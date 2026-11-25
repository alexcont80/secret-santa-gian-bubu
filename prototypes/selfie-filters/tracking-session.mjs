import { loadTracker, summarizeFace } from './tracker.mjs';

// Only one inference in flight. Slow devices drop analysis frames, never queue them.
export function startTracking(onFace, onReady, onError) {
  let stopped = false, worker = null, detector = null, busy = false, ready = false;
  let timeout, last = -Infinity, delay = 75, fallbackStarted = false;
  const sample = document.createElement('canvas');
  sample.width = 240; sample.height = 300;
  const ctx = sample.getContext('2d', { alpha: false });
  function result(face, time) {
    busy = false;
    delay = Math.min(240, Math.max(75, (performance.now() - time) * 1.5));
    if (!stopped) onFace(face, time);
  }
  async function fallback() {
    if (stopped || fallbackStarted) return;
    fallbackStarted = true;
    clearTimeout(timeout); worker?.terminate(); worker = null; busy = false; ready = false;
    try {
      const local = await loadTracker();
      if (stopped) { local.close(); return; }
      detector = local; ready = true; onReady();
    } catch (error) { if (!stopped) onError(error); }
  }
  if (window.Worker && window.OffscreenCanvas && window.createImageBitmap) {
    try {
      worker = new Worker(new URL('./tracking-worker.js', import.meta.url));
      worker.onmessage = ({ data }) => {
        if (stopped) return;
        if (data.type === 'ready') { clearTimeout(timeout); ready = true; onReady(); }
        if (data.type === 'result') result(data.face, data.time);
        if (data.type === 'error') fallback();
      };
      worker.onerror = event => { event.preventDefault(); fallback(); };
      timeout = setTimeout(fallback, 20000);
      worker.postMessage({ type: 'init' });
    } catch { fallback(); }
  } else { fallback(); }

  return {
    async update(video, crop, time) {
      if (!ready || stopped || busy || time - last < delay) return;
      last = time; busy = true;
      try {
        ctx.drawImage(video, ...crop, 0, 0, sample.width, sample.height);
        if (worker) {
          const target = worker;
          const bitmap = await createImageBitmap(sample);
          if (stopped || target !== worker) { bitmap.close(); return; }
          try { target.postMessage({ type:'frame', bitmap, time }, [bitmap]); }
          catch (error) { bitmap.close(); throw error; }
        } else { result(summarizeFace(detector.detectForVideo(sample, time)), time); }
      } catch (error) {
        busy = false;
        if (!stopped && worker) fallback();
        else if (!stopped) { ready = false; onError(error); }
      }
    },
    close() {
      stopped = true;
      clearTimeout(timeout); worker?.terminate(); detector?.close();
    },
  };
}
