/**
 * Flower
 *
 * Representa una flor amarilla que crece de forma progresiva:
 *   1. fase 'stem'  → el tallo crece de abajo hacia arriba (stemProgress 0→1)
 *   2. fase 'bloom' → los pétalos se escalan simulando abrirse (bloomProgress 0→1)
 *   3. fase 'open'  → flor completamente abierta, balanceo suave y emisión de partículas
 *
 * La geometría del tallo es una curva Bézier cuadrática, lo que permite
 * dibujarla parcialmente calculando el punto para un t dado.
 */

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const PHASE = Object.freeze({
  WAIT: 'wait',
  STEM: 'stem',
  BLOOM: 'bloom',
  OPEN: 'open',
});

export default class Flower {
  /**
   * @param {object} options
   * @param {number} options.x              Posición horizontal de la base del tallo.
   * @param {number} options.baseY          Posición vertical de la base del tallo.
   * @param {number} options.stemHeight     Altura máxima del tallo en píxeles.
   * @param {number} [options.petalCount]   Número de pétalos.
   * @param {number} [options.petalRadius]  Longitud de cada pétalo.
   * @param {number} [options.delay]        Retardo en segundos antes de empezar a crecer.
   * @param {number} [options.curve]        Desplazamiento horizontal del control de la curva (-1..1 relativo).
   * @param {number} [options.stemDuration] Duración del crecimiento del tallo (s).
   * @param {number} [options.bloomDuration] Duración de la apertura (s).
   * @param {string} [options.color]        Color principal de los pétalos.
   */
  constructor({
    x,
    baseY,
    stemHeight,
    petalCount = 9,
    petalRadius = 34,
    delay = 0,
    curve = 0,
    stemDuration = 2.2,
    bloomDuration = 1.6,
    color = '#ffd23f',
  }) {
    this.petalCount = petalCount;
    this.petalRadius = petalRadius;
    this.delay = delay;
    this.curve = curve;
    this.stemDuration = stemDuration;
    this.bloomDuration = bloomDuration;
    this.color = color;

    this.phase = PHASE.WAIT;
    this.elapsed = 0;
    this.stemProgress = 0;
    this.bloomProgress = 0;
    this.time = 0;
    this.swayPhase = Math.random() * Math.PI * 2;

    this.resize(x, baseY, stemHeight);
  }

  /** La flor ya está totalmente abierta. */
  get isOpen() {
    return this.phase === PHASE.OPEN;
  }

  /**
   * Reposiciona la flor manteniendo su progreso de animación.
   * Se llama en el evento resize de la ventana.
   */
  resize(x, baseY, stemHeight) {
    this.x = x;
    this.baseY = baseY;
    this.stemHeight = stemHeight;

    // Puntos de la curva Bézier cuadrática del tallo.
    this.p0 = { x, y: baseY };
    this.p1 = { x: x + this.curve * stemHeight * 0.35, y: baseY - stemHeight * 0.55 };
    this.p2 = { x: x + this.curve * stemHeight * 0.18, y: baseY - stemHeight };

    // La cabeza escala con el tamaño de la pantalla.
    this.headScale = Math.max(0.55, Math.min(1.4, stemHeight / 320));
  }

  /**
   * Punto sobre la curva del tallo para t ∈ [0, 1].
   * @param {number} t
   */
  pointAt(t) {
    const mt = 1 - t;
    return {
      x: mt * mt * this.p0.x + 2 * mt * t * this.p1.x + t * t * this.p2.x,
      y: mt * mt * this.p0.y + 2 * mt * t * this.p1.y + t * t * this.p2.y,
    };
  }

  /** Posición actual de la cabeza (útil para emitir partículas). */
  getHeadPosition() {
    const tip = this.pointAt(easeOutCubic(this.stemProgress));
    const sway = this.isOpen ? Math.sin(this.time * 1.3 + this.swayPhase) * 3 : 0;
    return { x: tip.x + sway, y: tip.y, radius: this.petalRadius * this.headScale * this.bloomProgress };
  }

  /**
   * Avanza la simulación.
   * @param {number} dt Delta de tiempo en segundos.
   */
  update(dt) {
    this.time += dt;
    this.elapsed += dt;

    switch (this.phase) {
      case PHASE.WAIT:
        if (this.elapsed >= this.delay) {
          this.phase = PHASE.STEM;
          this.elapsed = 0;
        }
        break;

      case PHASE.STEM:
        this.stemProgress = Math.min(this.elapsed / this.stemDuration, 1);
        if (this.stemProgress >= 1) {
          this.phase = PHASE.BLOOM;
          this.elapsed = 0;
        }
        break;

      case PHASE.BLOOM:
        this.bloomProgress = Math.min(this.elapsed / this.bloomDuration, 1);
        if (this.bloomProgress >= 1) {
          this.phase = PHASE.OPEN;
          this.elapsed = 0;
        }
        break;

      case PHASE.OPEN:
      default:
        break;
    }
  }

