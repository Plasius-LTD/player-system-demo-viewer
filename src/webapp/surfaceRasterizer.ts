import type {
  GpuInteractionBounds,
  GpuInteractionSurfaceAction,
} from "@plasius/gpu-interaction";
import type {
  SystemDemoAccent,
  SystemDemoModuleId,
  SystemDemoVisualKind,
} from "../index.js";

export type SystemPanelKind = "nav" | "screen" | "context";
export type SystemPanelRevealStage = "menu" | "screen" | "context";

export interface SystemSurfaceModule {
  readonly moduleId: SystemDemoModuleId;
  readonly label: string;
  readonly navHint: string;
  readonly status: string;
  readonly accent: SystemDemoAccent;
}

export interface SystemSurfaceMetric {
  readonly label: string;
  readonly value: string;
  readonly tone?: SystemDemoAccent;
}

export interface SystemSurfaceContextEntry {
  readonly label: string;
  readonly value: string;
}

export interface SystemSurfaceSelection {
  readonly selectionId: string;
  readonly label: string;
  readonly kind: string;
  readonly status: string;
  readonly summary: string;
  readonly progressLabel: string;
  readonly progress: number;
  readonly metrics: readonly SystemSurfaceMetric[];
  readonly context: readonly SystemSurfaceContextEntry[];
  readonly actions: readonly string[];
}

export interface SystemSceneSurfaceState {
  readonly featureFlagId: string;
  readonly revealStage: SystemPanelRevealStage;
  readonly activeModuleId: SystemDemoModuleId;
  readonly activeSelectionId: string;
  readonly screenTitle: string;
  readonly screenSubtitle: string;
  readonly visualKind: SystemDemoVisualKind;
  readonly accent: SystemDemoAccent;
  readonly status: string;
  readonly modules: readonly SystemSurfaceModule[];
  readonly selections: readonly SystemSurfaceSelection[];
  readonly selection: SystemSurfaceSelection;
}

export interface SystemPanelRaster {
  readonly kind: SystemPanelKind;
  readonly canvas: HTMLCanvasElement;
  readonly versionKey: string;
  readonly actions: readonly SystemPanelAction[];
}

export type SystemPanelActionType = "module" | "selection" | "command";

export interface SystemPanelActionPayload extends Record<string, unknown> {
  readonly moduleId?: SystemDemoModuleId;
  readonly selectionId?: string;
  readonly command?: string;
}

export type SystemPanelActionBounds = GpuInteractionBounds;

export interface SystemPanelAction extends GpuInteractionSurfaceAction<SystemPanelActionPayload> {
  readonly actionId: string;
  readonly type: SystemPanelActionType;
  readonly panelKind: SystemPanelKind;
  readonly moduleId?: SystemDemoModuleId;
  readonly selectionId?: string;
  readonly command?: string;
}

export interface SystemPanelActionInput {
  readonly type: SystemPanelActionType;
  readonly label: string;
  readonly panelKind: SystemPanelKind;
  readonly bounds: SystemPanelActionBounds;
  readonly moduleId?: SystemDemoModuleId;
  readonly selectionId?: string;
  readonly command?: string;
}

interface PanelPalette {
  readonly accent: string;
  readonly accentSoft: string;
  readonly accentText: string;
  readonly ink: string;
  readonly muted: string;
  readonly dim: string;
  readonly line: string;
  readonly panel: string;
  readonly panelStrong: string;
}

const widthByPanel: Record<SystemPanelKind, number> = {
  nav: 420,
  screen: 980,
  context: 470,
};
const panelHeight = 760;
const fontFamily = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
const monoFamily = "SFMono-Regular, Consolas, monospace";

function quoteScriptArg(value: string): string {
  return JSON.stringify(value);
}

