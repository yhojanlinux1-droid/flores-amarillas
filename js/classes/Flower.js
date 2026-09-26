/**
 * Flower
 *
 * Flor amarilla dibujada de forma procedural en Canvas 2D.
 *
 *   - Tallo: curva Bézier cúbica con grosor decreciente (polígono relleno a
 *     partir de las normales de la curva), gradiente verde y dos hojas.
 *   - Cabeza: tres capas superpuestas de pétalos orgánicos trazados con
 *     bezierCurveTo (punta afilada + pequeño doblez + nervadura), cada capa
 *     con su gradiente lineal (base oscura -> punta clara) y variaciones por
 *     pétalo generadas con una semilla fija para que no parpadeen.
 *   - Pistilo: disco con gradiente radial y semillas en espiral de Fibonacci
 *     (r = c*sqrt(n), ángulo = n*137.5°), pre-renderizado en un sprite.
 *   - Animación: crecimiento del tallo con easing, apertura escalonada por
 *     capas desde el centro hacia afuera (escala + giro de despliegue),
 *     viento global, balanceo y respiración con funciones trigonométricas.
 *
 * Fases: 'wait' -> 'stem' -> 'bloom' -> 'open'
 */

// ---------------------------------------------------------------------------
// Utilidades matemáticas
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 137.5°

const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
const lerp = (a, b, t) => a + (b - a) * t;

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** PRNG determinista (mulberry32) para variaciones estables por flor. */
function createRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Punto sobre una Bézier cúbica. */
function cubicAt(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Derivada (tangente) de una Bézier cúbica. */
function cubicTangentAt(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x: a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    y: a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
  };
}

// ---------------------------------------------------------------------------
// Configuración visual
// ---------------------------------------------------------------------------

const PHASE = Object.freeze({
  WAIT: 'wait',
  STEM: 'stem',
  BLOOM: 'bloom',
  OPEN: 'open',
});

/**
 * Capas de pétalos, de atrás hacia adelante.
 *  length / width   -> relativos a petalRadius / a la longitud del pétalo
 *  delay / duration -> fracciones del bloomProgress (0..1)
 *  colors           -> gradiente base -> medio -> punta
 */
const LAYERS = [
  {
    count: 9,
    length: 1.0,
    width: 0.38,
    angleOffset: Math.PI / 9,
    delay: 0.0,
    duration: 0.62,
    colors: ['#a94e00', '#e08a00', '#f6c12e'],
    edge: 'rgba(120, 50, 0, 0.22)',
  },
  {
    count: 9,
    length: 0.85,
    width: 0.36,
    angleOffset: 0,
    delay: 0.2,
    duration: 0.62,
    colors: ['#cf7a00', '#f5b000', '#ffde5c'],
    edge: 'rgba(150, 70, 0, 0.2)',
  },
  {
    count: 7,
    length: 0.6,
    width: 0.34,
    angleOffset: Math.PI / 7 + 0.25,
    delay: 0.4,
    duration: 0.6,
    colors: ['#e89d00', '#ffcd3c', '#fff4bd'],
    edge: 'rgba(170, 90, 0, 0.16)',
  },
];

const LEAVES = [
  { t: 0.34, side: -1, size: 0.17, tilt: 1.05 },
  { t: 0.6, side: 1, size: 0.14, tilt: 0.95 },
];

// ---------------------------------------------------------------------------
// Clase
// ---------------------------------------------------------------------------

export default class Flower {
  /**
   * @param {object} options
   * @param {number} options.x              Base del tallo (x).
   * @param {number} options.baseY          Base del tallo (y).
   * @param {number} options.stemHeight     Altura del tallo en px.
   * @param {number} [options.petalRadius]  Longitud del pétalo más largo en px.
   * @param {number} [options.delay]        Segundos de espera antes de crecer.
   * @param {number} [options.curve]        Curvatura lateral del tallo (-1..1).
   * @param {number} [options.seed]         Semilla para variaciones estables.
   * @param {number} [options.stemDuration] Duración del crecimiento (s).
   * @param {number} [options.bloomDuration] Duración de la apertura (s).
   */
  constructor({
    x,
    baseY,
    stemHeight,
    petalRadius = 40,
    delay = 0,
    curve = 0,
    seed = 1,
    stemDuration = 2.6,
    bloomDuration = 2.3,
  }) {
    this.delay = delay;
    this.curve = curve;
    this.stemDuration = stemDuration;
    this.bloomDuration = bloomDuration;

    this.phase = PHASE.WAIT;
    this.elapsed = 0;
    this.time = 0;
    this.stemProgress = 0;
    this.bloomProgress = 0;
    this.wind = 0;

    const rnd = createRandom(seed * 7919 + 17);
    this.swayPhase = rnd() * TAU;
    this.breathPhase = rnd() * TAU;

    // Variaciones por pétalo (longitud, anchura, jitter angular, doblez).
    this.petalVars = LAYERS.map((layer) =>
      Array.from({ length: layer.count }, () => ({
        len: 0.88 + rnd() * 0.24,
        wid: 0.9 + rnd() * 0.2,
        jitter: (rnd() - 0.5) * 0.14,
        bend: (rnd() - 0.5) * 0.9,
      }))
    );

    /** @type {CanvasGradient[] | null} */
    this.layerGradients = null;
    this.pistilSprite = null;
    this.pistilSpriteScale = 1;

    this.resize(x, baseY, stemHeight, petalRadius);
  }

