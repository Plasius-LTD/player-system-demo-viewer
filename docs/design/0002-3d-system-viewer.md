# 3D System Viewer

## Goal

Provide a pitch-ready Player System web app that makes the System UI feel embedded in a 3D game world.

## Surface

- left context menu for System modules
- center active screen for the current module
- right context panel for the current selection
- visible System screens rasterized into transparent canvas buffers and rendered as textured planes in the WebGPU world
- rasterized buttons carry `@plasius/gpu-interaction` action descriptors so the real 3D screens can be hit-tested and scripted
- staged System reveal: menu first, module screen after module choice, context panel after item choice
- `@plasius/gpu-renderer` world backdrop with a smoothed 360-degree skybox, curved rolling terrain, field foreground detail, particles, and accent lighting
- shared `@plasius/gpu-renderer` ray-tracing render-plan metadata and `@plasius/gpu-lighting` per-pixel shadow/reflection pass plans in ultra mode
- shader ray-collision resolve that casts an adaptive budget of 1-8 camera-view rays per pixel, intersects a storage-buffer BVH built from the generated triangle scene plus real System panel planes, shades traced mesh material data and bound panel textures directly, and interprets bounce/shadow data for final colour
- secondary reflection rays shade from traced hit materials rather than camera-projected source pixels so off-camera panels, terrain, and vegetation can tint reflections
- edge-aware denoise pass after the ray resolve so stochastic ray samples smooth out without compositing the geometry colour buffer back into the final frame
- outdoor grassland background with a directional sky-dome sun, horizon, minor terrain hills, dense wide/deep forest bands, patchy fine middle-distance grass, rougher tufts, and wildflowers to give camera movement stable parallax cues
- far-field background particles and ultra-quality lighting to make offline captures read as a lit 3D space
- player-view camera translation with subtle step bob; no visible player avatar is rendered
- code-native UI text and controls backed by typed demo data
- action scripts, structured payloads, and voice phrase aliases for module navigation, selection changes, and context commands
- parameter-driven capture mode for offline Chrome DevTools Protocol frame export and FFmpeg video encoding

## Initial Modules

- Missions / Quests
- MCC Core
- Spell Creation

## Concept Reference

The implementation reference is stored at `docs/design/assets/system-demo-spa-concept.png`.

## Exclusions

- production gameplay runtime ownership
- live backend data loading
- release or deployment automation
