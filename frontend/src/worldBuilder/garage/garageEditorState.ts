import { create } from "zustand";
import type { GaragePropId } from "../../game/preview/garageServiceLayout";

type GarageEditor = {
  page: "projects" | "room" | null;
  selected: GaragePropId;
  cameraProp: GaragePropId;
};

export const useGarageEditor = create<GarageEditor>(() => ({
  page: null, selected: "toolbox", cameraProp: "toolbox",
}));

export function selectGarageProp(id: GaragePropId, reframe = true) {
  useGarageEditor.setState(reframe ? { selected: id, cameraProp: id } : { selected: id });
}