  get isOpen() {
    return this.phase === PHASE.OPEN;
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  /**
   * Reposiciona / redimensiona la flor conservando su progreso.
   * Reconstruye los recursos cacheados (gradientes, sprite del pistilo).
   */
  resize(x, baseY, stemHeight, petalRadius = this.petalRadius) {
    this.x = x;
    this.baseY = baseY;
    this.stemHeight = stemHeight;
    this.petalRadius = petalRadius;

    const H = stemHeight;
    const c = this.curve;
    // Puntos de control base (sin viento).
    this.base = [
      { x, y: baseY },
      { x: x + c * H * 0.1, y: baseY - H * 0.35 },
      { x: x + c * H * 0.4, y: baseY - H * 0.72 },
      { x: x + c * H * 0.22, y: baseY - H },
    ];
    this.pts = this.base.map((p) => ({ ...p }));
    this.#applyWind();

    this.stemWidthBase = Math.max(4, petalRadius * 0.16);
    this.stemWidthTip = Math.max(2.2, petalRadius * 0.08);
    this.pistilRadius = petalRadius * 0.3;

    this.#buildLayerGradients();
    this.#buildPistilSprite();
  }

  /** Desplaza los puntos superiores del tallo según el viento actual. */
  #applyWind() {
    const shift = this.wind * this.stemHeight * 0.045;
    this.pts[0].x = this.base[0].x;
    this.pts[1].x = this.base[1].x + shift * 0.15;
    this.pts[2].x = this.base[2].x + shift * 0.6;
    this.pts[3].x = this.base[3].x + shift;
  }

