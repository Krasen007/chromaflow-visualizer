# Design Document — Chroma Flow Visualizer

**Current state of the app: what it does and how it does it.**
Based on the working tree after the 2026-09-28 taste pass (post `51f7cdd`).

---

## 1. Overview

Chroma Flow Visualizer is a single-screen, full-window web app that makes color move. It has two operating modes that share one color engine:

1. **Ambient mode (default):** the background cycles through vivid random HSL colors on a timer, with optional CSS-animated motion layers floating on top.
2. **Reactive mode (opt-in):** the user grants microphone access, and the live audio — loudness, spectral balance, and detected beats — drives the background color, pulses the effect layers, spawns beat ripples, and renders a real-time FFT spectrum strip.

A glass control panel (HUD) exposes all settings, then hides itself so the visuals own the screen.

**At a glance**

| Aspect | Value |
|---|---|
| Type | Static single-page app, no build step |
| Stack | Plain HTML + CSS + ES modules — zero dependencies, no framework, no bundler |
| Entry point | `index.html` → `main.js` (`type="module"`) → imports `audio.js` |
| Total size | ~2,060 lines across 4 source files |
| Persistence | None — all state is in-memory and resets on reload (deliberate) |
| Hosting | GitHub Pages (relative asset paths); local dev via Five Server (HTTPS :5500) |
| Required APIs | CSS custom properties, `backdrop-filter`, `mix-blend-mode`, `100svh`, Canvas 2D, Web Audio, `getUserMedia` (mic needs HTTPS or localhost) |

## 2. File map

| File | Lines | Responsibility |
|---|---|---|
| `index.html` | 120 | Layer stack (ambient → effects → beat → spectrum) + HUD markup |
| `style.css` | 1128 | All visuals: effect keyframes, HUD, audio-reactive rules, responsive, reduced-motion |
| `main.js` | 501 | Orchestrator: color engine, effect/HUD state, spectrum canvas, beat reactions, mic lifecycle |
| `audio.js` | 227 | `AudioEngine` class — mic capture → per-frame analysis snapshot. **Never touches the DOM.** |

## 3. Page structure and layer stack

Everything lives inside `<main id="visualizer">`, which is the background-color surface and the root for all state classes (`effect-*`, `menu-hidden`, `spectrum-visible`). Paint order, back to front:

1. `#visualizer` background — the current color (120 ms CSS transition)
2. `::after` — fixed diagonal overlay gradient (`mix-blend-mode: overlay`) for depth
3. `.ambient ×2` — blurred (70 px) glow blobs; blob one tracks the current color
4. `.effect-layer` (z 1) — the 13 motion elements of the four effect groups
5. `#beatLayer` (z 1) — pooled beat-ripple rings (only visible while mic runs)
6. `#beatFlash` (z 1) — radial accent flash pulsed by beat energy
7. `#spectrumCanvas` (z 1) — the FFT strip, bottom of screen
8. `.center-prompt` (z 1) — "CLICK TO SHIFT" hint
9. `.hud` (z 2) — the control panel
10. `.menu-tab` (z 3) — the left-edge MENU tab used to recall a hidden HUD

`body` gets mode classes: `paused` (flow stopped) and `mic-active` (listening).

---

## 4. The color engine

### 4.1 Ambient mode (default)

On load, `applyColor()` runs immediately and then on an interval:

1. Pick a random hue (0–359), **saturation 62–91 %, lightness 42–61 %** — deliberately clamped so random frames stay vivid, never muddy or blinding.
2. Convert HSL → RGB → uppercase hex.
3. Write it to `#visualizer` background and the ambient glow blob; the CSS `background-color` transition (120 ms linear) smooths the jump.
4. Update the HUD readout (hex, RGB triplet) and increment the `FRAME` counter.

**Flow speed** controls the interval, 5 steps, default **4 = FAST (180 ms)**:

| Step | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Label | CALM | EASY | MEDIUM | FAST | RAPID |
| Interval | 1100 ms | 640 ms | 360 ms | 180 ms | 75 ms |

Clicking anywhere (except on controls) jumps to a new random color immediately. **Space** pauses/resumes the cycle; while paused the HUD pins open, the LIVE pill turns amber, and a dimming overlay increases.

### 4.2 Reactive mode (microphone owns the color)

