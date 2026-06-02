import {
  getSystemDemoModules,
  resolveSystemDemoSelection,
  type SystemDemoModuleId,
} from "../index.js";

export interface DemoTimelineStep {
  readonly moduleId: SystemDemoModuleId;
  readonly selectionId?: string;
}

export interface DemoTimelineConfig {
  readonly steps: readonly DemoTimelineStep[];
  readonly stepMs: number;
  readonly loop: boolean;
}

export const DEFAULT_DEMO_SEQUENCE = [
  "missions-quests:quest-starfall-archive",
  "missions-quests:quest-ember-courier",
  "mcc-core:mcc-intent-router",
  "mcc-core:mcc-safety-governor",
  "spell-creation:spell-arc-lance",
  "spell-creation:spell-veil-step",
] as const;

const moduleIds = new Set<SystemDemoModuleId>(
  getSystemDemoModules().map((moduleDefinition) => moduleDefinition.moduleId)
);

function toPositiveInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseStep(rawStep: string): DemoTimelineStep | null {
  const [rawModuleId, rawSelectionId] = rawStep.split(":");
  const moduleId = rawModuleId?.trim() as SystemDemoModuleId | undefined;

  if (!moduleId || !moduleIds.has(moduleId)) {
    return null;
  }

  const selection = resolveSystemDemoSelection(moduleId, rawSelectionId?.trim());

  return {
    moduleId,
    selectionId: selection.selectionId,
  };
}

export function parseDemoTimeline(searchParams: URLSearchParams): DemoTimelineConfig {
  const rawSequence = searchParams.get("sequence") ?? searchParams.get("path");
  const sequence = rawSequence
    ? rawSequence.split(",").map((step) => step.trim()).filter(Boolean)
    : [...DEFAULT_DEMO_SEQUENCE];
  const steps = sequence.map(parseStep).filter((step): step is DemoTimelineStep => step !== null);

  return {
    steps: steps.length > 0 ? steps : DEFAULT_DEMO_SEQUENCE.map((step) => parseStep(step)).filter((step): step is DemoTimelineStep => step !== null),
    stepMs: toPositiveInteger(searchParams.get("stepMs"), 2_200),
    loop: searchParams.get("loop") !== "0",
  };
}

export function resolveTimelineStep(
  timeline: DemoTimelineConfig,
  elapsedMs: number
): DemoTimelineStep {
  const stepIndex = Math.max(0, Math.floor(elapsedMs / timeline.stepMs));
  const boundedIndex = timeline.loop
    ? stepIndex % timeline.steps.length
    : Math.min(stepIndex, timeline.steps.length - 1);
  const step = timeline.steps[boundedIndex];

  if (!step) {
    throw new Error("Demo timeline requires at least one step.");
  }

  return step;
}
