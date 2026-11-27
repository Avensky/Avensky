import { useEffect } from "react";
import { create } from "zustand";
import { requestSocial } from "../../net/socialClient";
import {
  DEFAULT_GARAGE_LAYOUT, garagePlacementError, validateGarageRoomLayout, type GarageRoomLayout,
} from "../../game/preview/garageServiceLayout";
import { useSocialStore } from "./socialStore";

type Status = "idle" | "loading" | "ready" | "saving" | "error";
type PersonalGarage = {
  owner: string | null;
  revision: number;
  layout: GarageRoomLayout;
  savedLayout: GarageRoomLayout | null;
  status: Status;
  error: string;
  setLayout(layout: GarageRoomLayout): void;
  revert(): void;
  reload(): Promise<void>;
  save(): Promise<void>;
};

const profileOwner = () => useSocialStore.getState().view?.profile.id ?? null;
function initial(owner: string | null) {
  return { owner, revision: 0, layout: DEFAULT_GARAGE_LAYOUT, savedLayout: null, status: "idle" as const, error: "" };
}

function garageSnapshot(reply: Record<string, unknown>, owner: string, allowRefit = false) {
  const revision = reply.revision;
  if (reply.owner !== owner || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0)
    throw Error("The server could not confirm your garage layout.");
  if (revision === 0 && reply.layout === null) return { revision, savedLayout: DEFAULT_GARAGE_LAYOUT };
  if (revision > 0 && validateGarageRoomLayout(reply.layout)) return { revision, savedLayout: reply.layout };
  if (revision > 0 && reply.layout && allowRefit)
    return { revision, savedLayout: DEFAULT_GARAGE_LAYOUT, error: "A saved furnishing no longer fits. Use the default placement or arrange the room again and save." };
  throw Error("The saved garage layout is unavailable.");
}

function failure(cause: unknown) {
  if (cause instanceof Error && cause.message !== "Invalid social action.") return cause.message;
  return "The garage layout service is unavailable. Try again after reconnecting.";
}

// Only Save crosses the network while arranging. Rendering and driving read the same room in memory.
let session = 0;
export const usePersonalGarage = create<PersonalGarage>()((set, get) => ({
  ...initial(profileOwner()),
  setLayout(layout) {
    const state = get();
    if (state.savedLayout && state.status !== "saving" && state.status !== "loading")
      set({ layout, status: "ready", error: "" });
  },
  revert() {
    const state = get();
    if (state.savedLayout && state.status !== "saving")
      set({ layout: state.savedLayout, status: "ready", error: "" });
  },
  async reload() {
    const { owner, status } = get();
    if (status === "loading" || status === "saving") return;
    if (!owner || profileOwner() !== owner) throw Error("Connect your account to load your garage.");
    const active = session;
    set({ status: "loading", error: "" });
    try {
      const reply = await requestSocial("garage_layout_get");
      if (active !== session) return;
      const confirmed = garageSnapshot(reply, owner, true);
      set({ ...confirmed, layout: confirmed.savedLayout, status: "ready" });
    } catch (cause) {
      if (active !== session) return;
      const error = failure(cause);
      set({ status: "error", error });
      throw Error(error);
    }
  },
  async save() {
    const { layout, savedLayout, owner, revision, status } = get();
    if (!owner || owner !== profileOwner() || !savedLayout) throw Error("Load your garage before saving.");
    if (status === "loading" || status === "saving") throw Error("Wait for the current garage request.");
    const invalid = garagePlacementError(layout);
    if (invalid) {
      set({ error: invalid, status: "error" });
      throw Error(invalid);
    }
    const active = session;
    set({ status: "saving", error: "" });
    try {
      const reply = await requestSocial("garage_layout_save", { revision, layout });
      if (active !== session) return;
      const confirmed = garageSnapshot(reply, owner, reply.conflict === true);
      if (reply.conflict === true) {
        set(confirmed);
        throw Error("Your garage changed on another device. Save again to keep these edits or discard them to use the other layout.");
      }
      set({ ...confirmed, layout: confirmed.savedLayout, status: "ready" });
    } catch (cause) {
      if (active !== session) return;
      const error = failure(cause);
      set({ error, status: "error" });
      throw Error(error);
    }
  },
}));

// Sign-out can happen while the room is offscreen or a request is pending.
useSocialStore.subscribe((next, previous) => {
  const owner = next.view?.profile.id ?? null;
  if (owner !== (previous.view?.profile.id ?? null)) {
    session++;
    usePersonalGarage.setState(initial(owner));
  }
});

export function useGarageAccountLayout() {
  const owner = useSocialStore(state => state.view?.profile.id ?? null);
  useEffect(() => {
    const garage = usePersonalGarage.getState();
    if (owner && garage.status === "idle") void garage.reload().catch(() => {});
  }, [owner]);
}
