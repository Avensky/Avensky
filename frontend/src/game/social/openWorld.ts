import type { SocialView, SocialWorld } from "../../store/social/socialStore";

export function parseOpenWorldId(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export const OPEN_WORLD_ID = parseOpenWorldId(import.meta.env?.VITE_OPEN_WORLD_ID);

export function openWorldForView(view?: SocialView | null) {
  const assigned = view?.main_world_id === undefined ? OPEN_WORLD_ID : view.main_world_id;
  if (assigned != null || import.meta.env?.MODE !== "staging") return assigned;
  return view?.worlds.filter(world => world.walkable && world.listed && !world.locked && world.mode == null)
    .reduce<number | undefined>((first, world) => first === undefined ? world.id : Math.min(first, world.id), undefined);
}

export function findOpenWorld(worlds: SocialWorld[], id = OPEN_WORLD_ID) {
  return worlds.find(world => world.id === id && world.listed && !world.locked && world.mode == null);
}

export function currentOpenWorld(view?: SocialView | null) {
  const id = openWorldForView(view);
  return view && id != null ? findOpenWorld(view.worlds, id) : undefined;
}
