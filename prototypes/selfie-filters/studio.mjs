import { cropFor, drawEffects, loadArt, poseFrom, smoothPose } from './effects.mjs';
import { startTracking } from './tracking-session.mjs';

const byId = id => document.getElementById(id);
const video = byId('camera'), canvas = byId('picture');
const ctx = canvas.getContext('2d', { alpha: false });
const choices = [...document.querySelectorAll('[data-item]')];
const selected = new Set(['hat']);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let stream, tracking, assets, pose, preview, previewUrl, raf;
let mode = 'idle', generation = 0, detectorState = 'off', lastVideoTime = -1;
let lastSeen = -Infinity, wobble = 0, mirror = true, lastMessage = '';
const artReady = loadArt().then(art => { assets = art; }, () => { assets = null; });

function say(text) {
  if (lastMessage !== text) { byId('status').textContent = text; lastMessage = text; }
}
function showMode(next) {
  mode = next;
  byId('idle').hidden = !['idle','opening'].includes(next);
  byId('open').disabled = next === 'opening';
  byId('live').hidden = next !== 'live';
  byId('review').hidden = next !== 'review';
  byId('use').hidden = window.parent === window;
  const showCanvas = ['live','capturing','review'].includes(next);
  canvas.classList.toggle('visible', showCanvas);
  byId('stage').classList.toggle('active', showCanvas);
  choices.forEach(button => { button.disabled = ['capturing','review'].includes(next); });
}
function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  byId('save').removeAttribute('href'); preview = null; previewUrl = null;
}
function stopTracking() {
  tracking?.close(); tracking = null; detectorState = 'off'; pose = null;
  lastSeen = -Infinity; wobble = 0;
}
function stopStream() {
  cancelAnimationFrame(raf); stopTracking();
  if (stream) for (const track of stream.getTracks()) { track.onended = null; track.stop(); }
  stream = null; video.srcObject = null; lastVideoTime = -1;
}
function idle(message) {
  generation++; stopStream(); clearPreview(); showMode('idle'); say(message);
}
function acceptPoints(points, time) {
  if (!points) { pose = null; lastSeen = -Infinity; wobble = 0; return; }
  const next = poseFrom(points, canvas.width, canvas.height);
  const previous = pose;
  pose = smoothPose(pose, next, time - lastSeen);
  if (previous && time-lastSeen < 300) {
    const delta = Math.atan2(Math.sin(pose.angle-previous.angle), Math.cos(pose.angle-previous.angle));
    wobble = Math.max(-.23, Math.min(.23, wobble*.5 - delta*1.25));
  } else { wobble = 0; }
  lastSeen = time;
}
function syncTracker() {
  if (!selected.size) { stopTracking(); return; }
  if (tracking || mode !== 'live') return;
  if (!assets) { detectorState = 'error'; return; }
  detectorState = 'loading';
  tracking = startTracking(acceptPoints, () => { detectorState = 'ready'; }, () => { pose = null; detectorState = 'error'; });
}
function frame(time) {
  if (mode !== 'live') return;
  if (video.readyState >= 2 && video.videoWidth > 0) {
    const crop = cropFor(video.videoWidth, video.videoHeight);
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      tracking?.update(video, crop, time);
    }
    ctx.save();
    if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, ...crop, 0, 0, canvas.width, canvas.height);
    const visible = detectorState === 'ready' && pose && time - lastSeen < 380;
    if (visible && selected.size) {
      drawEffects(ctx, assets, selected, pose, time, wobble * Math.exp(-Math.max(0,time-lastSeen)/160), reducedMotion.matches);
    }
    ctx.restore();
    byId('snap').disabled = Boolean(selected.size && !visible);
    if (!selected.size) say('Scatto senza accessori.');
    else if (detectorState === 'error') say('Filtri non disponibili. Deseleziona gli accessori per scattare, oppure riapri la fotocamera.');
    else if (detectorState !== 'ready') say('Caricamento dei filtri…');
    else if (!visible) say('Inquadra il viso al centro e lascia spazio sopra la testa.');
    else say('Accessori agganciati. Puoi scattare.');
  }
  raf = requestAnimationFrame(frame);
}
async function openCamera() {
  const version = ++generation;
  stopStream(); clearPreview(); showMode('opening'); say('Apertura della fotocamera…');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Apri la pagina in HTTPS oppure su localhost per attivare la fotocamera.');
    const next = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: { ideal:'user' }, width: { ideal:960 }, height: { ideal:720 }, frameRate:{ ideal:24, max:30 } },
    });
    if (generation !== version) { next.getTracks().forEach(t => t.stop()); return; }
    stream = next;
    const track = next.getVideoTracks()[0];
    mirror = track.getSettings().facingMode !== 'environment';
    track.onended = () => idle('Fotocamera scollegata. Puoi riaprirla.');
    video.srcObject = stream;
    await video.play(); await artReady;
    if (generation !== version) return;
    showMode('live'); byId('snap').disabled = true; syncTracker();
    raf = requestAnimationFrame(frame);
  } catch (error) {
    if (generation !== version) return;
    const denied = error.name === 'NotAllowedError';
    const message = denied ? 'Accesso negato. Consenti la fotocamera nelle impostazioni del browser.'
      : (navigator.mediaDevices?.getUserMedia ? 'Fotocamera non disponibile. Verifica che sia collegata e riprova.' : error.message);
    idle(message);
  }
}
function encode(type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}
async function capture() {
  if (mode !== 'live' || byId('snap').disabled) return;
  const version = generation;
  // Freeze exactly the composited, mirrored canvas that was visible on tap.
  showMode('capturing'); stopStream(); say('Preparazione del selfie…');
  try {
    let blob = await encode('image/webp',.82);
    if (!blob || blob.type !== 'image/webp' || blob.size >= 1_000_000) blob = await encode('image/jpeg',.75);
    if (!blob || blob.size >= 1_000_000) throw Error();
    if (version !== generation) return;
    preview = blob; previewUrl = URL.createObjectURL(blob);
    const save = byId('save'); save.href = previewUrl;
    save.download = 'secret-santa-selfie.' + (blob.type === 'image/webp' ? 'webp' : 'jpg');
    showMode('review'); say('Il selfie è pronto.');
  } catch {
    if (version === generation) idle('Salvataggio non riuscito. Riapri la fotocamera per riprovare.');
  }
}
for (const button of choices) button.addEventListener('click', () => {
  const key = button.dataset.item;
  if (selected.has(key)) selected.delete(key); else selected.add(key);
  button.setAttribute('aria-pressed', String(selected.has(key))); syncTracker();
  if (mode === 'live' && selected.size) byId('snap').disabled = true;
});
byId('open').onclick = byId('retake').onclick = openCamera;
byId('snap').onclick = capture;
byId('stop').onclick = () => idle('Fotocamera spenta.');
byId('use').onclick = () => {
  if (preview && window.parent !== window) {
    window.parent.postMessage({ type:'secret-santa:selfie', blob:preview }, window.location.origin);
    say('Selfie consegnato alla web app.');
  }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ['opening','live'].includes(mode)) idle('Fotocamera in pausa. Riaprila quando vuoi.');
});
window.addEventListener('pagehide', () => idle('Fotocamera spenta.'));
