/**
 * Utilidad de audio.
 *
 * Crea un reproductor HTML5 <audio> configurado para reproducirse en bucle.
 * La reproducción DEBE iniciarse desde un gesto del usuario (click / touch)
 * para respetar las políticas de Autoplay de los navegadores. `play()` devuelve
 * la promesa de `HTMLMediaElement.play()` ya protegida con `.catch`, de modo
 * que un rechazo (autoplay bloqueado, archivo ausente) nunca rompa la app.
 *
 * @param {string} src Ruta del archivo de audio (p. ej. 'assets/audio/song.mp3').
 * @param {{ loop?: boolean, volume?: number, fadeInMs?: number }} [options]
 * @returns {{ play: () => Promise<boolean>, stop: () => void, element: HTMLAudioElement }}
 */
export function createAudio(src, { loop = true, volume = 0.6, fadeInMs = 1500 } = {}) {
  const element = new Audio(src);
  element.loop = loop;
  element.preload = 'auto';
  element.volume = 0;

  let ready = true;

  element.addEventListener('error', () => {
    ready = false;
    console.warn(`[audio] No se pudo cargar "${src}". La animación continúa sin música.`);
  });

  /**
   * Sube el volumen gradualmente hasta el valor objetivo.
   * @param {number} target
   */
  function fadeIn(target) {
    if (fadeInMs <= 0) {
      element.volume = target;
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / fadeInMs, 1);
      element.volume = target * t;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /**
   * Inicia la reproducción. Llamar únicamente dentro de un handler de gesto
   * de usuario para cumplir con las políticas de Autoplay.
   * @returns {Promise<boolean>} true si empezó a sonar, false si fue bloqueado o falló.
   */
  async function play() {
    if (!ready) return false;
    try {
      await element.play();
      fadeIn(volume);
      return true;
    } catch (err) {
      console.warn('[audio] Reproducción bloqueada o fallida:', err?.message ?? err);
      return false;
    }
  }

  function stop() {
    element.pause();
    element.currentTime = 0;
  }

  return { play, stop, element };
}
