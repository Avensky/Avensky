import { useLayoutEffect, useRef } from "react";
import { mountGarage } from "../preview/LiveGarage";
import { entryAssets } from "./config";

export function GarageMenuBackdrop({ visible }: { visible: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const slot = host.current!;
    let room = document.querySelector<HTMLElement>("[data-live-garage]");
    if (!room) {
      room = document.createElement("div");
      room.className = "garage-entry-scene";
      room.dataset.liveGarage = "";
    }
    // The public form, startup shell and menus pass this exact mounted root forward.
    if (room.parentElement !== slot) slot.append(room);
    mountGarage(room);
  }, []);
  return <>
    <link rel="stylesheet" href={entryAssets + "/garage-entry.css"} />
    <div ref={host} className="garage-menu-backdrop" hidden={!visible} aria-hidden="true" />
  </>;
}
