/**
 * Flores Amarillas — punto de entrada.
 *
 *   - #galaxy  : estrellas por capas de profundidad + estrellas fugaces.
 *   - #flowers : ramo de flores (Flower) + luciérnagas (Particle).
 *   - Primer gesto: desvanece la intro, arranca la música con fade-in
 *     (AudioPlayer) y hace crecer el ramo.
 *   - requestAnimationFrame con dt acotado; canvas responsivo con DPR.
 */

import Flower from './classes/Flower.js';
import Particle from './classes/Particle.js';
import AudioPlayer from './utils/audio.js';

// -----------------------------------------------------------------------------
// DOM
// -----------------------------------------------------------------------------

const galaxyCanvas = document.getElementById('galaxy');
const flowersCanvas = document.getElementById('flowers');
const intro = document.getElementById('intro');

const galaxyCtx = galaxyCanvas.getContext('2d');
const flowersCtx = flowersCanvas.getContext('2d');

// -----------------------------------------------------------------------------
// Estado
// -----------------------------------------------------------------------------

const state = {
  started: false,
  width: 0,
  height: 0,
  dpr: 1,
  lastTime: 0,
  time: 0,
  isMobile: false,
};

const audio = new AudioPlayer('assets/audio/golden-hour.mp3', {
  loop: true,
  targetVolume: 0.4,
  fadeDuration: 2500,
});

/** Viento global: suma de senos de baja frecuencia, compartido por flores y luciérnagas. */
function wind(t) {
  return Math.sin(t * 0.45) * 0.55 + Math.sin(t * 1.1 + 1.3) * 0.3 + Math.sin(t * 2.7 + 0.4) * 0.15;
}

// -----------------------------------------------------------------------------
// Estrellas (tres capas de profundidad) + estrellas fugaces
// -----------------------------------------------------------------------------

const STAR_LAYERS = [
  { count: 160, rMin: 0.3, rMax: 0.8, alpha: 0.45, twinkle: [0.4, 1.2] },
  { count: 90, rMin: 0.7, rMax: 1.4, alpha: 0.7, twinkle: [0.8, 2.0] },
  { count: 26, rMin: 1.3, rMax: 2.1, alpha: 0.95, twinkle: [1.2, 3.0] },
];

const stars = STAR_LAYERS.flatMap((layer) =>
  Array.from({ length: layer.count }, () => ({
    nx: Math.random(),
    ny: Math.random(),
    r: layer.rMin + Math.random() * (layer.rMax - layer.rMin),
    alpha: layer.alpha * (0.6 + Math.random() * 0.4),
    twinkleSpeed: layer.twinkle[0] + Math.random() * (layer.twinkle[1] - layer.twinkle[0]),
    phase: Math.random() * Math.PI * 2,
    warm: Math.random() < 0.2,
  }))
);

/** @type {{x:number,y:number,vx:number,vy:number,life:number,maxLife:number}|null} */
let shootingStar = null;
let nextShootingIn = 4 + Math.random() * 5;

function updateShootingStar(dt) {
  if (shootingStar) {
    shootingStar.life += dt;
    shootingStar.x += shootingStar.vx * dt;
    shootingStar.y += shootingStar.vy * dt;
    if (shootingStar.life >= shootingStar.maxLife) shootingStar = null;
    return;
  }
  nextShootingIn -= dt;
  if (nextShootingIn <= 0) {
    const fromLeft = Math.random() < 0.5;
    const speed = 700 + Math.random() * 500;
    const angle = (fromLeft ? 1 : -1) * (0.25 + Math.random() * 0.3);
    shootingStar = {
      x: fromLeft ? -20 : state.width + 20,
      y: state.height * (0.05 + Math.random() * 0.4),
      vx: Math.cos(angle) * speed * (fromLeft ? 1 : -1),
      vy: Math.abs(Math.sin(angle)) * speed,
      life: 0,
      maxLife: 0.9 + Math.random() * 0.5,
    };
    nextShootingIn = 6 + Math.random() * 6;
  }
}

