import { ScreenNotice, useScreenNotice } from "../../components/menus/ScreenNotice";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GameButton } from "../../components/GameButton";
import { ControlGlyph, type ControlGlyphProps } from "../../components/controller/ControlGlyph";
import type { MenuAction } from "../../controls/inputRouting";
import { GarageEntryHeader } from "../../game/welcome/GarageEntryHeader";
import { GARAGE_PROP_IDS, GARAGE_PROP_LABELS, garagePlacementError, type GaragePropId, type GaragePropPose, type GarageRoomLayout } from "../../game/preview/garageServiceLayout";
import { isGaragePropOnParkedCar } from "../../game/preview/garageParkingCamera";
import { useUIStore } from "../../store/menus/uiStore";
import { usePersonalGarage } from "../../store/social/personalGarage";
import { Icon } from "../components/EditorArtwork";
import { useGarageEditor, selectGarageProp } from "./garageEditorState";
import { GaragePlacementSurface } from "./GaragePlacementSurface";
import "./garageEditor.css";

const close = () => useGarageEditor.setState({ page: null });
function openRoom() {
  useGarageEditor.setState({ page: "room", selected: "toolbox", cameraProp: "toolbox" });
}
function openProjects() {
  close();
  useUIStore.getState().setScreen("world_builder");
}

function useEditorActions(route: (action: MenuAction) => void) {
  useEffect(() => {
    const listener = (event: Event) => { event.preventDefault(); route((event as CustomEvent<MenuAction>).detail); };
    window.addEventListener("avenlab:main-menu-action", listener);
    return () => window.removeEventListener("avenlab:main-menu-action", listener);
  }, [route]);
}

function Tool({ label, children, press, disabled = false, selected = false, ...glyph }: ControlGlyphProps & {
  label: string; children: ReactNode; press: () => void; disabled?: boolean; selected?: boolean;
}) {
  return <GameButton variant="custom" className="garage-edit-control chamfered-frame" aria-label={label}
    title={label} disabled={disabled} selected={selected} onPress={press}>
    <ControlGlyph {...glyph}/>{children}
  </GameButton>;
}

function ProjectPicker() {
  const [choice, setChoice] = useState(0);
  const root = useRef<HTMLElement>(null);
  const backButton = () => root.current?.querySelector<HTMLElement>(".garage-entry-brand");
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);
  const route = (a: MenuAction) => {
    if (a === "back") close();
    else if (a === "previous_tab" || a === "next_tab")
      (document.activeElement === backButton() ? root.current : backButton())?.focus({ preventScroll: true });
    else if (a === "activate") {
      if (document.activeElement === backButton()) close();
      else (choice === 0 ? openRoom : openProjects)();
    }
    else if (["up", "left", "down", "right"].includes(a)) {
      root.current?.focus({ preventScroll: true });
      setChoice(a === "up" || a === "left" ? 0 : 1);
    }
  };
  useEditorActions(route);
  return <main ref={root} tabIndex={-1} className="game-ui menu-surface garage-editor" aria-label="World Editor" onKeyDown={e => { if (e.key === "Tab") e.preventDefault(); }}>
    <GarageEntryHeader showBrand backAction={{ label: "Back to Garage", busy: false, onBack: close }} />
    <section className="garage-project-choices" aria-label="World Editor destinations">
      <Tool label="Edit garage" press={openRoom} selected={choice === 0}><Icon name="translate"/>Edit garage</Tool>
      <Tool label="World projects" press={openProjects} selected={choice === 1}><Icon name="layers"/>World projects</Tool>
    </section>
  </main>;
}

