import { useRef, useState } from "react";
import { useSocialStore } from "../../store/social/socialStore";
import { useBuilderStore } from "../../worldBuilder/state/builderStore";
import { applyEditorDraft } from "./applyEditorDraft";
import { closeWorldBuilder, loadSavedWorldDraft } from "../../worldBuilder/state/builderActions";
import { useUIStore } from "../../store/menus/uiStore";
import { useAlphaStore } from "../../store/alpha/alphaStore";
import {
  useSelectionStore,
} from "../../store/selection/selectionStore";
import { useWorldCatalog } from "../../store/selection/worldCatalog";

/** Explicit apply, not pointer-move uploads. Rust validates/builds a complete
 * replacement before swapping only the editor runtime and resetting its car. */
export function EditorTestAction() {
  const active = useSocialStore((s) => s.view?.alpha?.active),
    source = useBuilderStore((s) => s.doc),
    installed = useWorldCatalog((s)=>s.maps);
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const worlds = useSocialStore(s => s.view?.worlds);
  const targets = worlds?.filter(w => w.can_edit && w.map === source?.map_id) ?? [];
  const [target, setTarget] = useState<number>();
  const chosen = targets.find(w => w.id === target);
  const pending = useRef(false);
  const test = async () => {
    if (pending.current) return;
    if (active?.mode !== "editor") {
      const map = useWorldCatalog.getState().maps.findIndex((m) => m.id === source?.map_id);
      closeWorldBuilder();
      if (map >= 0) useSelectionStore.setState({ mapIndex: map });
      useAlphaStore.getState().chooseMode("editor");
      useUIStore.getState().setScreen("hero_select");
      return;
    }
    pending.current = true;
    setBusy(true);
    setStatus("");
    try {
      await applyEditorDraft(chosen?.id);
      closeWorldBuilder();
      useUIStore.getState().closeOverlay();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="le-live-test">
      {active?.mode === "editor" && targets.length > 0 && <>
        <label>Save destination<select value={chosen?.id ?? ""} disabled={busy} onChange={e =>
          setTarget(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">Test session only</option>
          {targets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select></label>
        {chosen && <button type="button" className="le-button" disabled={busy}
          onClick={async () => {
            if (pending.current) return;
            setBusy(true); pending.current = true;
            try { await loadSavedWorldDraft(chosen.id, chosen.map); setStatus("Saved world loaded"); }
            catch (e) { setStatus((e as Error).message); }
            finally { setBusy(false); pending.current = false; }
          }}>Load saved world</button>}
      </>}
      <button
        type="button"
        className="le-button"
        disabled={busy || !source || !installed.some((map)=>map.id===source.map_id)}
        onClick={() => void test()}
        title="Validate the current draft, rebuild only your isolated editor physics world, and reset your test vehicle."
      >
        {busy
          ? "BUILDING PHYSICS…"
          : active?.mode === "editor"
            ? (chosen ? "SAVE WORLD & TEST DRIVE" : "APPLY & TEST DRIVE")
            : "RESERVE LIVE EDITOR"}
      </button>
      {status && <span role="status">{status}</span>}
    </div>
  );
}
