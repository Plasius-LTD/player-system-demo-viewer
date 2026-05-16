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

export interface PlayerSystemDemoValidationContract {
  readonly featureFlagId: string;
  readonly performanceBudget: DemoPerformanceBudget;
  readonly failureExpectation: DemoFailureExpectation;
}

export type PlayerSystemDemoScenarioId =
  | "awakening"
  | "combat-safe"
  | "institution-routing"
  | "points-ledgers";

export interface PlayerSystemDemoScenario {
  readonly scenarioId: PlayerSystemDemoScenarioId;
  readonly title: string;
  readonly description?: string;
}

export interface PlayerSystemDemoManifest {
  readonly scenarios: readonly PlayerSystemDemoScenario[];
  readonly validationContract?: PlayerSystemDemoValidationContract;
}

export const PLAYER_SYSTEM_DEMO_VIEWER_PACKAGE = "@plasius/player-system-demo-viewer";
export const PLAYER_SYSTEM_DEMO_VIEWER_ENV_PREFIX = "PLAYER_SYSTEM_DEMO_VIEWER";
export const PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID =
  "isekai.player-system.packages.enabled";
export const PLAYER_SYSTEM_DEMO_VIEWER_FEATURE_FLAG_ID =
  PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID;
export const PLAYER_SYSTEM_RUNTIME_NFR_FEATURE_FLAG_ID =
  "isekai.player-system.runtime-nfr.enabled";

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

export function createPlayerSystemDemoManifest(
  scenarios: readonly PlayerSystemDemoScenario[],
  validationContract: PlayerSystemDemoValidationContract = defaultPlayerSystemDemoValidationContract
): PlayerSystemDemoManifest {
  return Object.freeze({
    scenarios,
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
