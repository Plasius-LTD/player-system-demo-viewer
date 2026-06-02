export type SystemDemoModuleId = "missions-quests" | "mcc-core" | "spell-creation";

export type SystemDemoVisualKind = "mission-board" | "mcc-core" | "spell-forge";

export type SystemDemoAccent = "gold" | "teal" | "rose" | "blue";

export interface SystemDemoMetric {
  readonly label: string;
  readonly value: string;
  readonly tone?: SystemDemoAccent;
}

export interface SystemDemoContextEntry {
  readonly label: string;
  readonly value: string;
}

export interface SystemDemoSelection {
  readonly selectionId: string;
  readonly label: string;
  readonly kind: string;
  readonly status: string;
  readonly summary: string;
  readonly progressLabel: string;
  readonly progress: number;
  readonly metrics: readonly SystemDemoMetric[];
  readonly context: readonly SystemDemoContextEntry[];
  readonly actions: readonly string[];
}

export interface SystemDemoModuleDefinition {
  readonly moduleId: SystemDemoModuleId;
  readonly label: string;
  readonly shortLabel: string;
  readonly navHint: string;
  readonly screenTitle: string;
  readonly screenSubtitle: string;
  readonly visualKind: SystemDemoVisualKind;
  readonly accent: SystemDemoAccent;
  readonly status: string;
  readonly selections: readonly SystemDemoSelection[];
}

export interface SystemDemoAppState {
  readonly activeModuleId: SystemDemoModuleId;
  readonly activeSelectionId: string;
}

