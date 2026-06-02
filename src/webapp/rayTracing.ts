import {
  createLightingBandPlan,
  createRayTracedShadowPostProcessPlan,
  createWaterRayTraceLightingPlan,
  type GpuLightingBand,
  type GpuRayTracedShadowPostProcessPlan,
  type GpuWaterRayTraceLightingPlan,
} from "@plasius/gpu-lighting";
import {
  createRayTracingRenderPlan,
  type RayTracingRenderPlan,
} from "@plasius/gpu-renderer";
import type { SystemSceneQualityMode } from "./scene.js";

export interface SystemSceneRayTracingPlan {
  readonly quality: "high" | "ultra";
  readonly nearBand: GpuLightingBand;
  readonly renderer: RayTracingRenderPlan;
  readonly shadowPostProcess: GpuRayTracedShadowPostProcessPlan;
  readonly groundReflection: GpuWaterRayTraceLightingPlan;
  readonly rendererPasses: readonly string[];
}

export function createSystemSceneRayTracingPlan(
  qualityMode: SystemSceneQualityMode
): SystemSceneRayTracingPlan {
  const quality = qualityMode === "ultra" ? "ultra" : "high";
  const lightingPlan = createLightingBandPlan({
    profile: "realtime",
    importance: qualityMode === "ultra" ? "critical" : "high",
  });
  const nearBand = lightingPlan.bands.find((band) => band.band === "near") ?? lightingPlan.bands[0];

  if (!nearBand) {
    throw new Error("System scene ray tracing requires a near lighting band.");
  }

  const shadowPostProcess = createRayTracedShadowPostProcessPlan({
    directShadows: nearBand.rtParticipation.directShadows,
    quality,
    primaryShadowSource: nearBand.primaryShadowSource,
  });
  const groundReflection = createWaterRayTraceLightingPlan({
    reflections: nearBand.rtParticipation.reflections,
    directShadows: nearBand.rtParticipation.directShadows,
    quality,
    primaryShadowSource: nearBand.primaryShadowSource,
  });
  const renderer = createRayTracingRenderPlan({
    snapshotId: `player-system-demo-viewer:${quality}`,
    profile: "realtime",
    representations: [
      {
        band: "near",
        rasterMode: "full-live",
        rtParticipation: "premium",
        shadowSource: "ray-traced-primary",
        temporalReuse: "balanced",
        updateCadenceDivisor: 1,
      },
      {
        band: "mid",
        rasterMode: "simplified-live",
        rtParticipation: "selective",
        shadowSource: "regional-raster-and-proxy",
        temporalReuse: "aggressive",
        updateCadenceDivisor: 2,
      },
      {
        band: "far",
        rasterMode: "proxy-or-cached",
        rtParticipation: "proxy",
        shadowSource: "merged-proxy-casters",
        temporalReuse: "high",
        updateCadenceDivisor: 8,
      },
      {
        band: "horizon",
        rasterMode: "horizon-shell",
        rtParticipation: "disabled",
        shadowSource: "baked-impression",
        temporalReuse: "cached",
        updateCadenceDivisor: 60,
      },
    ],
  });

  return Object.freeze({
    quality,
    nearBand,
    renderer,
    shadowPostProcess,
    groundReflection,
    rendererPasses: Object.freeze([
      ...shadowPostProcess.rendererPasses,
      ...groundReflection.rendererPasses,
    ]),
  });
}

export function isPerPixelSystemRayTracingEnabled(plan: SystemSceneRayTracingPlan): boolean {
  return (
    plan.shadowPostProcess.shadowMask === "per-pixel-screen-space-ray-mask" &&
    plan.groundReflection.reflectionResolve === "per-pixel-water-raytrace-resolve"
  );
}
