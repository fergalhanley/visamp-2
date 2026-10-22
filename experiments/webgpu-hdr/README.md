# WebGPU HDR brightness proof of concept

An isolated static experiment for Visamp. **No changes** to the Rust/WASM engine, WebGL player or app routes.

## Run

From the repository root:

```sh
python3 -m http.server 8765 --directory experiments/webgpu-hdr
```

Open **http://localhost:8765** in Chrome on an HDR-capable display. The file is self-contained (no dependencies or build). Adjust the 0.5–6× highlight slider and compare with the CSS white swatch. Toggle **HDR extended** / **SDR standard**, then compare **Apple XDR Display** / **Apple Display** reference modes in macOS.

The four bands near the bottom of the canvas are 0.5×, 1×, 2× and 4× reference values. They deliberately use linear-ish float values to test whether output above 1 survives the display path. They are *not calibrated luminance measurements*.

## What constitutes a useful result

- On the XDR preset with extended mode, the core and 2×/4× bands should appear brighter than CSS white, without clipping to ordinary white.
- In standard mode (or a non-HDR preset), the >1 bands should visibly collapse toward the same white.
- Check the diagnostics, particularly the HDR media query and the reported canvas mode.
- Browser/OS variations mean the mode being reported as extended **does not prove** that the OS actually presents HDR.

## Known issues and follow-up

Chromium issue [567321057](https://issues.chromium.org/issues/567321057) concerns macOS HDR canvases appearing SDR until another element forces compositing; verified fixed in Chrome 157 Canary, with varied reports in Chrome 156. If HDR seems clipped, try updated Chrome/Canary before drawing architectural conclusions.

This experiment uses WebGPU with `rgba16float`, `display-p3` and `toneMapping: { mode: "extended" }`. It uses a static reference, modest pulse, and manual beat button instead of microphone permission. The floating-point slider is a relative shader intensity, **not nits**. Avoid looking at sustained high-intensity output if uncomfortable.

References:
- [Chrome WebGPU 129 HDR introduction](https://developer.chrome.com/blog/new-in-webgpu-129/)
- [Chromium macOS HDR issue](https://issues.chromium.org/issues/567321057)

If this works reliably, we can consider an optional HDR output pipeline consuming Visamp's existing audio/frame state—without migrating the whole renderer.

## Chrome 155 compositing workaround test

A transparent, pointer-events-disabled overlay with `backdrop-filter: blur(0px)` is enabled by default. It is designed to encourage Chrome's compositor to activate HDR presentation without hovering the New Tab button. Toggle **Compositing workaround (Chrome 155)** off and on while leaving the cursor away from Chrome's tab strip. Compare HDR output with the same intensity and display preset. The overlay is experimental, not a guaranteed fix; the CSS compositor may vary by browser build. If it does not help, report the observed difference and Chrome build. No main application changes are made.
