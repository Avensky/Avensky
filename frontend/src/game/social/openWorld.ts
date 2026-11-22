import type { SocialWorld } from "../../store/social/socialStore";

export function parseOpenWorldId(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export const OPEN_WORLD_ID = parseOpenWorldId(import.meta.env?.VITE_OPEN_WORLD_ID);

export function findOpenWorld(worlds: SocialWorld[], id = OPEN_WORLD_ID) {
  return worlds.find(world => world.id === id && world.listed && !world.locked && world.mode == null);
}