export function createSystemPanelAction(input: SystemPanelActionInput): SystemPanelAction {
  if (input.type === "module" && input.moduleId) {
    const script = `system.openModule(${quoteScriptArg(input.moduleId)})`;
    return {
      ...input,
      id: `module:${input.moduleId}`,
      kind: input.type,
      actionId: `module:${input.moduleId}`,
      script,
      surfaceId: input.panelKind,
      payload: { moduleId: input.moduleId },
      phrases: [`open ${input.label}`, `select ${input.label}`],
      moduleId: input.moduleId,
    };
  }

  if (input.type === "selection" && input.moduleId && input.selectionId) {
    const script = `system.select(${quoteScriptArg(input.moduleId)}, ${quoteScriptArg(input.selectionId)})`;
    return {
      ...input,
      id: `selection:${input.moduleId}:${input.selectionId}`,
      kind: input.type,
      actionId: `selection:${input.moduleId}:${input.selectionId}`,
      script,
      surfaceId: input.panelKind,
      payload: {
        moduleId: input.moduleId,
        selectionId: input.selectionId,
      },
      phrases: [`select ${input.label}`, `open ${input.label}`],
      moduleId: input.moduleId,
      selectionId: input.selectionId,
    };
  }

  if (input.type === "command" && input.moduleId && input.selectionId && input.command) {
    const script = `system.command(${quoteScriptArg(input.command)}, ${quoteScriptArg(input.selectionId)})`;
    return {
      ...input,
      id: `command:${input.moduleId}:${input.selectionId}:${input.command}`,
      kind: input.type,
      actionId: `command:${input.moduleId}:${input.selectionId}:${input.command}`,
      script,
      surfaceId: input.panelKind,
      payload: {
        moduleId: input.moduleId,
        selectionId: input.selectionId,
        command: input.command,
      },
      phrases: [`run ${input.label}`, `activate ${input.label}`],
      moduleId: input.moduleId,
      selectionId: input.selectionId,
      command: input.command,
    };
  }

  throw new Error(`Invalid System panel action: ${input.type}`);
}

function paletteForAccent(accent: SystemDemoAccent): PanelPalette {
  const accentHex = {
    gold: "#e4b45f",
    teal: "#63c7bd",
    rose: "#e3816f",
    blue: "#78aee8",
  }[accent];

  return {
    accent: accentHex,
    accentSoft: `${accentHex}33`,
    accentText: accentHex,
    ink: "#f6f1e8",
    muted: "#b8c6c8",
    dim: "#7f9292",
    line: "rgba(246, 241, 232, 0.18)",
    panel: "rgba(8, 16, 20, 0.72)",
    panelStrong: "rgba(14, 31, 35, 0.66)",
  };
}

function createPanelCanvas(kind: SystemPanelKind): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = widthByPanel[kind];
  canvas.height = panelHeight;
  return canvas;
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("System panel rasterization requires Canvas2D.");
  }
  context.textBaseline = "top";
  return context;
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const resolvedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + resolvedRadius, y);
  context.lineTo(x + width - resolvedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius);
  context.lineTo(x + width, y + height - resolvedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - resolvedRadius, y + height);
  context.lineTo(x + resolvedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius);
  context.lineTo(x, y + resolvedRadius);
  context.quadraticCurveTo(x, y, x + resolvedRadius, y);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string | CanvasGradient
): void {
  roundedRectPath(context, x, y, width, height, radius);
  context.fillStyle = fillStyle;
  context.fill();
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  strokeStyle: string,
  lineWidth = 2
): void {
  roundedRectPath(context, x, y, width, height, radius);
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawPanelShell(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: PanelPalette
): void {
  context.clearRect(0, 0, width, height);
  fillRoundedRect(context, 8, 8, width - 16, height - 16, 18, palette.panel);
  const gradient = context.createLinearGradient(0, 8, width, height - 8);
  gradient.addColorStop(0, "rgba(99, 199, 189, 0.1)");
  gradient.addColorStop(0.38, "rgba(246, 241, 232, 0.02)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.08)");
  fillRoundedRect(context, 8, 8, width - 16, height - 16, 18, gradient);
  strokeRoundedRect(context, 8, 8, width - 16, height - 16, 18, palette.line, 2);
  strokeRoundedRect(context, 11, 11, width - 22, height - 22, 15, palette.accentSoft, 1);
}

function setFont(context: CanvasRenderingContext2D, size: number, weight = 500): void {
  context.font = `${weight} ${size}px ${fontFamily}`;
}

function setMonoFont(context: CanvasRenderingContext2D, size: number, weight = 500): void {
  context.font = `${weight} ${size}px ${monoFamily}`;
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number,
  weight = 500
): void {
  setFont(context, size, weight);
  context.fillStyle = color;
  context.fillText(text, x, y);
}

function drawMonoText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number,
  weight = 500
): void {
  setMonoFont(context, size, weight);
  context.fillStyle = color;
  context.fillText(text, x, y);
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  color: string,
  size: number,
  lineHeight: number,
  weight = 500,
  maxLines = 3
): number {
  setFont(context, size, weight);
  context.fillStyle = color;
  const lines = wrapText(context, text, maxWidth).slice(0, maxLines);
  for (const [index, line] of lines.entries()) {
    context.fillText(line, x, y + index * lineHeight);
  }
  return y + lines.length * lineHeight;
}

