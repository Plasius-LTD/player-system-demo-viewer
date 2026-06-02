import { createGpuInteractionRegistry } from "@plasius/gpu-interaction";
import {
  createSystemDemoAppState,
  findSystemDemoModule,
  getSystemDemoModules,
  packageDescriptor,
  resolveSystemDemoSelection,
  type SystemDemoModuleDefinition,
  type SystemDemoModuleId,
  type SystemDemoSelection,
} from "../index.js";
import { resolvePlayerLook } from "./look.js";
import { parseDemoTimeline, resolveTimelineStep } from "./timeline.js";
import type { SystemSceneController, SystemSceneDiagnostics } from "./scene.js";
import type {
  SystemPanelAction,
  SystemPanelRevealStage,
  SystemSceneSurfaceState,
} from "./surfaceRasterizer.js";
import "./styles.css";

const modules = getSystemDemoModules();
const urlParams = new URLSearchParams(window.location.search);
const captureMode = urlParams.get("capture") === "1";
const autoplayMode = urlParams.get("autoplay") === "1";
const frameExportMode = urlParams.get("frameExport") === "1" || urlParams.get("videoCapture") === "1";
const allowCanvasFallback = urlParams.get("allowFallback") === "1";
const qualityMode = urlParams.get("quality") === "ultra" || urlParams.get("qualityMode") === "ultra"
  ? "ultra"
  : "standard";
const rawPresentationMode = urlParams.get("presentation") ?? urlParams.get("presentationMode");
const presentationMode =
  rawPresentationMode === "ray" ||
  rawPresentationMode === "ray-traced" ||
  urlParams.get("rayResolve") === "1"
    ? "ray-traced"
    : rawPresentationMode === "geometry"
      ? "geometry"
      : captureMode || frameExportMode || qualityMode === "ultra"
        ? "ray-traced"
        : "geometry";
const renderScale = (() => {
  const parsed = Number(urlParams.get("renderScale"));
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  if (presentationMode === "ray-traced") {
    return 1;
  }
  return captureMode && qualityMode === "ultra" ? 3 : 1;
})();
const rayDebugParam = urlParams.get("rayDebug");
const rayDebugMode =
  rayDebugParam === "hits" || rayDebugParam === "solid" ? rayDebugParam : "off";
