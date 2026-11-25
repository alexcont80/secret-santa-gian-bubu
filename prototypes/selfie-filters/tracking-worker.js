// Classic worker: the pinned MediaPipe WASM loader calls importScripts internally.
let tracker, anchors;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const module = await import('./tracker.mjs');
      anchors = module.anchors;
      tracker = await module.loadTracker();
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      try {
        const points = anchors(tracker.detectForVideo(data.bitmap, data.time));
        self.postMessage({ type: 'result', points, time: data.time });
      } finally {
        data.bitmap.close();
      }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error?.message || error) });
  }
};