  /**
   * Dibuja la flor en el contexto dado.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    if (this.phase === PHASE.WAIT) return;

    const stemT = easeOutCubic(this.stemProgress);
    this.#drawStem(ctx, stemT);

    if (this.stemProgress > 0.45) {
      this.#drawLeaf(ctx, stemT);
    }

    if (this.bloomProgress > 0) {
      this.#drawHead(ctx);
    }
  }

  // ---------------------------------------------------------------------------
  // Dibujo interno
  // ---------------------------------------------------------------------------

  #drawStem(ctx, stemT) {
    if (stemT <= 0) return;

    const segments = Math.max(4, Math.ceil(stemT * 40));
    const lineWidth = 5 * this.headScale;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = this.#stemGradient(ctx);
    ctx.shadowColor = 'rgba(120, 220, 120, 0.45)';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.moveTo(this.p0.x, this.p0.y);
    for (let i = 1; i <= segments; i++) {
      const p = this.pointAt((i / segments) * stemT);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  #stemGradient(ctx) {
    const g = ctx.createLinearGradient(this.p0.x, this.p0.y, this.p2.x, this.p2.y);
    g.addColorStop(0, '#2f6b2a');
    g.addColorStop(1, '#6fcf5a');
    return g;
  }

  #drawLeaf(ctx, stemT) {
    // La hoja aparece al 45 % del crecimiento y se despliega hasta el 75 %.
    const leafT = Math.min((this.stemProgress - 0.45) / 0.3, 1);
    if (leafT <= 0) return;

    const anchorT = Math.min(0.42, stemT);
    const anchor = this.pointAt(anchorT);
    const size = 26 * this.headScale * easeOutCubic(leafT);
    const side = this.curve >= 0 ? -1 : 1;

    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    ctx.rotate(side * -0.9);
    ctx.fillStyle = '#4fae45';
    ctx.shadowColor = 'rgba(120, 220, 120, 0.4)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(size * 0.6, -size * 0.55, size * 1.5, 0);
    ctx.quadraticCurveTo(size * 0.6, size * 0.55, 0, 0);
    ctx.fill();
    ctx.restore();
  }

  #drawHead(ctx) {
    const tip = this.pointAt(1);
    const bloom = easeOutBack(this.bloomProgress);
    const scale = Math.max(0.001, bloom) * this.headScale;

    // Balanceo suave una vez abierta.
    const sway = this.isOpen ? Math.sin(this.time * 1.3 + this.swayPhase) * 0.04 : 0;
    const glowPulse = this.isOpen ? 0.85 + Math.sin(this.time * 2.1 + this.swayPhase) * 0.15 : 1;

    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.rotate(sway);
    ctx.scale(scale, scale);

    // Resplandor dorado.
    ctx.shadowColor = 'rgba(255, 215, 0, 0.85)';
    ctx.shadowBlur = (28 * this.bloomProgress * glowPulse) / scale;

    // Capa trasera de pétalos (más oscura, ligeramente rotada) para dar volumen.
    this.#drawPetalRing(ctx, this.petalRadius * 0.92, Math.PI / this.petalCount, '#e8a800', '#f6c21b');
    // Capa frontal de pétalos.
    this.#drawPetalRing(ctx, this.petalRadius, 0, this.color, '#fff1a8');

    // Centro de la flor.
    ctx.shadowBlur = 0;
    const centerR = this.petalRadius * 0.34;
    const centerGrad = ctx.createRadialGradient(-centerR * 0.3, -centerR * 0.3, centerR * 0.1, 0, 0, centerR);
    centerGrad.addColorStop(0, '#a9612b');
    centerGrad.addColorStop(0.7, '#6b3a17');
    centerGrad.addColorStop(1, '#3f2109');
    ctx.fillStyle = centerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, centerR, 0, Math.PI * 2);
    ctx.fill();

    // Puntitos del centro (textura de semillas).
    ctx.fillStyle = 'rgba(255, 200, 120, 0.35)';
    const dots = 10;
    for (let i = 0; i < dots; i++) {
      const a = (i / dots) * Math.PI * 2 + 0.4;
      const r = centerR * 0.55;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, centerR * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  #drawPetalRing(ctx, radius, offsetAngle, baseColor, tipColor) {
    const petalLength = radius;
    const petalWidth = radius * 0.36;

    for (let i = 0; i < this.petalCount; i++) {
      const angle = (i / this.petalCount) * Math.PI * 2 + offsetAngle;
      ctx.save();
      ctx.rotate(angle);
      ctx.translate(petalLength * 0.55, 0);

      const grad = ctx.createLinearGradient(-petalLength * 0.55, 0, petalLength * 0.55, 0);
      grad.addColorStop(0, baseColor);
      grad.addColorStop(1, tipColor);
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.ellipse(0, 0, petalLength * 0.55, petalWidth, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
