# Chroma Flow Visualizer

A rapid, full-screen random color visualizer. Pure static HTML, CSS, and JavaScript — no build step, no framework, no runtime dependencies.

The page cycles the whole background through random HSL colors while optional motion layers (orbiting shapes, color waves, liquid blobs, prism bands) animate on top. A glass control panel reports the live color and lets you tune speed and effects.

## Live demo

Hosted on GitHub Pages — see the repository's **About → Website** link, or visit:

```
https://<your-username>.github.io/chromaflow-visualizer/
```

## Features

- **Random color cycling** — each frame picks a new hue with randomized saturation and lightness, eased with a 120ms background transition.
- **Four stackable effects** — Orbiting, Color waves, Liquid flow, and Prism shift. They combine freely; run all four at once.
- **Two independent speed axes** — *Flow speed* controls how often the color changes, *Motion speed* controls how fast the effect layers animate. They are deliberately decoupled.
- **Live readout** — hex value, RGB triplet, and a frame counter.
- **Auto-hiding HUD** — the control panel slides away after 2.2s of inactivity while playing, and reappears on any pointer movement. The `MENU` tab stays on the left edge to bring it back.
- **Fullscreen** — one button or the `F` key.
- **Keyboard control** — `Space`, arrow keys, and `F`.
- **Responsive** — under 600px the panel becomes a bottom sheet and the effects grid reflows to two columns.
- **Reduced-motion aware** — respects `prefers-reduced-motion` by pausing all effect animations.

## Usage

### On the page

| Action | Result |
|---|---|
| **Click anywhere** | Jump to a new random color |
| **Move the pointer** | Reveal the control panel |
| **Pause flow** button / `Space` | Freeze or resume color cycling |
| **Fullscreen** button / `F` | Toggle fullscreen |
| **Flow speed** slider / `↑` `↓` | Color change rate: CALM → RAPID (5 steps) |
| **Motion speed** slider | Effect animation rate: FLOAT → TURBO (5 steps) |
| **Effect toggles** | Enable or disable each of the four effect layers |
| **MIX ALL** / **CLEAR ALL** | Turn every effect on or off at once (label reflects the current state) |

While playing, the panel hides itself after a couple of seconds so the visuals are unobstructed. Pausing keeps it pinned open.

### Running it locally

> **You cannot open `index.html` by double-clicking it.** The script is loaded as an ES module, and browsers block module imports over the `file://` protocol (CORS). You need to serve the folder over HTTP.

There is nothing to install. Serve the folder with any static server:

```bash
npx serve .
```

It prints a local URL (typically <http://localhost:3000>) — open it and the visualizer runs. There is no compile or bundle step, so the same files you serve locally are exactly what gets published.

If you would rather have a watcher with automatic reload while editing, any static server with live reload works — for example `npx serve . --watch` does not, but `npx browser-sync . --server` does. A plain server is enough; there is nothing to rebuild.

## Project structure

```
.
├── index.html              # markup for the canvas and the control HUD
├── style.css               # all styling, animations, and responsive rules
├── main.js                 # color cycling, controls, and effect state
├── chroma-flow-icon.svg    # favicon
├── README.md
└── .gitignore
```

That is the entire project. No dependencies, no build configuration, and no generated output — GitHub Pages serves these files directly, so what you edit is exactly what visitors load.

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
