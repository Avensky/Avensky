import { useId, useState } from "react";
import { FINDER_ACTIONS, FINDER_OBJECTS } from "./emoteFinder";
import "./emoteFinder.css";

const groups = { Actions: FINDER_ACTIONS, Objects: FINDER_OBJECTS };
type BrowseGroup = keyof typeof groups;

export function EmoteFinderShortcuts({ search, onSearch }: { search: string; onSearch: (value: string) => void }) {
  const [open, setOpen] = useState<BrowseGroup | null>(null);
  const id = useId();
  return <div className="emote-finder-shortcuts">
    <div role="group" aria-label="Browse motions" className="emote-finder-toggle">
      {(["Actions", "Objects"] as const).map(group => <button key={group} type="button" className="menu-control"
        data-controller-row aria-expanded={open === group} aria-controls={id}
        onClick={() => setOpen(open === group ? null : group)}>{group}</button>)}
    </div>
    <div id={id} hidden={!open} className="emote-finder-choices" role="group" aria-label={open ?? "Motion shortcuts"}>
      {open && groups[open].map(label => {
        const selected = search.trim().toLowerCase() === label.toLowerCase();
        return <button key={label} type="button" className="menu-control" data-controller-row
          aria-pressed={selected} onClick={() => onSearch(selected ? "" : label)}>{label}</button>;
      })}
    </div>
  </div>;
}
