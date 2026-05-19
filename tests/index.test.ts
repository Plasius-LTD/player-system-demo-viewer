import {
  PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID,
  PLAYER_SYSTEM_DEMO_VIEWER_FEATURE_FLAG_ID,
  PLAYER_SYSTEM_RUNTIME_NFR_FEATURE_FLAG_ID,
  createPlayerSystemDemoManifest,
  createPlayerSystemDemoValidationContract,
  defaultPlayerSystemDemoValidationContract,
  packageDescriptor,
} from "../src/index.js";

describe("@plasius/player-system-demo-viewer", () => {
  it("exports the package descriptor", () => {
    expect(packageDescriptor.packageName).toBe("@plasius/player-system-demo-viewer");
    expect(packageDescriptor.featureFlagId).toBe(
      PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID
    );
    expect(PLAYER_SYSTEM_DEMO_VIEWER_FEATURE_FLAG_ID).toBe(
      PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID
    );
  });

  it("creates a demo manifest", () => {
    const manifest = createPlayerSystemDemoManifest([
      { scenarioId: "awakening", title: "Awakening" },
    ]);

    expect(manifest.scenarios).toHaveLength(1);
    expect(manifest.validationContract?.featureFlagId).toBe(
      PLAYER_SYSTEM_RUNTIME_NFR_FEATURE_FLAG_ID
    );
  });

  it("exports default demo validation budgets and degraded-path expectations", () => {
    expect(defaultPlayerSystemDemoValidationContract.performanceBudget.launchMs).toBe(
      1_500
    );
    expect(
      defaultPlayerSystemDemoValidationContract.failureExpectation.degradedMode
    ).toBe("freeze-last-good-frame");
  });

  it("creates overridable demo validation contracts", () => {
    const contract = createPlayerSystemDemoValidationContract({
      performanceBudget: {
        transitionMs: 350,
      },
      failureExpectation: {
        degradedMode: "fallback-overlay",
        boundedErrorCodes: ["PLAYER_SYSTEM_DEMO_TIMEOUT"],
      },
    });

    expect(contract.featureFlagId).toBe(PLAYER_SYSTEM_RUNTIME_NFR_FEATURE_FLAG_ID);
    expect(contract.performanceBudget.transitionMs).toBe(350);
    expect(contract.performanceBudget.steadyStateFrameMs).toBe(16);
    expect(contract.failureExpectation.degradedMode).toBe("fallback-overlay");
    expect(contract.failureExpectation.boundedErrorCodes).toEqual([
      "PLAYER_SYSTEM_DEMO_TIMEOUT",
    ]);
  });
});