function drawProgress(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  value: number,
  palette: PanelPalette
): void {
  fillRoundedRect(context, x, y, width, 12, 999, "rgba(246, 241, 232, 0.12)");
  const fillWidth = Math.max(12, width * Math.min(1, Math.max(0, value)));
  const gradient = context.createLinearGradient(x, y, x + width, y);
  gradient.addColorStop(0, "#e3816f");
  gradient.addColorStop(0.5, "#e4b45f");
  gradient.addColorStop(1, palette.accent);
  fillRoundedRect(context, x, y, fillWidth, 12, 999, gradient);
}

function drawDivider(context: CanvasRenderingContext2D, x: number, y: number, width: number): void {
  context.strokeStyle = "rgba(246, 241, 232, 0.14)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + width, y);
  context.stroke();
}

function drawNavPanel(state: SystemSceneSurfaceState): SystemPanelRaster {
  const canvas = createPanelCanvas("nav");
  const context = getContext(canvas);
  const palette = paletteForAccent(state.accent);
  const actions: SystemPanelAction[] = [];
  drawPanelShell(context, canvas.width, canvas.height, palette);

  const markGradient = context.createLinearGradient(34, 34, 106, 86);
  markGradient.addColorStop(0, palette.accent);
  markGradient.addColorStop(1, "#63c7bd");
  fillRoundedRect(context, 34, 34, 72, 52, 12, markGradient);
  drawText(context, "SYS", 51, 49, "#061015", 16, 850);
  drawText(context, "System", 124, 38, palette.ink, 24, 780);
  drawMonoText(context, state.featureFlagId, 124, 68, palette.dim, 11, 550);
  drawDivider(context, 32, 106, canvas.width - 64);

  let y = 132;
  for (const moduleItem of state.modules) {
    const isActive = moduleItem.moduleId === state.activeModuleId;
    const rowHeight = 116;
    const rowFill = isActive ? "rgba(246, 241, 232, 0.09)" : "rgba(246, 241, 232, 0.04)";
    fillRoundedRect(context, 32, y, canvas.width - 64, rowHeight, 12, rowFill);
    strokeRoundedRect(context, 32, y, canvas.width - 64, rowHeight, 12, isActive ? palette.accentSoft : palette.line, 1.4);
    if (isActive) {
      fillRoundedRect(context, 32, y + 10, 5, rowHeight - 20, 999, palette.accent);
    }
    const icon = moduleItem.moduleId === "mcc-core" ? "M" : moduleItem.moduleId === "spell-creation" ? "S" : "Q";
    fillRoundedRect(context, 50, y + 24, 52, 52, 12, isActive ? palette.accent : "rgba(246, 241, 232, 0.12)");
    drawText(context, icon, 67, y + 39, isActive ? "#061015" : palette.ink, 18, 850);
    drawWrappedText(context, moduleItem.label, 118, y + 22, 210, palette.ink, 19, 23, 780, 2);
    drawText(context, moduleItem.navHint, 118, y + 72, palette.muted, 13, 550);
    drawText(context, moduleItem.status, 118, y + 92, isActive ? palette.accentText : palette.dim, 12, 780);
    actions.push(createSystemPanelAction({
      type: "module",
      label: moduleItem.label,
      panelKind: "nav",
      bounds: { x: 32, y, width: canvas.width - 64, height: rowHeight },
      moduleId: moduleItem.moduleId,
    }));
    y += rowHeight + 18;
  }

  return {
    kind: "nav",
    canvas,
    versionKey: `nav:${state.activeModuleId}:${state.activeSelectionId}`,
    actions,
  };
}

function drawMetricStrip(
  context: CanvasRenderingContext2D,
  metrics: readonly SystemSurfaceMetric[],
  x: number,
  y: number,
  width: number,
  palette: PanelPalette
): void {
  const gap = 12;
  const itemWidth = (width - gap * 2) / 3;
  for (const [index, metric] of metrics.slice(0, 3).entries()) {
    const itemX = x + index * (itemWidth + gap);
    fillRoundedRect(context, itemX, y, itemWidth, 62, 10, "rgba(246, 241, 232, 0.045)");
    strokeRoundedRect(context, itemX, y, itemWidth, 62, 10, palette.line, 1);
    drawText(context, metric.label, itemX + 14, y + 12, palette.dim, 12, 650);
    drawWrappedText(context, metric.value, itemX + 14, y + 31, itemWidth - 28, metric.tone ? paletteForAccent(metric.tone).accentText : palette.ink, 14, 18, 800, 2);
  }
}

