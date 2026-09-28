import { AudioEngine, sensitivityNames } from './audio.js';

const root = document.querySelector('#visualizer');
const colorValue = document.querySelector('#colorValue');
const rgbValue = document.querySelector('#rgbValue');
const frameValue = document.querySelector('#frameValue');
const toggleButton = document.querySelector('#toggleButton');
const toggleIcon = document.querySelector('#toggleIcon');
const toggleLabel = document.querySelector('#toggleLabel');
const fullscreenButton = document.querySelector('#fullscreenButton');
const speedRange = document.querySelector('#speedRange');
const speedLabel = document.querySelector('#speedLabel');
const motionSpeedRange = document.querySelector('#motionSpeedRange');
const motionSpeedLabel = document.querySelector('#motionSpeedLabel');
const prompt = document.querySelector('#centerPrompt');
const mixButton = document.querySelector('#mixButton');
const menuTab = document.querySelector('#menuTab');
const closeMenuButton = document.querySelector('#closeMenuButton');
const effectButtons = [...document.querySelectorAll('.effect-toggle')];
const ambientOne = document.querySelector('.ambient-one');
const livePill = document.querySelector('.live-pill');
const hintPrimary = document.querySelector('#hintPrimary');
const spectrumCanvas = document.querySelector('#spectrumCanvas');
const spectrumContext = spectrumCanvas.getContext('2d');
const beatLayer = document.querySelector('#beatLayer');
const beatFlash = document.querySelector('#beatFlash');
const micButton = document.querySelector('#micButton');
const micLabel = document.querySelector('#micLabel');
const micStatus = document.querySelector('#micStatus');
const micError = document.querySelector('#micError');
const levelFill = document.querySelector('#levelFill');
const bpmValue = document.querySelector('#bpmValue');
const beatValue = document.querySelector('#beatValue');
const sensitivityRange = document.querySelector('#sensitivityRange');
const sensitivityLabel = document.querySelector('#sensitivityLabel');
const spectrumButton = document.querySelector('#spectrumButton');
const spectrumToggleLabel = document.querySelector('#spectrumToggleLabel');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const speedNames = ['CALM', 'EASY', 'MEDIUM', 'FAST', 'RAPID'];
const intervals = [1100, 640, 360, 180, 75];
const motionNames = ['FLOAT', 'EASY', 'MEDIUM', 'FAST', 'TURBO'];
const motionProfiles = [
  { orbit: '30s', wave: '14s', liquid: '28s', prism: '22s' },
  { orbit: '20s', wave: '9s', liquid: '19s', prism: '15s' },
  { orbit: '13s', wave: '6s', liquid: '12s', prism: '10s' },
  { orbit: '7s', wave: '3.6s', liquid: '7s', prism: '5.5s' },
  { orbit: '3.2s', wave: '1.7s', liquid: '3.6s', prism: '2.8s' },
];
const effects = { objects: false, waves: false, liquid: false, prism: false };
let speed = Number(speedRange.value);
let motionSpeed = Number(motionSpeedRange.value);
let playing = true;
let frame = 1;
let timer;
let promptTimer;
let micStartPending = false;
let screenWakeLock = null;
let wakeLockPending = false;

/* ---------- audio state ---------- */
const BAR_COUNT = 72; // spectrum bars across the strip
const MIN_HZ = 30;
const MAX_HZ = 16000;
const audio = new AudioEngine();
const barBins = new Int32Array(BAR_COUNT + 1);
const peaks = new Float32Array(BAR_COUNT);
const ripples = [];
const ripplePool = [];
let audioFrameId = 0;
let spectrumEnabled = true;
let stripWidth = 0;
let stripHeight = 0;
let lastFrameTime = 0;
let readoutClock = 0;
let hue = Math.random() * 360;
let hueBias = 0; // extra hue offset, re-rolled by clicking while listening
let accentHue = 85;
let sensitivity = Number(sensitivityRange.value);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

