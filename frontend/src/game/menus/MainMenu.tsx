import { useCallback, useEffect, useRef } from "react";
import { ControlGlyph } from "../../components/controller/ControlGlyph";
import { GameButton } from "../../components/GameButton";
import type { MenuAction } from "../../controls/inputRouting";
import { useUIStore } from "../../store";
import { registerGarageMenuMarker } from "../preview/garageMenuMarkers";
import { useGarageParking } from "../preview/garageParkingStore";
import { useGarageParkingVehicle } from "../preview/garageParkingVehicle";
import { GarageDriveOverlay } from "./GarageDriveOverlay";
import { GarageOrbitSurface } from "../preview/GarageOrbitSurface";
import { nextGarageStation } from "./garageStationNavigation";
import { GarageEntryHeader } from "../welcome/GarageEntryHeader";
import { MAIN_MENU_ITEMS } from "./menuItems";
import "./garageMainMenu.css";

// Keep marker registration stable while focus, controller hints or status change.
const stationRefs = MAIN_MENU_ITEMS.map(({ id }) => (element: HTMLDivElement | null) => {
  registerGarageMenuMarker(id, element);
});

export function MainMenu() {
  const driving = useGarageParking(state => state.driving);
  return driving ? <GarageDriveOverlay /> : <GarageStations />;
}

function GarageStations() {
  const vehicle = useGarageParkingVehicle();
  const selectedIndex = useUIStore(state => state.selectedMenuIndexById.main);
  const joining = useUIStore(state => state.mainWorldJoining);
  const error = useUIStore(state => state.mainWorldError);
  const root = useRef<HTMLElement>(null);
  const stations = useRef<HTMLElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const touchStart = useRef<{ pointerId: number; selected: number } | null>(null);

  const back = () => useUIStore.getState().setScreen("welcome");
  const continueSelection = useCallback(() => {
    const ui = useUIStore.getState();
    if (ui.mainWorldJoining) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && root.current?.querySelector("header")?.contains(focused)) focused.click();
    else ui.activateActiveMenuSelection();
  }, []);

  useEffect(() => {
    function focusStation() {
      stations.current?.querySelector<HTMLElement>('[data-selected="true"]')?.focus({ preventScroll: true });
    }
    focusStation();
    function route(event: Event) {
      const action = (event as CustomEvent<MenuAction>).detail;
      event.preventDefault();
      if (useUIStore.getState().mainWorldJoining) return;
      const active = document.activeElement as HTMLElement;
      const header = root.current?.querySelector("header");
      if (action === "previous_tab" || action === "next_tab") {
        const tabs = Array.from(header?.querySelectorAll<HTMLElement>('[role="button"]') ?? []);
        const index = tabs.indexOf(active);
        const direction = action === "next_tab" ? 1 : -1;
        const next = index < 0 ? (direction > 0 ? 0 : tabs.length - 1) : (index + direction + tabs.length) % tabs.length;
        tabs[next]?.focus({ preventScroll: true });
      } else if (action === "activate") continueSelection();
      else if (action === "back") back();
      else if (stations.current && (action === "left" || action === "right" || action === "up" || action === "down")) {
        if (!stations.current.contains(active)) focusStation();
        else {
          const buttons = Array.from(stations.current.querySelectorAll<HTMLElement>('[data-station-anchor] [role="button"]:not([aria-disabled="true"])'));
          const next = nextGarageStation(buttons, active, action);
          if (next !== active) next?.focus({ preventScroll: true });
        }
      }
    }
    window.addEventListener("avenlab:main-menu-action", route);
    return () => window.removeEventListener("avenlab:main-menu-action", route);
  }, [continueSelection]);

  return <main ref={root} className="game-ui menu-surface menu-home main-menu garage-main-menu relative z-30" aria-label="Garage"
    onKeyDown={event => { if (event.key === "Tab") event.preventDefault(); }}
    onPointerMove={event => {
      if (event.pointerType !== "mouse" || event.buttons || joining) return;
      // Track the cursor over the whole room: a label passing beneath a parked mouse
      // during a controller camera move must not steal focus.
      if (pointer.current?.x === event.clientX && pointer.current.y === event.clientY) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      if (event.target instanceof HTMLElement) event.target.closest<HTMLElement>(".garage-station-button")?.focus({ preventScroll: true });
    }}>
    <GarageOrbitSurface />
    <GarageEntryHeader showBrand menu={{ busy: joining, onBack: back, onOpen: screen => useUIStore.getState().setScreen(screen) }} />
    <section ref={stations} className="garage-menu-stations" aria-label="Garage stations">
      <div className="garage-menu-markers">
        {MAIN_MENU_ITEMS.map((item, index) => <div key={item.id} ref={stationRefs[index]}
          className="garage-station-anchor" data-station-anchor={item.id}>
          <GameButton variant="custom" className="garage-station-button" selected={selectedIndex === index}
            aria-label={item.label} aria-pressed={selectedIndex === index}
            aria-description={item.id === "world_editor" ? "Build and test drive your own world" : undefined} disabled={joining}
            onPointerDownCapture={event => {
              if (event.pointerType === "touch" || event.pointerType === "pen") {
                touchStart.current = { pointerId: event.pointerId, selected: useUIStore.getState().selectedMenuIndexById.main };
              }
            }}
            onPointerCancel={() => { touchStart.current = null; }}
            onFocusCapture={() => useUIStore.getState().setActiveMenuIndex(index)}
            onPress={event => {
              const ui = useUIStore.getState();
              if (ui.mainWorldJoining) return;
              const pointerEvent = event.nativeEvent;
              const touch = "pointerType" in pointerEvent && (pointerEvent.pointerType === "touch" || pointerEvent.pointerType === "pen");
              const start = touchStart.current;
              const previous = touch && start && "pointerId" in pointerEvent && start.pointerId === pointerEvent.pointerId
                ? start.selected : ui.selectedMenuIndexById.main;
              touchStart.current = null;
              ui.setActiveMenuIndex(index);
              if (touch && previous !== index) event.currentTarget.focus({ preventScroll: true });
              else ui.activateActiveMenuSelection();
            }}>
            <span className="garage-station-face chamfered-frame">
              {item.label}
              {item.id === "world_editor" && <small className="garage-station-caption">Build · Test drive</small>}
            </span>
          </GameButton>
        </div>)}
      </div>
    </section>
    {(joining || error) && <p className="garage-menu-notice" role={error ? "alert" : "status"}>
      {joining ? "Entering the Harbor…" : error}
    </p>}
    <GameButton variant="custom" className="garage-menu-drive" data-garage-drive-start
      aria-label={vehicle.loaner ? "Drive loaner BRZ" : "Drive " + vehicle.name}
      disabled={joining} onPress={() => useGarageParking.getState().start()}>
      <ControlGlyph controller="X" keyboard="F" />{vehicle.loaner ? "Drive loaner BRZ" : "Drive"}
    </GameButton>
    <GameButton variant="custom" className="garage-menu-continue" aria-label="Continue"
      disabled={joining} onPress={continueSelection}><ControlGlyph controller="A" />Continue</GameButton>
  </main>;
}
