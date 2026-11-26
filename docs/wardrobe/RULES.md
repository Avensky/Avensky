# Wardrobe rules: deterministic compatibility contract

**Status:** Proposed design v1.3 (2026-11-25). Numeric values are initial targets, **not measured acceptance**. Existing live behavior still differs.
**Owner:** This is the one normative source for layer and deformation rules. [Testing](TESTING.md) owns the executable acceptance matrix.

## 1. Vocabulary and strict invariants

- `equipped`: saved garment ID and appearance data. Must not be silently deleted by an outer garment or visibility decision.
- `active`: part of a valid resolved outfit, available to renderer/fit checks.
- `visible`: fully or partly exposed after pose-aware coverage, transparency and garment state are considered.
- `allowed`: structurally valid combination, with a verified fit profile if needed to ship.
- `needs-fitting`: permitted in theory but no passing fit/pose evidence for this exact relationship.
- `blocked`: incompatible or invalid as configured. Return stable reason codes and actionable alternatives.
- `hidden`: render-only occlusion, never an implicit `unequip`.
- `slot`: item-selection identity (e.g., coat); `region`: geometric overlap (e.g., forearm); `mode`: explicit user/asset option (e.g., coat open/closed, corset tucked/over).

Always keep `equipped` records, `resolved` active records and `render visibility` separate. A block MUST NOT erase data. UI must show an explanatory conflict and let the user remove/switch an item. Unknown classes, unsupported fit modes and unverified pairings default to `needs-fitting`, not `allowed`. Invalid schemas, impossible cycles, wrong skeletons or unsafe geometry are `blocked`.

A valid garment classification, source hash and compatible skeleton/rig are prerequisites for fitting. A catalog entry by itself proves neither rig validity nor collision-free wear.

## 2. Regions and ordering

Build an order graph **per overlapping region**, not a single global depth scalar. Recognized region keys:
`neck`, `torsoFront`, `torsoBack`, `leftShoulder`, `rightShoulder`, `leftUpperArm`, `rightUpperArm`, `leftForearm`, `rightForearm`, `waistFront`, `waistBack`, `hips`, `crotch`, `leftThigh`, `rightThigh`, `leftKnee`, `rightKnee`, `leftCalf`, `rightCalf`, `leftAnkle`, `rightAnkle`, `leftFoot`, `rightFoot`, `head`.

| Region | Default inward -> outward order, only when overlapping |
| --- | --- |
| Torso | body -> underwear -> undershirt -> top/dress bodice -> structured corset/vest -> coat/jacket |
| Arms | body -> under-sleeve -> top/dress sleeve -> jacket/coat sleeve |
| Waist | body -> underwear -> top -> corset/skirt waistband (explicit mode governs) -> belt -> coat |
| Hips | body -> underwear -> fitted pants or petticoat -> skirt/gown shell -> outerwear hem |
| Legs | body -> hosiery -> pants -> optional over-pants skirt/gown -> coat hem; boots governed by cuff mode |
| Feet | body -> stocking -> sock -> shoe inner -> shoe outer/sole |
| Neck | body -> inner collar -> outerwear collar -> outside scarf; explicitly tucked scarves invert final relation |
| Head | scalp/hair -> hat/hood only with a validated hairstyle/headwear mode |

Default order is **not** permission for conflicting silhouettes. Paired item rules and validated item-specific overrides control specific intersections. Evaluate only shared regions. Graph cycles or two unresolved incompatible mode requests are `blocked:ORDER_CYCLE` / `blocked:MODE_CONFLICT`. Never resolve by file order, garment ID sorting or last-writer-wins.

Precedence: explicit valid item-mode override > validated garment-family rule > default region ordering > `needs-fitting:UNKNOWN_RELATION`. Reject overrides that contradict locked geometry or create a cycle.

## 3. Pairwise compatibility matrix