async function keepScreenAwake() {
  if (screenWakeLock || wakeLockPending || document.visibilityState !== 'visible' || !navigator.wakeLock?.request) return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (document.visibilityState !== 'visible') {
      await lock.release();
      return;
    }
    screenWakeLock = lock;
    lock.addEventListener('release', () => {
      if (screenWakeLock === lock) screenWakeLock = null;
    });
  } catch {
    // Wake lock may be unavailable or denied; the visualizer remains usable.
  } finally {
    wakeLockPending = false;
  }
}

async function releaseScreenWakeLock() {
  const lock = screenWakeLock;
  screenWakeLock = null;
  try { await lock?.release(); } catch {}
}

function randomColor() {
  const baseHue = Math.floor(Math.random() * 360);
  const saturation = 62 + Math.floor(Math.random() * 30);
  const lightness = 42 + Math.floor(Math.random() * 20);
  return hslToRgb(baseHue, saturation, lightness);
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function randomVw(min, max) {
  return `${(Math.random() * (max - min) + min).toFixed(1)}vw`;
}

function randomDeg(min, max) {
  return `${Math.floor(Math.random() * (max - min) + min)}deg`;
}

function randomizeObjects() {
  root.style.setProperty('--square-x', randomVw(-42, 42));
  root.style.setProperty('--square-y', randomVw(-35, 35));
  root.style.setProperty('--square-scale', (0.45 + Math.random() * 1.45).toFixed(2));
  root.style.setProperty('--square-rotate', randomDeg(-180, 180));
  root.style.setProperty('--square-delay', `${(Math.random() * -5).toFixed(2)}s`);
  root.style.setProperty('--triangle-x', randomVw(-42, 42));
  root.style.setProperty('--triangle-y', randomVw(-35, 35));
  root.style.setProperty('--triangle-scale', (0.45 + Math.random() * 1.55).toFixed(2));
  root.style.setProperty('--triangle-rotate', randomDeg(-180, 180));
  root.style.setProperty('--triangle-delay', `${(Math.random() * -5).toFixed(2)}s`);
}

/* Maps the BAR_COUNT bars onto log-spaced frequency ranges so low bass notes
   are not squeezed into two pixels the way they would be on a linear scale. */
function buildBarBins() {
  const bins = audio.frequency.length;
  const ratio = MAX_HZ / MIN_HZ;
  for (let i = 0; i <= BAR_COUNT; i += 1) {
    const hz = MIN_HZ * ratio ** (i / BAR_COUNT);
    barBins[i] = clamp(Math.round(hz / audio.hzPerBin), 0, bins - 1);
  }
  peaks.fill(0);
}

function resizeSpectrum() {
  const rect = spectrumCanvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  stripWidth = rect.width;
  stripHeight = rect.height;
  spectrumCanvas.width = Math.max(1, Math.round(rect.width * ratio));
  spectrumCanvas.height = Math.max(1, Math.round(rect.height * ratio));
  spectrumContext.setTransform(ratio, 0, 0, ratio, 0, 0);
}

/** Real-time mirrored FFT strip: glow pass, core pass, peak-hold caps. */
function drawSpectrum(dt) {
  const data = audio.frequency;
  const ctx = spectrumContext;
  const center = stripHeight / 2;
  const reach = Math.max(2, center - 3);
  const gap = 2;
  const barWidth = Math.max(1.5, (stripWidth - gap * (BAR_COUNT - 1)) / BAR_COUNT);
  const huePart = Math.round(accentHue);
  ctx.clearRect(0, 0, stripWidth, stripHeight);

  ctx.fillStyle = 'rgba(255,255,255,.14)';
  ctx.fillRect(0, center - 0.5, stripWidth, 1);
  ctx.font = '8px "DM Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText('60', 2, center - 4);
  ctx.textAlign = 'center';
  ctx.fillText('1K', stripWidth / 2, center - 4);
  ctx.textAlign = 'right';
  ctx.fillText('12K', stripWidth - 2, center - 4);

  for (let i = 0; i < BAR_COUNT; i += 1) {
    const from = barBins[i];
    const to = Math.max(from + 1, barBins[i + 1]);
    let sum = 0;
    for (let bin = from; bin < to; bin += 1) sum += data[bin];
    const average = sum / (to - from) / 255;
    const value = Math.min(1, average ** 0.72 * 1.55);
    const height = Math.max(1, value * reach);
    const x = i * (barWidth + gap);

    ctx.fillStyle = `hsla(${huePart}, 100%, 58%, .20)`;
    ctx.fillRect(x - 1, center - height - 1, barWidth + 2, height * 2 + 2);
    ctx.fillStyle = `hsla(${huePart}, 100%, 66%, .58)`;
    ctx.fillRect(x, center - height, barWidth, height * 2);
    ctx.fillStyle = 'rgba(255,255,255,.48)';
    ctx.fillRect(x, center - height, barWidth, 1.5);

    peaks[i] = Math.max(value, peaks[i] - dt * 0.55);
    if (peaks[i] > 0.02) {
      const capHeight = peaks[i] * reach;
      ctx.fillStyle = 'rgba(255,255,255,.32)';
      ctx.fillRect(x, center - capHeight - 3, barWidth, 1.5);
    }
  }
}

/* ---------- beat reactions ---------- */
function createRipple() {
  const element = document.createElement('span');
  element.className = 'beat-ripple';
  return element;
}

function recycleRipple(ripple) {
  ripple.element.style.opacity = '0';
  ripplePool.push(ripple.element);
}

function spawnRipple(strength) {
  const element = ripplePool.pop() ?? createRipple();
  const size = 26 + Math.random() * 38;
  element.style.width = `${size.toFixed(1)}vmin`;
  element.style.height = `${size.toFixed(1)}vmin`;
  element.style.margin = `${(-size / 2).toFixed(1)}vmin 0 0 ${(-size / 2).toFixed(1)}vmin`;
  element.style.borderWidth = `${(1 + strength * 2.2).toFixed(1)}px`;
  element.style.borderColor = `hsla(${Math.round(accentHue)}, 100%, 74%, .7)`;
  element.style.left = `${(26 + Math.random() * 48).toFixed(1)}%`;
  element.style.top = `${(18 + Math.random() * 52).toFixed(1)}%`;
  element.style.opacity = '0';
  beatLayer.append(element);
  ripples.push({ element, start: performance.now(), life: 850 + Math.random() * 550, strength });
  if (ripples.length > 9) recycleRipple(ripples.shift());
}

function updateRipples(now) {
  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    const ripple = ripples[i];
    const progress = (now - ripple.start) / ripple.life;
    if (progress >= 1) {
      recycleRipple(ripple);
      ripples.splice(i, 1);
      continue;
    }
    const eased = 1 - (1 - progress) ** 3;
    ripple.element.style.transform = `scale(${(0.12 + eased * 1.45).toFixed(3)})`;
    ripple.element.style.opacity = ((1 - progress) ** 1.7 * 0.8 * ripple.strength).toFixed(3);
  }
}

