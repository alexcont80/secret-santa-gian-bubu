const runtime = new URL('./runtime/', import.meta.url);

export async function loadTracker() {
  const { FilesetResolver, FaceLandmarker } = await import(new URL('vision_bundle.mjs', runtime));
  const files = await FilesetResolver.forVisionTasks(new URL('wasm', runtime).href);
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: new URL('face_landmarker.task', runtime).href, delegate: 'CPU' },
    runningMode: 'VIDEO', numFaces: 1,
    outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
  });
}

// Send eight anchor points instead of the whole mesh back to the view.
export function anchors(result) {
  const face = result.faceLandmarks[0];
  if (!face) return null;
  return [33, 263, 10, 1, 13, 152, 234, 454].map(i => ({ x: face[i].x, y: face[i].y }));
}
