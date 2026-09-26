/**
 * Flores Amarillas — punto de entrada.
 *
 * Orquesta:
 *   - Fondo galaxia (estrellas parpadeantes) en #galaxy.
 *   - Ramo de 3 flores + partículas doradas en #flowers.
 *   - Transición de la pantalla de inicio y arranque del audio al primer gesto.
 *   - Bucle de render con requestAnimationFrame y canvas responsivo (resize + DPR).
 */

import Flower from './classes/Flower.js';
import { createAudio } from './utils/audio.js';

// -----------------------------------------------------------------------------
// Referencias DOM
// -----------------------------------------------------------------------------

const galaxyCanvas = document.getElementById('galaxy');
const flowersCanvas = document.getElementById('flowers');
const intro = document.getElementById('intro');

const galaxyCtx = galaxyCanvas.getContext('2d');
const flowersCtx = flowersCanvas.getContext('2d');

// -----------------------------------------------------------------------------
// Estado global
// -----------------------------------------------------------------------------

const state = {
  started: false,
  width: 0,
  height: 0,
  dpr: 1,
  lastTime: 0,
  time: 0,
};

const audio = createAudio('assets/audio/song.mp3', { loop: true, volume: 0.6 });

// -----------------------------------------------------------------------------
// Estrellas
// -----------------------------------------------------------------------------

const STAR_COUNT = 220;

/** Coordenadas normalizadas (0..1) para sobrevivir al resize sin recalcular. */
const stars = Array.from({ length: STAR_COUNT }, () => ({
  nx: Math.random(),
  ny: Math.random(),
  r: 0.4 + Math.random() * 1.4,
  alpha: 0.3 + Math.random() * 0.7,
  twinkleSpeed: 0.6 + Math.random() * 2.2,
  phase: Math.random() * Math.PI * 2,
  warm: Math.random() < 0.18, // algunas estrellas con tono dorado
}));

function drawStars(ctx, time) {
  ctx.clearRect(0, 0, state.width, state.height);

  for (const s of stars) {
    const twinkle = 0.55 + 0.45 * Math.sin(time * s.twinkleSpeed + s.phase);
    const alpha = s.alpha * twinkle;
    const x = s.nx * state.width;
    const y = s.ny * state.height;

    ctx.beginPath();
    ctx.fillStyle = s.warm
      ? `rgba(255, 224, 150, ${alpha})`
      : `rgba(235, 240, 255, ${alpha})`;
    ctx.arc(x, y, s.r, 0, Math.PI * 2);
    ctx.fill();

    // Halo sutil en las estrellas más grandes.
    if (s.r > 1.4) {
      ctx.beginPath();
      ctx.fillStyle = s.warm
        ? `rgba(255, 224, 150, ${alpha * 0.18})`
        : `rgba(200, 215, 255, ${alpha * 0.18})`;
      ctx.arc(x, y, s.r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// -----------------------------------------------------------------------------
// Partículas doradas
// -----------------------------------------------------------------------------

const MAX_PARTICLES = 320;

/**
 * Sprite de resplandor pre-renderizado. Dibujar cientos de partículas con
 * shadowBlur por frame es caro; un drawImage de un sprite con gradiente
 * radial da el mismo efecto a una fracción del coste.
 */
const GLOW_SPRITE_SIZE = 32;
const glowSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = GLOW_SPRITE_SIZE;
  const g = c.getContext('2d');
  const half = GLOW_SPRITE_SIZE / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255, 240, 180, 1)');
  grad.addColorStop(0.25, 'rgba(255, 220, 110, 0.9)');
  grad.addColorStop(0.6, 'rgba(255, 200, 80, 0.25)');
  grad.addColorStop(1, 'rgba(255, 200, 80, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, GLOW_SPRITE_SIZE, GLOW_SPRITE_SIZE);
  return c;
})();

class Particle {
  constructor(x, y, radius) {
    const angle = Math.random() * Math.PI * 2;
    const dist = radius * (0.4 + Math.random() * 0.8);
    const speed = 8 + Math.random() * 22;

    this.x = x + Math.cos(angle) * dist;
    this.y = y + Math.sin(angle) * dist;
    this.vx = Math.cos(angle) * speed * 0.6;
    this.vy = Math.sin(angle) * speed * 0.6 - 14; // tendencia a subir
    this.life = 0;
    this.maxLife = 1.6 + Math.random() * 1.8;
    this.size = 1 + Math.random() * 2.2;
    this.drift = Math.random() * Math.PI * 2;
  }

  get alive() {
    return this.life < this.maxLife;
  }

  update(dt) {
    this.life += dt;
    this.drift += dt * 2;
    this.x += (this.vx + Math.sin(this.drift) * 6) * dt;
    this.y += this.vy * dt;
    this.vy -= 6 * dt; // ligera flotación ascendente
  }

  draw(ctx) {
    const t = this.life / this.maxLife;
    // Aparece rápido, se desvanece lento.
    const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    // El sprite incluye el halo, por eso se dibuja ~4x el tamaño del núcleo.
    const size = this.size * (1 - t * 0.4) * 4;

    ctx.globalAlpha = alpha;
    ctx.drawImage(glowSprite, this.x - size / 2, this.y - size / 2, size, size);
  }
}

/** @type {Particle[]} */
let particles = [];

function emitParticles(flowers) {
  for (const flower of flowers) {
    if (!flower.isOpen || particles.length >= MAX_PARTICLES) continue;
    const head = flower.getHeadPosition();
    const count = Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(head.x, head.y, head.radius));
    }
  }
}