function onBeat(snapshot) {
  if (effects.objects) randomizeObjects();
  if (!reduceMotion.matches) spawnRipple(clamp(0.45 + snapshot.strength, 0.35, 1));
}

/* ---------- audio -> colour ---------- */
function shortestHue(from, to) {
  return ((to - from + 540) % 360) - 180;
}

/** Drives the background from spectral brightness, loudness, and bass weight. */
function applyAudioColor(snapshot, dt) {
  const target = (snapshot.centroid * 460 + hueBias + snapshot.bass * 24) % 360;
  const rate = 0.6 + (speed - 1) * 0.85; // FLOW SPEED = how fast colour chases the audio
  hue = (hue + shortestHue(hue, target) * (1 - Math.exp(-dt * rate)) + 360) % 360;
  const saturation = clamp(58 + snapshot.level * 34, 40, 96);
  const lightness = clamp(38 + snapshot.level * 26 + snapshot.bass * 6, 20, 68);
  const rgb = hslToRgb(hue, saturation, lightness);
  const hex = toHex(rgb);
  accentHue = (hue + 180) % 360;
  root.style.backgroundColor = hex;
  ambientOne.style.backgroundColor = hex;
  root.style.setProperty('--accent', `hsl(${Math.round(accentHue)} 95% 62%)`);
  return { hex, rgb };
}

