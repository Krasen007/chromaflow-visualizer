/**
 * Chroma Flow — audio engine.
 *
 * Captures the microphone through the Web Audio API and turns it into numbers
 * the visualizer can react to. This module never touches the DOM: it only
 * exposes an `analyse()` snapshot per animation frame.
 *
 *   level     0..1  overall loudness (RMS, fast attack / slow release)
 *   bass      0..1  20-180 Hz energy
 *   mid       0..1  180 Hz - 2.2 kHz energy
 *   treble    0..1  2.2 kHz - 14 kHz energy
 *   centroid  0..1  spectral centroid, 0 = dark, 1 = bright
 *   pulse     0..1  decaying envelope that spikes to 1 on every beat
 *   beat      true  set for exactly one frame when a new beat is detected
 *   strength  0..1  how far the transient overshot the running average
 */

const FFT_SIZE = 2048;
const HISTORY_SIZE = 48; // ~0.8 s of bass energy at 60 fps
const WARMUP_FRAMES = 16; // let the analyser settle before trusting the first beat
const MIN_BEAT_INTERVAL = 0.16; // s — caps detection at ~375 BPM
const BEAT_WINDOW = 10; // beat-to-beat intervals kept for the BPM average
const SILENCE_FLOOR = 0.035; // energy below this counts as silence
const BANDS = { bass: [20, 180], mid: [180, 2200], treble: [2200, 14000] };
// Index 0 = least sensitive (needs a big overshoot), 4 = most trigger-happy.
const SENSITIVITY_MULTIPLIERS = [1.85, 1.58, 1.36, 1.18, 1.05];

export const sensitivityNames = ['CALM', 'FAIR', 'MEDIUM', 'TIGHT', 'MAX'];

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Fast attack, slow release — transients pop while sustained material stays steady. */
function smooth(current, target, attack, release) {
  return current + (target - current) * (target > current ? attack : release);
}

/** Maps a raw 0-255 band average to a usable 0-1 energy with the noise floor lifted out. */
function normalizeBand(average) {
  return clamp01((average - 52) / 150);
}

export class AudioEngine {
  constructor() {
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.frequency = null;
    this.waveform = null;
    this.bandBins = null;
    this.hzPerBin = 0;
    this.bassHistory = new Float32Array(HISTORY_SIZE);
    this.historyCursor = 0;
    this.historyFilled = 0;
    this.sensitivity = 3;
    this.bpm = 0;
    this.beatCount = 0;
    this.lastBeatAt = 0;
    this.lastBass = 0;
    this.intervals = [];
    this.snapshot = this.emptySnapshot();
  }

  emptySnapshot() {
    return { level: 0, bass: 0, mid: 0, treble: 0, centroid: 0, pulse: 0, beat: false, strength: 0 };
  }

  get running() {
    return Boolean(this.analyser);
  }

  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('NO-SECURE-CONTEXT');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.72;
    const source = context.createMediaStreamSource(stream);
    // Deliberately not connected to `destination`: routing the mic back out to the
    // speakers would build a feedback loop.
    source.connect(analyser);
    if (context.state === 'suspended') await context.resume();