function RoomEditor() {
  const { layout, savedLayout, status, error } = usePersonalGarage();
  const selected = useGarageEditor(s => s.selected);
  const [history, setHistory] = useState<GarageRoomLayout[]>([]);
  const reportPlacement = useScreenNotice();
  const historyOwner = usePersonalGarage.getState().owner;
  const active = useRef(true);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    active.current = true;
    root.current?.focus({ preventScroll: true });
    return () => {
      active.current = false;
      const state = usePersonalGarage.getState();
      if (state.owner === historyOwner && state.layout !== state.savedLayout) state.revert();
    };
  }, [historyOwner]);
  const busy = status === "saving";
  const disabled = !savedLayout || busy || status === "loading";
  const record = (previous: GarageRoomLayout) => setHistory(items => [...items.slice(-23), previous]);
  function cancel() {
    if (usePersonalGarage.getState().status !== "saving") usePersonalGarage.getState().revert();
    close();
  }
  async function save() {
    if (disabled) return;
    const owner = usePersonalGarage.getState().owner;
    try {
      await usePersonalGarage.getState().save();
      if (active.current && owner === usePersonalGarage.getState().owner && useGarageEditor.getState().page === "room") close();
    } catch { /* The store retains the draft and exposes the server error. */ }
  }
  function changeItem(delta: number) {
    const i = GARAGE_PROP_IDS.indexOf(useGarageEditor.getState().selected);
    selectGarageProp(GARAGE_PROP_IDS[(i + delta + GARAGE_PROP_IDS.length) % GARAGE_PROP_IDS.length]);
    reportPlacement("");
  }
  function cycleHeader(delta: number) {
    const back = root.current?.querySelector<HTMLElement>(".garage-entry-brand");
    const i = document.activeElement === back ? -1 : GARAGE_PROP_IDS.indexOf(useGarageEditor.getState().selected);
    const next = (i + 1 + delta + GARAGE_PROP_IDS.length + 1) % (GARAGE_PROP_IDS.length + 1) - 1;
    if (next < 0) back?.focus({ preventScroll: true });
    else {
      root.current?.focus({ preventScroll: true });
      selectGarageProp(GARAGE_PROP_IDS[next]);
      reportPlacement("");
    }
  }
  const move = useCallback((id: GaragePropId, pose: GaragePropPose) => {
    const state = usePersonalGarage.getState();
    if (!state.savedLayout || state.status === "saving" || state.status === "loading") return false;
    const old = state.layout[id];
    if (old.x === pose.x && old.z === pose.z && old.yaw === pose.yaw) return false;
    const next = { ...state.layout, [id]: pose };
    const message = garagePlacementError(next) ||
      (isGaragePropOnParkedCar(id, pose) ? "Leave room for your parked vehicle." : "");
    reportPlacement(message);
    if (message) return false;
    state.setLayout(next);
    return true;
  }, [reportPlacement]);
  function shift(dx: number, dz: number, turn = 0) {
    const layout = usePersonalGarage.getState().layout, id = useGarageEditor.getState().selected;
    const current = layout[id], angle = current.yaw + turn * Math.PI / 12;
    const yaw = turn ? Math.atan2(Math.sin(angle), Math.cos(angle)) : current.yaw;
    if (move(id, { x: current.x + dx * .25, z: current.z + dz * .25, yaw })) record(layout);
  }
  function undo() {
    const previous = history.at(-1);
    if (disabled || !previous) return;
    usePersonalGarage.getState().setLayout(previous);
    setHistory(items => items.slice(0, -1));
    reportPlacement("");
  }
  const needsReload = status === "error";
  function reload() {
    reportPlacement("");
    void usePersonalGarage.getState().reload().then(() => setHistory([])).catch(() => {});
  }
  const route = (a: MenuAction) => {
    if (a === "back") cancel();
    if (a === "activate") {
      if (root.current?.querySelector(".garage-entry-brand") === document.activeElement) cancel();
      else if (needsReload && !savedLayout) reload();
      else void save();
    }
    if (busy) return;
    if (a === "previous_tab" || a === "next_tab") cycleHeader(a === "previous_tab" ? -1 : 1);
    if (a === "previous_option" || a === "next_option") shift(0, 0, a === "previous_option" ? 1 : -1);
    if (a === "left" || a === "right" || a === "up" || a === "down") root.current?.focus({ preventScroll: true });
    if (a === "left" || a === "right") shift(a === "left" ? -1 : 1, 0);
    if (a === "up" || a === "down") shift(0, a === "up" ? -1 : 1);
  };
  useEditorActions(route);
  return <main ref={root} tabIndex={-1} className="game-ui menu-surface garage-editor" aria-label="Personal garage editor"
    onKeyDown={e => {
      if (e.key === "Tab") e.preventDefault();
      if (e.code === "KeyZ" && !e.repeat) { e.preventDefault(); undo(); }
    }}>
    <GarageEntryHeader showBrand backAction={{ label: busy ? "Back to Garage" : "Discard changes", busy: false, onBack: cancel }} />
    <GaragePlacementSurface selected={selected} layout={layout} disabled={disabled} move={move} record={record}/>
    <section className="garage-edit-tools" aria-label="Furniture placement">
      <div className="garage-edit-item">
        <Tool label="Previous item" controller="LB" keyboard="Q" press={() => changeItem(-1)} disabled={busy}>‹</Tool>
        <output aria-live="polite">{GARAGE_PROP_LABELS[selected]}</output>
        <Tool label="Next item" controller="RB" keyboard="E" press={() => changeItem(1)} disabled={busy}>›</Tool>
      </div>
      <div className="garage-edit-move">
        <Tool label="Rotate counterclockwise" controller="LT" keyboard="1" press={() => shift(0, 0, 1)} disabled={disabled}><Icon name="rotate"/></Tool>
        <Tool label="Move up" press={() => shift(0, -1)} disabled={disabled}>↑</Tool>
        <Tool label="Rotate clockwise" controller="RT" keyboard="3" press={() => shift(0, 0, -1)} disabled={disabled}><Icon name="rotate"/></Tool>
        <Tool label="Move left" press={() => shift(-1, 0)} disabled={disabled}>←</Tool>
        <Tool label="Move down" press={() => shift(0, 1)} disabled={disabled}>↓</Tool>
        <Tool label="Move right" press={() => shift(1, 0)} disabled={disabled}>→</Tool>
      </div>
      <div className="garage-edit-footer">
        <span data-garage-undo><Tool label="Undo placement" keyboard="Z" controller="Y" press={undo} disabled={disabled || !history.length}><Icon name="undo"/></Tool></span>
        <Tool label="Save layout" controller="A" press={() => void save()} disabled={disabled}>{busy ? "Saving…" : "Save"}</Tool>
        {needsReload && <Tool label="Reload saved layout" controller={!savedLayout ? "A" : undefined} press={reload}>Reload</Tool>}
      </div>
    </section>
    <ScreenNotice message={error || (!savedLayout && status !== "error" ? "Loading your garage…" : "")} />
  </main>;
}

export default function GarageEditor() {
  const page = useGarageEditor(s => s.page);
  const owner = usePersonalGarage(s => s.owner);
  return page === "room" ? <RoomEditor key={owner}/> : <ProjectPicker />;
}
