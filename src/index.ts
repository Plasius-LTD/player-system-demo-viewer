export interface PackageDescriptor {
  readonly packageName: string;
  readonly featureFlagId: string;
  readonly envPrefix: string;
  readonly summary: string;
}

export interface DemoPerformanceBudget {
  readonly launchMs: number;
  readonly transitionMs: number;
  readonly steadyStateFrameMs: number;
  readonly warmFrames: number;
}

export interface DemoFailureExpectation {
  readonly degradedMode:
    | "freeze-last-good-frame"
    | "fallback-overlay"
    | "skip-scenario";
  readonly boundedErrorCodes: readonly string[];
}

export interface DemoSampleDataPolicy {
  readonly sampleClassification: "synthetic-only";
  readonly forbiddenSensitiveFields: readonly string[];
}

export interface DemoCompositionScaleContract {
  readonly maxRuntimeModules: number;
  readonly maxWorldPanels: number;
  readonly maxAlertMarkers: number;
  readonly maxFocusPanes: number;
}

export interface PlayerSystemDemoValidationContract {
  readonly featureFlagId: string;
  readonly performanceBudget: DemoPerformanceBudget;
  readonly failureExpectation: DemoFailureExpectation;
}

export interface PlayerSystemDemoPortabilityContract {
  readonly featureFlagId: string;
  readonly sampleData: DemoSampleDataPolicy;
  readonly compositionScale: DemoCompositionScaleContract;
}

export type PlayerSystemDemoScenarioId =
  | "awakening"
  | "combat-safe"
  | "institution-routing"
  | "points-ledgers"
  | "scaled-composition";

export interface PlayerSystemDemoSamplePersona {
  readonly personaId: string;
  readonly characterHandle: string;
  readonly classification: "synthetic";
}

export interface PlayerSystemDemoScenarioComposition {
  readonly runtimeModules: number;
  readonly worldPanels: number;
  readonly alertMarkers: number;
  readonly focusPanes: number;
}

export interface PlayerSystemDemoScenario {
  readonly scenarioId: PlayerSystemDemoScenarioId;
  readonly title: string;
  readonly description?: string;
  readonly samplePersona?: PlayerSystemDemoSamplePersona;
  readonly composition?: PlayerSystemDemoScenarioComposition;
}

export interface PlayerSystemDemoManifest {
  readonly scenarios: readonly PlayerSystemDemoScenario[];
  readonly validationContract?: PlayerSystemDemoValidationContract;
  readonly portabilityContract?: PlayerSystemDemoPortabilityContract;
}

export interface PlayerSystemDemoPortabilityContractInput {
  readonly featureFlagId?: string;
  readonly sampleData?: Partial<DemoSampleDataPolicy>;
  readonly compositionScale?: Partial<DemoCompositionScaleContract>;
}

export interface DemoPortabilityAssessment {
  readonly accepted: boolean;
  readonly violations: readonly string[];
}

export const PLAYER_SYSTEM_DEMO_VIEWER_PACKAGE = "@plasius/player-system-demo-viewer";
export const PLAYER_SYSTEM_DEMO_VIEWER_ENV_PREFIX = "PLAYER_SYSTEM_DEMO_VIEWER";
export const PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID =
  "isekai.player-system.packages.enabled";
export const PLAYER_SYSTEM_DEMO_VIEWER_FEATURE_FLAG_ID =
  PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID;
export const PLAYER_SYSTEM_RUNTIME_NFR_FEATURE_FLAG_ID =
  "isekai.player-system.runtime-nfr.enabled";
export const PLAYER_SYSTEM_RUNTIME_PORTABILITY_FEATURE_FLAG_ID =
  "isekai.player-system.runtime-portability.enabled";

export const packageDescriptor: PackageDescriptor = Object.freeze({
  packageName: PLAYER_SYSTEM_DEMO_VIEWER_PACKAGE,
  featureFlagId: PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID,
  envPrefix: PLAYER_SYSTEM_DEMO_VIEWER_ENV_PREFIX,
  summary: "Static validation launcher and scenario manifest surface for Player System demos.",
});

export const defaultPlayerSystemDemoValidationContract: PlayerSystemDemoValidationContract =
  Object.freeze({
    featureFlagId: PLAYER_SYSTEM_RUNTIME_NFR_FEATURE_FLAG_ID,
    performanceBudget: Object.freeze({
      launchMs: 1_500,
      transitionMs: 200,
      steadyStateFrameMs: 16,
      warmFrames: 5,
    }),
    failureExpectation: Object.freeze({
      degradedMode: "freeze-last-good-frame",
      boundedErrorCodes: Object.freeze([
        "PLAYER_SYSTEM_DEMO_TIMEOUT",
        "PLAYER_SYSTEM_DEMO_DEGRADED",
      ]),
    }),
  });

export const defaultPlayerSystemDemoPortabilityContract: PlayerSystemDemoPortabilityContract =
  Object.freeze({
    featureFlagId: PLAYER_SYSTEM_RUNTIME_PORTABILITY_FEATURE_FLAG_ID,
    sampleData: Object.freeze({
      sampleClassification: "synthetic-only",
      forbiddenSensitiveFields: Object.freeze([
        "email",
        "accountId",
        "oauthSubject",
        "accessToken",
        "refreshToken",
      ]),
    }),
    compositionScale: Object.freeze({
      maxRuntimeModules: 3,
      maxWorldPanels: 6,
      maxAlertMarkers: 8,
      maxFocusPanes: 3,
    }),
  });