function drawSelectionCard(
  context: CanvasRenderingContext2D,
  selection: SystemSurfaceSelection,
  active: boolean,
  x: number,
  y: number,
  width: number,
  palette: PanelPalette
): void {
  fillRoundedRect(context, x, y, width, 104, 12, active ? "rgba(228, 180, 95, 0.12)" : "rgba(246, 241, 232, 0.045)");
  strokeRoundedRect(context, x, y, width, 104, 12, active ? palette.accentSoft : palette.line, 1);
  drawWrappedText(context, selection.label, x + 14, y + 13, width - 92, palette.ink, 15, 18, 780, 2);
  drawText(context, selection.status, x + width - 78, y + 15, palette.accentText, 11, 800);
  drawWrappedText(context, selection.summary, x + 14, y + 48, width - 28, palette.muted, 12, 15, 500, 2);
  drawText(context, selection.progressLabel, x + 14, y + 82, palette.dim, 10, 650);
  drawProgress(context, x + 120, y + 84, width - 178, selection.progress, palette);
  drawText(context, `${Math.round(selection.progress * 100)}%`, x + width - 44, y + 79, palette.ink, 12, 800);
}

function drawScreenPanel(state: SystemSceneSurfaceState): SystemPanelRaster {
  const canvas = createPanelCanvas("screen");
  const context = getContext(canvas);
  const palette = paletteForAccent(state.accent);
  const actions: SystemPanelAction[] = [];
  drawPanelShell(context, canvas.width, canvas.height, palette);

  drawText(context, state.screenTitle, 38, 34, palette.ink, 34, 780);
  drawWrappedText(context, state.screenSubtitle, 38, 77, 570, palette.muted, 15, 20, 500, 2);
  fillRoundedRect(context, canvas.width - 190, 38, 142, 38, 8, "rgba(246, 241, 232, 0.055)");
  strokeRoundedRect(context, canvas.width - 190, 38, 142, 38, 8, palette.accentSoft, 1);
  drawText(context, state.status, canvas.width - 172, 49, palette.accentText, 13, 820);
  drawDivider(context, 36, 116, canvas.width - 72);

  if (state.visualKind === "mcc-core") {
    const gridX = 38;
    const gridY = 150;
    const cardWidth = 184;
    for (const [index, selection] of state.selections.entries()) {
      const col = index % 3;
      const row = Math.floor(index / 3);
      drawSelectionCard(
        context,
        selection,
        selection.selectionId === state.activeSelectionId,
        gridX + col * (cardWidth + 18),
        gridY + row * 128,
        cardWidth,
        palette
      );
      actions.push(createSystemPanelAction({
        type: "selection",
        label: selection.label,
        panelKind: "screen",
        bounds: {
          x: gridX + col * (cardWidth + 18),
          y: gridY + row * 128,
          width: cardWidth,
          height: 104,
        },
        moduleId: state.activeModuleId,
        selectionId: selection.selectionId,
      }));
    }
    const panelX = 638;
    fillRoundedRect(context, panelX, 150, 300, 440, 14, palette.panelStrong);
    strokeRoundedRect(context, panelX, 150, 300, 440, 14, palette.line, 1);
    drawWrappedText(context, state.selection.label, panelX + 22, 176, 242, palette.ink, 24, 28, 780, 2);
    drawWrappedText(context, state.selection.summary, panelX + 22, 244, 246, palette.muted, 14, 20, 500, 4);
    let y = 348;
    for (const metric of state.selection.metrics) {
      drawText(context, metric.label, panelX + 22, y, palette.dim, 12, 650);
      drawText(context, metric.value, panelX + 106, y - 1, metric.tone ? paletteForAccent(metric.tone).accentText : palette.ink, 14, 800);
      drawProgress(context, panelX + 22, y + 24, 250, state.selection.progress, palette);
      y += 64;
    }
  } else {
    const listX = 38;
    const listWidth = state.visualKind === "spell-forge" ? 250 : 300;
    let y = 148;
    for (const selection of state.selections.slice(0, 3)) {
      drawSelectionCard(
        context,
        selection,
        selection.selectionId === state.activeSelectionId,
        listX,
        y,
        listWidth,
        palette
      );
      actions.push(createSystemPanelAction({
        type: "selection",
        label: selection.label,
        panelKind: "screen",
        bounds: { x: listX, y, width: listWidth, height: 104 },
        moduleId: state.activeModuleId,
        selectionId: selection.selectionId,
      }));
      y += 122;
    }

    const detailX = listX + listWidth + 26;
    const detailWidth = canvas.width - detailX - 38;
    fillRoundedRect(context, detailX, 148, detailWidth, 476, 14, palette.panelStrong);
    strokeRoundedRect(context, detailX, 148, detailWidth, 476, 14, palette.line, 1);
    drawText(context, state.selection.kind, detailX + 24, 174, palette.accentText, 13, 850);
    drawWrappedText(context, state.selection.label, detailX + 24, 203, detailWidth - 48, palette.ink, 29, 34, 780, 2);
    drawWrappedText(context, state.selection.summary, detailX + 24, 286, detailWidth - 48, palette.muted, 15, 21, 500, 3);
    drawMetricStrip(context, state.selection.metrics, detailX + 24, 374, detailWidth - 48, palette);

    const contextEntries = state.selection.context.slice(0, 3);
    const slotWidth = (detailWidth - 72) / 3;
    for (const [index, entry] of contextEntries.entries()) {
      const slotX = detailX + 24 + index * (slotWidth + 12);
      fillRoundedRect(context, slotX, 468, slotWidth, 118, 12, "rgba(246, 241, 232, 0.045)");
      strokeRoundedRect(context, slotX, 468, slotWidth, 118, 12, palette.line, 1);
      drawText(context, entry.label, slotX + 13, 484, palette.dim, 11, 700);
      drawWrappedText(context, entry.value, slotX + 13, 510, slotWidth - 26, palette.ink, 14, 18, 780, 4);
    }
  }

  return {
    kind: "screen",
    canvas,
    versionKey: `screen:${state.activeModuleId}:${state.activeSelectionId}`,
    actions,
  };
}