const raySamples = (() => {
  const parsed = Number(urlParams.get("raySamples"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
})();
const timeline = parseDemoTimeline(urlParams);
let state = createSystemDemoAppState();
let revealStage: SystemPanelRevealStage = "menu";
let sceneController: SystemSceneController | undefined;
let autoplayFrameId: number | undefined;
const autoplayStartedAt = performance.now();
let exportedElapsedMs = 0;

declare global {
  interface Window {
    playerSystemDemoCapture?: {
      ready: boolean;
      error?: string;
      readonly timeline: typeof timeline;
      readonly getState: () => typeof state;
      readonly getRevealStage: () => SystemPanelRevealStage;
      readonly getRendererMode: () => "webgpu" | "canvas" | "pending";
      readonly getPresentationMode: () => typeof presentationMode;
      readonly getSceneDiagnostics: () => SystemSceneDiagnostics;
      readonly getActions: () => readonly SystemPanelAction[];
      readonly seek: (elapsedMs: number) => void;
      readonly setActive: (moduleId: SystemDemoModuleId, selectionId?: string) => void;
      readonly runAction: (actionId: string) => boolean;
      readonly runScript: (script: string) => boolean;
      readonly runVoiceCommand: (phrase: string) => boolean;
    };
    __plasiusCaptureFrame?: (options?: {
      readonly seekMs?: number;
      readonly stepMs?: number;
    }) => Promise<{
      readonly elapsedMs: number;
      readonly activeModuleId: SystemDemoModuleId;
      readonly activeSelectionId: string;
    }>;
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);

  if (!node) {
    throw new Error(`Missing System demo element: ${id}`);
  }

  return node as T;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  return element;
}

function getSceneActions(): readonly SystemPanelAction[] {
  return sceneController?.getActions() ?? [];
}

const actionRuntime = createGpuInteractionRegistry<SystemPanelAction>({
  onInvoke(invocation) {
    const action = invocation.action;
    window.dispatchEvent(
      new CustomEvent("player-system-demo:action", {
        detail: {
          actionId: action.actionId,
          id: action.id,
          type: action.type,
          kind: action.kind,
          label: action.label,
          script: action.script,
          source: invocation.source,
          phrase: invocation.phrase,
          moduleId: action.moduleId,
          selectionId: action.selectionId,
          command: action.command,
          payload: action.payload,
        },
      })
    );
  },
  handlers: {
    module(invocation) {
      if (invocation.action.moduleId) {
        setState({
          activeModuleId: invocation.action.moduleId,
          revealStage: "screen",
        });
      }
    },
    selection(invocation) {
      if (invocation.action.moduleId && invocation.action.selectionId) {
        setState({
          activeModuleId: invocation.action.moduleId,
          activeSelectionId: invocation.action.selectionId,
          revealStage: "context",
        });
      }
    },
    command(invocation) {
      if (invocation.action.command && invocation.action.selectionId) {
        const selection = resolveSystemDemoSelection(
          state.activeModuleId,
          invocation.action.selectionId
        );
        const command = byId<HTMLElement>("command-status");
        command.textContent = `${invocation.action.command}: ${selection.label}`;
      }
    },
  },
});

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function getModuleIcon(moduleId: SystemDemoModuleId): string {
  if (moduleId === "mcc-core") {
    return "M";
  }

  if (moduleId === "spell-creation") {
    return "S";
  }

  return "Q";
}

function setState(nextState: {
  readonly activeModuleId?: SystemDemoModuleId;
  readonly activeSelectionId?: string;
  readonly revealStage?: SystemPanelRevealStage;
}): void {
  state = createSystemDemoAppState({
    activeModuleId: nextState.activeModuleId ?? state.activeModuleId,
    activeSelectionId:
      nextState.activeModuleId && nextState.activeModuleId !== state.activeModuleId
        ? undefined
        : nextState.activeSelectionId ?? state.activeSelectionId,
  });
  revealStage = nextState.revealStage ?? revealStage;
  render();
}

function setActive(moduleId: SystemDemoModuleId, selectionId?: string): void {
  state = createSystemDemoAppState({
    activeModuleId: moduleId,
    activeSelectionId: selectionId,
  });
  revealStage = selectionId ? "context" : "screen";
  render();
}

function resolveTimelineRevealStage(elapsedMs: number): SystemPanelRevealStage {
  const stepIndex = Math.max(0, Math.floor(elapsedMs / timeline.stepMs));
  const boundedIndex = timeline.loop
    ? stepIndex
    : Math.min(stepIndex, timeline.steps.length - 1);
  const stepElapsed = Math.max(0, elapsedMs - boundedIndex * timeline.stepMs);
  const phase = Math.min(1, stepElapsed / timeline.stepMs);
  if (phase < 0.24) {
    return "menu";
  }
  if (phase < 0.58) {
    return "screen";
  }
  return "context";
}

function seekDemo(elapsedMs: number): void {
  const step = resolveTimelineStep(timeline, elapsedMs);
  state = createSystemDemoAppState({
    activeModuleId: step.moduleId,
    activeSelectionId: step.selectionId,
  });
  revealStage = resolveTimelineRevealStage(elapsedMs);
  render();
  sceneController?.renderFrame(elapsedMs);
  applyPlayerLook(elapsedMs);
}

async function waitForPresentedFrame(): Promise<void> {
  await sceneController?.waitForFrame();
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

function applyPlayerLook(elapsedMs: number): void {
  const look = sceneController?.getLookState(elapsedMs) ?? resolvePlayerLook(elapsedMs);
  const panelShiftY = 132 - look.screenFocus * 86 + look.panelY * 1.6;
  const panelTiltX = 21 - look.screenFocus * 16 + look.pitch * -0.35;
  document.documentElement.style.setProperty("--look-x", look.panelX.toFixed(4));
  document.documentElement.style.setProperty("--look-y", look.panelY.toFixed(4));
  document.documentElement.style.setProperty("--look-roll", look.roll.toFixed(4));
  document.documentElement.style.setProperty("--screen-focus", look.screenFocus.toFixed(4));
  document.documentElement.style.setProperty("--camera-perspective-x", `${(look.panelX * 118).toFixed(2)}px`);
  document.documentElement.style.setProperty("--camera-perspective-y", `${(look.panelY * -74).toFixed(2)}px`);
  document.documentElement.style.setProperty("--panel-shift-x", `${(look.panelX * -3).toFixed(2)}px`);
  document.documentElement.style.setProperty("--panel-shift-y", `${panelShiftY.toFixed(2)}px`);
  document.documentElement.style.setProperty("--panel-tilt-x", `${panelTiltX.toFixed(2)}deg`);
  document.documentElement.style.setProperty("--panel-tilt-y", `${(look.panelX * -1.15).toFixed(2)}deg`);
  document.documentElement.style.setProperty("--panel-roll", `${(look.roll * -0.18).toFixed(2)}deg`);
  document.documentElement.style.setProperty("--panel-scale", (0.82 + look.screenFocus * 0.08).toFixed(4));
  document.documentElement.style.setProperty("--panel-side-yaw", `${(look.panelX * -0.48).toFixed(2)}deg`);
  document.documentElement.style.setProperty("--screen-local-yaw", `${(look.panelX * -0.18).toFixed(2)}deg`);
  document.documentElement.style.setProperty("--screen-local-pitch", `${(look.panelY * 0.18).toFixed(2)}deg`);
  document.documentElement.style.setProperty("--hud-shift-x", `${(look.panelX * -1.2).toFixed(2)}px`);
  document.documentElement.style.setProperty("--hud-shift-y", `${(look.panelY * 0.5).toFixed(2)}px`);
  document.documentElement.style.setProperty("--hud-roll", `${(look.roll * -0.14).toFixed(2)}deg`);
}

function createSceneSurfaceState(): SystemSceneSurfaceState {
  const moduleDefinition = findSystemDemoModule(state.activeModuleId);
  const selection = resolveSystemDemoSelection(state.activeModuleId, state.activeSelectionId);
  return {
    featureFlagId: packageDescriptor.featureFlagId,
    revealStage,
    activeModuleId: state.activeModuleId,
    activeSelectionId: state.activeSelectionId,
    screenTitle: moduleDefinition.screenTitle,
    screenSubtitle: moduleDefinition.screenSubtitle,
    visualKind: moduleDefinition.visualKind,
    accent: moduleDefinition.accent,
    status: moduleDefinition.status,
    modules: modules.map((moduleItem) => ({
      moduleId: moduleItem.moduleId,
      label: moduleItem.label,
      navHint: moduleItem.navHint,
      status: moduleItem.status,
      accent: moduleItem.accent,
    })),
    selections: moduleDefinition.selections,
    selection,
  };
}

function syncSceneSurfaceState(): void {
  sceneController?.setSurfaceState(createSceneSurfaceState());
  actionRuntime.setActions(getSceneActions());
}

function runSystemAction(action: SystemPanelAction): void {
  actionRuntime.invokeAction(action, { source: "pointer" });
}

function createProgress(value: number, label: string): HTMLElement {
  const wrapper = createElement("div", "progress-readout");
  const labelNode = createElement("span");
  const meter = createElement("span", "meter");
  const fill = createElement("span", "meter__fill");
  const valueNode = createElement("strong");

  labelNode.textContent = label;
  fill.style.width = formatPercent(value);
  valueNode.textContent = formatPercent(value);
  meter.append(fill);
  wrapper.append(labelNode, meter, valueNode);
  return wrapper;
}

function createMetricList(selection: SystemDemoSelection): HTMLElement {
  const list = createElement("dl", "metric-strip");

  for (const metric of selection.metrics) {
    const item = createElement("div");
    const dt = createElement("dt");
    const dd = createElement("dd");
    dt.textContent = metric.label;
    dd.textContent = metric.value;
    if (metric.tone) {
      dd.dataset.tone = metric.tone;
    }
    item.append(dt, dd);
    list.append(item);
  }

  return list;
}

function createSelectionButton(
  moduleDefinition: SystemDemoModuleDefinition,
  selection: SystemDemoSelection
): HTMLButtonElement {
  const button = createElement("button", "selection-row");
  button.type = "button";
  button.classList.toggle("is-active", selection.selectionId === state.activeSelectionId);
  button.dataset.selectionId = selection.selectionId;

  const heading = createElement("span", "selection-row__heading");
  const label = createElement("strong");
  const status = createElement("span");
  const summary = createElement("span", "selection-row__summary");

  label.textContent = selection.label;
  status.textContent = selection.status;
  summary.textContent = selection.summary;
  heading.append(label, status);
  button.append(heading, summary, createProgress(selection.progress, selection.progressLabel));
    button.addEventListener("click", () => {
      setState({
        activeModuleId: moduleDefinition.moduleId,
        activeSelectionId: selection.selectionId,
        revealStage: "context",
      });
    });

  return button;
}

function renderNav(root: HTMLElement): void {
  const nav = createElement("nav", "context-menu");
  nav.setAttribute("aria-label", "System modules");

  const brand = createElement("div", "context-menu__brand");
  const mark = createElement("span", "system-mark");
  const titleGroup = createElement("div");
  const title = createElement("strong");
  const flag = createElement("span");
  mark.textContent = "SYS";
  title.textContent = "System";
  flag.textContent = packageDescriptor.featureFlagId;
  titleGroup.append(title, flag);
  brand.append(mark, titleGroup);
  nav.append(brand);

  const moduleList = createElement("div", "module-list");
  for (const moduleDefinition of modules) {
    const button = createElement("button", "module-button");
    button.type = "button";
    button.classList.toggle("is-active", moduleDefinition.moduleId === state.activeModuleId);
    button.dataset.accent = moduleDefinition.accent;

    const icon = createElement("span", "module-button__icon");
    const copy = createElement("span", "module-button__copy");
    const label = createElement("strong");
    const hint = createElement("span");
    const status = createElement("span", "module-button__status");
    icon.textContent = getModuleIcon(moduleDefinition.moduleId);
    label.textContent = moduleDefinition.label;
    hint.textContent = moduleDefinition.navHint;
    status.textContent = moduleDefinition.status;
    copy.append(label, hint);
    button.append(icon, copy, status);
    button.addEventListener("click", () => {
      setState({
        activeModuleId: moduleDefinition.moduleId,
        revealStage: "screen",
      });
    });
    moduleList.append(button);
  }

  nav.append(moduleList);
  root.append(nav);
}

function renderScreenHeader(
  moduleDefinition: SystemDemoModuleDefinition,
  selection: SystemDemoSelection
): HTMLElement {
  const header = createElement("header", "screen-header");
  const titleGroup = createElement("div");
  const title = createElement("h1");
  const subtitle = createElement("p");
  const statusGroup = createElement("div", "screen-status");
  const status = createElement("span");
  const selected = createElement("strong");

  title.textContent = moduleDefinition.screenTitle;
  subtitle.textContent = moduleDefinition.screenSubtitle;
  status.textContent = moduleDefinition.status;
  selected.textContent = selection.label;
  statusGroup.append(status, selected);
  titleGroup.append(title, subtitle);
  header.append(titleGroup, statusGroup);
  return header;
}

function renderMissionBoard(
  moduleDefinition: SystemDemoModuleDefinition,
  selection: SystemDemoSelection
): HTMLElement {
  const body = createElement("section", "screen-body screen-body--missions");

  const list = createElement("div", "selection-list");
  for (const item of moduleDefinition.selections) {
    list.append(createSelectionButton(moduleDefinition, item));
  }

  const detail = createElement("article", "mission-detail");
  const kicker = createElement("span", "detail-kicker");
  const title = createElement("h2");
  const summary = createElement("p");
  const objectiveGrid = createElement("div", "objective-grid");
  const objectives = [
    ["Primary", selection.context[0]?.value ?? "Objective pending"],
    ["Dependency", selection.context[1]?.value ?? "No dependency"],
    ["Signal", selection.context[3]?.value ?? "Telemetry pending"],
  ] as const;

  for (const [label, value] of objectives) {
    const objective = createElement("div", "objective-card");
    const objectiveLabel = createElement("span");
    const objectiveValue = createElement("strong");
    objectiveLabel.textContent = label;
    objectiveValue.textContent = value;
    objective.append(objectiveLabel, objectiveValue);
    objectiveGrid.append(objective);
  }

  kicker.textContent = selection.kind;
  title.textContent = selection.label;
  summary.textContent = selection.summary;
  detail.append(kicker, title, summary, createMetricList(selection), objectiveGrid);
  body.append(list, detail);
  return body;
}

function renderMccCore(
  moduleDefinition: SystemDemoModuleDefinition,
  selection: SystemDemoSelection
): HTMLElement {
  const body = createElement("section", "screen-body screen-body--mcc");
  const matrix = createElement("div", "core-matrix");

  for (const item of moduleDefinition.selections) {
    const node = createSelectionButton(moduleDefinition, item);
    node.classList.add("core-node");
    matrix.append(node);
  }

  const telemetry = createElement("article", "telemetry-panel");
  const title = createElement("h2");
  const summary = createElement("p");
  const stream = createElement("div", "telemetry-stream");
  title.textContent = selection.label;
  summary.textContent = selection.summary;

  for (const metric of selection.metrics) {
    const row = createElement("div", "telemetry-row");
    const label = createElement("span");
    const bar = createElement("span", "telemetry-bar");
    const fill = createElement("span");
    const value = createElement("strong");
    const pseudoValue = Math.max(0.24, Math.min(0.98, selection.progress - stream.childElementCount * 0.12));
    label.textContent = metric.label;
    fill.style.width = formatPercent(pseudoValue);
    value.textContent = metric.value;
    bar.append(fill);
    row.append(label, bar, value);
    stream.append(row);
  }

  telemetry.append(title, summary, stream, createProgress(selection.progress, selection.progressLabel));
  body.append(matrix, telemetry);
  return body;
}

function renderSpellForge(
  moduleDefinition: SystemDemoModuleDefinition,
  selection: SystemDemoSelection
): HTMLElement {
  const body = createElement("section", "screen-body screen-body--spell");

  const runeGraph = createElement("div", "rune-graph");
  const runeNames = ["Source", "Form", "Motion", "Release"];
  runeNames.forEach((runeName, index) => {
    const rune = createElement("button", "rune-node");
    rune.type = "button";
    rune.classList.toggle("is-active", index === 1);
    rune.textContent = runeName;
    rune.addEventListener("click", () => {
      setState({
        activeModuleId: moduleDefinition.moduleId,
        activeSelectionId: selection.selectionId,
        revealStage: "context",
      });
    });
    runeGraph.append(rune);
  });

  const spellList = createElement("div", "spell-list");
  for (const item of moduleDefinition.selections) {
    spellList.append(createSelectionButton(moduleDefinition, item));
  }

  const forgePanel = createElement("article", "forge-panel");
  const title = createElement("h2");
  const summary = createElement("p");
  const ingredientGrid = createElement("div", "ingredient-grid");
  const ingredientValues = [
    selection.context[0]?.value ?? "Rune pending",
    selection.context[1]?.value ?? "Catalyst pending",
    selection.metrics[0]?.value ?? "Element pending",
  ];

  for (const ingredient of ingredientValues) {
    const slot = createElement("div", "ingredient-slot");
    slot.textContent = ingredient;
    ingredientGrid.append(slot);
  }

  title.textContent = selection.label;
  summary.textContent = selection.summary;
  forgePanel.append(title, summary, runeGraph, ingredientGrid, createProgress(selection.progress, selection.progressLabel));
  body.append(spellList, forgePanel);
  return body;
}

function renderCurrentScreen(root: HTMLElement): void {
  const moduleDefinition = findSystemDemoModule(state.activeModuleId);
  const selection = resolveSystemDemoSelection(state.activeModuleId, state.activeSelectionId);
  const screen = createElement("section", "system-screen");
  screen.dataset.accent = moduleDefinition.accent;
  screen.setAttribute("aria-labelledby", "current-screen-title");

  const header = renderScreenHeader(moduleDefinition, selection);
  const title = header.querySelector("h1");
  if (title) {
    title.id = "current-screen-title";
  }

  let body: HTMLElement;
  if (moduleDefinition.visualKind === "mcc-core") {
    body = renderMccCore(moduleDefinition, selection);
  } else if (moduleDefinition.visualKind === "spell-forge") {
    body = renderSpellForge(moduleDefinition, selection);
  } else {
    body = renderMissionBoard(moduleDefinition, selection);
  }

  screen.append(header, body);
  root.append(screen);
}

function renderInspector(root: HTMLElement): void {
  const moduleDefinition = findSystemDemoModule(state.activeModuleId);
  const selection = resolveSystemDemoSelection(state.activeModuleId, state.activeSelectionId);
  const panel = createElement("aside", "selection-panel");
  panel.dataset.accent = moduleDefinition.accent;
  panel.setAttribute("aria-label", "Selection context");

  const header = createElement("header", "inspector-header");
  const label = createElement("span");
  const title = createElement("h2");
  const status = createElement("strong");
  label.textContent = "Selection Context";
  title.textContent = selection.label;
  status.textContent = selection.status;
  header.append(label, title, status);

  const summary = createElement("p", "inspector-summary");
  summary.textContent = selection.summary;

  const contextList = createElement("dl", "context-list");
  for (const item of selection.context) {
    const row = createElement("div");
    const dt = createElement("dt");
    const dd = createElement("dd");
    dt.textContent = item.label;
    dd.textContent = item.value;
    row.append(dt, dd);
    contextList.append(row);
  }

  const actions = createElement("div", "action-grid");
  for (const action of selection.actions) {
    const button = createElement("button");
    button.type = "button";
    button.textContent = action;
    button.addEventListener("click", () => {
      const command = byId<HTMLElement>("command-status");
      command.textContent = `${action}: ${selection.label}`;
    });
    actions.append(button);
  }

  panel.append(header, summary, createMetricList(selection), contextList, actions);
  root.append(panel);
}

function renderCommandBar(root: HTMLElement): void {
  const selection = resolveSystemDemoSelection(state.activeModuleId, state.activeSelectionId);
  const commandBar = createElement("footer", "command-bar");
  const status = createElement("span");
  const buttons = createElement("div");
  status.id = "command-status";
  status.textContent = `Ready: ${selection.label}`;

  for (const command of ["Focus", "Snapshot", "Route", "Record"]) {
    const button = createElement("button");
    button.type = "button";
    button.textContent = command;
    button.addEventListener("click", () => {
      status.textContent = `${command}: ${selection.label}`;
    });
    buttons.append(button);
  }

  commandBar.append(status, buttons);
  root.append(commandBar);
}

function renderHud(root: HTMLElement): void {
  const moduleDefinition = findSystemDemoModule(state.activeModuleId);
  const hud = createElement("header", "system-hud");
  const left = createElement("div");
  const title = createElement("strong");
  const subtitle = createElement("span");
  const right = createElement("div", "hud-metrics");

  title.textContent = "Player System";
  subtitle.textContent = moduleDefinition.screenTitle;

  for (const item of [
    ["Mode", "Focused"],
    ["Anchor", "world-overlay"],
    ["Frame", "pitch-demo"],
  ] as const) {
    const metric = createElement("span");
    metric.textContent = `${item[0]} ${item[1]}`;
    right.append(metric);
  }

  left.append(title, subtitle);
  hud.append(left, right);
  root.append(hud);
}

function render(): void {
  const root = byId<HTMLElement>("app");
  root.replaceChildren();
  renderHud(root);

  const layout = createElement("div", "system-layout");
  layout.dataset.revealStage = revealStage;
  renderNav(layout);
  if (revealStage === "screen" || revealStage === "context") {
    renderCurrentScreen(layout);
  }
  if (revealStage === "context") {
    renderInspector(layout);
  }
  root.append(layout);
  renderCommandBar(root);
  sceneController?.setFocus(state.activeModuleId);
  syncSceneSurfaceState();
}

function tickLook(): void {
  const elapsedMs = performance.now() - autoplayStartedAt;
  applyPlayerLook(elapsedMs);
}

const canvas = byId<HTMLCanvasElement>("system-scene");
function resolveSceneAction(event: PointerEvent): SystemPanelAction | undefined {
  return sceneController?.pickAction(event.clientX, event.clientY);
}

canvas.addEventListener("click", (event) => {
  const action = resolveSceneAction(event);
  if (!action) {
    return;
  }

  event.preventDefault();
  runSystemAction(action);
});

canvas.addEventListener("pointermove", (event) => {
  canvas.classList.toggle("is-actionable", Boolean(resolveSceneAction(event)));
});

canvas.addEventListener("pointerleave", () => {
  canvas.classList.remove("is-actionable");
});

if (captureMode) {
  document.documentElement.classList.add("is-capturing");
}
if (qualityMode === "ultra") {
  document.documentElement.classList.add("is-ultra-quality");
}
render();

window.playerSystemDemoCapture = {
  ready: false,
  timeline,
  getState: () => state,
  getRevealStage: () => revealStage,
  getRendererMode: () => sceneController?.rendererMode ?? "pending",
  getPresentationMode: () => presentationMode,
  getSceneDiagnostics: () =>
    sceneController?.getDiagnostics() ?? {
      panelRasterCount: 0,
      traceTriangleCount: 0,
      traceNodeCount: 0,
      raySampleCount: raySamples,
      rayDebugMode,
      gpuError: undefined,
      shaderDiagnostics: [],
    },
  getActions: getSceneActions,
  seek: seekDemo,
  setActive,
  runAction: (actionId) => actionRuntime.invokeActionId(actionId, { source: "script" }),
  runScript: (script) => actionRuntime.invokeScript(script),
  runVoiceCommand: (phrase) => actionRuntime.invokePhrase(phrase),
};

void import("./scene.js").then(async ({ mountSystemScene }) => {
  sceneController = await mountSystemScene(canvas, {
    allowCanvasFallback: allowCanvasFallback || !(captureMode || frameExportMode),
    manualFrame: captureMode || frameExportMode,
    qualityMode,
    presentationMode,
    renderScale,
    raySamples,
    rayDebugMode,
  });
  sceneController.setFocus(state.activeModuleId);
  syncSceneSurfaceState();
  document.documentElement.classList.add("is-world-space-ui");
  applyPlayerLook(0);

  window.__plasiusCaptureFrame = async (options = {}) => {
    const stepMs =
      typeof options.stepMs === "number" && Number.isFinite(options.stepMs)
        ? Math.max(0, options.stepMs)
        : 1000 / 60;
    exportedElapsedMs =
      typeof options.seekMs === "number" && Number.isFinite(options.seekMs)
        ? Math.max(0, options.seekMs)
        : exportedElapsedMs + stepMs;
    seekDemo(exportedElapsedMs);
    await waitForPresentedFrame();
    return {
      elapsedMs: exportedElapsedMs,
      activeModuleId: state.activeModuleId,
      activeSelectionId: state.activeSelectionId,
    };
  };
  window.playerSystemDemoCapture!.ready = true;

  if (captureMode) {
    exportedElapsedMs = 0;
    seekDemo(0);
  }
}).catch((error: unknown) => {
  window.playerSystemDemoCapture!.error =
    error instanceof Error ? error.message : String(error);
});

function tickAutoplay(): void {
  seekDemo(performance.now() - autoplayStartedAt);
  autoplayFrameId = window.requestAnimationFrame(tickAutoplay);
}

function tickAmbientLook(): void {
  tickLook();
  autoplayFrameId = window.requestAnimationFrame(tickAmbientLook);
}

if (autoplayMode && !captureMode) {
  autoplayFrameId = window.requestAnimationFrame(tickAutoplay);
} else if (!captureMode) {
  autoplayFrameId = window.requestAnimationFrame(tickAmbientLook);
}

window.addEventListener("beforeunload", () => {
  if (autoplayFrameId !== undefined) {
    window.cancelAnimationFrame(autoplayFrameId);
  }
  delete window.__plasiusCaptureFrame;
  sceneController?.dispose();
});