While listening, the ambient interval is **not scheduled at all** (`schedule()` skips it while `audio.running`), and every animation frame the background hue *chases* an audio-derived target:

- **Target hue** = `(spectralCentroid × 460 + hueBias + bass × 24) mod 360` — bright sound ⇒ higher hue; bass nudges the hue; `hueBias` is a random offset re-rolled on each click ("CLICK TO SHIFT") so the user can re-key the palette.
- **Easing:** hue takes the shortest path around the wheel, exponentially: `hue += Δ × (1 − e^(−dt × rate))`, where `rate = 0.6 + (flowSpeed − 1) × 0.85` — so **FLOW SPEED also controls how fast color chases the audio**.
- **Saturation** = `clamp(58 + level × 34, 40…96)`, **lightness** = `clamp(38 + level × 26 + bass × 6, 20…68)` — loud music gets hotter, heavier music gets deeper.
- An **accent color** (complementary, `hue + 180`) is published as `--accent` for the HUD meters, mic button, flash, and ripples.

## 5. The motion system (four effects)

Each effect is a set of pre-built DOM elements revealed by a class on `#visualizer` (`effect-objects`, `effect-waves`, `effect-liquid`, `effect-prism`). Toggling is instant and effects stack freely.

| Effect | Elements | Animation |
|---|---|---|
| **Orbiting objects** | 3 glow orbs + 1 square + 1 triangle | Drift keyframes; the square/triangle travel to random positions, scales, rotations, and delays (re-randomized on enable and on every beat) |
| **Color waves** | 3 concentric rings | `pulse-wave` scale/fade loop, staggered 0 / 2.6 / 5.2 s |
| **Liquid flow** | 3 blurred organic blobs | Slow `liquid-drift` alternate loop, `soft-light` blending |
| **Prism shift** | 2 wide gradient bands | `prism-shift` translate loop, `screen` blending |

**All four default OFF** — the empty state is pure color.

**Motion speed** (independent of flow speed, default **4 = FAST**) writes duration custom properties consumed by the keyframes:

| Step | 1 FLOAT | 2 EASY | 3 MEDIUM | 4 FAST | 5 TURBO |
|---|---|---|---|---|---|
| orbit / wave / liquid / prism | 30s / 14s / 28s / 22s | 20s / 9s / 19s / 15s | 13s / 6s / 12s / 10s | 7s / 3.6s / 7s / 5.5s | 3.2s / 1.7s / 3.6s / 2.8s |

**MIX ALL** flips every effect at once and renames itself **CLEAR ALL** when all are on.

---

## 6. The control surface (HUD)

The HUD is a fixed glass panel on the left (bottom sheet under 600 px) with these sections, top to bottom: brand row + LIVE pill + close button → live color readout (hex / RGB / frame) → Pause + Fullscreen buttons → Flow speed slider → Motion speed slider → Effects grid + MIX ALL → **Audio input** block (mic toggle, status, error slot, level meter, BPM/BEATS, FFT toggle, plus a collapsed **BEAT FINE-TUNING** disclosure holding the sensitivity slider).

**Panel budget:** the order is a taste decision, not history. Everything that matters in a default ambient session — readout, pause, the two speed axes, effects — sits above the fold on a phone; the opt-in audio block sits below it. The one control whose default is already right (beat sensitivity, `MEDIUM`) lives inside a native `<details>` disclosure rather than a permanent row, and the redundant "multiple effects can run together" note was deleted because the grid already shows that state. The rule the panel is held to: no new control without removing or hiding one.

**Panel visibility:** the panel stays open until its close button is activated. The **MENU tab** remains at the left edge while it is closed and reopens it. The interface has no app-specific keyboard shortcuts; controls are operated by touch or mouse.

**Click behavior:** one delegated guard decides ownership — the root handler returns early when `event.target.closest('button, input, summary, a[href]')` matches. Individual handlers never call `stopPropagation()`: one guard, not twelve. Every other click re-keys the color (ambient mode: new random color; reactive mode: re-roll `hueBias`).

**Fullscreen** uses the Fullscreen API and swaps the icon (`⛶` ↔ `⤢`); controls carry accessible labels describing their actions.

## 7. The audio pipeline

### 7.1 Capture (`audio.js`)