function audioFrame() {
  const snapshot = audio.analyse();
  if (!snapshot) return;
  const now = performance.now();
  const dt = clamp((now - lastFrameTime) / 1000, 0.008, 0.1);
  lastFrameTime = now;

  root.style.setProperty('--level', snapshot.level.toFixed(3));
  root.style.setProperty('--bass', snapshot.bass.toFixed(3));
  root.style.setProperty('--mid', snapshot.mid.toFixed(3));
  root.style.setProperty('--treble', snapshot.treble.toFixed(3));
  root.style.setProperty('--beat', snapshot.pulse.toFixed(3));
  if (!reduceMotion.matches) beatFlash.style.opacity = (snapshot.pulse * 0.3).toFixed(3);
  levelFill.style.width = `${(snapshot.level * 100).toFixed(1)}%`;
  if (snapshot.beat) onBeat(snapshot);
  updateRipples(now);
  if (spectrumEnabled) drawSpectrum(dt);

  const color = playing ? applyAudioColor(snapshot, dt) : null;
  readoutClock += dt;
  if (readoutClock > 0.1) {
    readoutClock = 0;
    if (color) {
      colorValue.textContent = color.hex;
      rgbValue.textContent = `RGB ${color.rgb.join(' · ')}`;
      frameValue.textContent = `FRAME ${String(frame).padStart(4, '0')}`;
      frame += 1;
    }
    bpmValue.textContent = audio.bpm ? `BPM ${audio.bpm}` : 'BPM —';
    beatValue.textContent = `BEATS ${audio.beatCount}`;
  }
  audioFrameId = requestAnimationFrame(audioFrame);
}

/* ---------- microphone controls ---------- */
const MIC_ERRORS = {
  'NO-SECURE-CONTEXT': 'MIC NEEDS A SECURE CONTEXT — OPEN THE PAGE OVER HTTPS OR http://localhost.',
  NotAllowedError: 'MIC PERMISSION BLOCKED — ALLOW IT IN THE ADDRESS BAR, THEN TRY AGAIN.',
  NotFoundError: 'NO MICROPHONE FOUND ON THIS DEVICE.',
  NotReadableError: 'THE MICROPHONE IS ALREADY IN USE BY ANOTHER APP.',
  OverconstrainedError: 'NO MICROPHONE MATCHES THE REQUESTED SETTINGS.',
};

function describeMicError(error) {
  return MIC_ERRORS[error?.name] ?? `MIC COULD NOT START — ${error?.message ?? 'UNKNOWN ERROR'}.`;
}

function setSpectrumVisible(visible) {
  root.classList.toggle('spectrum-visible', visible && audio.running);
}

async function toggleMicrophone() {
  if (audio.running) {
    stopMicrophone();
    return;
  }
  if (micStartPending) return;
  micStartPending = true;
  micError.hidden = true;
  micButton.disabled = true;
  micStatus.textContent = 'CONNECTING';
  try {
    await audio.start();
    audio.setSensitivity(sensitivity);
    buildBarBins();
    resizeSpectrum();
    schedule(); // the interval stands down while the microphone owns the background
    audio.stream.getAudioTracks().forEach((track) => track.addEventListener('ended', stopMicrophone, { once: true }));
    setSpectrumVisible(spectrumEnabled);
    document.body.classList.add('mic-active');
    livePill.classList.add('is-listening');
    micButton.classList.add('is-live');
    micButton.setAttribute('aria-pressed', 'true');
    micButton.setAttribute('aria-label', 'Disable microphone input');
    micLabel.textContent = 'Stop microphone';
    micStatus.textContent = 'LISTENING';
    hintPrimary.textContent = 'MIC IS DRIVING COLOUR AND EFFECTS';
    lastFrameTime = performance.now();
    readoutClock = 1; // refresh the readouts on the very first frame
    audioFrameId = requestAnimationFrame(audioFrame);
  } catch (error) {
    await audio.stop();
    micStatus.textContent = 'OFFLINE';
    micError.textContent = describeMicError(error);
    micError.hidden = false;
  } finally {
    micStartPending = false;
    micButton.disabled = false;
  }
}

