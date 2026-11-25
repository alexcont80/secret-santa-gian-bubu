// Classic worker: the pinned MediaPipe WASM loader calls importScripts internally.
let tracker, summarizeFace;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const module = await import('./tracker.mjs');
      summarizeFace = module.summarizeFace;
      tracker = await module.loadTracker();
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      try {
        const face = summarizeFace(tracker.detectForVideo(data.bitmap, data.time));
        self.postMessage({ type: 'result', face, time: data.time });
      } finally {
        data.bitmap.close();
      }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error?.message || error) });
  }
};