function updateParticles(dt) {
  for (const p of particles) p.update(dt);
  particles = particles.filter((p) => p.alive);
}

function drawParticles(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) p.draw(ctx);
  ctx.restore();
}

// -----------------------------------------------------------------------------
// Ramo de flores
// -----------------------------------------------------------------------------

/** Definición relativa del ramo; se convierte a píxeles en layoutFlowers(). */
const BOUQUET = [
  { offsetX: -0.12, heightRatio: 0.4, delay: 0.0, curve: -0.6, petalCount: 9 },
  { offsetX: 0.0, heightRatio: 0.5, delay: 0.45, curve: 0.05, petalCount: 10 },
  { offsetX: 0.12, heightRatio: 0.42, delay: 0.9, curve: 0.6, petalCount: 9 },
];

/** @type {Flower[]} */
let flowers = [];

function flowerLayout(def) {
  // En pantallas muy estrechas se abre un poco más el ramo para que no se solapen.
  const spread = state.width < 520 ? 1.5 : 1;
  const minDim = Math.min(state.width, state.height);
  const stemHeight = def.heightRatio * state.height;
  const petalRadius = Math.max(22, Math.min(46, minDim * 0.075));

  // La cabeza queda desplazada respecto a la base por la curvatura del tallo
  // (misma fórmula que Flower.resize). Se limita la base para que la cabeza
  // completa quepa siempre dentro del viewport.
  const tipOffset = def.curve * stemHeight * 0.18;
  const headScale = Math.max(0.55, Math.min(1.4, stemHeight / 320));
  const margin = petalRadius * headScale * 1.2 + 12;

  let x = state.width / 2 + def.offsetX * spread * state.width;
  x = Math.min(Math.max(x, margin - tipOffset), state.width - margin - tipOffset);

  return {
    x,
    baseY: state.height + 6,
    stemHeight,
    petalRadius,
  };
}

function createFlowers() {
  flowers = BOUQUET.map(
    (def) =>
      new Flower({
        ...flowerLayout(def),
        delay: def.delay,
        curve: def.curve,
        petalCount: def.petalCount,
      })
  );
}

function layoutFlowers() {
  flowers.forEach((flower, i) => {
    const layout = flowerLayout(BOUQUET[i]);
    flower.petalRadius = layout.petalRadius;
    flower.resize(layout.x, layout.baseY, layout.stemHeight);
  });
}

// -----------------------------------------------------------------------------
// Resize / DPR
// -----------------------------------------------------------------------------

function resize() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;

  for (const [canvas, ctx] of [
    [galaxyCanvas, galaxyCtx],
    [flowersCanvas, flowersCtx],
  ]) {
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  layoutFlowers();
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 80);
});

// -----------------------------------------------------------------------------
// Inicio (primer gesto del usuario)
// -----------------------------------------------------------------------------

function start() {
  if (state.started) return;
  state.started = true;

  // 1. Desvanecer textos de inicio.
  intro.classList.add('hidden');

  // 2. Reproducir audio dentro del gesto de usuario (política de Autoplay).
  audio.play();

  // 3. Instanciar el ramo; empieza a crecer en el siguiente frame.
  createFlowers();
  document.body.style.cursor = 'default';
}

document.addEventListener('pointerdown', start, { once: true });
// Fallback para navegadores sin Pointer Events.
document.addEventListener('touchstart', start, { once: true, passive: true });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') start();
}, { once: true });

// -----------------------------------------------------------------------------
// Bucle principal
// -----------------------------------------------------------------------------

function loop(now) {
  const dt = Math.min((now - state.lastTime) / 1000 || 0, 0.05);
  state.lastTime = now;
  state.time += dt;

  drawStars(galaxyCtx, state.time);

  if (state.started) {
    flowersCtx.clearRect(0, 0, state.width, state.height);

    for (const flower of flowers) flower.update(dt);
    emitParticles(flowers);
    updateParticles(dt);

    drawParticles(flowersCtx);
    for (const flower of flowers) flower.draw(flowersCtx);
  }

  requestAnimationFrame(loop);
}

resize();
requestAnimationFrame((t) => {
  state.lastTime = t;
  loop(t);
});