function stopMicrophone() {
  audio.stop();
  cancelAnimationFrame(audioFrameId);
  audioFrameId = 0;
  document.body.classList.remove('mic-active');
  root.classList.remove('spectrum-visible');
  ['--level', '--bass', '--mid', '--treble', '--beat'].forEach((name) => root.style.setProperty(name, '0'));
  root.style.setProperty('--accent', '#a3ff12');
  beatFlash.style.opacity = '0';
  levelFill.style.width = '0%';
  while (ripples.length) recycleRipple(ripples.pop());
  beatLayer.replaceChildren();
  livePill.classList.remove('is-listening');
  micButton.classList.remove('is-live');
  micButton.setAttribute('aria-pressed', 'false');
  micButton.setAttribute('aria-label', 'Enable microphone input');
  micLabel.textContent = 'Enable microphone';
  micStatus.textContent = 'OFFLINE';
  hintPrimary.textContent = 'CLICK ANYWHERE TO CHANGE COLOR';
  bpmValue.textContent = 'BPM —';
  beatValue.textContent = 'BEATS 0';
  spectrumContext.clearRect(0, 0, stripWidth, stripHeight);
  schedule(); // hand the background back to the interval
  if (playing) applyColor(); // ...and restart the flow now rather than after a full tick
  showMenu();
}

function setSensitivity(nextSensitivity) {
  sensitivity = clamp(nextSensitivity, 1, 5);
  sensitivityRange.value = String(sensitivity);
  sensitivityLabel.textContent = sensitivityNames[sensitivity - 1];
  sensitivityRange.style.background = `linear-gradient(90deg, #fff ${(sensitivity - 1) * 25}%, rgba(255,255,255,.20) ${(sensitivity - 1) * 25}%)`;
  audio.setSensitivity(sensitivity);
}

function setSpectrumEnabled(enabled) {
  spectrumEnabled = enabled;
  spectrumButton.setAttribute('aria-pressed', String(enabled));
  spectrumToggleLabel.textContent = enabled ? 'ON' : 'OFF';
  spectrumContext.clearRect(0, 0, stripWidth, stripHeight);
  setSpectrumVisible(enabled);
  showMenu();
}

function applyColor() {
  const rgb = randomColor();
  const hex = toHex(rgb);
  root.style.backgroundColor = hex;
  colorValue.textContent = hex;
  rgbValue.textContent = `RGB ${rgb.join(' · ')}`;
  frameValue.textContent = `FRAME ${String(frame).padStart(4, '0')}`;
  frame += 1;
  ambientOne.style.backgroundColor = hex;
  prompt.style.opacity = '1';
  clearTimeout(promptTimer);
  promptTimer = setTimeout(() => { prompt.style.opacity = '.35'; }, 500);
}

function schedule() {
  clearInterval(timer);
  // While the mic runs the animation loop owns the background, so there is nothing to schedule.
  if (playing && !audio.running) timer = setInterval(applyColor, intervals[speed - 1]);
}

function showMenu() {
  root.classList.remove('menu-hidden');
}

function hideMenu() {
  root.classList.add('menu-hidden');
}

function setPlaying(nextPlaying) {
  playing = nextPlaying;
  document.body.classList.toggle('paused', !playing);
  toggleButton.setAttribute('aria-pressed', String(!playing));
  toggleButton.setAttribute('aria-label', playing ? 'Pause color cycling' : 'Play color cycling');
  toggleIcon.textContent = playing ? 'Ⅱ' : '▶';
  toggleLabel.textContent = playing ? 'Pause flow' : 'Resume flow';
  schedule();
}

