import {
  PLAYER_SYSTEM_DEMO_VIEWER_FEATURE_FLAG_ID,
  createPlayerSystemDemoManifest,
  packageDescriptor,
} from "../src/index.js";

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
});
