import { garageDoorForEmote, garagePanelForEmote } from "./garageInteractions";
import { GARAGE_LEAN_ID } from "./garageLean";
import { isMirrorMakeupEmote } from "./mirrorCheck";

/** Ordinary emotes share the stable, character-only fitting stage.
 * Switch to the garage/vehicle only for shots that actually use a car. */
export function characterEmoteNeedsGarage(
  tab: string | null, camera: string, id: string | undefined, insideCar: boolean,
) {
  return tab === "emotes" && (insideCar || camera === "Whole car" || id === GARAGE_LEAN_ID
    || Boolean(garageDoorForEmote(id) || garagePanelForEmote(id) || isMirrorMakeupEmote(id)));
}