  #stemPoint(t) {
    const [p0, p1, p2, p3] = this.pts;
    return cubicAt(p0, p1, p2, p3, t);
  }

  #stemTangent(t) {
    const [p0, p1, p2, p3] = this.pts;
    return cubicTangentAt(p0, p1, p2, p3, t);
  }

  /** Posición y radio aproximado de la cabeza (para partículas). */
  getHeadPosition() {
    const tip = this.#stemPoint(easeOutCubic(this.stemProgress));
    return {
      x: tip.x,
      y: tip.y,
      radius: this.petalRadius * LAYERS[0].length * easeOutCubic(this.bloomProgress),
    };
  }

  // -------------------------------------------------------------------------
  // Simulación
  // -------------------------------------------------------------------------

  /**
   * @param {number} dt   Delta de tiempo (s).
   * @param {number} wind Viento global normalizado (-1..1).
   */
  update(dt, wind = 0) {
    this.time += dt;
    this.elapsed += dt;

    // Cada flor responde al viento con una ligera fase propia.
    const localWind = wind * 0.75 + Math.sin(this.time * 0.9 + this.swayPhase) * 0.25;
    this.wind = this.phase === PHASE.WAIT ? 0 : localWind * clamp01(this.stemProgress * 1.5);
    this.#applyWind();

    switch (this.phase) {
      case PHASE.WAIT:
        if (this.elapsed >= this.delay) {
          this.phase = PHASE.STEM;
          this.elapsed = 0;
        }
        break;

      case PHASE.STEM:
        this.stemProgress = clamp01(this.elapsed / this.stemDuration);
        if (this.stemProgress >= 1) {
          this.phase = PHASE.BLOOM;
          this.elapsed = 0;
        }
        break;

      case PHASE.BLOOM:
        this.bloomProgress = clamp01(this.elapsed / this.bloomDuration);
        if (this.bloomProgress >= 1) {
          this.phase = PHASE.OPEN;
          this.elapsed = 0;
        }
        break;

      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    if (this.phase === PHASE.WAIT) return;

    const stemT = easeOutCubic(this.stemProgress);
    this.#drawStem(ctx, stemT);
    this.#drawLeaves(ctx, stemT);

    if (this.bloomProgress < 0.5) {
      this.#drawBud(ctx, stemT);
    }
    if (this.bloomProgress > 0) {
      this.#drawHead(ctx);
    }
  }

  // ---- Tallo ----------------------------------------------------------------

  #drawStem(ctx, stemT) {
    if (stemT <= 0.002) return;

    const segments = Math.max(6, Math.ceil(stemT * 44));
    const left = [];
    const right = [];

    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * stemT;
      const p = this.#stemPoint(t);
      const d = this.#stemTangent(t);
      const len = Math.hypot(d.x, d.y) || 1;
      const nx = -d.y / len;
      const ny = d.x / len;
      // Grosor decreciente hacia la punta.
      const w = lerp(this.stemWidthBase, this.stemWidthTip, t) * 0.5;
      left.push(p.x + nx * w, p.y + ny * w);
      right.push(p.x - nx * w, p.y - ny * w);
    }

    const [p0] = this.pts;
    const tip = this.#stemPoint(stemT);
    const grad = ctx.createLinearGradient(p0.x, p0.y, tip.x, tip.y);
    grad.addColorStop(0, '#1f4d1f');
    grad.addColorStop(0.55, '#3f8a34');
    grad.addColorStop(1, '#7ed15f');

    ctx.save();
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(150, 240, 140, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(110, 220, 110, 0.35)';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.moveTo(left[0], left[1]);
    for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
    for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
    ctx.closePath();
    ctx.fill();

    // Brillo lateral sutil (luz desde la izquierda).
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(left[0], left[1]);
    for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
    ctx.stroke();
    ctx.restore();
  }

  /** Capullo verde en la punta mientras el tallo crece; se disuelve al abrir. */
  #drawBud(ctx, stemT) {
    if (stemT <= 0.02) return;
    const tip = this.#stemPoint(stemT);
    const r = this.stemWidthTip * 1.5 + this.petalRadius * 0.12 * stemT;
    const alpha = 1 - clamp01(this.bloomProgress / 0.5);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(tip.x, tip.y);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#9fdc7a');
    g.addColorStop(1, '#2f6b2a');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(160, 240, 140, 0.5)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.8, r, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ---- Hojas -----------------------------------------------------------------

  #drawLeaves(ctx, stemT) {
    for (const leaf of LEAVES) {
      const appear = clamp01((this.stemProgress - leaf.t - 0.06) / 0.28);
      if (appear <= 0) continue;

      const anchorT = Math.min(leaf.t, stemT);
      const p = this.#stemPoint(anchorT);
      const d = this.#stemTangent(anchorT);
      const tangentAngle = Math.atan2(d.y, d.x);
      const side = this.curve >= 0 ? leaf.side : -leaf.side;
      const angle = tangentAngle + side * leaf.tilt + this.wind * 0.08 * side;

      const size = this.stemHeight * leaf.size * easeOutBack(appear);
      this.#drawLeaf(ctx, p.x, p.y, angle, size);
    }
  }

  #drawLeaf(ctx, x, y, angle, L) {
    const W = L * 0.34;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const g = ctx.createLinearGradient(0, 0, L, 0);
    g.addColorStop(0, '#2c6a28');
    g.addColorStop(0.6, '#4ea644');
    g.addColorStop(1, '#8fd96c');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(120, 220, 120, 0.35)';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(L * 0.22, -W * 1.05, L * 0.72, -W * 0.9, L, 0);
    ctx.bezierCurveTo(L * 0.72, W * 0.6, L * 0.22, W * 0.75, 0, 0);
    ctx.closePath();
    ctx.fill();

    // Nervadura central.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(220, 255, 200, 0.35)';
    ctx.lineWidth = Math.max(0.6, L * 0.02);
    ctx.beginPath();
    ctx.moveTo(L * 0.04, 0);
    ctx.quadraticCurveTo(L * 0.5, -W * 0.12, L * 0.94, -W * 0.02);
    ctx.stroke();
    ctx.restore();
  }

  // ---- Cabeza ----------------------------------------------------------------

  #layerProgress(layer) {
    return clamp01((this.bloomProgress - layer.delay) / layer.duration);
  }

  #drawHead(ctx) {
    const tip = this.#stemPoint(1);
    const open = this.isOpen ? 1 : 0;

    // Balanceo + respiración (solo perceptibles una vez abierta).
    const sway =
      this.wind * 0.06 +
      (Math.sin(this.time * 0.9 + this.swayPhase) * 0.035 +
        Math.sin(this.time * 2.3 + this.swayPhase) * 0.012) *
        clamp01(this.bloomProgress * 1.5);
    const breath = 1 + Math.sin(this.time * 1.4 + this.breathPhase) * 0.012 * open;
    const glowPulse = 0.8 + Math.sin(this.time * 2.1 + this.breathPhase) * 0.2;

    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.rotate(sway);
    // Ligera compresión horizontal simula la inclinación de la cabeza con el viento.
    ctx.scale(breath * (1 - Math.abs(this.wind) * 0.04), breath);

    this.#drawAura(ctx, glowPulse);
    this.#ensureLayerGradients(ctx);

    LAYERS.forEach((layer, li) => {
      const p = this.#layerProgress(layer);
      if (p <= 0) return;
      this.#drawPetalLayer(ctx, layer, li, p, li === 0 ? 26 * glowPulse : 0);
    });

    this.#drawPistil(ctx);
    ctx.restore();
  }

  /** Halo dorado difuso detrás de la cabeza. */
  #drawAura(ctx, glowPulse) {
    const r = this.petalRadius * 1.45;
    const a = 0.32 * easeOutCubic(this.bloomProgress) * glowPulse;
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(0, 0, this.pistilRadius, 0, 0, r);
    g.addColorStop(0, `rgba(255, 200, 70, ${a})`);
    g.addColorStop(0.5, `rgba(255, 170, 40, ${a * 0.35})`);
    g.addColorStop(1, 'rgba(255, 150, 20, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
  }

  /**
   * Los gradientes se definen en el espacio local del pétalo (base en el
   * origen, punta en +x), así se reutilizan para todos los pétalos de la capa
   * y entre frames. Se construyen de forma perezosa con el contexto real.
   */
  #buildLayerGradients() {
    this.layerGradients = null;
  }

  #ensureLayerGradients(ctx) {
    if (this.layerGradients) return;
    this.layerGradients = LAYERS.map((layer) => {
      const L = this.petalRadius * layer.length;
      const g = ctx.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, layer.colors[0]);
      g.addColorStop(0.42, layer.colors[1]);
      g.addColorStop(1, layer.colors[2]);
      return g;
    });
  }

  /**
   * Dibuja una capa de pétalos. Cada pétalo se abre desde el centro:
   * escala con easeOutBack + giro de despliegue + fundido.
   */
  #drawPetalLayer(ctx, layer, li, progress, glow) {
    const L = this.petalRadius * layer.length;
    const W = L * layer.width;
    const e = Math.max(easeOutBack(progress), 0.001);
    const alpha = easeOutCubic(progress);
    const swirl = (1 - easeOutCubic(progress)) * 1.15; // giro de despliegue
    const vars = this.petalVars[li];
    const step = TAU / layer.count;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.layerGradients[li];
    ctx.strokeStyle = layer.edge;
    ctx.lineJoin = 'round';

    for (let i = 0; i < layer.count; i++) {
      const v = vars[i];
      ctx.save();
      ctx.rotate(layer.angleOffset + i * step + v.jitter + swirl);
      ctx.scale(e * v.len, (0.3 + 0.7 * e) * v.wid);

      this.#tracePetal(ctx, L, W, v.bend);
      if (glow) {
        ctx.shadowColor = 'rgba(255, 200, 40, 0.9)';
        ctx.shadowBlur = glow;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // Borde suave para separar pétalos superpuestos.
      ctx.lineWidth = 0.9 / v.len;
      ctx.stroke();

      // Nervadura / pliegue central.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = Math.max(0.6, W * 0.05) / v.len;
      ctx.beginPath();
      ctx.moveTo(L * 0.08, 0);
      ctx.quadraticCurveTo(L * 0.55, v.bend * W * 0.35, L * 0.9, -W * 0.1);
      ctx.stroke();

      // Sombra en la mitad inferior para dar el doblez.
      ctx.strokeStyle = 'rgba(140, 60, 0, 0.12)';
      ctx.lineWidth = Math.max(0.8, W * 0.12) / v.len;
      ctx.beginPath();
      ctx.moveTo(L * 0.12, W * 0.08);
      ctx.quadraticCurveTo(L * 0.5, W * 0.28 + v.bend * W * 0.2, L * 0.86, W * 0.05);
      ctx.stroke();
      ctx.strokeStyle = layer.edge;

      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Trazado del pétalo en coordenadas locales (base en 0,0; punta en +x).
   * Curvas Bézier asimétricas -> forma orgánica con punta afilada y un
   * pequeño gancho/doblez cerca del extremo.
   */
  #tracePetal(ctx, L, W, bend) {
    const b = bend * W * 0.25;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Borde superior hasta cerca de la punta.
    ctx.bezierCurveTo(L * 0.16, -W * 1.05 + b, L * 0.62, -W * 0.95 + b, L * 0.93, -W * 0.26 + b * 0.5);
    // Punta afilada con leve doblez.
    ctx.quadraticCurveTo(L * 1.03, -W * 0.1 + b * 0.3, L, W * 0.03);
    // Borde inferior, ligeramente distinto para romper la simetría.
    ctx.bezierCurveTo(L * 0.7, W * 0.62 + b, L * 0.22, W * 0.98 + b, 0, 0);
    ctx.closePath();
  }

  // ---- Pistilo -----------------------------------------------------------------

  /**
   * Pre-renderiza el pistilo (disco, semillas en espiral y estambres) en un
   * canvas fuera de pantalla: es estático, así que evitamos cientos de arcs
   * por frame.
   */
  #buildPistilSprite() {
    const R = this.pistilRadius;
    const outer = R * 1.5; // incluye estambres
    const ss = Math.min(3, (window.devicePixelRatio || 1) * 1.5);
    const size = Math.ceil(outer * 2 * ss) + 4;

    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2);
    g.scale(ss, ss);

    // Estambres: pequeños filamentos con anteras amarillas alrededor del disco.
    const stamens = 22;
    g.lineCap = 'round';
    for (let i = 0; i < stamens; i++) {
      const a = (i / stamens) * TAU + 0.15;
      const r0 = R * 0.92;
      const r1 = R * (1.22 + ((i % 3) * 0.06));
      g.strokeStyle = 'rgba(230, 150, 20, 0.9)';
      g.lineWidth = Math.max(0.6, R * 0.045);
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.stroke();
      g.fillStyle = '#ffd95a';
      g.beginPath();
      g.arc(Math.cos(a) * r1, Math.sin(a) * r1, Math.max(0.8, R * 0.07), 0, TAU);
      g.fill();
    }

    // Sombra bajo el disco para asentarlo sobre los pétalos.
    const shade = g.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 1.35);
    shade.addColorStop(0, 'rgba(90, 40, 0, 0.35)');
    shade.addColorStop(1, 'rgba(90, 40, 0, 0)');
    g.fillStyle = shade;
    g.beginPath();
    g.arc(0, 0, R * 1.35, 0, TAU);
    g.fill();

    // Disco.
    const disc = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
    disc.addColorStop(0, '#8a4a1a');
    disc.addColorStop(0.55, '#5a2c0d');
    disc.addColorStop(1, '#2a1305');
    g.fillStyle = disc;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();

    // Semillas en espiral de Fibonacci (Vogel): r = c*sqrt(n), θ = n*137.5°.
    const seeds = Math.round(70 + R * 1.2);
    const seedR = Math.max(0.6, R * 0.075);
    for (let n = 0; n < seeds; n++) {
      const r = R * 0.9 * Math.sqrt(n / seeds);
      const a = n * GOLDEN_ANGLE;
      const sx = Math.cos(a) * r;
      const sy = Math.sin(a) * r;
      const depth = r / R; // más claras hacia el borde
      g.fillStyle = `rgba(${20 + depth * 40}, ${10 + depth * 18}, 4, 0.85)`;
      g.beginPath();
      g.arc(sx, sy, seedR, 0, TAU);
      g.fill();
      // Micro-brillo.
      g.fillStyle = `rgba(255, 190, 110, ${0.12 + depth * 0.18})`;
      g.beginPath();
      g.arc(sx - seedR * 0.35, sy - seedR * 0.35, seedR * 0.4, 0, TAU);
      g.fill();
    }

    // Reflejo suave en la parte superior.
    const gloss = g.createRadialGradient(-R * 0.35, -R * 0.4, 0, -R * 0.35, -R * 0.4, R * 0.9);
    gloss.addColorStop(0, 'rgba(255, 220, 160, 0.22)');
    gloss.addColorStop(1, 'rgba(255, 220, 160, 0)');
    g.fillStyle = gloss;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();

    this.pistilSprite = c;
    this.pistilSpriteScale = ss;
  }

  #drawPistil(ctx) {
    if (!this.pistilSprite) return;
    const p0 = this.#layerProgress(LAYERS[0]);
    const p1 = this.#layerProgress(LAYERS[1]);
    if (p0 <= 0) return;

    const alpha = easeOutCubic(p0);
    const scale = lerp(0.55, 1, easeOutBack(p1));
    const size = this.pistilSprite.width / this.pistilSpriteScale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.scale(scale, scale);
    ctx.drawImage(this.pistilSprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}