function drawStars(ctx, time) {
  ctx.clearRect(0, 0, state.width, state.height);

  for (const s of stars) {
    const twinkle = 0.55 + 0.45 * Math.sin(time * s.twinkleSpeed + s.phase);
    const alpha = s.alpha * twinkle;
    const x = s.nx * state.width;
    const y = s.ny * state.height;

    ctx.beginPath();
    ctx.fillStyle = s.warm ? `rgba(255, 226, 160, ${alpha})` : `rgba(230, 236, 255, ${alpha})`;
    ctx.arc(x, y, s.r, 0, Math.PI * 2);
    ctx.fill();

    if (s.r > 1.3) {
      // Halo y destello en cruz para las estrellas grandes.
      ctx.beginPath();
      ctx.fillStyle = s.warm ? `rgba(255, 226, 160, ${alpha * 0.16})` : `rgba(200, 215, 255, ${alpha * 0.16})`;
      ctx.arc(x, y, s.r * 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.35})`;
      ctx.lineWidth = 0.6;
      const len = s.r * 4 * twinkle;
      ctx.beginPath();
      ctx.moveTo(x - len, y);
      ctx.lineTo(x + len, y);
      ctx.moveTo(x, y - len);
      ctx.lineTo(x, y + len);
      ctx.stroke();
    }
  }

  if (shootingStar) {
    const s = shootingStar;
    const t = s.life / s.maxLife;
    const fade = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    const tailLen = 140;
    const dirLen = Math.hypot(s.vx, s.vy) || 1;
    const tx = s.x - (s.vx / dirLen) * tailLen;
    const ty = s.y - (s.vy / dirLen) * tailLen;

    const grad = ctx.createLinearGradient(s.x, s.y, tx, ty);
    grad.addColorStop(0, `rgba(255, 245, 220, ${0.9 * fade})`);
    grad.addColorStop(1, 'rgba(255, 245, 220, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
}

// -----------------------------------------------------------------------------
// Ramo
// -----------------------------------------------------------------------------

/** Definición relativa del ramo; se convierte a píxeles en flowerLayout(). */
const BOUQUET = [
  { offsetX: -0.13, heightRatio: 0.42, delay: 0.0, curve: -0.65, seed: 3 },
  { offsetX: 0.0, heightRatio: 0.54, delay: 0.6, curve: 0.08, seed: 7 },
  { offsetX: 0.13, heightRatio: 0.45, delay: 1.2, curve: 0.65, seed: 11 },
];

/** @type {Flower[]} */
let flowers = [];

function flowerLayout(def) {
  const spread = state.width < 520 ? 1.5 : 1;
  const minDim = Math.min(state.width, state.height);
  const stemHeight = def.heightRatio * state.height;
  const petalRadius = Math.max(26, Math.min(58, minDim * 0.085)) * (def.heightRatio / 0.5);

  // Desplazamiento de la cabeza por la curvatura (misma fórmula que Flower.resize)
  // más un margen de viento; se limita la base para que la cabeza quepa siempre.
  const tipOffset = def.curve * stemHeight * 0.22;
  const margin = petalRadius * 1.15 + stemHeight * 0.05 + 12;

  let x = state.width / 2 + def.offsetX * spread * state.width;
  x = Math.min(Math.max(x, margin - tipOffset), state.width - margin - tipOffset);

  return { x, baseY: state.height + 8, stemHeight, petalRadius };
}

function createFlowers() {
  flowers = BOUQUET.map(
    (def) =>
      new Flower({
        ...flowerLayout(def),
        delay: def.delay,
        curve: def.curve,
        seed: def.seed,
      })
  );
}

function layoutFlowers() {
  flowers.forEach((flower, i) => {
    const l = flowerLayout(BOUQUET[i]);
    flower.resize(l.x, l.baseY, l.stemHeight, l.petalRadius);
  });
}

// -----------------------------------------------------------------------------
// Luciérnagas
// -----------------------------------------------------------------------------

/** @type {Particle[]} */
let fireflies = [];
let fireflyTarget = 0;

function fireflyCount() {
  return state.isMobile ? 40 : 70;
}

function spawnFireflies(dt) {
  const openHeads = flowers.filter((f) => f.isOpen).map((f) => f.getHeadPosition());
  if (openHeads.length === 0) return;

  // Aparecen de forma gradual (no todas a la vez).
  fireflyTarget = Math.min(fireflyCount(), fireflyTarget + dt * 22);
  const scale = state.isMobile ? 0.8 : 1;
  while (fireflies.length < Math.floor(fireflyTarget)) {
    const head = openHeads[Math.floor(Math.random() * openHeads.length)];
    fireflies.push(new Particle(head, scale));
  }
}

function nearestHead(p, heads) {
  let best = null;
  let bestD = Infinity;
  for (const h of heads) {
    const d = (h.x - p.x) ** 2 + (h.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

function updateFireflies(dt, w) {
  if (fireflies.length === 0) return;
  const heads = flowers.filter((f) => f.bloomProgress > 0).map((f) => f.getHeadPosition());
  const bounds = { width: state.width, height: state.height };
  for (const p of fireflies) {
    p.update(dt, state.time, nearestHead(p, heads), w, bounds);
  }
}

function drawFireflies(ctx) {
  if (fireflies.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of fireflies) p.draw(ctx);
  ctx.restore();
}

// -----------------------------------------------------------------------------
// Resize / DPR
// -----------------------------------------------------------------------------

function resize() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  state.isMobile = state.width < 700 || (navigator.maxTouchPoints > 0 && state.width < 1024);

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

  // 1. Desvanecer la intro.
  intro.classList.add('hidden');
  document.body.classList.add('started');
  document.body.style.cursor = 'default';

  // 2. Música: debe iniciarse dentro del gesto (política de Autoplay).
  //    AudioPlayer hace el fade-in 0 -> 0.4 en 2.5 s.
  audio.play();

  // 3. Ramo: empieza a crecer en el siguiente frame.
  createFlowers();
}

document.addEventListener('pointerdown', start, { once: true });
document.addEventListener('touchstart', start, { once: true, passive: true });
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Enter' || e.key === ' ') start();
  },
  { once: true }
);

// -----------------------------------------------------------------------------
// Bucle principal
// -----------------------------------------------------------------------------

function loop(now) {
  const dt = Math.min((now - state.lastTime) / 1000 || 0, 0.05);
  state.lastTime = now;
  state.time += dt;

  updateShootingStar(dt);
  drawStars(galaxyCtx, state.time);

  if (state.started) {
    const w = wind(state.time);

    for (const flower of flowers) flower.update(dt, w);
    spawnFireflies(dt);
    updateFireflies(dt, w);

    flowersCtx.clearRect(0, 0, state.width, state.height);
    for (const flower of flowers) flower.draw(flowersCtx);
    drawFireflies(flowersCtx);
  }

  requestAnimationFrame(loop);
}

resize();
requestAnimationFrame((t) => {
  state.lastTime = t;
  loop(t);
});
