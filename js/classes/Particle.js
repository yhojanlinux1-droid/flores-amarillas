/**
 * Particle — luciérnaga dorada.
 *
 * Movimiento orgánico sin librerías de ruido: el rumbo (ángulo) deriva con la
 * suma de dos senos de distinta frecuencia (pseudo-ruido), a velocidad baja,
 * con una fuerza de "órbita" suave hacia la flor objetivo para que las
 * luciérnagas floten alrededor del ramo sin quedarse pegadas ni escaparse.
 *
 * Parpadeo tipo luciérnaga: destellos cortos con sin() elevado al cubo.
 * Brillo con shadowBlur fuerte + halo con gradiente radial.
 */

const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const lerp = (a, b, t) => a + (b - a) * t;

/** Diferencia angular mínima (−π..π). */
function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export default class Particle {
  /**
   * @param {{ x: number, y: number, radius: number }} head Punto de aparición (cabeza de una flor).
   * @param {number} [scale=1] Escala global (para pantallas pequeñas).
   */
  constructor(head, scale = 1) {
    this.scale = scale;

    // Parámetros fijos de personalidad.
    this.speed = lerp(14, 34, Math.random()) * scale;
    this.size = lerp(1.1, 2.4, Math.random()) * scale;
    this.wanderFreqA = lerp(0.5, 1.1, Math.random());
    this.wanderFreqB = lerp(1.6, 2.8, Math.random());
    this.wanderPhaseA = Math.random() * TAU;
    this.wanderPhaseB = Math.random() * TAU;
    this.blinkSpeed = lerp(0.6, 1.6, Math.random());
    this.blinkPhase = Math.random() * TAU;
    this.bobPhase = Math.random() * TAU;
    this.orbitFactor = lerp(1.4, 3.2, Math.random());
    this.warmth = Math.random(); // 0 = dorado, 1 = más blanco/cálido

    this.life = 0;
    this.alpha = 0;
    this.respawn(head);
  }

  /** Coloca la luciérnaga alrededor de una cabeza con rumbo aleatorio. */
  respawn(head) {
    const a = Math.random() * TAU;
    const r = head.radius * lerp(0.8, 2.6, Math.random()) + 10;
    this.x = head.x + Math.cos(a) * r;
    this.y = head.y + Math.sin(a) * r * 0.8;
    this.angle = Math.random() * TAU;
    this.life = 0;
  }

  /**
   * @param {number} dt      Delta (s).
   * @param {number} time    Tiempo global (s).
   * @param {{ x: number, y: number, radius: number }} target Cabeza de flor más cercana.
   * @param {number} wind    Viento global (−1..1).
   * @param {{ width: number, height: number }} bounds Tamaño del canvas.
   */
  update(dt, time, target, wind, bounds) {
    this.life += dt;

    // 1. Deriva orgánica del rumbo (pseudo-ruido con dos senos).
    const wander =
      Math.sin(time * this.wanderFreqA + this.wanderPhaseA) * 0.9 +
      Math.sin(time * this.wanderFreqB + this.wanderPhaseB) * 0.45;
    this.angle += wander * dt * 1.7;

    // 2. Órbita suave alrededor del objetivo.
    if (target) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      const orbit = Math.max(target.radius, 20) * this.orbitFactor;
      const toTarget = Math.atan2(dy, dx);

      if (dist > orbit * 1.35) {
        // Demasiado lejos: gira hacia la flor.
        const strength = clamp((dist - orbit) / orbit, 0, 1) * 2.2;
        this.angle += angleDelta(this.angle, toTarget) * strength * dt;
      } else if (dist < orbit * 0.55) {
        // Demasiado cerca: aléjate tangencialmente.
        this.angle += angleDelta(this.angle, toTarget + Math.PI * 0.6) * 2.4 * dt;
      } else {
        // Zona cómoda: tendencia leve a orbitar.
        this.angle += angleDelta(this.angle, toTarget + Math.PI / 2) * 0.35 * dt;
      }
    }

    // 3. Integración + viento + bamboleo vertical.
    const bob = Math.sin(time * 1.9 + this.bobPhase) * 9 * this.scale;
    this.x += (Math.cos(this.angle) * this.speed + wind * 18 * this.scale) * dt;
    this.y += (Math.sin(this.angle) * this.speed * 0.7 + bob) * dt;

    // 4. Fuera de pantalla: reaparece junto al objetivo.
    const m = 40;
    if (this.x < -m || this.x > bounds.width + m || this.y < -m || this.y > bounds.height + m) {
      if (target) this.respawn(target);
    }

    // 5. Parpadeo (destellos cortos) + aparición gradual al nacer.
    const blink = Math.max(0, Math.sin(time * this.blinkSpeed + this.blinkPhase));
    const spawn = clamp(this.life / 1.8, 0, 1);
    this.alpha = (0.14 + 0.86 * blink * blink * blink) * spawn;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    if (this.alpha <= 0.01) return;

    const a = this.alpha;
    const r = this.size * (0.8 + a * 0.6);
    const haloR = r * 6;

    // Halo suave.
    const halo = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, haloR);
    halo.addColorStop(0, `rgba(255, 215, 110, ${0.35 * a})`);
    halo.addColorStop(0.4, `rgba(255, 190, 70, ${0.12 * a})`);
    halo.addColorStop(1, 'rgba(255, 180, 60, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(this.x, this.y, haloR, 0, TAU);
    ctx.fill();

    // Núcleo brillante con glow fuerte.
    const g = Math.round(lerp(215, 240, this.warmth));
    const b = Math.round(lerp(120, 200, this.warmth));
    ctx.shadowColor = `rgba(255, ${g - 30}, 60, ${0.95 * a})`;
    ctx.shadowBlur = 16 + 16 * a;
    ctx.fillStyle = `rgba(255, ${g}, ${b}, ${a})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
