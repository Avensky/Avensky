import { useMemo } from "react";
import type { CharacterChoice } from "./characterCatalog";
import { importedWardrobeItems, villageWardrobeItems } from "./wardrobeGarments";
import rules from "../../../../packages/wardrobe-catalog/layer-rules.json";
import { buildWardrobeLayerPreview } from "../../../../packages/wardrobe-catalog/wardrobe-layer-preview.mjs";
import "./wardrobeLayerInspector.css";

const catalog = [...importedWardrobeItems, ...villageWardrobeItems];
const labels = {
  candidate: "Proposed",
  suspended: "Saved, not in current preview",
  unmapped: "Saved, class unrecognized",
  retired: "Saved, asset retired",
  preserved: "Saved",
  blocked: "Conflict",
  "needs-fitting": "Fit review needed",
  unverified: "Not visually verified",
  allowed: "Graph only",
} as const;

/** W-06 inspection only: no save, try-on, camera or mesh mutations. */
export function WardrobeLayerInspector({ choice }: { choice: CharacterChoice }) {
  const plan = useMemo(() => buildWardrobeLayerPreview(choice, {catalog, rules}), [choice]);
  return <section className="dressing-layer-inspector" aria-label="Layer compatibility preview"
      data-layer-preview data-review-status={plan.status}>
    <header className="dressing-layer-inspector-header">
      <h3>Outfit stack</h3><small>Read-only preview</small>
    </header>
    <p className="dressing-layer-disclaimer">
      Saved choices stay unchanged. Ordering is proposed, not proof of mesh fit or visibility.
    </p>
    <p className="dressing-layer-base">Base: <strong>{plan.baseOutfitId || "No base outfit"}</strong> · bundled pieces not yet mapped</p>
    {plan.error && <p className="dressing-layer-error" role="alert">
      Invalid layer metadata; original selections are still shown. {plan.error}
    </p>}
    <div className="dressing-layer-summary" data-layer-status={plan.status}>
      <span>{plan.status === "blocked" ? "Review conflicting rules" :
        plan.status === "needs-fitting" ? "Geometry review required" : "No verified fitting evidence"}</span>
      <small>{plan.saved.length} saved selection{plan.saved.length === 1 ? "" : "s"}</small>
    </div>
    {plan.saved.length ? <ul className="dressing-layer-saved" aria-label="Saved garment selections">
      {plan.saved.map(item => <li key={item.source + ":" + item.slot} data-layer-item={item.id}
          data-layer-source={item.source} data-layer-state={item.status}>
        <span className="dressing-layer-item-name">{item.label}</span>
        <small>{item.source === "wardrobeTrial" ? "Trial corset" :
          item.source === "wardrobe" ? "Saved corset" : item.slot}
          {" · "}{labels[item.status]}</small>
        {Object.keys(item.modes).length > 0 && <small className="dressing-layer-modes">
          {Object.entries(item.modes).map(([name,value]) => name + ": " + value).join(" · ")}
        </small>}
        {item.status === "candidate" && <small>{labels[item.reviewStatus]}</small>}
      </li>)}
    </ul> : <p className="dressing-layer-disclaimer">
      This saved look has no separately selected garments. Its built-in outfit layers still use the legacy renderer.
    </p>}
    {plan.removedClothing.length > 0 && <p className="dressing-layer-base" data-layer-removals>
      Legacy removals (preserved): {plan.removedClothing.join(", ")}
    </p>}
    {plan.issues.length > 0 && <details className="dressing-layer-details" data-layer-issues>
      <summary>Compatibility notices ({plan.issues.length})</summary>
      <ul>{plan.issues.map(issue => <li key={issue.code + ":" + issue.garmentIds.join("|")}>
        <strong>{issue.code}</strong>
        <small>{issue.garmentIds.join(" + ")}{issue.regions.length ? " · " + issue.regions.length + " regions" : ""}</small>
        <span>{issue.message}</span>
      </li>)}</ul>
    </details>}
    {plan.regions.length > 0 && <details className="dressing-layer-details" data-layer-regions>
      <summary>Proposed region order ({plan.regions.length})</summary>
      <ul>{plan.regions.map(region => <li key={region.id} data-region={region.id}>
        <strong>{region.label}</strong><small>{labels[region.status]}</small>
        <span>{region.hasCycle ? "Order conflict; no valid stack" : region.orderedIds.join(" → ")}</span>
      </li>)}</ul>
    </details>}
    {plan.occlusionIntents.length > 0 && <p className="dressing-layer-base">
      Coat coverage intents: {plan.occlusionIntents.some(x => x.intent === "expose-opening")
        ? "Open-front exposure proposed" : "Potential coverage proposed"} · no skin or cloth hidden
    </p>}
  </section>;
}
