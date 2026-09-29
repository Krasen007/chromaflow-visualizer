# Chroma Flow Visualizer

A full-screen color visualizer with two ways to make color move. Pure static HTML, CSS, and JavaScript — no build step, no framework, no bundled dependencies, and no CSS framework. (The page's only third-party request is the Inter webfont; if it is blocked the page falls back to the system sans-serif.)

**Ambient mode** is the default: the background cycles through random HSL colors while optional motion layers (orbiting shapes, color waves, liquid blobs, prism bands) animate on top. **Reactive mode** is opt-in — enable the microphone with its button, allow access, and the sound takes over. Loudness and spectral brightness drive the background, beats spawn ripples and re-roll the shapes, and a 72-sample FFT spectrum strip runs along the bottom of the screen.

A glass control panel reports the live color, level, and BPM, and you close it with its close button whenever you want the visuals to own the screen.

## Live demo

Hosted on GitHub Pages — see the repository's **About → Website** link, or visit:

```
https://krasen007.github.io/chromaflow-visualizer/
```

## Features

- **Random color cycling** — each frame picks a new hue with randomized saturation and lightness, eased with a 120ms background transition.
- **Beat detection and BPM** — adaptive onset detection across bass, mid, and treble feeds a running BPM estimate, expanding beat ripples, a beat flash, and a re-roll of the orbiting shapes.
- **Microphone mode** — Web Audio analysis turns the live signal into loudness, bass/mid/treble energy, and spectral brightness; those drive the background color and scale every effect layer in real time. Strictly opt-in: nothing is requested until you ask for it. Every frequency reading is noise-floor lifted by a 5.5% threshold before it is averaged, so a silent room reads as silence — no phantom bass.
- **FFT spectrum strip** — 72 log-spaced samples from 30 Hz to 16 kHz with peak-hold caps, drawn along the bottom of the screen, with 60 Hz and 1 kHz markers at their true log positions. The right-edge label reads `16 KHZ` when the sample rate reaches that far and otherwise reports the real maximum instead of implying frequencies that do not exist. Only visible while the mic runs, and toggleable; **BARS** or **WAVE** envelope.
- **Four stackable effects** — Orbiting, Color waves, Liquid flow, and Prism shift. Each has its own toggle; run all four at once.
- **Two independent speed axes, each with 20 steps** — *Flow speed* controls how often the color changes (while listening, how fast color chases the audio), *Motion speed* controls how fast the effect layers animate. They are deliberately decoupled, and both interpolate logarithmically between their five anchor rates so every single step is a distinct, usable setting rather than a repeat. The label names the band you are in (CALM → RAPID, FLOAT → TURBO) and the control announces the resulting rate or loop time.
- **Live readout** — hex value, RGB triplet, frame counter, input level meter, BPM, and beat count.
- **Manually closable HUD** — close the control panel with its close button and reopen it with the `MENU` tab. It does not hide automatically.
- **Touch and mouse controls** — use the on-screen controls; the only keyboard shortcut is Space, which pauses when focus is outside a control.
- **Responsive** — under 600px the panel becomes a scrollable bottom sheet and the spectrum strip shortens.
- **Reduced-motion aware** — respects `prefers-reduced-motion` by pausing all effect animations and skipping beat ripples.
- **Private by design** — audio is analysed in your browser only. Nothing is recorded, uploaded, or stored, and the mic is never routed back to your speakers (no feedback loop).

## Usage

### On the page

| Action | Result |
|---|---|
| **Click anywhere** | Jump to a new random color — while listening, re-keys the palette instead |
| **Space** | Pause or resume, as long as focus is not inside a control |
| **Pause flow** button | Freeze or resume the automatic color cycling — the visuals are never dimmed, and you can still click to re-key the color while paused |
| **Fullscreen** button | Toggle fullscreen |
| **Flow speed** slider | Color change rate: CALM → RAPID (20 steps, 1100 ms down to 75 ms) |
| **Motion speed** slider | Effect animation rate: FLOAT → TURBO (20 steps, 30 s down to 3.2 s per orbit) |
| **Effect toggles** | Enable or disable each of the four effect layers; all four can run together |
| **Enable microphone** button | Start or stop listening |
| **Microphone gain** slider | Input trim, 1.0x → 8.0x in 0.5x steps, adjustable live |
| **FFT SPECTRUM** | Show or hide the spectrum strip |
| **BARS / WAVE** | Draw the spectrum as bars with peak caps, or as a filled frequency envelope |
| **BEAT SENSITIVITY** | Beat trigger threshold: CALM → MAX (5 steps), visible by default under BEAT FINE-TUNING |

The control panel remains visible until closed manually; use the `MENU` tab to reopen it. Click or touch anywhere outside a control to change the color (or re-key the palette while listening). Nothing is persisted — reloading restores every default.

### Listening (microphone)

Use the **ENABLE MICROPHONE** button. The browser asks for permission once — until you activate it the app never touches the microphone, and the status line reads `Ambient mode · no microphone access`.

| Status | Meaning |
|---|---|
| `Ambient mode · no microphone access` | Ambient mode — the random color engine owns the background |
| `Waiting for microphone permission…` | Waiting on the permission prompt; pressing the button again cancels it |
| `Listening · color follows your sound` | Sound drives the color, the layers, the ripples, and the strip |
| *(any other line)* | A specific failure — insecure page, permission denied, no device, device busy — with the fix in the message |

Once it is listening:

- The **background color** chases the brightness and loudness of the sound; clicking re-keys the palette without disturbing the audio.
- **Bass** swells the ambient blobs and wave rings, **mids** the liquid blobs, **treble** the prism bands, **loudness** the whole effect layer.
- **Beats** spawn a ripple, flash the accent color, and re-roll the orbiting shapes; `BPM` and `BEATS` update in the panel.
- The **spectrum strip** appears along the bottom of the screen (this is what `FFT SPECTRUM` toggles).
- If beats trigger too often or too rarely, move the **BEAT SENSITIVITY** slider in the always-open **BEAT FINE-TUNING** section. The default, `MEDIUM`, is tuned for a typical room and most people never need to touch it.

The microphone requires a **secure context**: `https://` or `http://localhost`. On a plain `http://` LAN address the browser hides `getUserMedia` completely, and the app tells you that in the error slot instead of failing silently. Stopping — the button, releasing the device, or closing the tab — tears the whole pipeline down and hands the background straight back to the random engine.

### Running it locally

> **You cannot open `index.html` by double-clicking it.** The script is loaded as an ES module, and browsers block module imports over the `file://` protocol (CORS). You need to serve the folder over HTTP.

There is nothing to install. Serve the folder with any static server:

```bash
npx serve .
```

It prints a local URL (typically <http://localhost:3000>) — open it and the visualizer runs. There is no compile or bundle step, so the same files you serve locally are exactly what gets published.

If you would rather have a watcher with automatic reload while editing, any static server with live reload works — for example `npx serve . --watch` does not, but `npx browser-sync . --server` does. A plain server is enough; there is nothing to rebuild.

`http://localhost` counts as a secure context, so the microphone works locally with no certificates. To test it from a phone on your LAN you need HTTPS — any dev server that can serve a self-signed certificate will do.

## Project structure

```
.
├── index.html              # layer stack + control HUD markup
├── style.css               # all styling, animations, audio-reactive rules, responsive rules
├── main.js                 # orchestrator: color engine, HUD state, spectrum canvas, beat reactions,
│                           #   and the AudioEngine class (mic capture → per-frame analysis; never touches the DOM)
├── chroma-flow-icon.svg    # favicon
├── DESIGN.md               # the app explained section by section
├── README.md
├── LICENSE
└── .gitignore
```

That is the entire project. No installed dependencies, no build configuration, and no generated output — GitHub Pages serves these files directly, so what you edit is exactly what visitors load. (A `fiveserver.config.js` for a local HTTPS dev server is convenient but deliberately gitignored — the app does not need it.)

## Deploying to GitHub Pages

The site is plain static files, so deployment is just "push, then switch Pages on."

**1. Create the repository**

Go to <https://github.com/new> and create a public repository named `chromaflow-visualizer` (public is required unless you are on a paid plan). Do **not** initialize it with a README — the local repo already has one.

**2. Push**

```bash
git remote add origin https://github.com/<your-username>/chromaflow-visualizer.git
git push -u origin main
```

**3. Enable Pages**

In the repository: **Settings → Pages → Build and deployment → Source**, choose **Deploy from a branch**, select **main** and **/ (root)**, then save.

**4. Wait**

The first deploy takes about a minute. The site appears at:

```
https://<your-username>.github.io/chromaflow-visualizer/
```

Subsequent pushes to `main` go live automatically.

### Why relative paths

Every asset reference is relative (`./style.css`, `./main.js`, `./chroma-flow-icon.svg`). GitHub Pages serves project sites from a subpath rather than a domain root, so absolute paths like `/style.css` would resolve to `https://<your-username>.github.io/style.css` and 404. Keeping paths relative means the site works unchanged from a subpath, a custom domain, or any other static host.

## Browser support

Any current browser. Uses CSS custom properties, `color-mix()`, `backdrop-filter`, `mix-blend-mode`, `<details>`/`<summary>`, `aria-valuetext`, and `100svh` — all widely supported in modern Chrome, Firefox, Safari, and Edge. Inter loads from Google Fonts; if that request is blocked the page falls back to the system sans-serif.

The reactive mode additionally uses the Web Audio `AnalyserNode`, Canvas 2D, and `navigator.mediaDevices.getUserMedia`. All of those are standard, but browsers only expose `getUserMedia` in a **secure context**, so the microphone needs `https://` (GitHub Pages qualifies) or `http://localhost`. Everywhere else the app stays in ambient mode and explains why if you try.
