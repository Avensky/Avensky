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