export const systemDemoModules: readonly SystemDemoModuleDefinition[] = Object.freeze([
  {
    moduleId: "missions-quests",
    label: "Missions / Quests",
    shortLabel: "Missions",
    navHint: "Tracked objectives",
    screenTitle: "Missions / Quests",
    screenSubtitle: "Active storylines, guild requests, and reward routing.",
    visualKind: "mission-board",
    accent: "gold",
    status: "4 active",
    selections: [
      {
        selectionId: "quest-starfall-archive",
        label: "Recover the Starfall Archive",
        kind: "Main Quest",
        status: "Tracked",
        summary:
          "Locate the sealed archive below the Aster Gate before the moon-phase lock resets.",
        progressLabel: "Objectives complete",
        progress: 0.64,
        metrics: [
          { label: "Region", value: "Aster Gate", tone: "blue" },
          { label: "Risk", value: "High", tone: "rose" },
          { label: "Reward", value: "1,200 XP + Prism Sigil", tone: "gold" },
        ],
        context: [
          { label: "Next objective", value: "Open the lower observatory lift" },
          { label: "Dependency", value: "Requires moon-key fragment" },
          { label: "Party note", value: "Companion dialogue unlocked" },
          { label: "Telemetry", value: "23% of players detour to guild route" },
        ],
        actions: ["Track", "Pin route", "Open map"],
      },
      {
        selectionId: "quest-ember-courier",
        label: "Ember Courier Contract",
        kind: "Guild Quest",
        status: "Ready",
        summary:
          "Escort a sealed ember relay across contested bridges without breaking the heat seal.",
        progressLabel: "Route stability",
        progress: 0.82,
        metrics: [
          { label: "Region", value: "Vey Crossing", tone: "teal" },
          { label: "Timer", value: "18 min", tone: "gold" },
          { label: "Bonus", value: "No seal damage", tone: "blue" },
        ],
        context: [
          { label: "Next objective", value: "Meet courier captain at bridge six" },
          { label: "Dependency", value: "Bridge patrol reputation neutral" },
          { label: "Risk source", value: "Ambush probability rising" },
          { label: "Telemetry", value: "Heat-seal failures cluster at final bridge" },
        ],
        actions: ["Accept", "Preview route", "Compare reward"],
      },
      {
        selectionId: "quest-lost-cartographer",
        label: "The Lost Cartographer",
        kind: "Side Quest",
        status: "Investigating",
        summary:
          "Resolve map fragments that disagree with the current dungeon topology.",
        progressLabel: "Clue confidence",
        progress: 0.46,
        metrics: [
          { label: "Region", value: "Hollow Fen", tone: "teal" },
          { label: "Clues", value: "3 / 7", tone: "blue" },
          { label: "Reward", value: "Map overlay", tone: "gold" },
        ],
        context: [
          { label: "Next objective", value: "Scan the sunken survey marker" },
          { label: "Dependency", value: "Water-breathing charm recommended" },
          { label: "World state", value: "Fen visibility degraded" },
          { label: "Telemetry", value: "Exploration affinity increased" },
        ],
        actions: ["Track", "Ask guide", "Mark clue"],
      },
    ],
  },
  {
    moduleId: "mcc-core",
    label: "MCC Core",
    shortLabel: "MCC",
    navHint: "Command cognition",
    screenTitle: "MCC Core",
    screenSubtitle: "Model command center, routing health, and live player intent.",
    visualKind: "mcc-core",
    accent: "teal",
    status: "Nominal",
    selections: [
      {
        selectionId: "mcc-intent-router",
        label: "Intent Router",
        kind: "Core Module",
        status: "Routing",
        summary:
          "Blends explicit requests with observed play patterns before selecting System surfaces.",
        progressLabel: "Route confidence",
        progress: 0.91,
        metrics: [
          { label: "Latency", value: "18 ms", tone: "teal" },
          { label: "Confidence", value: "91%", tone: "gold" },
          { label: "Fallback", value: "Ready", tone: "blue" },
        ],
        context: [
          { label: "Current route", value: "missions-quests -> center screen" },
          { label: "Input blend", value: "Explicit goal + exploration bias" },
          { label: "Guardrail", value: "Combat-safe overlay limit armed" },
          { label: "Telemetry", value: "No stale context detected" },
        ],
        actions: ["Inspect trace", "Pin route", "Simulate fallback"],
      },
      {
        selectionId: "mcc-memory-lattice",
        label: "Memory Lattice",
        kind: "State Layer",
        status: "Synced",
        summary:
          "Keeps quest context, companion recall, and world-state references coherent.",
        progressLabel: "Sync coverage",
        progress: 0.76,
        metrics: [
          { label: "Nodes", value: "148", tone: "blue" },
          { label: "Drift", value: "Low", tone: "teal" },
          { label: "Expired", value: "6", tone: "rose" },
        ],
        context: [
          { label: "Hot memory", value: "Aster Gate moon-key fragment" },
          { label: "Dependency", value: "Quest graph resolver" },
          { label: "Risk", value: "Expired rumors need pruning" },
          { label: "Telemetry", value: "Recall freshness inside target budget" },
        ],
        actions: ["Open graph", "Prune stale", "Lock memory"],
      },
      {
        selectionId: "mcc-safety-governor",
        label: "Safety Governor",
        kind: "Control Plane",
        status: "Armed",
        summary:
          "Constrains screen takeover, spell suggestions, and combat-time notification pressure.",
        progressLabel: "Policy match",
        progress: 0.88,
        metrics: [
          { label: "Mode", value: "Combat safe", tone: "rose" },
          { label: "Blocks", value: "2", tone: "gold" },
          { label: "Override", value: "None", tone: "teal" },
        ],
        context: [
          { label: "Current rule", value: "One panel maximum while threat is active" },
          { label: "Dependency", value: "Encounter state stream" },
          { label: "Risk", value: "Spellcraft compile suppressed in combat" },
          { label: "Telemetry", value: "Interrupt budget remains stable" },
        ],
        actions: ["View policy", "Test combat", "Mute low priority"],
      },
    ],
  },
  {
    moduleId: "spell-creation",
    label: "Spell Creation",
    shortLabel: "Spellcraft",
    navHint: "Rune compiler",
    screenTitle: "Spell Creation",
    screenSubtitle: "Compose runes, tune stability, and preview crafted spell output.",
    visualKind: "spell-forge",
    accent: "rose",
    status: "Draft",
    selections: [
      {
        selectionId: "spell-arc-lance",
        label: "Arc Lance",
        kind: "Spell Draft",
        status: "Stable",
        summary:
          "A precise lightning spell tuned for shield piercing and short cooldown recovery.",
        progressLabel: "Stability",
        progress: 0.84,
        metrics: [
          { label: "Element", value: "Storm", tone: "blue" },
          { label: "Cost", value: "32 mana", tone: "teal" },
          { label: "Output", value: "Pierce II", tone: "gold" },
        ],
        context: [
          { label: "Primary rune", value: "Conductive spine" },
          { label: "Catalyst", value: "Prism salt" },
          { label: "Risk", value: "Backlash if stability drops below 70%" },
          { label: "Telemetry", value: "Build matches ranged-combat preference" },
        ],
        actions: ["Compile", "Save draft", "Test cast"],
      },
      {
        selectionId: "spell-veil-step",
        label: "Veil Step",
        kind: "Spell Draft",
        status: "Volatile",
        summary:
          "Short blink movement wrapped in shadow masking for stealth repositioning.",
        progressLabel: "Stability",
        progress: 0.58,
        metrics: [
          { label: "Element", value: "Shadow", tone: "rose" },
          { label: "Cost", value: "44 mana", tone: "gold" },
          { label: "Output", value: "Blink I", tone: "blue" },
        ],
        context: [
          { label: "Primary rune", value: "Folded threshold" },
          { label: "Catalyst", value: "Black glass thread" },
          { label: "Risk", value: "Arrival noise currently too high" },
          { label: "Telemetry", value: "Recommended for stealth-biased players" },
        ],
        actions: ["Stabilize", "Swap catalyst", "Test cast"],
      },
      {
        selectionId: "spell-hearth-ward",
        label: "Hearth Ward",
        kind: "Spell Draft",
        status: "Ready",
        summary:
          "Area ward that converts incoming fire pressure into temporary party shielding.",
        progressLabel: "Stability",
        progress: 0.93,
        metrics: [
          { label: "Element", value: "Ember", tone: "gold" },
          { label: "Cost", value: "51 mana", tone: "rose" },
          { label: "Output", value: "Ward III", tone: "teal" },
        ],
        context: [
          { label: "Primary rune", value: "Sheltering ember" },
          { label: "Catalyst", value: "Ash-bound silver" },
          { label: "Risk", value: "Long cast window" },
          { label: "Telemetry", value: "Support affinity trending upward" },
        ],
        actions: ["Compile", "Bind slot", "Share build"],
      },
    ],
  },
]);

