import { create } from "zustand";
import type { ParkingInput } from "./garageParkingPhysics";

const neutral = (): ParkingInput => ({ throttle: 0, steer: 0, brake: 0 });
const inputs = { keyboard: neutral(), controller: neutral(), touch: neutral() };
type Source = keyof typeof inputs;
let invalidate: (() => void) | undefined;
export function bindParkingWake(wake: () => void) {
  invalidate = wake;
  return () => { if (invalidate === wake) invalidate = undefined; };
}
export function setParkingInput(source: Source, throttle = 0, steer = 0, brake = 0) {
  const input = inputs[source];
  if (throttle === input.throttle && steer === input.steer && brake === input.brake) return;
  Object.assign(input, { throttle, steer, brake });
  invalidate?.();
}
export function readParkingInput(): ParkingInput {
  return {
    throttle: inputs.keyboard.throttle || inputs.touch.throttle || inputs.controller.throttle,
    steer: inputs.keyboard.steer || inputs.touch.steer || inputs.controller.steer,
    brake: Math.max(inputs.keyboard.brake, inputs.touch.brake, inputs.controller.brake),
  };
}
export function clearParkingInput() {
  for (const source of Object.keys(inputs) as Source[]) setParkingInput(source);
}

type Parking = {
  driving: boolean; joining: boolean; error: string;
  start(): void; park(): void; leave(): void; clearError(): void; depart(heroId: string): Promise<void>;
};
let attempt = 0;
export const useGarageParking = create<Parking>()((set, get) => ({
  driving: false, joining: false, error: "",
  start() {
    if (get().driving) return;
    clearParkingInput();
    set({ driving: true, joining: false, error: "" });
    invalidate?.();
  },
  park() {
    if (!get().joining) get().leave();
  },
  leave() {
    ++attempt;
    clearParkingInput();
    set({ driving: false, joining: false, error: "" });
    invalidate?.();
  },
  clearError() { set({ error: "" }); },
  async depart(heroId) {
    if (!get().driving || get().joining) return;
    const ticket = ++attempt;
    const current = () => attempt === ticket && get().driving;
    set({ joining: true, error: "" });
    clearParkingInput();
    try {
      const { driveIntoOpenWorld } = await import("../alpha/driveIntoOpenWorld");
      if (current()) await driveIntoOpenWorld(heroId, current);
    } catch (error) {
      if (current()) set({ error: error instanceof Error ? error.message : "Could not enter the shared world." });
    } finally {
      if (current()) set({ joining: false });
      invalidate?.();
    }
  },
}));