Legend: **A** = allowed in principle but requires profile evidence before Hero/NPC approval; **F** = needs-fitting until pair-specific test passes; **B** = blocked unless an explicit approved special mode changes it. This is design intent, **not evidence that any currently installed asset passes**.

| Inner garment | Outer garment | Default | Required mode/rule |
| --- | --- | --- | --- |
| Shirt/top | Coat/jacket | F | Coat OVER torso and sleeves; open/closed independent of shirt selection |
| Shirt/top | Corset/underbust vest | F | Corset OVER shirt; protect top neckline/armholes and corset straps/laces |
| Bra/undershirt | Corset | F | Corset OVER underlayer, or corset direct-to-body where deliberately designed |
| Corset + top | Coat/jacket | F | Coat OVER both; size against final composite shell, not body only |
| Dress/gown bodice | Coat/jacket | F | Coat OVER bodice and sleeves; hem silhouette may require special coat cut |
| Dress/gown bodice | Corset | F | Explicit `over-dress` corset mode; corset MUST NOT replace the dress |
| Fitted top | Dress/gown | B | Default conflict on torso; `underdress` or pinafore/tunic profile may permit |
| Pants | Tunic/short dress | F | `over-pants` profile and coverage; independent pants selection |
| Pants | Full closed gown | B | Enable only for authored gown+trouser profile and test it |
| Petticoat/slip | Skirt/gown | F | Outer shell OVER petticoat; required edge/hem and seated clearances |
| Skirt waistband | Corset | F | `corset-over-skirt` puts corset hem OUTSIDE waistband |
| Corset hem | Skirt waistband | F | `corset-tucked` puts corset UNDER waistband, preserving actual trim |
| Top sleeve | Coat sleeve | F | Coat sleeve OUTSIDE, with correct cuff/shoulder motion |
| Gloves | Jacket/coat cuff | F | `glove-under-cuff` OR `gauntlet-over-cuff` per item, never both on same region |
| Waist belt | Coat | F | `belt-under-coat` default; `belt-over-coat` requires external coat cinch profile |
| Belt | Corset/skirt/pants waistband | F | External belt OVER chosen host; don't wrap all overlapping waistbands blindly |
| Scarf | Jacket collar | F | `outside` or `tucked`; collar/hair/neck contact required |
| Stockings | Socks | F | Socks OVER hosiery, avoid duplicated opaque skins |
| Socks/stockings | Shoes | F | Shoes OVER all equipped sock/hosiery surfaces; sole remains rigid |
| Pants cuff | Boot shaft | F | Explicit `pants-tucked-into-boots`: boot shaft OUTSIDE cuff |
| Boot shaft | Pants cuff | F | Explicit `pants-over-boots`: sufficiently wide pants OUTSIDE shaft |
| Slim pants | Bulky high boots | B | Block unless specific compatible cuff/shaft variant passes |
| Hood | Hair/headwear | F | Hood style must support hairstyle and optional under-hat mode |
| Rigid armor shoulder | Narrow coat | B | Require purpose-built coat/armor compatibility profile |
| Harness/bag strap | Coat/corset | F | Attach over/under per authored routing and preserve hard pieces |

Item-specific asset metadata may override the default **only** after fit evidence, e.g. a coat authored for a wide skirt. Do not infer fitting from filenames such as "loose" or "gothic".

## 3a. Dependent garment lifecycle

The machine-readable manifest also describes **parent/child dependency lifetimes**. A dependent underlayer may be derived from an outfit (such as a bundled petticoat following a skirt) or explicitly chosen by the player. On parent removal, only a derived selection can be automatically removed; an explicit selection remains saved but may become inactive until supported by another equipped parent. With several potential parents (e.g. skirt and gown), a child should become inactive only when **no eligible active parent remains**. This schema does not activate that runtime behavior until W-04/W-05.

## 4. Mode semantics and visibility

