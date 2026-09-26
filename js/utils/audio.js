/**
 * AudioPlayer
 *
 * Reproductor HTML5 <audio> en bucle con fade-in por código.
 *
 * Política de Autoplay: los navegadores solo permiten iniciar audio dentro de
 * un gesto del usuario (click / tap / tecla). `play()` debe llamarse desde ese
 * handler. La promesa de `HTMLMediaElement.play()` se protege con try/catch
 * para que un rechazo (autoplay bloqueado, archivo ausente) nunca rompa la
 * experiencia visual.
 *
 * Uso:
 *   const player = new AudioPlayer('assets/audio/golden-hour.mp3', {
 *     loop: true, targetVolume: 0.4, fadeDuration: 2500,
 *   });
 *   document.addEventListener('pointerdown', () => player.play(), { once: true });
 */

const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export default class AudioPlayer {
  /**
   * @param {string} src Ruta del archivo de audio.
   * @param {object} [options]
   * @param {boolean} [options.loop=true]          Reproducir en bucle.
   * @param {number}  [options.targetVolume=0.4]   Volumen final del fade-in (0..1).
   * @param {number}  [options.fadeDuration=2500]  Duración del fade-in en ms.
   */
  constructor(src, { loop = true, targetVolume = 0.4, fadeDuration = 2500 } = {}) {
    this.src = src;
    this.targetVolume = Math.min(Math.max(targetVolume, 0), 1);
    this.fadeDuration = fadeDuration;

    this.element = new Audio(src);
    this.element.loop = loop;
    this.element.preload = 'auto';
    this.element.volume = 0;

    this.available = true;
    this.playing = false;
    this._fadeFrame = 0;

    this.element.addEventListener('error', () => {
      this.available = false;
      console.warn(`[AudioPlayer] No se pudo cargar "${src}". La experiencia continúa sin música.`);
    });

    this.element.addEventListener('ended', () => {
      if (!loop) this.playing = false;
    });
  }

  get isPlaying() {
    return this.playing && !this.element.paused;
  }

  /**
   * Inicia la reproducción con fade-in de 0 → targetVolume.
   * Debe invocarse dentro de un gesto de usuario.
   * @returns {Promise<boolean>} true si el audio empezó a sonar.
   */
  async play() {
    if (!this.available || this.playing) return this.playing;

    this.element.volume = 0;

    try {
      await this.element.play();
    } catch (err) {
      console.warn('[AudioPlayer] Reproducción bloqueada o fallida:', err?.message ?? err);
      return false;
    }

    this.playing = true;
    this.fadeTo(this.targetVolume, this.fadeDuration);
    return true;
  }

  /**
   * Transiciona el volumen actual hacia `volume` en `duration` ms.
   * Usa requestAnimationFrame para una curva suave (easeInOutSine).
   * @param {number} volume   Volumen destino (0..1).
   * @param {number} duration Duración en ms.
   * @returns {Promise<void>}
   */
  fadeTo(volume, duration = 1000) {
    cancelAnimationFrame(this._fadeFrame);

    const from = this.element.volume;
    const to = Math.min(Math.max(volume, 0), 1);

    if (duration <= 0 || from === to) {
      this.element.volume = to;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        this.element.volume = from + (to - from) * easeInOutSine(t);
        if (t < 1) {
          this._fadeFrame = requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      this._fadeFrame = requestAnimationFrame(step);
    });
  }

  /** Pausa con fade-out corto y reinicia la pista. */
  async stop(fadeOut = 600) {
    if (!this.playing) return;
    await this.fadeTo(0, fadeOut);
    this.element.pause();
    this.element.currentTime = 0;
    this.playing = false;
  }
}
