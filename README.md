# @plasius/player-system-demo-viewer

[![npm version](https://img.shields.io/npm/v/@plasius/player-system-demo-viewer.svg)](https://www.npmjs.com/package/@plasius/player-system-demo-viewer)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/player-system-demo-viewer/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/player-system-demo-viewer/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/Plasius-LTD/player-system-demo-viewer)](https://codecov.io/gh/Plasius-LTD/player-system-demo-viewer)
[![License](https://img.shields.io/github/license/Plasius-LTD/player-system-demo-viewer)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

3D System demo viewer and scenario manifest surface for Player System demos.

Apache-2.0. ESM + CJS builds. TypeScript types included.

## Installation

```bash
npm install @plasius/player-system-demo-viewer
```

## Scope

`@plasius/player-system-demo-viewer` owns the reusable manifest and demo viewer surface for:

- awakening demos
- combat-safe reduction demos
- institution-routing demos
- points-ledger demos
- single-page System demo modules for Missions / Quests, MCC Core, and Spell Creation

## Web App

Run the 3D System viewer locally:

```bash
npm run dev
```

Then open the local Vite URL shown in the terminal. The web app presents a 3D world-space System shell with a left context menu, active center screen, and right selection context panel. The visible System screens are rasterized into transparent canvas buffers, uploaded as WebGPU textures, and rendered on real 3D planes in the `@plasius/gpu-renderer` scene. The camera has a slow player-movement path with step bob while the screens stay fixed in world space. The world backdrop includes a smoothed 360-degree skybox, rolling curved grassland terrain, outdoor horizon, directional sky-dome sun, dense forest bands, patchy traced wind-ripple grass with rougher tufts, near-ground and middle-distance wildflowers, background particles, ultra-quality lighting, and a Canvas fallback only when WebGPU is unavailable. Ultra mode enables the shared `@plasius/gpu-renderer` ray-tracing render plan plus `@plasius/gpu-lighting` per-pixel shadow and reflection resolve metadata, then renders the scene into an offscreen edge-guidance texture, builds a storage-buffer BVH over the generated triangle scene, runs a shader ray-collision resolve with an adaptive budget of 1-8 camera-ray texel alignments per pixel, shades traced mesh with explicit material IDs, and applies a detail-preserving edge-aware denoise pass before presentation. Forest primary visibility and shadows resolve from the generated mesh BVH. Reflection bounces use material roughness and reflectance, so grass is matte and leaves and bark are non-reflective occluders. In ray presentation, panels draw as a final world-space overlay pass after denoise, so they stay crisp and interactive while not casting ray shadows or contributing to reflections. The geometry pass is not composited into the final frame; presentation is owned by the ray resolve, denoise, and panel-overlay passes. The menu appears first; choosing a module reveals the center screen, and choosing an item reveals the right context panel.

The real 3D screens remain interactive. Each rasterized module row, selection card, and context action button emits an `@plasius/gpu-interaction` action descriptor with bounds, payload, a stable script string, and voice phrases. The app exposes those actions through `window.playerSystemDemoCapture.getActions()`, `runAction(actionId)`, `runScript(script)`, and `runVoiceCommand(phrase)` for pitch-video scripting and future voice activation experiments.

Build the static web app:

```bash
npm run build:web
```

The static app output is written to `web-dist/`.

## Video Export

Render a deterministic MP4 menu-navigation demo with Chrome DevTools Protocol frame capture and FFmpeg encoding, matching the `gpu-shared` demo recording flow:

```bash
npm run render:video -- --output demo/system-demo.mp4
```

Useful controls:

```bash
npm run render:video -- \
  --output demo/system-demo.mp4 \
  --width 1280 \
  --height 720 \
  --fps 60 \
  --duration 14 \
  --step-ms 2200 \
  --quality ultra \
  --resolution 720p \
  --render-scale 1 \
  --crf 14 \
  --sequence "missions-quests:quest-starfall-archive,mcc-core:mcc-safety-governor,spell-creation:spell-veil-step"
```

Capture a deterministic still frame for quality checks before encoding:

```bash
npm run render:video -- \
  --screenshot output/screenshots/system-demo-check.png \
  --seek-ms 8250 \
  --quality ultra \
  --resolution 720p \
  --render-scale 1 \
  --presentation ray \
  --settle-frames 6 \
  --capture-delay-ms 120
```

For supersampled quality checks, `--width` and `--height` remain the browser/WebGPU capture viewport, while `--output-width` and `--output-height` set the delivered file size. Render the capture viewport at a higher resolution and downscale the delivered still with FFmpeg. This avoids upscaling a smaller GPU render into a larger image:

```bash
npm run render:video -- \
  --screenshot output/screenshots/system-demo-1440p-to-720p.png \
  --seek-ms 8250 \
  --width 2560 \
  --height 1440 \
  --output-width 1280 \
  --output-height 720 \
  --quality ultra \
  --resolution 720p \
  --render-scale 1 \
  --presentation ray \
  --settle-frames 10 \
  --capture-delay-ms 180
```

The default capture presentation is `ray`, and ray presentation now implies `--require-ray` so offline renders fail if the page does not enter the ray-traced resolve. `--presentation geometry` remains available for explicit debugging of the real WebGPU 3D triangle scene and textured world-space System panel planes, but it is not the path-traced resolve and will not show ray-traced shadows/reflections. The recorder prints the active renderer, presentation mode, and active ray sample count. By default the ray shader keeps roughly the same ray workload as a 720p ultra frame, so 2560x1440 captures resolve with fewer rays per pixel and then downscale cleanly. Use `--ray-samples 1` through `--ray-samples 8` only when you want to override that budget. The recorder re-submits the same simulation timestamp for several settled frames, waits for the page-side WebGPU queue to finish submitted work, then waits for compositor frames before reading the browser surface. Increase `--settle-frames` or `--capture-delay-ms` if a host/browser still captures before presentation completes. Capture mode fails before Canvas fallback can replace the renderer, so pitch-video screenshots and MP4 captures come from the real WebGPU renderer. Use `--allow-fallback` only for fallback QA.
For ray-frame diagnosis, the WebGPU scene uses an opaque swapchain so CSS backgrounds cannot hide blank GPU output. `--ray-debug solid` renders a trivial magenta stripe pass directly to the output view to confirm swapchain presentation. `--ray-debug hits` bypasses material shading and denoise, renders raw traced-hit categories directly to the output view, and reports `rayDebug=hits` in capture diagnostics: red for System panel hits, green for generated mesh hits, yellow for procedural vegetation hits, blue for ground hits, and dark grey for ray misses. Capture diagnostics also include `raySamples=...`, `gpuError=...`, and `shaderDiagnostics=[...]` when the browser reports WebGPU validation or shader compilation errors.

If Chromium launch is restricted by the host shell, run from a normal terminal and point the recorder at system Chrome:

```bash
npm run render:video -- \
  --chrome-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

The web app also accepts demo params directly:

- `capture=1` for manual frame rendering
- `autoplay=1` for live menu navigation
- `frameExport=1` for CDP-driven deterministic frame export
- `quality=ultra`
- `resolution=720p`
- `renderScale=1`
- `presentation=geometry` or `presentation=ray`
- `rayDebug=solid` for swapchain presentation checks or `rayDebug=hits` for ray-hit category visualization
- `raySamples=1` through `raySamples=8` to override the automatic high-resolution ray budget
- `--output-width` / `--output-height` on the recorder for FFmpeg downscale-only delivery from a larger capture viewport
- `sequence=module:selection,module:selection`
- `stepMs=2200`
- `loop=0`

Scriptable interaction helpers are available when the page is loaded:

- `window.playerSystemDemoCapture.getActions()`
- `window.playerSystemDemoCapture.runAction("module:mcc-core")`
- `window.playerSystemDemoCapture.runScript('system.openModule("mcc-core")')`
- `window.playerSystemDemoCapture.runVoiceCommand("open mcc core")`

## Package Demo

```bash
npm run build:package
node demo/example.mjs
```

## Usage

```ts
import { createPlayerSystemDemoManifest } from "@plasius/player-system-demo-viewer";

const manifest = createPlayerSystemDemoManifest([
  { scenarioId: "awakening", title: "Awakening" },
]);

console.log(manifest.scenarios.length);
```

## Governance

- ADRs: [docs/adrs](./docs/adrs)
- TDRs: [docs/tdrs](./docs/tdrs)
- Design notes: [docs/design](./docs/design)