export const defaultPrivacySafeDemoScenarios: readonly PlayerSystemDemoScenario[] =
  Object.freeze([
    Object.freeze({
      scenarioId: "awakening",
      title: "Awakening",
      description: "Synthetic single-player baseline for onboarding validation.",
      samplePersona: Object.freeze({
        personaId: "persona-awakening-001",
        characterHandle: "Dawnstrider",
        classification: "synthetic",
      }),
      composition: Object.freeze({
        runtimeModules: 2,
        worldPanels: 3,
        alertMarkers: 2,
        focusPanes: 1,
      }),
    }),
    Object.freeze({
      scenarioId: "scaled-composition",
      title: "Scaled Composition",
      description:
        "Synthetic max-budget composition exercising runtime module and overlay limits.",
      samplePersona: Object.freeze({
        personaId: "persona-scale-001",
        characterHandle: "LanternKeep",
        classification: "synthetic",
      }),
      composition: Object.freeze({
        runtimeModules: 3,
        worldPanels: 6,
        alertMarkers: 8,
        focusPanes: 3,
      }),
    }),
  ]);

export function createPlayerSystemDemoManifest(
  scenarios: readonly PlayerSystemDemoScenario[],
  validationContract: PlayerSystemDemoValidationContract = defaultPlayerSystemDemoValidationContract,
  portabilityContract: PlayerSystemDemoPortabilityContract = defaultPlayerSystemDemoPortabilityContract
): PlayerSystemDemoManifest {
  return Object.freeze({
    scenarios: Object.freeze(
      scenarios.map((scenario) =>
        Object.freeze({
          ...scenario,
          samplePersona: scenario.samplePersona
            ? Object.freeze({ ...scenario.samplePersona })
            : undefined,
          composition: scenario.composition
            ? Object.freeze({ ...scenario.composition })
            : undefined,
        })
      )
    ),
    validationContract: Object.freeze({
      featureFlagId: validationContract.featureFlagId,
      performanceBudget: Object.freeze({
        ...validationContract.performanceBudget,
      }),
      failureExpectation: Object.freeze({
        ...validationContract.failureExpectation,
        boundedErrorCodes: Object.freeze([
          ...validationContract.failureExpectation.boundedErrorCodes,
        ]),
      }),
    }),
    portabilityContract: Object.freeze({
      featureFlagId: portabilityContract.featureFlagId,
      sampleData: Object.freeze({
        ...portabilityContract.sampleData,
        forbiddenSensitiveFields: Object.freeze([
          ...portabilityContract.sampleData.forbiddenSensitiveFields,
        ]),
      }),
      compositionScale: Object.freeze({
        ...portabilityContract.compositionScale,
      }),
    }),
  });
}

export function createPlayerSystemDemoValidationContract(
  input: Partial<PlayerSystemDemoValidationContract> = {}
): PlayerSystemDemoValidationContract {
  return Object.freeze({
    featureFlagId:
      input.featureFlagId ?? defaultPlayerSystemDemoValidationContract.featureFlagId,
    performanceBudget: Object.freeze({
      ...defaultPlayerSystemDemoValidationContract.performanceBudget,
      ...input.performanceBudget,
    }),
    failureExpectation: Object.freeze({
      ...defaultPlayerSystemDemoValidationContract.failureExpectation,
      ...input.failureExpectation,
      boundedErrorCodes:
        input.failureExpectation?.boundedErrorCodes ??
        defaultPlayerSystemDemoValidationContract.failureExpectation.boundedErrorCodes,
    }),
  });
}

export function createPlayerSystemDemoPortabilityContract(
  input: PlayerSystemDemoPortabilityContractInput = {}
): PlayerSystemDemoPortabilityContract {
  return Object.freeze({
    featureFlagId:
      input.featureFlagId ??
      defaultPlayerSystemDemoPortabilityContract.featureFlagId,
    sampleData: Object.freeze({
      ...defaultPlayerSystemDemoPortabilityContract.sampleData,
      ...input.sampleData,
      forbiddenSensitiveFields: Object.freeze([
        ...(input.sampleData?.forbiddenSensitiveFields ??
          defaultPlayerSystemDemoPortabilityContract.sampleData
            .forbiddenSensitiveFields),
      ]),
    }),
    compositionScale: Object.freeze({
      ...defaultPlayerSystemDemoPortabilityContract.compositionScale,
      ...input.compositionScale,
    }),
  });
}

export function assessPlayerSystemDemoScenarioPortability(
  scenario: PlayerSystemDemoScenario,
  contract: PlayerSystemDemoPortabilityContract = defaultPlayerSystemDemoPortabilityContract
): DemoPortabilityAssessment {
  const violations: string[] = [];

  if (scenario.samplePersona?.classification !== "synthetic") {
    violations.push("samplePersona.classification");
  }

  if (scenario.samplePersona) {
    for (const sensitiveField of contract.sampleData.forbiddenSensitiveFields) {
      if (
        Object.prototype.hasOwnProperty.call(
          scenario.samplePersona,
          sensitiveField
        )
      ) {
        violations.push(`samplePersona.${sensitiveField}`);
      }
    }
  }

  if (
    scenario.composition &&
    scenario.composition.runtimeModules >
      contract.compositionScale.maxRuntimeModules
  ) {
    violations.push("composition.runtimeModules");
  }

  if (
    scenario.composition &&
    scenario.composition.worldPanels > contract.compositionScale.maxWorldPanels
  ) {
    violations.push("composition.worldPanels");
  }

  if (
    scenario.composition &&
    scenario.composition.alertMarkers >
      contract.compositionScale.maxAlertMarkers
  ) {
    violations.push("composition.alertMarkers");
  }

  if (
    scenario.composition &&
    scenario.composition.focusPanes > contract.compositionScale.maxFocusPanes
  ) {
    violations.push("composition.focusPanes");
  }

  return Object.freeze({
    accepted: violations.length === 0,
    violations: Object.freeze(violations),
  });
}
