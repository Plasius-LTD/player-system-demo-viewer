import {
  PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID,
  PLAYER_SYSTEM_DEMO_VIEWER_FEATURE_FLAG_ID,
  PLAYER_SYSTEM_RUNTIME_NFR_FEATURE_FLAG_ID,
  PLAYER_SYSTEM_RUNTIME_PORTABILITY_FEATURE_FLAG_ID,
  assessPlayerSystemDemoScenarioPortability,
  createPlayerSystemDemoManifest,
  createPlayerSystemDemoPortabilityContract,
  createPlayerSystemDemoValidationContract,
  defaultPlayerSystemDemoScenarioCatalog,
  defaultPlayerSystemDemoPortabilityContract,
  defaultPlayerSystemDemoValidationContract,
  defaultPrivacySafeDemoScenarios,
  packageDescriptor,
} from "../src/index.js";

describe("@plasius/player-system-demo-viewer", () => {
  it("exports the package descriptor", () => {
    expect(packageDescriptor.packageName).toBe("@plasius/player-system-demo-viewer");
    expect(packageDescriptor.featureFlagId).toBe(
      PLAYER_SYSTEM_DEMO_VIEWER_FEATURE_FLAG_ID
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
    expect(manifest.portabilityContract?.featureFlagId).toBe(
      PLAYER_SYSTEM_RUNTIME_PORTABILITY_FEATURE_FLAG_ID
    );
  });

  it("clones optional scenario persona and composition details into manifests", () => {
    const scenario = {
      scenarioId: "scaled-composition" as const,
      title: "Scaled Composition",
      validationGoals: ["composition-scale"] as const,
      previewStates: ["overlay coexistence"] as const,
      samplePersona: {
        personaId: "persona-scale-002",
        characterHandle: "ScaleTester",
        classification: "synthetic" as const,
      },
      composition: {
        runtimeModules: 3,
        worldPanels: 6,
        alertMarkers: 8,
        focusPanes: 3,
      },
    };

    const manifest = createPlayerSystemDemoManifest([scenario]);

    expect(manifest.scenarios[0]?.samplePersona).toEqual(scenario.samplePersona);
    expect(manifest.scenarios[0]?.composition).toEqual(scenario.composition);
    expect(manifest.scenarios[0]?.validationGoals).toEqual(
      scenario.validationGoals
    );
    expect(manifest.scenarios[0]?.previewStates).toEqual(
      scenario.previewStates
    );
    expect(manifest.scenarios[0]?.samplePersona).not.toBe(
      scenario.samplePersona
    );
    expect(manifest.scenarios[0]?.composition).not.toBe(scenario.composition);
    expect(manifest.scenarios[0]?.validationGoals).not.toBe(
      scenario.validationGoals
    );
    expect(manifest.scenarios[0]?.previewStates).not.toBe(
      scenario.previewStates
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

  it("keeps default bounded errors when only validation metadata changes", () => {
    const contract = createPlayerSystemDemoValidationContract({
      featureFlagId: "isekai.player-system.custom-validation.enabled",
    });

    expect(contract.featureFlagId).toBe(
      "isekai.player-system.custom-validation.enabled"
    );
    expect(contract.failureExpectation.boundedErrorCodes).toEqual([
      "PLAYER_SYSTEM_DEMO_TIMEOUT",
      "PLAYER_SYSTEM_DEMO_DEGRADED",
    ]);
  });

  it("exports a portability contract and privacy-safe default scenarios", () => {
    expect(defaultPlayerSystemDemoPortabilityContract.featureFlagId).toBe(
      PLAYER_SYSTEM_RUNTIME_PORTABILITY_FEATURE_FLAG_ID
    );
    expect(
      defaultPlayerSystemDemoPortabilityContract.sampleData.forbiddenSensitiveFields
    ).toContain("refreshToken");
    expect(defaultPrivacySafeDemoScenarios).toBe(
      defaultPlayerSystemDemoScenarioCatalog
    );
    expect(defaultPrivacySafeDemoScenarios).toHaveLength(7);
    expect(defaultPrivacySafeDemoScenarios.at(-1)?.scenarioId).toBe(
      "scaled-composition"
    );
  });

  it("exports the required demo-scenario coverage for story #419", () => {
    expect(defaultPlayerSystemDemoScenarioCatalog.map((scenario) => scenario.scenarioId))
      .toEqual([
        "awakening",
        "mission-guidance",
        "focused-panes",
        "combat-safe",
        "institution-routing",
        "points-ledgers",
        "scaled-composition",
      ]);

    for (const scenario of defaultPlayerSystemDemoScenarioCatalog) {
      expect(scenario.validationGoals?.length).toBeGreaterThan(0);
      expect(scenario.previewStates?.length).toBeGreaterThan(0);
      expect(scenario.samplePersona?.classification).toBe("synthetic");
    }

    const institutionScenario = defaultPlayerSystemDemoScenarioCatalog.find(
      (scenario) => scenario.scenarioId === "institution-routing"
    );
    const combatSafeScenario = defaultPlayerSystemDemoScenarioCatalog.find(
      (scenario) => scenario.scenarioId === "combat-safe"
    );
    const pointsLedgerScenario = defaultPlayerSystemDemoScenarioCatalog.find(
      (scenario) => scenario.scenarioId === "points-ledgers"
    );

    expect(institutionScenario?.previewStates).toEqual([
      "school recommendation",
      "barracks unlock",
      "academy prerequisite gate",
      "apprenticeship handoff",
    ]);
    expect(combatSafeScenario?.entryMode).toBe("combat-safe");
    expect(pointsLedgerScenario?.previewStates).toContain("spend preflight");
  });

  it("creates overridable demo portability contracts", () => {
    const contract = createPlayerSystemDemoPortabilityContract({
      compositionScale: {
        maxWorldPanels: 4,
      },
      sampleData: {
        forbiddenSensitiveFields: ["email", "accessToken"],
      },
    });

    expect(contract.featureFlagId).toBe(
      PLAYER_SYSTEM_RUNTIME_PORTABILITY_FEATURE_FLAG_ID
    );
    expect(contract.compositionScale.maxWorldPanels).toBe(4);
    expect(contract.sampleData.forbiddenSensitiveFields).toEqual([
      "email",
      "accessToken",
    ]);
  });

  it("keeps default forbidden fields when only portability scale changes", () => {
    const contract = createPlayerSystemDemoPortabilityContract({
      compositionScale: {
        maxFocusPanes: 2,
      },
    });

    expect(contract.compositionScale.maxFocusPanes).toBe(2);
    expect(contract.sampleData.forbiddenSensitiveFields).toEqual(
      defaultPlayerSystemDemoPortabilityContract.sampleData
        .forbiddenSensitiveFields
    );
  });

  it("assesses synthetic sample scenarios against the documented scale assumptions", () => {
    const accepted = assessPlayerSystemDemoScenarioPortability(
      defaultPlayerSystemDemoScenarioCatalog.at(-1)!
    );
    const rejected = assessPlayerSystemDemoScenarioPortability({
      scenarioId: "scaled-composition",
      title: "Too Many Panels",
      samplePersona: {
        personaId: "persona-over-budget-001",
        characterHandle: "OverBudget",
        classification: "synthetic",
      },
      composition: {
        runtimeModules: 4,
        worldPanels: 7,
        alertMarkers: 9,
        focusPanes: 4,
      },
    });

    expect(accepted.accepted).toBe(true);
    expect(rejected.accepted).toBe(false);
    expect(rejected.violations).toEqual([
      "composition.runtimeModules",
      "composition.worldPanels",
      "composition.alertMarkers",
      "composition.focusPanes",
    ]);
  });

  it("rejects sensitive fields in samplePersona when portability contract forbids them", () => {
    const rejected = assessPlayerSystemDemoScenarioPortability({
      scenarioId: "awakening",
      title: "Sensitive Sample Persona",
      samplePersona: {
        personaId: "persona-unsafe-001",
        characterHandle: "Leaky",
        classification: "synthetic",
        email: "sensitive@example.com",
      } as any,
    });

    expect(rejected.accepted).toBe(false);
    expect(rejected.violations).toEqual(["samplePersona.email"]);
  });

  it("rejects non-synthetic sample persona classifications", () => {
    const rejected = assessPlayerSystemDemoScenarioPortability({
      scenarioId: "awakening",
      title: "Non Synthetic Sample Persona",
      samplePersona: {
        personaId: "persona-unsafe-002",
        characterHandle: "ImportedAccount",
        classification: "customer",
      } as any,
    });

    expect(rejected.accepted).toBe(false);
    expect(rejected.violations).toEqual(["samplePersona.classification"]);
  });

  it("rejects scenarios without sample persona metadata", () => {
    const rejected = assessPlayerSystemDemoScenarioPortability({
      scenarioId: "awakening",
      title: "Missing Sample Persona",
    });

    expect(rejected.accepted).toBe(false);
    expect(rejected.violations).toEqual(["samplePersona.classification"]);
  });
});
