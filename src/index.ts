export interface PackageDescriptor {
  readonly packageName: string;
  readonly featureFlagId: string;
  readonly envPrefix: string;
  readonly summary: string;
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
}

export const PLAYER_SYSTEM_DEMO_VIEWER_PACKAGE = "@plasius/player-system-demo-viewer";
export const PLAYER_SYSTEM_DEMO_VIEWER_ENV_PREFIX = "PLAYER_SYSTEM_DEMO_VIEWER";
export const PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID =
  "isekai.player-system.packages.enabled";
export const PLAYER_SYSTEM_DEMO_VIEWER_FEATURE_FLAG_ID =
  PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID;

export const packageDescriptor: PackageDescriptor = Object.freeze({
  packageName: PLAYER_SYSTEM_DEMO_VIEWER_PACKAGE,
  featureFlagId: PLAYER_SYSTEM_PACKAGES_FEATURE_FLAG_ID,
  envPrefix: PLAYER_SYSTEM_DEMO_VIEWER_ENV_PREFIX,
  summary: "Static validation launcher and scenario manifest surface for Player System demos.",
});

export function createPlayerSystemDemoManifest(
  scenarios: readonly PlayerSystemDemoScenario[]
): PlayerSystemDemoManifest {
  return Object.freeze({ scenarios });
}