function drawContextPanel(state: SystemSceneSurfaceState): SystemPanelRaster {
  const canvas = createPanelCanvas("context");
  const context = getContext(canvas);
  const palette = paletteForAccent(state.accent);
  const actions: SystemPanelAction[] = [];
  drawPanelShell(context, canvas.width, canvas.height, palette);

  drawText(context, "Selection Context", 34, 36, palette.accentText, 14, 850);
  drawWrappedText(context, state.selection.label, 34, 66, canvas.width - 68, palette.ink, 24, 28, 780, 3);
  fillRoundedRect(context, 34, 152, 116, 34, 8, "rgba(246, 241, 232, 0.055)");
  strokeRoundedRect(context, 34, 152, 116, 34, 8, palette.accentSoft, 1);
  drawText(context, state.selection.status, 51, 162, palette.accentText, 13, 820);
  drawWrappedText(context, state.selection.summary, 34, 208, canvas.width - 68, palette.muted, 15, 21, 500, 4);
  drawMetricStrip(context, state.selection.metrics, 34, 316, canvas.width - 68, palette);

  let y = 414;
  for (const entry of state.selection.context) {
    drawDivider(context, 34, y, canvas.width - 68);
    drawText(context, entry.label, 34, y + 16, palette.dim, 12, 700);
    y = drawWrappedText(context, entry.value, 34, y + 40, canvas.width - 68, palette.ink, 14, 19, 650, 3) + 14;
  }

  y = Math.min(y + 10, 648);
  for (const action of state.selection.actions.slice(0, 3)) {
    fillRoundedRect(context, 34, y, canvas.width - 68, 34, 8, "rgba(246, 241, 232, 0.055)");
    strokeRoundedRect(context, 34, y, canvas.width - 68, 34, 8, palette.line, 1);
    drawText(context, action, 50, y + 10, palette.ink, 13, 720);
    actions.push(createSystemPanelAction({
      type: "command",
      label: action,
      panelKind: "context",
      bounds: { x: 34, y, width: canvas.width - 68, height: 34 },
      moduleId: state.activeModuleId,
      selectionId: state.activeSelectionId,
      command: action,
    }));
    y += 44;
  }

  return {
    kind: "context",
    canvas,
    versionKey: `context:${state.activeModuleId}:${state.activeSelectionId}`,
    actions,
  };
}

export function rasterizeSystemPanels(
  state: SystemSceneSurfaceState
): readonly SystemPanelRaster[] {
  const panels: SystemPanelRaster[] = [drawNavPanel(state)];
  if (state.revealStage === "screen" || state.revealStage === "context") {
    panels.push(drawScreenPanel(state));
  }
  if (state.revealStage === "context") {
    panels.push(drawContextPanel(state));
  }
  return panels;
}