### Coats / jackets
- Modes: `open`, `closed`; `partial` only when the mesh actually has an authored transition/fit.
- `open`: expose underlying valid layers through openings and at moving sleeves/collars; do not mask exposed skin.
- `closed`: occlusion may hide verified fully covered triangles; the shirt/corset remains equipped and active.
- Changing mode must not change top, corset, dress, dye, save ID, or unrelated fitting-room camera state.
- Coat fitted surfaces are measured against the **composite underlying shell**, with author-defined drape room. Do not forcibly shrink underlayers.

### Corsets / skirts / tops
- A corset worn over a shirt is **distinct** from legacy corset-as-top replacement. Use explicit `over-top` / `direct` intent; keep legacy default until migrated.
- At waist, `tucked` = corset hem inside skirt waistband, `over` = corset outside. Each requires its own verification; neither has automatic priority across the whole torso.
- Top under a dress is not allowed by default unless tagged `underdress`/`pinafore` and reviewed.
- Removing top re-exposes appropriate underwear; removing skirt may remove dependent petticoat according to explicit dependency settings, not a global clothing deletion.

### Sleeves, cuffs, belts, boots
- Sleeves are collision-tested in raised-arm, crossed-arm, reaching and seated/steering poses. Coat sleeves normally cover top sleeves. Use separate cuffs and elbow regions; no full-sleeve resizing to hide one crease.
- Belt mode `under-coat` is default. `over-coat` must reference a coat cinch surface and must not permanently constrict coat panels. A belt anchored to pants remains on pants when the coat is removed.
- Boot/Pants mode is an **exclusive choice** at each ankle: `pants-tucked-into-boots` or `pants-over-boots`. Each side must use consistent intended mode unless asymmetry is explicitly authored. No runtime automatic toggling from pose to pose.
- Sock and stocking combination retains both equipped IDs; hidden toe polygons may be skipped only with proven coverage.

### Gowns and dresses
- Full-length gowns prefer an unbroken outer skirt silhouette. The coat may cover only torso and upper arms if its length stops above the gown's lower drape; different regions can have different outermost garments.
- An authored inner lining, slip or petticoat is treated as its own dependent layer for collision and removals. Hidden lining intersections are not automatically visible defects.
- Long skirt / gown hem near floor and seated poses require targeted gait, foot and seat clearance checks.

### Occlusion and surface protection
- Occlusion is pose-aware and respects alpha/material opacity and open geometry. Transparent lace and split skirts do not fully mask underlying clothing or skin.
- Preserve source geometry, UV, skin indices/weights, dye channels and stable IDs until an explicit fit operation is approved.
- Detail classes: `deformable` cloth, `follow-parent` trim/laces/buttons, `locked` rigid eyelets/soles/hardware. Hard features may translate/rotate as an assembly but not stretch internally.

## 5. Geometry policy: moderate / controlled

All lengths below are **proposed mm after normalized unit scale and rigid alignment**, never asset-proven limits.

| Region | Soft local vertex movement | Hard local movement |
| --- | ---: | ---: |
| Corset torso / cups / straps | 6 / 4 / 4 | 15 / 10 / 8 |
| Top torso / armhole / sleeve | 8 / 4 / 10 | 18 / 10 / 25 |
| Skirt waistband / hips / hem | 8 / 12 / 20 | 20 / 30 / 45 |
| Pants waist / crotch / knee | 8 / 5 / 10 | 20 / 12 / 25 |
| Shoe upper | 2 | 6 |
| Gown bodice / lower hem | 8 / 20 | 18 / 50 |

Proposed initial rigid-fit warning: >30 mm translation, >5 degrees rotation, or >2% uniform scale after unit normalization. These are reasons for manual inspection, not automatic clipping of known accepted assets.

Proposed clearance in close-contact regions: corset/torso 2–5 mm, close top 3–7, sleeves 4–8, waistband/underlayer 3–6, hip/skirt 5–12, pants 4–10, crotch 8–15, shoe/foot 1–4, gown lining 6–12. Loose drape deliberately exceeds these bands.