function setSpeed(nextSpeed) {
  speed = Math.max(1, Math.min(5, nextSpeed));
  speedRange.value = String(speed);
  speedLabel.textContent = speedNames[speed - 1];
  speedRange.style.background = `linear-gradient(90deg, #fff ${(speed - 1) * 25}%, rgba(255,255,255,.20) ${(speed - 1) * 25}%)`;
  schedule();
}

function setMotionSpeed(nextSpeed) {
  motionSpeed = Math.max(1, Math.min(5, nextSpeed));
  const profile = motionProfiles[motionSpeed - 1];
  motionSpeedRange.value = String(motionSpeed);
  motionSpeedLabel.textContent = motionNames[motionSpeed - 1];
  motionSpeedRange.style.background = `linear-gradient(90deg, #fff ${(motionSpeed - 1) * 25}%, rgba(255,255,255,.20) ${(motionSpeed - 1) * 25}%)`;
  Object.entries(profile).forEach(([name, duration]) => root.style.setProperty(`--${name}-duration`, duration));
}

function setEffect(name, enabled) {
  effects[name] = enabled;
  root.classList.toggle(`effect-${name}`, enabled);
  const button = effectButtons.find((item) => item.dataset.effect === name);
  button?.setAttribute('aria-pressed', String(enabled));
  button?.classList.toggle('is-active', enabled);
  if (name === 'objects' && enabled) randomizeObjects();
  const allOn = Object.values(effects).every(Boolean);
  mixButton.textContent = allOn ? 'CLEAR ALL' : 'MIX ALL';
  mixButton.setAttribute('aria-label', allOn ? 'Clear all visualizer effects' : 'Enable all visualizer effects');
}

function setAllEffects(enabled) {
  Object.keys(effects).forEach((name) => setEffect(name, enabled));
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
}

applyColor();
setSpeed(speed);
setMotionSpeed(motionSpeed);
setSensitivity(sensitivity);
setSpectrumEnabled(spectrumEnabled);
randomizeObjects();
resizeSpectrum();
showMenu();
keepScreenAwake();
new ResizeObserver(resizeSpectrum).observe(spectrumCanvas);
window.addEventListener('resize', resizeSpectrum);
window.addEventListener('pagehide', () => { if (audio.running) stopMicrophone(); });
window.addEventListener('pagehide', releaseScreenWakeLock);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepScreenAwake();
  else releaseScreenWakeLock();
});

/* Clicks are filtered in exactly one place: the root handler ignores anything that landed on a
   control, so the individual handlers never need to stop propagation themselves. */
const CONTROL_SELECTOR = 'button, input, summary, a[href]';

toggleButton.addEventListener('click', () => setPlaying(!playing));
fullscreenButton.addEventListener('click', () => toggleFullscreen());
speedRange.addEventListener('input', (event) => setSpeed(Number(event.target.value)));
motionSpeedRange.addEventListener('input', (event) => { setMotionSpeed(Number(event.target.value)); showMenu(); });
effectButtons.forEach((button) => button.addEventListener('click', () => { setEffect(button.dataset.effect, !effects[button.dataset.effect]); showMenu(); }));
mixButton.addEventListener('click', () => { setAllEffects(!Object.values(effects).every(Boolean)); showMenu(); });
micButton.addEventListener('click', () => { toggleMicrophone(); showMenu(); });
sensitivityRange.addEventListener('input', (event) => { setSensitivity(Number(event.target.value)); showMenu(); });
spectrumButton.addEventListener('click', () => setSpectrumEnabled(!spectrumEnabled));
menuTab.addEventListener('click', () => showMenu());
closeMenuButton.addEventListener('click', hideMenu);
root.addEventListener('click', (event) => {
  if (event.target.closest?.(CONTROL_SELECTOR)) return; // the click belonged to a control
  if (audio.running) hueBias = Math.random() * 360; else applyColor();
});
document.addEventListener('fullscreenchange', () => {
  const label = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreenButton.setAttribute('aria-label', label);
  fullscreenButton.setAttribute('title', label);
  fullscreenButton.querySelector('span').textContent = document.fullscreenElement ? '⤢' : '⛶';
});
