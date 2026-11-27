// The shutter renderer and the vehicle clearance check sample the same motor clock.
const travelMs = 1850;
type Stroke = { from: number; target: number; start: number };

export class GarageBayMotion {
  private strokes = new Map<number, Stroke>();
  private listeners = new Set<() => void>();

  opening(index: number, now: number) {
    const stroke = this.strokes.get(index);
    if (!stroke) return 0;
    const duration = travelMs * Math.abs(stroke.target - stroke.from);
    if (!duration || now >= stroke.start + duration) return stroke.target;
    const t = Math.max(0, (now - stroke.start) / duration);
    return stroke.from + (stroke.target - stroke.from) * t * t * (3 - 2 * t);
  }

  setOpen(index: number, open: boolean, now: number) {
    const target = open ? 1 : 0;
    if ((this.strokes.get(index)?.target ?? 0) === target) return;
    this.strokes.set(index, { from: this.opening(index, now), target, start: now });
    for (const wake of this.listeners) wake();
  }

  sample(openings: Float32Array, now: number) {
    let moving = false;
    for (let i = 0; i < openings.length; i++) {
      const opening = this.opening(i, now);
      openings[i] = opening;
      if (opening !== (this.strokes.get(i)?.target ?? 0)) moving = true;
    }
    return moving;
  }

  subscribe(wake: () => void) {
    this.listeners.add(wake);
    return () => { this.listeners.delete(wake); };
  }
}

// The entry screen can already own the garage when the authenticated game bundle mounts.
const shared = globalThis as typeof globalThis & { __avenskyBayMotion?: GarageBayMotion };
export const garageBayMotion = shared.__avenskyBayMotion ??= new GarageBayMotion();
export const setGarageBayOpen = (index: number, open: boolean) => garageBayMotion.setOpen(index, open, performance.now());
export const garageBayOpening = (index: number) => garageBayMotion.opening(index, performance.now());
