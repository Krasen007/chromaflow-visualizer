const canvas = document.querySelector('#visualizer');
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
const effectButtons = [...document.querySelectorAll('.effect-toggle')];

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
const HIDE_DELAY = 2200;
let speed = Number(speedRange.value);
let motionSpeed = Number(motionSpeedRange.value);
let playing = true;
let frame = 1;
let timer;
let promptTimer;
let hideTimer;

function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 62 + Math.floor(Math.random() * 30);
  const lightness = 42 + Math.floor(Math.random() * 20);
  return hslToRgb(hue, saturation, lightness);
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
  canvas.style.setProperty('--square-x', randomVw(-42, 42));
  canvas.style.setProperty('--square-y', randomVw(-35, 35));
  canvas.style.setProperty('--square-scale', (0.45 + Math.random() * 1.45).toFixed(2));
  canvas.style.setProperty('--square-rotate', randomDeg(-180, 180));
  canvas.style.setProperty('--square-delay', `${(Math.random() * -5).toFixed(2)}s`);
  canvas.style.setProperty('--triangle-x', randomVw(-42, 42));
  canvas.style.setProperty('--triangle-y', randomVw(-35, 35));
  canvas.style.setProperty('--triangle-scale', (0.45 + Math.random() * 1.55).toFixed(2));
  canvas.style.setProperty('--triangle-rotate', randomDeg(-180, 180));
  canvas.style.setProperty('--triangle-delay', `${(Math.random() * -5).toFixed(2)}s`);
}

function applyColor() {
  const rgb = randomColor();
  const hex = toHex(rgb);
  canvas.style.backgroundColor = hex;
  colorValue.textContent = hex;
  rgbValue.textContent = `RGB ${rgb.join(' · ')}`;
  frameValue.textContent = `FRAME ${String(frame).padStart(4, '0')}`;
  frame += 1;
  document.querySelector('.ambient-one').style.backgroundColor = hex;
  prompt.style.opacity = '1';
  clearTimeout(promptTimer);
  promptTimer = setTimeout(() => { prompt.style.opacity = '.35'; }, 500);
}

function schedule() {
  clearInterval(timer);
  if (playing) timer = setInterval(applyColor, intervals[speed - 1]);
}

function showMenu() {
  clearTimeout(hideTimer);
  canvas.classList.remove('menu-hidden');
  if (playing) hideTimer = setTimeout(hideMenu, HIDE_DELAY);
}

function hideMenu() {
  if (playing) canvas.classList.add('menu-hidden');
}

function syncMenu() {
  clearTimeout(hideTimer);
  if (playing) showMenu();
  else canvas.classList.remove('menu-hidden');
}

function setPlaying(nextPlaying) {
  playing = nextPlaying;
  document.body.classList.toggle('paused', !playing);
  toggleButton.setAttribute('aria-pressed', String(!playing));
  toggleButton.setAttribute('aria-label', playing ? 'Pause color cycling' : 'Play color cycling');
  toggleIcon.textContent = playing ? 'Ⅱ' : '▶';
  toggleLabel.textContent = playing ? 'Pause flow' : 'Resume flow';
  schedule();
  syncMenu();
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
  Object.entries(profile).forEach(([name, duration]) => canvas.style.setProperty(`--${name}-duration`, duration));
}

function setEffect(name, enabled) {
  effects[name] = enabled;
  canvas.classList.toggle(`effect-${name}`, enabled);
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
randomizeObjects();
showMenu();
toggleButton.addEventListener('click', (event) => { event.stopPropagation(); setPlaying(!playing); });
fullscreenButton.addEventListener('click', (event) => { event.stopPropagation(); toggleFullscreen(); });
speedRange.addEventListener('input', (event) => { event.stopPropagation(); setSpeed(Number(event.target.value)); });
motionSpeedRange.addEventListener('input', (event) => { event.stopPropagation(); setMotionSpeed(Number(event.target.value)); showMenu(); });
effectButtons.forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const name = button.dataset.effect; setEffect(name, !effects[name]); showMenu(); }));
mixButton.addEventListener('click', (event) => { event.stopPropagation(); setAllEffects(!Object.values(effects).every(Boolean)); showMenu(); });
menuTab.addEventListener('click', (event) => { event.stopPropagation(); showMenu(); });
canvas.addEventListener('click', (event) => { if (!event.target.closest('button, input')) { applyColor(); showMenu(); } });
document.addEventListener('pointermove', showMenu, { passive: true });
document.addEventListener('pointerdown', showMenu, { passive: true });
document.addEventListener('touchstart', showMenu, { passive: true });
document.addEventListener('fullscreenchange', () => { fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'); fullscreenButton.querySelector('span').textContent = document.fullscreenElement ? '⤢' : '⛶'; });
document.addEventListener('keydown', (event) => { showMenu(); if (event.target.matches('input')) return; if (event.code === 'Space') { event.preventDefault(); setPlaying(!playing); } if (event.key === 'ArrowUp') setSpeed(speed + 1); if (event.key === 'ArrowDown') setSpeed(speed - 1); if (event.key.toLowerCase() === 'f') toggleFullscreen(); });
