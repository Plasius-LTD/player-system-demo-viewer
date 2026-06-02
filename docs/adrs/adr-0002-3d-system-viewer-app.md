# ADR-0002: 3D System Viewer App Surface

## Status

Accepted

## Context

The demo viewer needs to support pitch-video capture, where the Player System should read as a believable in-world System interface rather than only a static manifest helper.

## Decision

Add a Vite-powered single-page web app to the package. The package keeps its reusable TypeScript exports, and the web app consumes typed demo-module data from `src/` while rendering the visual surface with code-native HTML/CSS and a dynamically loaded `@plasius/gpu-renderer` scene.

The viewer uses one active center screen at a time, with a left context menu and right selection context panel, so Missions / Quests, MCC Core, and Spell Creation behave as modules inside one System shell rather than separate full-screen demos.

Visible System UI is rasterized to transparent surfaces and rendered on real WebGPU planes. Interactive regions on those rasterized surfaces use `@plasius/gpu-interaction` descriptors so pointer, script, and future voice activation can route through one explicit action registry.

Ultra-quality rendering uses the local `@plasius/gpu-renderer` full-frame encode hook so the viewer can own a multi-pass frame: rasterize the world into an offscreen edge-guidance texture, build a storage-buffer BVH over the generated triangle scene, run a WGSL ray-collision resolve that reconstructs camera rays, intersects the generated mesh and System panel planes, shades traced mesh material data and bound panel textures directly, run an edge-aware denoise pass, then present to the swapchain. Secondary reflection rays shade from traced hit materials rather than camera-projected source pixels so off-camera scene content can tint reflections. The offscreen geometry pass is not composited into the presented image.

## Consequences

- The package can support both manifest validation and local pitch capture from one repository.
- The 3D runtime is isolated to the web app and lazy-loaded so package consumers do not import the GPU renderer through the public library entrypoint.
- The interaction contract is shared with the `gpu-*` family instead of being kept as viewer-local glue.
- Shadows/reflections are no longer manual overlay geometry; they are derived from shader ray hit, shadow, reflection, and panel texture sampling data.
- The demo data remains testable through package exports.
