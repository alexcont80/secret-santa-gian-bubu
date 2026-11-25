export function cropFor(width, height, ratio = 4 / 5) {
  const w = Math.min(width, height * ratio), h = w / ratio;
  return [(width - w) / 2, (height - h) / 2, w, h];
}

export async function loadArt() {
  const images = await Promise.all(['hat', 'antler', 'beard'].map(async name => {
    const image = new Image();
    image.src = new URL('./art/' + name + '.webp', import.meta.url).href;
    await image.decode();
    return [name, image];
  }));
  return Object.fromEntries(images);
}

export function poseFrom(points, width, height) {
  const [left, right, forehead, nose, mouth, chin, templeL, templeR] =
    points.map(p => ({ x: p.x * width, y: p.y * height }));
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  return {
    angle: Math.atan2(right.y - left.y, right.x - left.x),
    width: Math.max(distance(templeL, templeR), distance(left, right) * 1.36),
    headX: forehead.x, headY: forehead.y, noseX: nose.x, noseY: nose.y,
    lipX: mouth.x, lipY: mouth.y, jaw: distance(mouth, chin),
  };
}

// Smooth small jitter, but snap to a new face after a gap or a large jump.
export function smoothPose(old, next, delta) {
  if (!old || delta > 300 || Math.hypot(next.noseX-old.noseX, next.noseY-old.noseY) > next.width*.6) return next;
  const weight = 1 - Math.exp(-Math.max(1, delta) / 48);
  return Object.fromEntries(Object.entries(next).map(([key,value]) => {
    let diff = value - old[key];
    if (key === 'angle') diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return [key, old[key] + weight * diff];
  }));
}

function anchored(ctx, x, y, angle, draw) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); draw(); ctx.restore();
}

export function paintHat(ctx, art, width, wobble) {
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.translate(width*.32, -width*.26);
    ctx.rotate(side*wobble + .11);
    ctx.drawImage(art.antler, -width*.055, -width*.66, width*.40, width*.68);
    ctx.restore();
  }
  ctx.drawImage(art.hat, -width*.55, -width*.53, width*1.10, width*.74);
}

export function drawEffects(ctx, art, selected, pose, time, wobble, reduceMotion = false) {
  const w = pose.width;
  if (selected.has('hat')) {
    anchored(ctx, pose.headX, pose.headY, pose.angle, () => paintHat(ctx, art, w, reduceMotion ? 0 : wobble));
  }
  if (selected.has('beard')) {
    const height = Math.max(w*.78, Math.min(w*1.10, pose.jaw*2.52));
    anchored(ctx, pose.lipX, pose.lipY, pose.angle, () =>
      ctx.drawImage(art.beard, -w*.48, -height*.29, w*.96, height));
  }
  if (selected.has('nose')) {
    const pulse = reduceMotion ? 1 : 1 + .055*Math.sin(time/230);
    const r = w*.113*pulse;
    anchored(ctx, pose.noseX, pose.noseY, pose.angle, () => {
      ctx.scale(1, .86);
      const red = ctx.createRadialGradient(-r*.32, -r*.4, r*.09, 0, 0, r);
      red.addColorStop(0,'#ffe0cb'); red.addColorStop(.22,'#ff715b');
      red.addColorStop(.55,'#df2d3a'); red.addColorStop(1,'#8b1428');
      ctx.fillStyle = red; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
    });
  }
}
