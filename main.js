 const $ = (selector) => document.querySelector(selector);
    const visualizer = $('#visualizer');
    const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    const flowIntervals = [1100, 640, 360, 180, 75];
    const motionDurations = { orbit: [30, 20, 13, 7, 3.2], waves: [14, 9, 6, 3.6, 1.7], liquid: [28, 19, 12, 7, 3.6], prism: [22, 15, 10, 5.5, 2.8] };
    // Both speed axes are 20-step sliders that interpolate between the five anchor values above,
    // logarithmically so the perceived change per step stays even across the whole range.
    const SPEED_STEPS = 20, SPEED_DEFAULT = 15, TIER_STEPS = SPEED_STEPS / 5;
    const flowTierNames = ['CALM', 'EASY', 'MEDIUM', 'FAST', 'RAPID'];
    const motionTierNames = ['FLOAT', 'EASY', 'MEDIUM', 'FAST', 'TURBO'];
    const state = { paused: false, flow: SPEED_DEFAULT, motion: SPEED_DEFAULT, sensitivity: 3, gain: 1, display: 'bars', effects: new Set(), spectrum: !motionPreference.matches, hue: 275, hueBias: Math.random() * 360, frame: 0, rgb: [135, 73, 219], hex: '#8749DB', mic: 'off', beatCount: 0, bpm: null, lastReactivePaint: 0 };
    const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
    const random = (min, max) => min + Math.random() * (max - min);
    // Maps step 1..SPEED_STEPS onto anchor 0..anchors.length-1, so every step is a distinct value.
    const interpolate = (anchors, step) => {
      const segments = anchors.length - 1;
      const position = (clamp(step, 1, SPEED_STEPS) - 1) * segments / (SPEED_STEPS - 1);
      const low = Math.floor(position), high = Math.min(low + 1, segments);
      return anchors[low] * Math.pow(anchors[high] / anchors[low], position - low);
    };
    const flowIntervalFor = step => Math.round(interpolate(flowIntervals, step));
    const effectDurationFor = (effect, step) => interpolate(motionDurations[effect], step);
    const tierName = (names, step) => names[clamp(Math.floor((step - 1) / TIER_STEPS), 0, names.length - 1)];
    const speedFill = step => (step - 1) / (SPEED_STEPS - 1) * 100;
    // Reactive colour easing: 0.6/s at the calmest step up to ~4.05/s at the most rapid one.
    const flowEasingRate = () => .6 + (state.flow - 1) / (SPEED_STEPS - 1) * 3.45;

    // Analysis is self-contained: it never accesses the DOM or routes input to speakers.
    class AudioEngine {
      constructor() { this.generation = 0; this.gainValue = 1; this.reset(); }
      setGain(value) { this.gainValue = value; if (this.gainNode && this.context) this.gainNode.gain.setTargetAtTime(value, this.context.currentTime, .015); }
      reset() { this.history = [[], [], []]; this.previous = [0, 0, 0]; this.bands = [0, 0, 0]; this.level = 0; this.pulse = 0; this.frames = 0; this.lastBeat = 0; this.intervals = []; this.bpm = null; this.beatCount = 0; this.lastAnalysis = 0; }
      async start(onEnded) {
        const generation = ++this.generation;
        if (!window.isSecureContext) { const error = new Error('Microphone access requires HTTPS or localhost.'); error.name = 'NO-SECURE-CONTEXT'; throw error; }
        if (!navigator.mediaDevices?.getUserMedia) { const error = new Error('Microphone capture is unavailable.'); error.name = 'NotSupportedError'; throw error; }
        let stream, context, source, gainNode, analyser;
        const cleanup = () => {
          stream?.getTracks().forEach(track => track.stop());
          source?.disconnect(); gainNode?.disconnect(); analyser?.disconnect();
          if (context) context.close().catch(() => { });
        };
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
          if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return false; }
          context = new (window.AudioContext || window.webkitAudioContext)();
          source = context.createMediaStreamSource(stream);
          gainNode = context.createGain();
          gainNode.gain.value = this.gainValue;
          analyser = context.createAnalyser();
          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = .72;
          source.connect(gainNode);
          gainNode.connect(analyser);
          if (context.state === 'suspended') await context.resume();
          if (generation !== this.generation) { cleanup(); return false; }
          if (stream.getTracks().every(track => track.readyState === 'ended')) { const error = new Error('Microphone disconnected during startup.'); error.name = 'NotReadableError'; throw error; }
          this.context = context; this.stream = stream; this.source = source;
          this.gainNode = gainNode; this.analyser = analyser;
          this.gainNode.gain.value = this.gainValue;
          this.frequency = new Uint8Array(analyser.frequencyBinCount);
          this.time = new Uint8Array(analyser.fftSize);
          this.reset();
          stream.getTracks().forEach(track => track.addEventListener('ended', onEnded, { once: true }));
          return true;
        } catch (error) {
          const cancelled = generation !== this.generation;
          if (this.stream === stream) this.stop(); else cleanup();
          if (cancelled) return false;
          throw error;
        }
      }
      stop() {
        ++this.generation;
        this.stream?.getTracks().forEach(track => track.stop());
        this.source?.disconnect();
        this.gainNode?.disconnect();
        this.analyser?.disconnect();
        this.context?.close().catch(() => { });
        this.stream = this.source = this.gainNode = this.analyser = this.context = null;
        this.reset();
      }
      analyse(now, sensitivity) {
        if (!this.analyser) return null;
        this.analyser.getByteFrequencyData(this.frequency);
        this.analyser.getByteTimeDomainData(this.time);
        const dt = this.lastAnalysis ? clamp((now - this.lastAnalysis) / 1000, .001, .05) : 1 / 60;
        this.lastAnalysis = now;
        let sumSquares = 0;
        for (let i = 0; i < this.time.length; i++) { const sample = (this.time[i] - 128) / 128; sumSquares += sample * sample; }
        const loudness = clamp(Math.sqrt(sumSquares / this.time.length) * 3.2, 0, 1);
        this.level += (loudness - this.level) * (loudness > this.level ? .42 : .095);
        const hzPerBin = this.context.sampleRate / this.analyser.fftSize;
        const ranges = [[20, 180], [180, 2200], [2200, 14000]];
        const values = ranges.map(([low, high], band) => {
          const from = Math.max(1, Math.floor(low / hzPerBin));
          const to = Math.min(this.frequency.length - 1, Math.ceil(high / hzPerBin));
          let total = 0;
          for (let i = from; i <= to; i++) total += Math.max(0, this.frequency[i] / 255 - .055);
          const energy = clamp(total / (to - from + 1) * 1.6, 0, 1);
          this.bands[band] += (energy - this.bands[band]) * (energy > this.bands[band] ? .42 : .12);
          return this.bands[band];
        });
        let weight = 0, weighted = 0;
        for (let i = 1; i < this.frequency.length; i++) { const energy = Math.max(0, this.frequency[i] / 255 - .055); weight += energy; weighted += energy * Math.log1p(i) / Math.log(this.frequency.length); }
        const centroid = weight > .01 ? clamp(weighted / weight, 0, 1) : 0;
        const multipliers = [1.85, 1.58, 1.36, 1.18, 1.05];
        let beat = false, strength = 0;
        this.frames++;
        if (this.lastBeat && now - this.lastBeat > 1300) { this.bpm = null; this.intervals = []; }
        values.forEach((value, index) => {
          const history = this.history[index];
          const average = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0;
          const threshold = Math.max(.035, average * multipliers[sensitivity - 1]);
          if (this.frames > 16 && now - this.lastBeat >= 160 && value > threshold && value > this.previous[index] * 1.035) {
            beat = true;
            strength = Math.max(strength, clamp((value - threshold) / Math.max(threshold, .035), 0, 1));
          }
          this.previous[index] = value;
          history.push(value);
          if (history.length > 48) history.shift();
        });
        if (beat) {
          if (this.lastBeat) {
            const interval = (now - this.lastBeat) / 1000;
            if (interval >= .28 && interval <= 1.30) {
              this.intervals.push(interval);
              if (this.intervals.length > 10) this.intervals.shift();
              if (this.intervals.length >= 3) {
                const sorted = [...this.intervals].sort((a, b) => a - b);
                const estimate = Math.round(60 / sorted[Math.floor(sorted.length / 2)]);
                this.bpm = estimate >= 55 && estimate <= 200 ? estimate : null;
              }
            }
          }
          this.lastBeat = now;
          this.beatCount++;
          this.pulse = clamp(.45 + strength * .55, .45, 1);
        } else this.pulse *= Math.exp(-dt * 8);
        return { level: this.level, bass: values[0], mid: values[1], treble: values[2], centroid, beat, pulse: this.pulse, strength, bpm: this.bpm, beatCount: this.beatCount, frequency: this.frequency, sampleRate: this.context.sampleRate, fftSize: this.analyser.fftSize };
      }
    }
    const audio = new AudioEngine();
    let ambientTimer = null, animationFrame = null, latestAudio = null, lastHudUpdate = 0, lastAmbientHudUpdate = 0;
    let canvasWidth = 0, canvasHeight = 0, peaks = new Float32Array(72);
    const canvas = $('#spectrum'), ctx = canvas.getContext('2d');

    function hslToRgb(h, s, l) {
      s /= 100; l /= 100;
      const a = s * Math.min(l, 1 - l);
      const channel = n => { const k = (n + h / 30) % 12; return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255); };
      return [channel(0), channel(8), channel(4)];
    }
    function applyColor(h, s, l) {
      state.hue = (h + 360) % 360;
      state.rgb = hslToRgb(state.hue, s, l);
      state.hex = '#' + state.rgb.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
      visualizer.style.setProperty('--color', state.hex);
      visualizer.style.setProperty('--accent', `hsl(${(state.hue + 180) % 360} 88% 73%)`);
      state.frame++;
    }
    // The timer tick stays frozen while paused, so the guard lives here and not in the picker.
    function applyRandomColor() { applyColor(Math.floor(random(0, 360)), random(62, 92), random(42, 62)); const now = performance.now(); if (!lastAmbientHudUpdate || now - lastAmbientHudUpdate >= 100) { updateHud(); lastAmbientHudUpdate = now; } }
    function selectAmbientColor() { if (!state.paused && state.mic === 'off') applyRandomColor(); }
    function scheduleAmbient() { clearInterval(ambientTimer); ambientTimer = null; if (state.mic === 'off' && !state.paused) ambientTimer = setInterval(selectAmbientColor, Math.max(flowIntervalFor(state.flow), motionPreference.matches ? 1100 : 0)); }
    // A click is an explicit user action, so it re-keys the colour even while paused.
    function shiftColor() {
      if (state.mic === 'on') {
        state.hueBias = random(0, 360);
        // The reactive loop does not paint while paused, so resolve the new bias straight away.
        if (state.paused) { const snapshot = latestAudio; if (snapshot) applyColor((snapshot.centroid * 460 + state.hueBias + snapshot.bass * 24) % 360, clamp(58 + snapshot.level * 34, 40, 96), clamp(38 + snapshot.level * 26 + snapshot.bass * 6, 20, 68)); else applyRandomColor(); }
        updateHud();
      } else {
        applyRandomColor(); updateHud(); lastAmbientHudUpdate = performance.now();
      }
    }
    function updateHud() {
      $('#hex-value').textContent = state.hex;
      $('#rgb-value').textContent = `RGB ${state.rgb.join(', ')}`;
      $('#frame-value').textContent = String(state.frame).padStart(4, '0');
      $('#live-label').textContent = state.paused ? 'PAUSED SESSION' : state.mic === 'on' ? 'LIVE / REACTIVE' : 'LIVE SESSION';
      $('#level-value').textContent = `${Math.round((latestAudio?.level || 0) * 100)}%`;
      $('#meter-fill').style.transform = `scaleX(${latestAudio?.level || 0})`;
      $('#level-meter').setAttribute('aria-valuenow', Math.round((latestAudio?.level || 0) * 100));
      $('#bpm-value').textContent = latestAudio?.bpm ?? '--';
      $('#beat-count').textContent = audio.beatCount;
    }
    function setPause(paused) {
      state.paused = paused;
      document.body.classList.toggle('paused', paused);
      $('#pause-btn').setAttribute('aria-pressed', paused);
      $('#pause-label').textContent = paused ? 'RESUME' : 'PAUSE';
      $('#pause-icon').innerHTML = paused ? '<path d="m8 5 11 7-11 7z"/>' : '<path d="M8 5v14M16 5v14"/>';
      if (!paused) { state.lastReactivePaint = 0; visualizer.style.setProperty('--beat', 0); }
      scheduleAmbient(); updateHud();
    }
    function updateMotionSpeed() { for (const effect of Object.keys(motionDurations)) visualizer.style.setProperty(`--${effect === 'waves' ? 'wave' : effect}-duration`, `${effectDurationFor(effect, state.motion).toFixed(2)}s`); }
    function randomizeOrbit() {
      visualizer.style.setProperty('--shape-x', `${random(38, 81)}%`); visualizer.style.setProperty('--shape-y', `${random(12, 75)}%`);
      visualizer.style.setProperty('--shape-tx', `${random(-28, 25)}vw`); visualizer.style.setProperty('--shape-ty', `${random(-30, 28)}vh`);
      visualizer.style.setProperty('--tri-x', `${random(36, 86)}%`); visualizer.style.setProperty('--tri-y', `${random(14, 76)}%`);
      visualizer.style.setProperty('--tri-tx', `${random(-32, 22)}vw`); visualizer.style.setProperty('--tri-ty', `${random(-28, 25)}vh`);
    }
    function updateEffects() {
      document.querySelectorAll('[data-effect]').forEach(button => { const active = state.effects.has(button.dataset.effect); button.setAttribute('aria-pressed', active); visualizer.classList.toggle(`effect-${button.dataset.effect}`, active); });
    }
    function updateSpectrumState() { $('#spectrum-btn').setAttribute('aria-pressed', state.spectrum); visualizer.classList.toggle('spectrum-visible', state.spectrum); }
    function setMicUi(status, message, error = false) {
      state.mic = status;
      $('#mic-btn').classList.toggle('active', status === 'on');
      $('#mic-btn').classList.toggle('pending', status === 'pending');
      $('#mic-btn').setAttribute('aria-pressed', status === 'on');
      $('#mic-label').textContent = status === 'on' ? 'DISABLE MICROPHONE' : status === 'pending' ? 'CANCEL REQUEST' : 'ENABLE MICROPHONE';
      $('#mic-status').textContent = message;
      $('#mic-status').classList.toggle('error', error);
      document.body.classList.toggle('mic-active', status === 'on');
      visualizer.classList.toggle('mic-running', status === 'on');
    }
    const errorMessages = {
      'NO-SECURE-CONTEXT': 'Microphone needs HTTPS or localhost. Open this page securely and try again.',
      NotAllowedError: 'Microphone blocked. Allow access in your browser site settings, then try again.',
      SecurityError: 'Microphone blocked by browser security settings. Check site permissions.',
      NotFoundError: 'No microphone found. Connect an input device and try again.',
      DevicesNotFoundError: 'No microphone found. Connect an input device and try again.',
      NotReadableError: 'Microphone is busy. Close other apps using it, then try again.',
      TrackStartError: 'Microphone is busy. Close other apps using it, then try again.',
      AbortError: 'Microphone could not start. Close other apps using it, then try again.',
      NotSupportedError: 'Microphone capture is not supported here. Try a current browser.',
      OverconstrainedError: 'This microphone cannot meet the requested audio settings. Try another device.'
    };
    function teardownMic(message = 'Ambient mode · no microphone access') {
      audio.stop();
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = null; latestAudio = null; peaks.fill(0); ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      visualizer.style.setProperty('--level', 0); visualizer.style.setProperty('--bass', 0); visualizer.style.setProperty('--mid', 0); visualizer.style.setProperty('--treble', 0); visualizer.style.setProperty('--beat', 0);
      setMicUi('off', message);
      if (!state.paused) { selectAmbientColor(); scheduleAmbient(); }
      updateHud();
    }
    async function toggleMic() {
      if (state.mic !== 'off') { teardownMic(); return; }
      clearInterval(ambientTimer); ambientTimer = null;
      setMicUi('pending', 'Waiting for microphone permission…');
      try {
        const started = await audio.start(() => { if (state.mic === 'on') teardownMic('Microphone disconnected. Back in ambient mode.'); });
        if (!started || state.mic !== 'pending') return;
        setMicUi('on', 'Listening · color follows your sound');
        lastHudUpdate = 0;
        animationFrame = requestAnimationFrame(renderAudio);
      } catch (error) {
        if (state.mic !== 'pending') return;
        setMicUi('off', errorMessages[error.name] || 'Could not start the microphone. Check your device and try again.', true);
        if (!state.paused) { selectAmbientColor(); scheduleAmbient(); }
      }
    }
    function spawnRipple() {
      const layer = $('#beat-layer');
      if (layer.childElementCount >= 9) layer.firstElementChild.remove();
      const ripple = document.createElement('div');
      ripple.className = 'ripple'; ripple.style.left = `${random(37, 88)}%`; ripple.style.top = `${random(14, 82)}%`;
      layer.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    }
    function drawSpectrum(snapshot) {
      if (!state.spectrum || !canvasWidth || !canvasHeight) return;
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      const w = canvasWidth, h = canvasHeight, baseline = h - 23, left = 30, right = w - 30;
      const minHz = 30, binHz = snapshot.sampleRate / snapshot.fftSize;
      const maxHz = Math.min(16000, (snapshot.frequency.length - 1) * binHz);
      const bars = 72, slot = (right - left) / bars, heights = [];
      const color = `hsl(${(state.hue + 180) % 360} 90% 72%)`;
      ctx.strokeStyle = 'rgba(255,255,255,.24)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, baseline); ctx.lineTo(right, baseline); ctx.stroke();
      for (let i = 0; i < bars; i++) {
        const f1 = minHz * Math.pow(maxHz / minHz, i / bars), f2 = minHz * Math.pow(maxHz / minHz, (i + 1) / bars);
        const from = clamp(Math.floor(f1 / binHz), 1, snapshot.frequency.length - 1), to = clamp(Math.ceil(f2 / binHz), from, snapshot.frequency.length - 1);
        let value = 0; for (let k = from; k <= to; k++) value = Math.max(value, snapshot.frequency[k] / 255);
        const height = Math.max(2, Math.pow(value, 1.35) * (h - 45));
        heights.push(height);
        if (state.display === 'bars') {
          peaks[i] = Math.max(height, peaks[i] - 1.2);
          const x = left + i * slot + 1;
          const barWidth = Math.max(1, slot - 2);
          ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 13; ctx.globalAlpha = .84;
          ctx.fillRect(x, baseline - height, barWidth, height);
          ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.globalAlpha = .9;
          ctx.fillRect(x, baseline - height, barWidth, 2);
          ctx.globalAlpha = .55; ctx.fillRect(x, baseline - peaks[i] - 5, barWidth, 1);
        }
      }
      if (state.display === 'wave') {
        // This is the FFT frequency envelope, not a time-domain oscilloscope trace.
        ctx.beginPath();
        heights.forEach((height, i) => { const x = left + (i + .5) * slot; if (i === 0) ctx.moveTo(x, baseline - height); else ctx.lineTo(x, baseline - height); });
        ctx.lineTo(right, baseline); ctx.lineTo(left, baseline); ctx.closePath();
        const fill = ctx.createLinearGradient(0, baseline - (h - 45), 0, baseline);
        fill.addColorStop(0, color); fill.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = .34; ctx.fillStyle = fill; ctx.fill();
        ctx.beginPath();
        heights.forEach((height, i) => { const x = left + (i + .5) * slot; if (i === 0) ctx.moveTo(x, baseline - height); else ctx.lineTo(x, baseline - height); });
        ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.stroke();
      }
      ctx.globalAlpha = .68; ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = '9px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      for (const [hz, label] of [[60, '60 HZ'], [1000, '1 KHZ']]) {
        if (hz <= maxHz) ctx.fillText(label, left + Math.log(hz / minHz) / Math.log(maxHz / minHz) * (right - left), h - 6);
      }
      ctx.textAlign = 'right'; ctx.fillText(maxHz >= 15950 ? '16 KHZ' : `${(maxHz / 1000).toFixed(1)} KHZ MAX`, right, h - 6);
      ctx.textAlign = 'start';
      ctx.globalAlpha = 1;
    }
    function renderAudio(now) {
      if (state.mic !== 'on') return;
      const snapshot = audio.analyse(now, state.sensitivity);
      if (snapshot) {
        latestAudio = snapshot;
        if (!state.paused) {
          if (!motionPreference.matches || now - state.lastReactivePaint >= 500) {
            const target = (snapshot.centroid * 460 + state.hueBias + snapshot.bass * 24) % 360;
            const difference = ((target - state.hue + 540) % 360) - 180;
            const dt = state.lastReactivePaint ? clamp((now - state.lastReactivePaint) / 1000, .001, .5) : 1 / 60;
            const rate = flowEasingRate();
            const easing = 1 - Math.exp(-rate * dt);
            applyColor(state.hue + difference * easing, clamp(58 + snapshot.level * 34, 40, 96), clamp(38 + snapshot.level * 26 + snapshot.bass * 6, 20, 68));
            state.lastReactivePaint = now;
          }
          visualizer.style.setProperty('--level', snapshot.level);
          visualizer.style.setProperty('--bass', snapshot.bass);
          visualizer.style.setProperty('--mid', snapshot.mid);
          visualizer.style.setProperty('--treble', snapshot.treble);
          visualizer.style.setProperty('--beat', motionPreference.matches ? 0 : snapshot.pulse);
          if (snapshot.beat && !motionPreference.matches) { spawnRipple(); if (state.effects.has('orbit')) randomizeOrbit(); }
          drawSpectrum(snapshot);
        }
        if (now - lastHudUpdate >= 100) { updateHud(); lastHudUpdate = now; }
      }
      animationFrame = requestAnimationFrame(renderAudio);
    }
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvasWidth = rect.width; canvasHeight = rect.height;
      canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); peaks.fill(0);
    };
    new ResizeObserver(resizeCanvas).observe(canvas);

    function syncFlowSpeed() {
      const input = $('#flow-speed'), interval = flowIntervalFor(state.flow);
      input.value = state.flow;
      input.style.setProperty('--fill', `${speedFill(state.flow)}%`);
      input.setAttribute('aria-valuetext', `${tierName(flowTierNames, state.flow)}, one color every ${interval >= 1000 ? `${(interval / 1000).toFixed(2)} seconds` : `${interval} milliseconds`}`);
      $('#flow-label').textContent = `${state.flow} · ${tierName(flowTierNames, state.flow)}`;
    }
    function syncMotionSpeed() {
      const input = $('#motion-speed'), orbit = effectDurationFor('orbit', state.motion);
      input.value = state.motion;
      input.style.setProperty('--fill', `${speedFill(state.motion)}%`);
      input.setAttribute('aria-valuetext', `${tierName(motionTierNames, state.motion)}, one orbit every ${orbit < 10 ? `${orbit.toFixed(1)} seconds` : `${Math.round(orbit)} seconds`}`);
      $('#motion-label').textContent = `${state.motion} · ${tierName(motionTierNames, state.motion)}`;
      updateMotionSpeed();
    }
    $('#flow-speed').addEventListener('input', event => { state.flow = Number(event.target.value); syncFlowSpeed(); scheduleAmbient(); });
    $('#motion-speed').addEventListener('input', event => { state.motion = Number(event.target.value); syncMotionSpeed(); });
    const sensitivityTierNames = ['CALM', 'LOW', 'MEDIUM', 'HIGH', 'MAX'];
    function syncSensitivity() {
      const input = $('#sensitivity');
      input.value = state.sensitivity;
      input.style.setProperty('--fill', `${(state.sensitivity - 1) * 25}%`);
      input.setAttribute('aria-valuetext', sensitivityTierNames[state.sensitivity - 1].toLowerCase());
      $('#sensitivity-label').textContent = `${state.sensitivity} · ${sensitivityTierNames[state.sensitivity - 1]}`;
    }
    $('#sensitivity').addEventListener('input', () => { state.sensitivity = Number($('#sensitivity').value); syncSensitivity(); });
    $('#mic-gain').addEventListener('input', event => { state.gain = Number(event.target.value); audio.setGain(state.gain); event.target.style.setProperty('--fill', `${(state.gain - 1) / 7 * 100}%`); $('#gain-label').textContent = `${state.gain.toFixed(1)}x`; });
    document.querySelectorAll('[data-display]').forEach(button => button.addEventListener('click', () => { state.display = button.dataset.display; document.querySelectorAll('[data-display]').forEach(option => option.setAttribute('aria-pressed', option === button)); peaks.fill(0); if (!state.paused) { ctx.clearRect(0, 0, canvasWidth, canvasHeight); if (state.mic === 'on' && latestAudio) drawSpectrum(latestAudio); } }));
    document.querySelectorAll('[data-effect]').forEach(button => button.addEventListener('click', () => { const name = button.dataset.effect; if (state.effects.has(name)) state.effects.delete(name); else { state.effects.add(name); if (name === 'orbit') randomizeOrbit(); } updateEffects(); }));
    $('#spectrum-btn').addEventListener('click', () => { state.spectrum = !state.spectrum; updateSpectrumState(); if (!state.spectrum) ctx.clearRect(0, 0, canvasWidth, canvasHeight); });
    $('#pause-btn').addEventListener('click', () => setPause(!state.paused));
    $('#mic-btn').addEventListener('click', toggleMic);
    $('#close-menu').addEventListener('click', () => { visualizer.classList.add('menu-hidden'); $('#menu-tab').setAttribute('aria-expanded', 'false'); $('#menu-tab').focus(); });
    $('#menu-tab').addEventListener('click', () => { visualizer.classList.remove('menu-hidden'); $('#menu-tab').setAttribute('aria-expanded', 'true'); $('#close-menu').focus(); });
    function syncFullscreen() { const active = Boolean(document.fullscreenElement); $('#fullscreen-btn').setAttribute('aria-pressed', active); $('#fullscreen-btn').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen'); $('#fullscreen-label').textContent = active ? 'EXIT FULLSCREEN' : 'FULLSCREEN'; }
    $('#fullscreen-btn').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await visualizer.requestFullscreen(); } catch { $('#mic-status').textContent = 'Fullscreen is unavailable in this browser.'; } });
    document.addEventListener('fullscreenchange', syncFullscreen);
    visualizer.addEventListener('click', event => { if (!event.target.closest('button, input, summary, a[href]')) shiftColor(); });
    document.addEventListener('keydown', event => { if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return; const target = event.target; if (target.closest('button, input, summary, a[href], select, textarea, [contenteditable="true"]') || target.isContentEditable) return; event.preventDefault(); setPause(!state.paused); });
    motionPreference.addEventListener('change', () => { scheduleAmbient(); if (motionPreference.matches) { visualizer.style.setProperty('--beat', 0); $('#beat-layer').replaceChildren(); } state.lastReactivePaint = 0; });
    window.addEventListener('pagehide', () => { clearInterval(ambientTimer); if (animationFrame) cancelAnimationFrame(animationFrame); audio.stop(); });
    updateEffects(); syncFlowSpeed(); syncMotionSpeed(); syncSensitivity(); updateSpectrumState(); selectAmbientColor(); scheduleAmbient();