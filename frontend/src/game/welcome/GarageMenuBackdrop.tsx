import { garageBackdrop } from "../../theme/garageEntry";
import { entryAssets } from "./config";

const scene = { __html: garageBackdrop(entryAssets) };

/** Keep the decoded room available when a player returns from a live preview. */
export function GarageMenuBackdrop({ visible }: { visible: boolean }) {
  return <>
    <link rel="stylesheet" href={entryAssets + "/garage-entry.css"} />
    <div className="garage-menu-backdrop" hidden={!visible} aria-hidden="true" dangerouslySetInnerHTML={scene} />
  </>;
}
