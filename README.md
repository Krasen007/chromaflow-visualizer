# Chroma Flow Visualizer

A full-screen color visualizer with two ways to make color move. Pure static HTML, CSS, and JavaScript — no build step, no framework, no runtime dependencies.

**Ambient mode** is the default: the background cycles through random HSL colors while optional motion layers (orbiting shapes, color waves, liquid blobs, prism bands) animate on top. **Reactive mode** is opt-in — enable the microphone with its button, allow access, and the sound takes over. Loudness and spectral brightness drive the background, beats spawn ripples and re-roll the shapes, and a 72-bar FFT spectrum strip runs along the bottom of the screen.

A glass control panel reports the live color, level, and BPM, then slides away after a couple of seconds so the visuals own the screen.

## Live demo

Hosted on GitHub Pages — see the repository's **About → Website** link, or visit:

```
https://krasen007.github.io/chromaflow-visualizer/
```

## Features

- **Random color cycling** — each frame picks a new hue with randomized saturation and lightness, eased with a 120ms background transition.
- **Microphone mode** — Web Audio analysis turns the live signal into loudness, bass/mid/treble energy, and spectral brightness; those drive the background color and scale every effect layer in real time. Strictly opt-in: nothing is requested until you ask for it.
- **Beat detection and BPM** — adaptive onset detection across bass, mid, and treble feeds a running BPM estimate, expanding beat ripples, a beat flash, and a re-roll of the orbiting shapes.
- **FFT spectrum strip** — 72 log-spaced bars from 30 Hz to 16 kHz with peak-hold caps, drawn along the bottom of the screen. Only visible while the mic runs, and toggleable.
- **Four stackable effects** — Orbiting, Color waves, Liquid flow, and Prism shift. They combine freely; run all four at once.
- **Two independent speed axes** — *Flow speed* controls how often the color changes (while listening, how fast color chases the audio), *Motion speed* controls how fast the effect layers animate. They are deliberately decoupled.
- **Live readout** — hex value, RGB triplet, frame counter, input level meter, BPM, and beat count.
- **Manually closable HUD** — close the control panel with its close button and reopen it with the `MENU` tab. It does not hide automatically.
- **Touch and mouse controls** — use the on-screen controls; there are no app-specific keyboard shortcuts.
- **Responsive** — under 600px the panel becomes a bottom sheet and the effects grid reflows to two columns.
- **Reduced-motion aware** — respects `prefers-reduced-motion` by pausing all effect animations and skipping beat ripples.
- **Private by design** — audio is analysed in your browser only. Nothing is recorded, uploaded, or stored, and the mic is never routed back to your speakers (no feedback loop).

## Usage

### On the page

| Action | Result |
|---|---|
| **Click anywhere** | Jump to a new random color — while listening, re-keys the palette instead |
| **Move the pointer** | Reveal the control panel |
| **Pause flow** button | Freeze or resume color cycling |
| **Fullscreen** button | Toggle fullscreen |
| **Flow speed** slider | Color change rate: CALM → RAPID (5 steps) |
| **Motion speed** slider | Effect animation rate: FLOAT → TURBO (5 steps) |
| **Effect toggles** | Enable or disable each of the four effect layers |
| **MIX ALL** / **CLEAR ALL** | Turn every effect on or off at once (label reflects the current state) |
| **Enable microphone** button | Start or stop listening |
| **FFT SPECTRUM** | Show or hide the spectrum strip |
| **BEAT FINE-TUNING** | Opens the beat sensitivity slider: CALM → MAX (5 steps) |

The control panel remains visible until closed manually; use the `MENU` tab to reopen it. Click or touch anywhere outside a control to change the color (or re-key the palette while listening).

### Listening (microphone)

Use the **ENABLE MICROPHONE** button. The browser asks for permission once — until you activate it the app never touches the microphone, and the status line reads `OFFLINE`.

| Status | Meaning |
|---|---|
| `OFFLINE` | Ambient mode — the random color engine owns the background |
| `CONNECTING` | Waiting on the permission prompt |
| `LISTENING` | Sound drives the color, the layers, the ripples, and the strip |

Once it is listening:

- The **background color** chases the brightness and loudness of the sound; clicking re-keys the palette without disturbing the audio.
- **Bass** swells the ambient blobs and wave rings, **mids** the liquid blobs, **treble** the prism bands, **loudness** the whole effect layer.
- **Beats** spawn a ripple, flash the accent color, and re-roll the orbiting shapes; `BPM` and `BEATS` update in the panel.
- The **spectrum strip** appears along the bottom of the screen (this is what `FFT SPECTRUM` toggles).
- If beats trigger too often or too rarely, open **BEAT FINE-TUNING** and move **BEAT SENSITIVITY**. The default, `MEDIUM`, is tuned for a typical room and most people never need to touch it.

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
├── main.js                 # orchestrator: color engine, HUD state, spectrum canvas, beat reactions
├── audio.js                # AudioEngine — mic capture → per-frame analysis snapshot (never touches the DOM)
├── chroma-flow-icon.svg    # favicon
├── designdocument.md       # the app explained section by section
├── README.md
└── .gitignore
```

That is the entire project. No dependencies, no build configuration, and no generated output — GitHub Pages serves these files directly, so what you edit is exactly what visitors load. (A `fiveserver.config.js` for a local HTTPS dev server is convenient but deliberately gitignored — the app does not need it.)

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

Any current browser. Uses CSS custom properties, `clip-path`, `backdrop-filter`, `mix-blend-mode`, `aspect-ratio`, and `100svh` — all widely supported in modern Chrome, Firefox, Safari, and Edge. Fonts load from Google Fonts; if that request is blocked the page falls back to system sans-serif and monospace.

The reactive mode additionally uses the Web Audio `AnalyserNode`, Canvas 2D, and `navigator.mediaDevices.getUserMedia`. All of those are standard, but browsers only expose `getUserMedia` in a **secure context**, so the microphone needs `https://` (GitHub Pages qualifies) or `http://localhost`. Everywhere else the app stays in ambient mode and explains why if you try.