Candidate acceptance: visible skin/waist/armhole exterior exposure >1 mm fails the strict seam regression; isolated other visible contact up to 2 mm goes to review; persistent visible >2 mm fails; >5 mm visible, inverted triangles, damaged rig, or invalid geometry is critical. Hidden intended contacts are assessed separately with coverage logic. Use penetration/sign-aware intersections, not just unsigned nearest-point distances.

Preserve edge lengths: proposed fabric soft 2% / hard 4%; structured corset soft 1% / hard 2%. No inverted triangles, UV tearing or broken stitches. Existing accepted authored fits with wider motions remain **versioned exceptions** until revalidated; do not overwrite accepted shape because the new default is smaller.

Existing skirt fit algorithms contain different numbers (e.g. high-waist ceilings and hem extensions). New generic rules must not silently supersede accepted fixture behavior. See [DECISIONS.md](DECISIONS.md).

## W-03 shared manifest representation

The [machine-readable class defaults](../../packages/wardrobe-catalog/layer-rules.json), [schema](../../packages/wardrobe-catalog/layer-rules.schema.json), and [validator](../../packages/wardrobe-catalog/validate-layer-rules.mjs) implement structural checks, known modes, and conditional per-region order cycles. They do **not** implement runtime outfit resolution or imply a passed visual/physics fit. Class IDs are distinct from existing saved garment slots; mapping and evidence-gated item overrides belong to W-04/W-05.

## 6. Deterministic resolution contract

Inputs: ordered set of **stable garment IDs plus mode selections**, body-profile version, asset revision hashes, target geometry tier, fitted-variant approvals. Output:
- original `equipped` IDs and appearance unchanged;
- `active` IDs (only approved combinations; unresolved combinations remain selected but not approved for use);
- per-region ordered graph and render visibility masks;
- `allowed` / `needs-fitting` / `blocked` per pair with stable reason codes, region and actionable suggestion;
- fit-profile requirements and confidence/provenance.

Algorithm: validate schema and IDs; expand garment regions; merge class defaults + explicit item overrides; collect pair constraints for shared regions; require valid modes; build deterministic DAGs and detect cycles; compute conflict status and pose-aware surface coverage; return resolution **without mutation**. Never auto-unequip or silently replace. No last-write-wins. Same input produces the same sorted output (order using stable region/garment identity only for reporting, not resolving incompatible geometry).

Suggested reason codes: `UNKNOWN_RELATION`, `PAIR_FIT_UNVERIFIED`, `INCOMPATIBLE_CLASS`, `MODE_CONFLICT`, `ORDER_CYCLE`, `MISSING_ASSET`, `RIG_MISMATCH`, `FIT_FAILED`, `RELEASE_NOT_CLEARED`.

**A resolved graph is not proof of physical fit.** Fit acceptance additionally requires [TESTING.md](TESTING.md).

## 7. W-04 resolver behavior and evidence contract

The pure `packages/wardrobe-catalog/resolve-wardrobe-layers.mjs` exports `resolveWardrobeLayers(input, validatedRules)`, `classifyWardrobeCatalogItem(record)`, and `outfitSignature(equipped)`. It does **not** read files, touch GLBs, mutate profile choices, or replace the active `wardrobeGarments.ts` logic. The caller supplies a normalized `equipped` array (stable IDs, class IDs, origin explicit/derived, optional mode choices and source revisions), optional reviewed evidence, the target body-profile ID, pose ID and geometry tier. Legacy saved JSON must not be passed directly until W-05 has a versioned adapter.

The result contains sorted equipped records, per-item `membership` with `active` (no unresolved region relationships), per-region DAG ordering and edges, pairwise `blocked` / `needs-fitting` / `allowed` statuses, stable explanatory issue codes, dependent-layer actions, visibility-evidence states and candidate occlusion hints. **Active is only a pair-layer graph readiness result; it does not imply standalone asset quality, approved gameplay, verified render visibility, mobile testing or redistribution rights.** Any unrecognized garment pairing remains `UNKNOWN_RELATION` / pending review. Conflicts cannot silently unequip garments.

