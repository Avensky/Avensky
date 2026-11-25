import { useLayoutEffect, useRef } from "react";
import { garageBackdrop } from "../../theme/garageEntry";
import { entryAssets } from "./config";

/** Adopt the startup room before the cover is removed, then keep it behind the menus. */
export function GarageMenuBackdrop({ visible }: { visible: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = host.current!;
    if (!node.firstElementChild) {
      const startup = document.querySelector("#startup-screen avensky-garage-room");
      if (startup) node.append(startup);
      else node.innerHTML = garageBackdrop(entryAssets);
    }
    if (typeof ResizeObserver !== "undefined" && !customElements.get("avensky-garage-room"))
      void import("./garageRoomElement").catch(() => { /* The room still has its first frame. */ });
  }, []);
  return <>
    <link rel="stylesheet" href={entryAssets + "/garage-entry.css"} />
    <div ref={host} className="garage-menu-backdrop" hidden={!visible} aria-hidden="true" />
  </>;
}
