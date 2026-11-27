export type PlanBounds = { x: number; z: number; width: number; depth: number };

export function snapValue(value: number, step: number) {
  return Number((Math.round(value / step) * step).toFixed(6));
}

export function planPoint(
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
  view: PlanBounds,
): [number, number] | null {
  const ratio = Math.min(rect.width / view.width, rect.height / view.depth);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const px = (x - rect.left - (rect.width - view.width * ratio) / 2) / ratio,
    pz = (y - rect.top - (rect.height - view.depth * ratio) / 2) / ratio;
  return px < 0 || pz < 0 || px > view.width || pz > view.depth
    ? null
    : [view.x + px, view.z + pz];
}