Fit evidence may upgrade a `needs-fitting` relation to `allowed` only when the two stable garment IDs, each source revision, all effective class/item modes, overlapping region, body-profile ID and geometry tier match exactly; the record must include an approved/reviewed fit report ID. The resolver cannot authenticate its caller: integration and publication must independently verify report provenance, actual geometry, and licensing. A blocked class pairing is never overridden by generic evidence; a specifically documented item override first makes it `needs-fitting`, after which item-specific fit evidence is still required.

**Visibility is not inferred from the layer graph.** Without a matching reviewed pose/geometry coverage report, each region stays `unverified`. The resolver supplies only candidate intent (such as `expose-opening` for the front of an open coat, or `may-cover` when closed). A visibility report must match the complete normalized outfit signature including every layer mode/revision, pose, body, tier, and garment revision to avoid reusing a stale hidden-surface mask. Actual pose-aware triangle masking remains W-13.

Derived underlayers may be marked `remove-derived-only` when their parent disappears. Explicitly selected underlayers are never deleted; they may become `inactive` pending an eligible parent. Multiple valid potential parents count; the decision is a **suggested lifecycle action**, not a mutation. Only a later reviewed **runtime integration** may apply dependency actions after W-05 migration and W-07 geometry tests. The W-06 read-only inspector NEVER applies them.

Run `npm run wardrobe:layers:check` (Node 24, no source GLBs required). Tests cover order inversion, blocked modes, 3-layer outfits, evidence freshness, orphaned layers, immutable saves, and deterministic output. See [TESTING.md](TESTING.md) for artifact/pose verification still needed.

## 8. W-05 versioned saved outfit adapter: normative contract

The persisted `CharacterChoice` retains its existing `id`, `outfit`, `wardrobe`, `wardrobeTrial`, `wardrobeEase`, `garments`, `removedClothing`, `bra`, `appearance.item_colors`, hair, identity and all other validated fields. It MAY additionally have `wardrobeLayers` in the following **sidecar-only** v1 shape:

```json
{
  "schemaVersion": 1,
  "entries": [
    {"source": "garments", "slot": "top", "id": "top-02", "modes": {}},
    {"source": "wardrobeTrial", "slot": "corset", "id": "gothic-04",
     "modes": {"waist": "over", "body-fit": "over-top"}}
  ]
}
```

**The sidecar cannot create, equip or remove an item.** Each `source:slot:id` entry MUST correspond to the exactly matching legacy selection in that saved `CharacterChoice`: `garments[slot]`, `wardrobe.set` or `wardrobeTrial.set`. `source` may be `garments`, `wardrobe` or `wardrobeTrial`. For corset entries the slot is always `corset`; `modes.waist` MUST agree with the existing corset waist. No implicit stretch, no guessed `body-fit`, and no automatic conversion from old `shirt: under/over` into an over-top fit.

Mode choice names/values come from [layer-rules.json](../../packages/wardrobe-catalog/layer-rules.json), not independently hard-coded allowlists. The saved metadata has a maximum of 32 unique source/slot entries. Unknown/retired accessories remain in original `garments`; if they lack a recognized class their sidecar entry can contain empty `modes` but cannot gain speculative fit modes. An unverified mode is a **design intent only**, never geometry/appearance clearance.

