const runtime = new URL('./runtime/', import.meta.url);

export async function loadTracker() {
  const { FilesetResolver, FaceLandmarker } = await import(new URL('vision_bundle.mjs', runtime));
  const files = await FilesetResolver.forVisionTasks(new URL('wasm', runtime).href);
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: new URL('face_landmarker.task', runtime).href, delegate: 'CPU' },
    runningMode: 'VIDEO', numFaces: 1,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false,
  });
}

// Keep the full mesh inside the inference context. Only the camera anchors and four
// expression scores cross the worker boundary.
export function summarizeFace(result) {
  const face = result.faceLandmarks[0];
  if (!face) return null;
  const points = [33, 263, 10, 1, 13, 152, 234, 454, 132, 361]
    .map(i => ({ x: face[i].x, y: face[i].y }));
  const scores = Object.create(null);
  for (const { categoryName, score } of result.faceBlendshapes?.[0]?.categories ?? []) {
    scores[categoryName] = score;
  }
  // Small resting smiles can yield high smile scores. Require parted lips as
  // well for the customs stamp so selecting the effect does not fire it.
  const lipGap = Math.hypot(face[13].x-face[14].x, face[13].y-face[14].y);
  const eyeSpan = Math.hypot(face[33].x-face[263].x, face[33].y-face[263].y);
  const smile = ((scores.mouthSmileLeft ?? 0) + (scores.mouthSmileRight ?? 0)) / 2;
  const smileWithTeeth = smile * Math.min(1, lipGap / Math.max(.001, eyeSpan * .085));
  return {
    points,
    gestures: {
      punch: scores.jawOpen ?? 0,
      kiss: scores.mouthPucker ?? 0,
      customs: smileWithTeeth,
      pop: scores.browInnerUp ?? 0,
    },
  };
}