    this.stream = stream;
    this.context = context;
    this.source = source;
    this.analyser = analyser;
    this.frequency = new Uint8Array(analyser.frequencyBinCount);
    this.waveform = new Uint8Array(analyser.fftSize);
    this.hzPerBin = context.sampleRate / analyser.fftSize;
    this.bandBins = Object.fromEntries(
      Object.entries(BANDS).map(([name, [low, high]]) => [name, [this.binFor(low), this.binFor(high)]]),
    );
    this.reset();
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source?.disconnect();
    this.context?.close?.();
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.context = null;
    this.frequency = null;
    this.waveform = null;
    this.bandBins = null;
    this.reset();
  }

  reset() {
    this.bassHistory.fill(0);
    this.historyCursor = 0;
    this.historyFilled = 0;
    this.bpm = 0;
    this.beatCount = 0;
    this.lastBeatAt = 0;
    this.lastBass = 0;
    this.intervals.length = 0;
    this.snapshot = this.emptySnapshot();
  }

  setSensitivity(value) {
    this.sensitivity = Math.max(1, Math.min(5, value));
  }


  binFor(hz) {
    const bins = this.frequency.length;
    return Math.max(0, Math.min(bins - 1, Math.round(hz / this.hzPerBin)));
  }

  /** Mean magnitude of the analyser bins inside a frequency range, normalised to 0-1. */
  bandEnergy(range) {
    const [from, to] = range;
    const data = this.frequency;
    let sum = 0;
    for (let bin = from; bin < to; bin += 1) sum += data[bin];
    return normalizeBand(sum / Math.max(1, to - from));
  }

  /** Reads the analyser and returns this frame's snapshot, or `null` when stopped. */
  analyse(now = performance.now() / 1000) {
    if (!this.running) return null;
    this.analyser.getByteFrequencyData(this.frequency);
    this.analyser.getByteTimeDomainData(this.waveform);

    const waveform = this.waveform;
    let sumSquares = 0;
    for (let i = 0; i < waveform.length; i += 1) {
      const sample = (waveform[i] - 128) / 128;
      sumSquares += sample * sample;
    }

    const snapshot = this.snapshot;
    const bassEnergy = this.bandEnergy(this.bandBins.bass);
    snapshot.level = smooth(snapshot.level, clamp01(Math.sqrt(sumSquares / waveform.length) * 2.8), 0.5, 0.09);
    snapshot.bass = smooth(snapshot.bass, bassEnergy, 0.6, 0.11);
    snapshot.mid = smooth(snapshot.mid, this.bandEnergy(this.bandBins.mid), 0.5, 0.1);
    snapshot.treble = smooth(snapshot.treble, this.bandEnergy(this.bandBins.treble), 0.5, 0.1);
    snapshot.centroid = this.spectralCentroid();
    snapshot.pulse *= 0.88;
    snapshot.beat = this.detectBeat(bassEnergy, now);
    if (snapshot.beat) {
      snapshot.pulse = 1;
      this.beatCount += 1;
    }
    return snapshot;
  }

  /** Brightness measure in 0-1: where the energy of the spectrum is centred. */
  spectralCentroid() {
    const data = this.frequency;
    let weighted = 0;
    let total = 0;
    for (let bin = 1; bin < data.length; bin += 1) {
      weighted += data[bin] * bin;
      total += data[bin];
    }
    return total > 0 ? weighted / total / data.length : 0;
  }

  /**
   * Onset detection on the bass band. The new energy has to clear an adaptive
   * threshold (running average x sensitivity), the noise floor, a small rise over
   * the previous frame, and the minimum gap since the last beat.
   */
  detectBeat(bassEnergy, now) {
    let sum = 0;
    for (let i = 0; i < this.historyFilled; i += 1) sum += this.bassHistory[i];
    const average = this.historyFilled > 0 ? sum / this.historyFilled : 0;
    const threshold = Math.max(average * SENSITIVITY_MULTIPLIERS[this.sensitivity - 1], SILENCE_FLOOR);

    this.bassHistory[this.historyCursor] = bassEnergy;
    this.historyCursor = (this.historyCursor + 1) % HISTORY_SIZE;
    this.historyFilled = Math.min(this.historyFilled + 1, HISTORY_SIZE);

    const rising = bassEnergy > this.lastBass * 1.02;
    this.lastBass = bassEnergy;

    const isBeat =
      this.historyFilled > WARMUP_FRAMES &&
      bassEnergy > threshold &&
      rising &&
      now - this.lastBeatAt > MIN_BEAT_INTERVAL;

    if (!isBeat) return false;

    const gap = now - this.lastBeatAt;
    this.lastBeatAt = now;
    if (gap > 0.28 && gap < 1.3) {
      this.intervals.push(gap);
      if (this.intervals.length > BEAT_WINDOW) this.intervals.shift();
      if (this.intervals.length >= 3) {
        const bpm = 60 / (this.intervals.reduce((total, value) => total + value, 0) / this.intervals.length);
        this.bpm = bpm > 55 && bpm < 200 ? Math.round(bpm) : 0;
      }
    }
    this.snapshot.strength = clamp01((bassEnergy - threshold) / Math.max(threshold, 0.001));
    return true;
  }
}