export function getSystemDemoModules(): readonly SystemDemoModuleDefinition[] {
  return systemDemoModules;
}

export function findSystemDemoModule(
  moduleId: SystemDemoModuleId
): SystemDemoModuleDefinition {
  const moduleDefinition = systemDemoModules.find((moduleItem) => moduleItem.moduleId === moduleId);

  if (!moduleDefinition) {
    throw new Error(`Unknown System demo module: ${moduleId}`);
  }

  return moduleDefinition;
}

export function resolveSystemDemoSelection(
  moduleId: SystemDemoModuleId,
  selectionId?: string
): SystemDemoSelection {
  const moduleDefinition = findSystemDemoModule(moduleId);
  const selection =
    moduleDefinition.selections.find((item) => item.selectionId === selectionId) ??
    moduleDefinition.selections[0];

  if (!selection) {
    throw new Error(`System demo module has no selections: ${moduleId}`);
  }

  return selection;
}

export function createSystemDemoAppState(
  input: Partial<SystemDemoAppState> = {}
): SystemDemoAppState {
  const activeModuleId = input.activeModuleId ?? systemDemoModules[0]?.moduleId;

  if (!activeModuleId) {
    throw new Error("System demo app requires at least one module.");
  }

  const activeSelection = resolveSystemDemoSelection(
    activeModuleId,
    input.activeSelectionId
  );

  return Object.freeze({
    activeModuleId,
    activeSelectionId: activeSelection.selectionId,
  });
}
