import { CHARACTER_PERSONALITIES } from "./characterPersonality";
import { EMOTE_GROUPS, emoteCollection } from "./garageEmotes";

export type FinderEmote = { id: string; name: string; prop?: string; pack?: string };

const actionIds = {
  Greet: ["010", "033", "058", "072", "090", "139", "195"],
  React: ["007", "030", "034", "037", "038", "044", "045", "052", "053", "054", "055", "079", "119", "153", "191", "192", "194", "196", "198", "oh-no"],
  Move: ["014", "019", "026", "032", "042", "044", "046", "095", "122", "123", "125", "171", "179", "walk-casual", "robot-dance"],
  Inspect: ["005", "006", "061", "066", "081", "088", "099", "105", "132", "138", "143", "144", "146", "161", "162", "164", "165", "167", "168", "169", "bag-check"],
  Signal: ["062", "063", "064", "065", "067", "071", "075", "082", "083", "084", "085", "089", "174", "175", "177", "178", "197"],
  Rest: ["001", "002", "004", "052", "114", "133", "pose-lean"],
};
export const FINDER_ACTIONS = Object.keys(actionIds);
export const FINDER_OBJECTS = ["Car", "Wheel", "Bag", "Flag", "Phone", "Map", "Mirror"];

const tagsById = new Map<string, string[]>();
function tag(ids: readonly string[], words: string) {
  for (const id of ids) tagsById.set(id, [...(tagsById.get(id) ?? []), words]);
}

for (const [action, ids] of Object.entries(actionIds)) tag(ids, action.toLowerCase());
for (const personality of CHARACTER_PERSONALITIES) tag(personality.emotes, personality.label.toLowerCase());
tag(["010", "033", "058"], "hello hi greeting");
tag(["035"], "thanks thank gratitude");
tag(["040", "120"], "bye goodbye farewell");
tag(["013", "115"], "clap clapping");
tag(["005", "006", "066", "103", "105", "107", "161", "162", "163", "164", "165", "166", "167", "168", "169", "184"], "car vehicle");
tag(["006", "066", "164"], "wheel tire tyre");

export function availableFinderEmotes(bag: boolean): FinderEmote[] {
  const byId = new Map<string, FinderEmote>();
  for (const pack of EMOTE_GROUPS) {
    for (const { id, name, prop } of emoteCollection(pack, bag)) {
      if (!byId.has(id)) byId.set(id, { id, name, pack, prop });
    }
  }
  return [...byId.values()];
}

export function matchesEmote(emote: FinderEmote, terms: readonly string[]) {
  const words = [emote.id, emote.name, emote.prop, emote.pack, ...(tagsById.get(emote.id) ?? [])]
    .join(" ").toLowerCase().split(/[^a-z0-9]+/);
  return terms.every(term => words.some(word => word.startsWith(term)));
}
