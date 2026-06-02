# TDR-0002: System Viewer Single-Page App Shape

## Direction

The System demo viewer is a single-page app with three persistent regions:

- module context menu on the left
- current System screen in the center
- selection context panel on the right

## Runtime

- Vite serves and builds the local web app.
- `@plasius/gpu-renderer` renders the ambient world backdrop through WebGPU and is loaded with a dynamic import.
- HTML and CSS keep an accessibility/source representation of module rows, controls, meters, and inspector content.
- The visible System screens are rasterized into transparent Canvas2D buffers, uploaded to WebGPU textures, and drawn on real 3D planes in the world.
- Rasterized module rows, selection cards, and context buttons are emitted as `@plasius/gpu-interaction` surface actions with pixel bounds, scripts, payloads, and phrase aliases.
- The WebGPU scene projects the textured quads to screen space, resolves pointer hits back to panel UVs, and delegates UV-to-action matching to `@plasius/gpu-interaction`.
- Ultra mode builds the same renderer-owned RT plan shape used by `gpu-shared`: `@plasius/gpu-renderer` supplies the ray-tracing stage plan, while `@plasius/gpu-lighting` supplies per-pixel scene shadow and reflection resolve metadata.
- The viewer consumes those RT plans through a renderer-owned multi-pass WebGPU frame: offscreen scene texture for denoise edge guidance, shader ray-collision resolve texture, edge-aware denoise pass, then swapchain presentation.
- The ray resolve reconstructs camera rays per pixel, traces an adaptive budget of 1-8 texel-aligned samples per pixel, collides against a storage-buffer BVH built from the generated triangle scene plus real System panel planes, shades traced mesh material data and bound panel textures directly, and uses secondary shadow/reflection rays for final colour.
- Secondary reflection rays shade from traced hit materials rather than camera-projected source pixels, so off-camera panels, terrain, and vegetation can tint reflections.
- The offscreen geometry render is not composited into the final frame. It is only a denoise-edge source for the ray-traced result.
- The app dispatches all pointer, script, and phrase activation through one interaction registry so future voice activation can drive the same commands as 3D pointer hits.
- The System surface reveal is staged: menu actions reveal the center module screen, and selection actions reveal the right context panel.
- Panel motion is no longer simulated as visible DOM movement; the textured planes are fixed in world space while camera/look motion changes their perspective.
- Player movement is represented by camera translation and subtle step bob. No player avatar or body marker is rendered in the scene.
- The background is an outdoor grassland scene with a smoothed 360-degree procedural skybox, curved rolling terrain, directional sky-dome sun, horizon, hills, dense wide/deep forest bands, patchy fine middle-distance grass, rougher tuft clusters, and wildflowers so pitch-video camera movement has stable real-world parallax.
- Ultra capture mode increases render scale, background particle density, lighting intensity, and shared RT shadow/reflection pass quality without changing the interactive UI layout.
- Offline video rendering follows the `gpu-shared` capture shape: Chrome is driven through the DevTools Protocol, `window.__plasiusCaptureFrame` advances deterministic frames, PNG frames are captured from the browser surface, and FFmpeg encodes those frames to MP4.

## Data

Demo modules are represented as typed package data so tests can validate module IDs, selection fallback behavior, and screen metadata independently from the browser runtime.

## Video Parameters

The browser surface accepts `capture=1`, `autoplay=1`, `frameExport=1`, `quality`, `resolution`, `renderScale`, `sequence`, `stepMs`, and `loop` query parameters. The `render:video` script maps CLI flags to those parameters and controls the capture timeline frame by frame. Runtime scripting can also call `window.playerSystemDemoCapture.runAction`, `runScript`, or `runVoiceCommand` to invoke the same action descriptors used by pointer hits.