- **Read:** Old saves without `wardrobeLayers` MUST continue to load unchanged. Neither device nor profile read should add a sidecar silently.
- **Opt-in migrate:** `migrateLegacyOutfit` creates a cloned outfit with v1 sidecar and a class projection; it preserves all original fields and explicit removals. Old selections overridden in today's renderer are flagged `suspended`, not deleted.
- **Mode edit:** `withLegacyLayerMode` may alter only a mode of a currently selected item, not its legacy ID or waistline. Actual fit requires later approved per-item geometry evidence.
- **Revert:** `revertLayerMigration` removes only `wardrobeLayers`, restoring the exact original legacy fields from a valid v1 migration. The server already normalizes obsolete historical `wardrobe.shirt` values to `none` on Rust deserialization; this predates W-05 and must not be mistaken for sidecar-induced loss.
- **Persist:** Rust's existing strict `CharacterChoice` validation now recognizes the optional versioned sidecar, cross-checking source/slot/IDs and mode choices. Invalid versions, unknown fields, stale IDs, duplicate source+slot, contradictory waist and invented modes are rejected. A fitted/look sidecar MUST NOT bypass `is_equippable` or current garment availability rules.
- **Deploy order:** Server support for `wardrobeLayers` MUST ship before any client sends it. On a server version without W-05 support, the field is rejected; clients must keep sending legacy saves until both sides are ready. This review branch does not enable client-side automatic sidecar publishing.
- **Rendering:** W-05 does not connect the new resolver to current `wardrobeGarments.ts`, `clothingPieces.ts`, `SavedOutfits.tsx` or the garage. That requires W-06 and fit evidence. Future coat support must still wait for a non-retired catalog asset and correct rig/LOD testing.

Code: [migration adapter](../../packages/wardrobe-catalog/migrate-legacy-wardrobe.mjs), [save schema](../../packages/wardrobe-catalog/wardrobe-layers-save.schema.json), [shared sample](../../frontend/tests/fixtures/wardrobe-layer-save-v1.json). Test steps belong in [TESTING.md](TESTING.md); this is the sole normative save contract.

## 9. W-06 read-only layer inspector contract

The existing `DressingRoom.tsx` Layers category MAY display the [pure projection](../../packages/wardrobe-catalog/wardrobe-layer-preview.mjs) behind an explicit **Inspect outfit stack** toggle, with the [React panel](../../frontend/src/game/characters/WardrobeLayerInspector.tsx). The panel MUST mount only when opened; opening, closing and browsing MUST NOT call `onChange`, `onTryOn`, networking, storage, camera setters, or mesh setters. The player's original `CharacterChoice` and colors are the source of truth, even when the new versioned metadata is invalid.

The panel MUST distinguish these cases: a **saved selection** is persistent source data; a **suspended selection** is held by the W-05 legacy compatibility projection, not deleted; a **candidate selection** is merely eligible for W-04 relationship checks; **retired/unmapped** selections remain listed but cannot become layer-graph approvals. It MUST label region ordering, coat opening/coverage and compatibility warnings as **proposed**, and MUST NOT equate a no-conflict/single-item graph with verified physical fit or actual rendered visibility. It MUST disclose that bundled base-outfit pieces are not yet decomposed and that neither a mesh review nor a player phone audit was performed.

A proposed garment mode may be displayed if already present in an explicit saved `wardrobeLayers` sidecar; reading legacy `shirt` values or inferring `body-fit` is forbidden. Invalid metadata MUST fall back to an error state while retaining visible raw legacy IDs. No automatic conversion/persist occurs on page load.

The W-06 Outerwear section is currently inspection-only. `coat-01` remains **retired** in the installed catalog, and newly discovered coats MUST NOT gain equip/remove/clear actions until the W-07 per-item mesh and pose QA produces explicit acceptance. Browsing Outerwear MUST preserve the user's current camera. No changes to the old `wardrobeGarments.ts` saved-slot replacement behavior or Rust equippability are authorized by this panel.

**Deferred** (needs separate review): interactive layer-mode controls, backing a draft mode with save/rollback, renderer swapping/occlusion, actual coat fit, mobile screenshot/landscape interaction verification and W-07/13 geometry evidence. See [TESTING.md](TESTING.md#w-06-layer-inspector-acceptance); avoid duplicating this rule in component README files.
