# Chroma Flow Visualizer - Implementation Design

**Status:** Implemented single-file version, revised for unobstructed viewing, unmirrored FFT, display styles, and microphone gain.

## Product and structure

Chroma Flow is a single-screen, full-window color visualizer. Ambient mode starts immediately and selects vivid colors on a timer. Reactive mode is opt-in and uses the microphone to drive colors, effects, beats, and an optional frequency display. All four motion effects begin off. Settings are not persisted.

The deployable app is `index.html`, with semantic HTML, inline CSS and JavaScript, and Tailwind's browser CDN script. It has no build step. `AudioEngine` is defined inside the page and owns audio capture and analysis; the rest of the script owns UI and rendering. Audio is never connected to the speakers. Serve over HTTP(S); the microphone needs HTTPS or localhost.

## Scene and menu

Paint order is background color and diagonal gradient, ambient glows, enabled effects, beat ripples, radial flash, bottom canvas, dimming layer, center branding and click prompt, glass settings panel, and persistent MENU tab. Decorative content is hidden from assistive technology.

The settings panel is open on startup. **Closing the menu hides the entire central CHROMA FLOW composition, including its overline and CLICK TO SHIFT prompt**, leaving the color and effects unobstructed. Only the small MENU tab remains. Reopening the menu restores the central composition. This behavior is the same in ambient/reactive, paused/playing, desktop/mobile, and fullscreen states. The page title and the brand in the settings panel remain available independently of the central composition.

On wide screens the panel is left-aligned; below 600 px it is a scrollable bottom sheet. The close and MENU buttons transfer keyboard focus to one another. A background click changes the color (or reactive hue bias), but controls do not: a delegated guard excludes `button`, `input`, `summary`, and links. Space pauses only when focus is outside interactive or editable elements. Fullscreen button state follows `fullscreenchange`.

## Color and playback

Ambient hue is random from 0-359 degrees, saturation from 62-91%, and lightness from 42-61%. Values are converted to RGB and uppercase hex and displayed in the HUD. Flow speed steps 1-5 schedule changes at 1100, 640, 360, 180, and 75 ms; step 4 is the default. Background transitions take 120 ms in standard motion.

With microphone capture active there is no ambient interval. Hue follows `(centroid * 460 + hueBias + bass * 24) mod 360` by the shortest route around the color wheel with exponential easing at `0.6 + (flowSpeed - 1) * 0.85`. Saturation is `clamp(58 + level * 34, 40, 96)` and lightness is `clamp(38 + level * 26 + bass * 6, 20, 68)`. The complementary hue supplies accents. Background clicks re-roll `hueBias` without restarting capture.

Pause freezes applied visual colors, frame count, effects, ripples, flash, and canvas; the microphone continues to analyse audio and the level/BPM/beat HUD may update. Beats during pause do not queue visual events. The microphone button explicitly ends capture. On resume rendering continues from the frozen visual state.

## Effects

Orbiting objects include three glow orbs, a square, and a triangle; shape paths change when enabled and on audible beats. Color waves are three staggered rings, liquid flow is three soft-light blobs, and prism shift is two screen-blended bands. All start off, can be mixed freely, and MIX ALL becomes CLEAR ALL when all four are enabled.

Motion speed is independent of flow speed and defaults to step 4. Durations for steps 1-5 are: orbit 30/20/13/7/3.2 s; waves 14/9/6/3.6/1.7 s; liquid 28/19/12/7/3.6 s; prism 22/15/10/5.5/2.8 s.

## Settings

The HUD contains brand/live state and close, color readout/frame, pause/fullscreen, flow speed, motion speed, effects, and audio settings. Audio settings contain microphone toggle and status, level meter, BPM and beat count, FFT spectrum toggle, **BARS/WAVE display style buttons**, **microphone gain slider**, and a BEAT FINE-TUNING disclosure for sensitivity.

Display style defaults to **BARS**, and spectrum visibility defaults on unless reduced motion is active at startup. Choosing WAVE draws a connected, filled **FFT frequency-response envelope** rather than a time-domain oscilloscope trace. It uses the same frequencies and input data as BARS, so both modes represent the entire available frequency range from left (low) to right (high). Style and visibility can be changed while listening; a hidden or paused canvas is not animated.

