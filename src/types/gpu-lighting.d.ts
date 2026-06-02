declare module "@plasius/gpu-lighting" {
  export type GpuLightingRtParticipation = "premium" | "selective" | "proxy" | "disabled";

  export interface GpuLightingBand {
    readonly band: string;
    readonly primaryShadowSource: string;
    readonly rtParticipation: {
      readonly reflections: GpuLightingRtParticipation;
      readonly directShadows: GpuLightingRtParticipation;
      readonly globalIllumination: GpuLightingRtParticipation;
    };
  }

  export interface GpuLightingBandPlan {
    readonly profile: string;
    readonly bands: readonly GpuLightingBand[];
  }

  export interface GpuWaterRayTraceLightingPlan {
    readonly pass: "water-ray-trace";
    readonly quality: string;
    readonly reflections: GpuLightingRtParticipation;
    readonly directShadows: GpuLightingRtParticipation;
    readonly reflectionGeometry: string;
    readonly shadowOcclusion: string;
    readonly reflectionResolve: string;
    readonly shadowResolve: string;
    readonly reflectionStrengthMultiplier: number;
    readonly shadowStrengthMultiplier: number;
    readonly polygonReflectionContribution: number;
    readonly polygonShadowContribution: number;
    readonly sceneReflectionIntensity: number;
    readonly waterShadowIntensity: number;
    readonly rendererPasses: readonly string[];
  }

  export interface GpuRayTracedShadowPostProcessPlan {
    readonly pass: "ray-traced-shadow-postprocess";
    readonly quality: string;
    readonly primaryShadowSource: string;
    readonly directShadows: GpuLightingRtParticipation;
    readonly sampleMode: "per-pixel" | "screen-space" | "polygon";
    readonly shadowMask: string;
    readonly lightingIntegration: string;
    readonly shadowStrengthMultiplier: number;
    readonly polygonShadowContribution: number;
    readonly polygonLightingContribution: number;
    readonly softnessMultiplier: number;
    readonly contactHardening: number;
    readonly rendererPasses: readonly string[];
  }

  export function createLightingBandPlan(options?: {
    readonly profile?: string;
    readonly importance?: string;
  }): GpuLightingBandPlan;

  export function createWaterRayTraceLightingPlan(options?: {
    readonly reflections?: GpuLightingRtParticipation;
    readonly reflectionParticipation?: GpuLightingRtParticipation;
    readonly directShadows?: GpuLightingRtParticipation;
    readonly shadowParticipation?: GpuLightingRtParticipation;
    readonly quality?: string;
    readonly primaryShadowSource?: string;
  }): GpuWaterRayTraceLightingPlan;

  export function createRayTracedShadowPostProcessPlan(options?: {
    readonly directShadows?: GpuLightingRtParticipation;
    readonly shadowParticipation?: GpuLightingRtParticipation;
    readonly quality?: string;
    readonly primaryShadowSource?: string;
  }): GpuRayTracedShadowPostProcessPlan;
}