`AudioEngine.start()` requests the mic with **echo cancellation, noise suppression, and auto gain all disabled** (raw signal for analysis), builds an `AudioContext` → `AnalyserNode` (FFT 2048, smoothing 0.72) → `MediaStreamAudioSourceNode`, and connects source → analyser **only** — never to `destination`, so the mic is never played back (no feedback loop). Fails with a typed `NO-SECURE-CONTEXT` error when the page isn't on HTTPS/localhost.

`stop()` stops every track, disconnects, closes the context, and resets all counters.

### 7.2 Analysis snapshot

Once per `requestAnimationFrame`, `analyse()` returns one snapshot object:

| Field | Meaning | How it's computed |
|---|---|---|
| `level` 0–1 | Loudness | RMS of the time-domain waveform × 2.8, fast attack / slow release |
| `bass` 0–1 | 20–180 Hz energy | Mean bin magnitude, noise floor lifted: `(avg − 52) / 150`, smoothed |
| `mid` 0–1 | 180 Hz–2.2 kHz energy | Same |
| `treble` 0–1 | 2.2–14 kHz energy | Same |
| `centroid` 0–1 | Spectral brightness | Energy-weighted average bin position |
| `pulse` 0–1 | Beat envelope | Spikes to 1 on beat, decays ×0.88 per frame |
| `beat` bool | New beat (one frame) | See below |
| `strength` 0–1 | Transient overshoot | How far past the threshold the beat went |

### 7.3 Beat detection

Onset detection independently tracks bass, mid, and treble against per-band **adaptive thresholds**, so a transient in any of them can trigger a beat:

- A 48-frame (~0.8 s) ring buffer for each band; threshold = `running average × sensitivity multiplier`, floored at 0.035 (silence gate).
- Conditions: above threshold **and** rising (> previous frame × 1.02) **and** ≥ 0.16 s since last beat (caps at ~375 BPM) **and** 16-frame warm-up elapsed.
- Sensitivity is a 5-step slider (default **3 = MEDIUM**): multipliers `1.85 / 1.58 / 1.36 / 1.18 / 1.05`, labels CALM → MAX. It sits behind the **BEAT FINE-TUNING** disclosure because MEDIUM is already tuned for a typical room — re-tuning is the exception, so it is not a permanent row in the panel.
- **BPM:** the last 10 beat intervals in the 0.28–1.30 s window are averaged (≥3 required); `BPM = 60 / mean`, accepted only within 55–200. A beat gap over 1.30 s clears the estimate and interval history, including while waiting for the next beat.

---

## 8. How audio becomes visual

Two mechanisms, deliberately split between CSS and JS:

### 8.1 CSS custom properties (every frame)

`main.js` publishes `--level`, `--bass`, `--mid`, `--treble`, `--beat` (and `--accent`) onto `#visualizer`; pure CSS formulas do the reacting:

| Element | Reaction |
|---|---|
| Ambient blobs | `scale(1 + bass × .30)` |
| Effect layer | `scale(1 + level × .025)` |
| Orbit orbs | `scale(1 + bass × .22 + beat × .10)` |
| Square / triangle | `scale(1 + level × .30 + beat × .08)` |
| Wave rings | `scale(1 + bass × .10)` |
| Liquid blobs | `blur(16px + bass × 26px)`, `scale(1 + mid × .14)` |
| Prism bands | `scale(1 + treble × .10)`, `opacity .35 + treble × .65` |
| Beat flash | `opacity = pulse × 0.30` (JS-written) |

### 8.2 Discrete JS reactions

- **Beat ripples:** each beat spawns an expanding accent-colored ring at a random position (26–64 vmin across, life 0.85–1.4 s, border width scaled by `strength`). Rings come from a pool, capped at **9 live** elements — DOM growth stays bounded.
- **Object re-randomization:** if the Orbiting effect is on, every beat re-rolls the square/triangle paths.
- **Spectrum strip:** see below.
- **Readouts:** HUD text (hex, RGB, frame, BPM, beats) refreshes at **10 Hz**, not per frame — no layout thrash.

### 8.3 FFT spectrum canvas

A full-width strip at the bottom (`height: min(36svh, 320px)`, hidden until the mic runs, toggleable):

