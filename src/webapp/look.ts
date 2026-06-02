export interface PlayerLookState {
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly panelX: number;
  readonly panelY: number;
  readonly screenFocus: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolvePlayerLook(timeMs: number): PlayerLookState {
  const time = timeMs * 0.001;
  const yaw = clamp(
    Math.sin(time * 0.38) * 0.72 + Math.sin(time * 0.17 + 1.8) * 0.22,
    -1,
    1
  );
  const pitch = clamp(
    Math.sin(time * 0.31 + 0.9) * 0.36 + Math.sin(time * 0.12) * 0.12,
    -0.6,
    0.6
  );
  const roll = clamp(Math.sin(time * 0.24 + 2.2) * 0.18, -0.24, 0.24);
  const screenFocus = clamp((-pitch + 0.35) / 0.68, 0, 1);

  return {
    yaw,
    pitch,
    roll,
    panelX: yaw,
    panelY: pitch,
    screenFocus,
  };
}