Gain defaults to **1.0x**, with a native range slider from 1.0x to 8.0x in 0.5x increments. Gain can be adjusted before or during capture. The chosen value stays in memory across microphone restarts but resets on page reload. The level meter and all audio analysis use the boosted input. Large gain values can clip; the user can lower the slider to restore headroom.

Sensitivity remains a five-step slider inside BEAT FINE-TUNING, default 3, with multipliers 1.85/1.58/1.36/1.18/1.05. Controls use native buttons, sliders, and disclosure with visible labels, state attributes, and keyboard focus indication.

## Capture and analysis

The audio graph is `MediaStreamAudioSourceNode -> GainNode -> AnalyserNode`, with no connection to `AudioContext.destination`. Microphone constraints disable echo cancellation, noise suppression, and automatic gain control. The analyser FFT size is 2048 and smoothing is 0.72. Gain changes are applied smoothly to the GainNode. Insecure contexts fail before requesting permission.

One requestAnimationFrame loop while listening reads frequency and time-domain buffers. It calculates smoothed RMS level, noise-floor-lifted bass (20-180 Hz), mid (180 Hz-2.2 kHz), treble (2.2-14 kHz), normalized centroid, beat, beat envelope, and onset strength. Each band has a 48-frame running average. Onsets must exceed the band's average times its sensitivity multiplier and a 0.035 minimum, be rising, follow a 16-frame warm-up, and be at least 0.16 s apart. The detector is three-band, not bass-only. BPM uses up to ten intervals of 0.28-1.30 s, requires three qualifying intervals, and shows only 55-200 BPM; a gap longer than 1.30 s clears it.

During a pending permission request, a second activation cancels the pending start. A late grant stops its tracks rather than activating capture. Track-ended and pagehide also tear down the graph. Teardown stops tracks, disconnects nodes, closes the context, resets analysis, resumes ambient scheduling, and repaints when unpaused. Inline status messages cover insecure pages, denied permission, missing/busy microphones, unsupported capture, overconstrained input, and unknown errors.

## Reactive visuals and FFT

The renderer publishes `--level`, `--bass`, `--mid`, `--treble`, `--beat`, and `--accent`. A beat creates an accent ripple (at most nine live), moves orbit shapes when enabled, and drives the radial flash. HUD readouts update at approximately 10 Hz. Frame deltas are clamped after background-tab gaps. The canvas backing store uses ResizeObserver and caps device-pixel ratio at 2.

The bottom FFT strip draws **72 logarithmically spaced frequency samples, left-to-right without mirroring**, beginning at about 30 Hz and ending at **16 kHz when the input sample rate supports it**. The actual upper bound is `min(16000, (frequencyBinCount - 1) * sampleRate / fftSize)`, because bins above Nyquist do not exist. The displayed rightmost label is 16 KHZ when available; otherwise it reports the reachable maximum instead of implying nonexistent frequency data. BARS uses glowing colored bars, white caps, and decaying peak markers. WAVE draws a glowing continuous frequency envelope with a translucent fill. Both show a baseline and 60 Hz / 1 kHz frequency markers, and both use the same left-to-right logarithmic scale. The strip shortens on phone-sized screens.

## Reduced motion, defaults, and verification

Reduced motion stops effect keyframes and pulsing indicators and suppresses ripples and flash. Ambient timing never goes below 1100 ms and has a longer transition. Reactive color application is limited to twice per second with a gentler transition. Spectrum starts hidden under reduced motion but remains manually available. Changes to the motion preference during the session update behavior without changing sliders.

Defaults: playing, ambient, menu open with center title visible, flow 4, motion 4, sensitivity 3, gain 1.0x, effects off, spectrum on except under reduced motion, and FFT style BARS. Reloading restores these defaults.

Manual verification should cover ambient speeds and click-to-shift; each effect and MIX ALL; pause/resume and microphone capture while paused; close/reopen on desktop and mobile (especially center-title visibility); keyboard/focus/fullscreen; gain adjustments before and during capture and clipping at high settings; BARS and WAVE frequency progression without mirroring and 16 kHz label on supported sample rates; low-sample-rate fallback; spectrum resize; permission rejection/cancellation/late grant/disconnection; beat and BPM clearing; and reduced-motion changes during a session. There is no automated test suite or build output.