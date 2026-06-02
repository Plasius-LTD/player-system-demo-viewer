import {
  PLAYER_SYSTEM_DEMO_VIEWER_FEATURE_FLAG_ID,
  createSystemDemoAppState,
  createPlayerSystemDemoManifest,
  findSystemDemoModule,
  getSystemDemoModules,
  packageDescriptor,
  resolveSystemDemoSelection,
} from "../src/index.js";
import {
  parseDemoTimeline,
  resolveTimelineStep,
} from "../src/webapp/timeline.js";
import { resolvePlayerLook } from "../src/webapp/look.js";
import {
  createSystemSceneRayTracingPlan,
  isPerPixelSystemRayTracingEnabled,
} from "../src/webapp/rayTracing.js";

describe("@plasius/player-system-demo-viewer", () => {
  it("exports the package descriptor", () => {
    expect(packageDescriptor.packageName).toBe("@plasius/player-system-demo-viewer");
    expect(packageDescriptor.featureFlagId).toBe(PLAYER_SYSTEM_DEMO_VIEWER_FEATURE_FLAG_ID);
  });

  it("creates a demo manifest", () => {
    const manifest = createPlayerSystemDemoManifest([
      { scenarioId: "awakening", title: "Awakening" },
    ]);

    expect(manifest.scenarios).toHaveLength(1);
  });

  it("exports the single-page System demo modules", () => {
    const modules = getSystemDemoModules();

    expect(modules.map((moduleDefinition) => moduleDefinition.moduleId)).toEqual([
      "missions-quests",
      "mcc-core",
      "spell-creation",
    ]);
    expect(modules.every((moduleDefinition) => moduleDefinition.selections.length > 0)).toBe(true);
  });

  it("resolves the active module and selection for the web app", () => {
    const state = createSystemDemoAppState({
      activeModuleId: "spell-creation",
      activeSelectionId: "spell-veil-step",
    });
    const moduleDefinition = findSystemDemoModule(state.activeModuleId);
    const selection = resolveSystemDemoSelection(
      state.activeModuleId,
      state.activeSelectionId
    );

    expect(moduleDefinition.visualKind).toBe("spell-forge");
    expect(selection.label).toBe("Veil Step");
  });

  it("falls back to the first selection when a stale selection is requested", () => {
    const state = createSystemDemoAppState({
      activeModuleId: "mcc-core",
      activeSelectionId: "missing-selection",
    });

    expect(state.activeSelectionId).toBe("mcc-intent-router");
  });

  it("parses demo timeline parameters for offline video rendering", () => {
    const timeline = parseDemoTimeline(
      new URLSearchParams({
        sequence: "mcc-core:mcc-safety-governor,spell-creation:spell-veil-step",
        stepMs: "1500",
        loop: "0",
      })
    );

    expect(timeline.stepMs).toBe(1500);
    expect(timeline.loop).toBe(false);
    expect(resolveTimelineStep(timeline, 0)).toEqual({
      moduleId: "mcc-core",
      selectionId: "mcc-safety-governor",
    });
    expect(resolveTimelineStep(timeline, 2000)).toEqual({
      moduleId: "spell-creation",
      selectionId: "spell-veil-step",
    });
    expect(resolveTimelineStep(timeline, 10_000)).toEqual({
      moduleId: "spell-creation",
      selectionId: "spell-veil-step",
    });
  });

  it("keeps System screens centered only during downward looks", () => {
    const neutralLook = resolvePlayerLook(0);
    const downwardLook = resolvePlayerLook(11_000);

    expect(neutralLook.pitch).toBeGreaterThan(0);
    expect(neutralLook.screenFocus).toBeLessThan(0.3);
    expect(downwardLook.pitch).toBeLessThan(0);
    expect(downwardLook.screenFocus).toBeGreaterThan(0.8);
  });

  it("uses the shared RT render and lighting plans for ultra captures", () => {
    const plan = createSystemSceneRayTracingPlan("ultra");

    expect(plan.renderer.renderStages.map((stage) => stage.key)).toContain("rtReflections");
    expect(plan.renderer.renderStages.map((stage) => stage.key)).toContain("rtDirectLighting");
    expect(plan.shadowPostProcess.shadowMask).toBe("per-pixel-screen-space-ray-mask");
    expect(plan.groundReflection.reflectionResolve).toBe("per-pixel-water-raytrace-resolve");
    expect(plan.rendererPasses).toEqual(
      expect.arrayContaining([
        "scene.shadow-mask.per-pixel-resolve",
        "water.reflection.per-pixel-resolve",
      ])
    );
    expect(isPerPixelSystemRayTracingEnabled(plan)).toBe(true);
  });
});