- **72 bars** mapped log-spaced across **30 Hz → 16 kHz**, so bass isn't squeezed into pixels.
- Each bar: averaged bin magnitude → `min(1, avg^0.72 × 1.55)`, drawn mirrored around a center axis in three passes — glow, hue-filled core (accent hue), white cap — plus a **peak-hold marker** decaying at 0.55/s.
- Axis labels 60 / 1K / 12K drawn in DM Mono; canvas sized at device-pixel-ratio capped to 2, resized via `ResizeObserver`.

## 9. State model

All state lives in module-level variables of `main.js` plus fields on the single `AudioEngine` instance — no store, no persistence:

- `playing`, `speed`, `motionSpeed`, `sensitivity`, `spectrumEnabled`, `effects{}` (4 flags), `hue`, `hueBias`, `accentHue`, `frame`
- Audio: BPM, beat count, history buffers (inside `AudioEngine`)
- Reload resets everything to defaults: **playing, flow 4/5 FAST, motion 4/5 FAST, sensitivity 3/5 MEDIUM, spectrum ON, all effects OFF, mic OFF.**

## 10. Accessibility and reduced motion

- Every control is a real `<button>`/`<input>` with `aria-label`, `aria-pressed` mirroring state; the mic error is `role="status"`; decorative layers are `aria-hidden`.
- `prefers-reduced-motion: reduce` pauses all effect keyframes and pulsing indicators in CSS **and** suppresses ripple spawning and beat-flash in JS.
- Under 600 px the HUD becomes a scrollable bottom sheet, the effects grid reflows to 2 columns, and the spectrum strip shortens.

## 11. Performance choices

- One `requestAnimationFrame` loop while listening; `dt` clamped to 8–100 ms.
- Ripple object pooling (max 9), 10 Hz DOM readout writes, DPR capped at 2.
- Mic audio is analysed, never played (no feedback, no output cost).
- Effects are pure compositing-friendly CSS (transform/opacity/filter) — no per-frame layout reads in the animation path.

## 12. Error handling (mic)

Five mapped failure modes with actionable copy shown inline and announced via `role="status"`: insecure context, permission blocked, no device, device busy, overconstrained. Every lookup keys on `error.name` — the insecure-context case is a typed `NO-SECURE-CONTEXT` error thrown by `audio.js`, so nothing matches on message text; an unmapped failure falls through to a generic line that quotes the message. On any failure the engine is stopped, the button re-enabled (`finally`), and status returns to OFFLINE. Track `ended` events and `pagehide` also trigger full teardown, which reschedules the ambient interval and repaints immediately instead of waiting for the next tick.

## 13. Running and deploying

- **Local:** any static server; must be HTTP(S) — ES modules don't load over `file://`, and the mic requires a secure context. `fiveserver.config.js` runs Five Server with HTTPS on port 5500.
- **Production:** GitHub Pages serves the repo root as-is; all asset paths are relative so subpath hosting works. No build output exists to deploy.

## 14. Known gaps in the current state

1. **No automated verification** — no tests, linter, or CI. Correctness rests on manual testing plus throwaway Node checks of `audio.js`, which is importable precisely because it is DOM-free. Accepted tradeoff for a zero-build static page.
2. **Sensitivity is per-session** — a reload returns it to MEDIUM along with everything else. Deliberate: persistence is the first brick of a settings system this product does not need.
3. **Motion speed has no keyboard route** — decided in §6, not forgotten. Revisit only if the slider proves awkward on touch.
4. **Beat detection is bass-only onset detection** — it locks onto drums, not harmony, and quiet or bass-light material leaves `BPM —` instead of guessing. That honesty is the feature.

Closed by the 2026-09-28 taste pass: README and `<meta description>` now describe the real product and the file map lists `audio.js`; the formatting pass shipped as its own commit (`51f7cdd`); the redundant effects note left the panel and beat sensitivity moved behind a disclosure; the `↑ ↓` hint reads FLOW; the click guard exists once instead of twelve times; `#visualizer` is `root` in JS and the root hue field is `baseHue`; the ambient interval is unscheduled while the mic runs and resumes immediately on stop; the insecure-context error is typed and matched by `name`; `todo/` and the taste analysis are gitignored.

*Companion analysis: `reports/codebase-taste-analysis.md`.*



