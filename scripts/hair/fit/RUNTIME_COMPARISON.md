# Vesper scalp diagnostic — developer/staging comparison

This is a **temporary, opt-in runtime comparison** of existing hair foundations, not the new fitted scalp mesh. It does not change the default hair, hat or bonnet experience, and it does not affect saved character choices.

## Findings from the existing code
- `villagerModel.ts` defines `villager-short-hair`: small procedural ellipsoid attached to `head`, shown for crop mode.
- The same file defines `villager-scalp-cap`: a separate procedurally shaped sphere shell with bonnet-specific approximate dimensions. It is created only for garments with `scalpCap: true`, presently `hood-07`.
- `SpaceBunsPreview.tsx` normally hides imported hair parts with material ending in `Crown backing`, and hides the original short hair and braid. This may reveal gaps; **visual confirmation still required**.
- No inspected code proves the source Vesper GLB contains a complete scalp under its face mesh. Do not claim the runtime sphere is an original authored scalp.

## Compare the same hairstyle and camera (development or staging builds only)
Open the character wardrobe in a development or staging build with an **imported hairstyle selected** (not the stock braid). Use the query string parameter `hairScalpAudit`; reload for each mode.

| URL query | What is visible |
| --- | --- |
| no query | Existing behavior, unchanged |
| `?hairScalpAudit=baseline` | Existing imported hair, backing hidden, cap unchanged |
| `?hairScalpAudit=backing` | Imported hair including matching material named `Crown backing`; original legacy cap unchanged |
| `?hairScalpAudit=legacy-cap` | Imported hair with existing legacy cap, creating a temporary legacy cap only if missing |
| `?hairScalpAudit=cap-only` | Cap only, all imported hair components hidden (stock braid remains hidden by the existing preview system) |

These modes do not add a menu or change the selected style, user profile or camera store. They are enabled by the application build's `DEV` flag or the Vite `staging` mode and **ignored in production**. The temporary cap is removed and its resources disposed when the preview unmounts; any pre-existing cap has its visibility restored.

Example path: `/path/to/character?hairScalpAudit=backing`. Keep any existing route and query parameters (e.g. use `&hairScalpAudit=backing` if a query already exists).

Record the same six views for every mode: front, back, left, right, top, three-quarter. Make screenshots with the same hair color and lighting. Also record hairline/temple gaps, crown holes, unwanted bonnet-shaped hard boundaries, card alpha halos, and head rotation. Try one **Space Buns** style and one of the twelve installed imported styles.

**Caveat:** The development/staging preview uses the existing bonnet-era cap as a diagnostic reference only. The next actual geometry build must be based on measured head/hairline geometry in Blender and use a per-style fit mask (not a global scalp sphere). If a vendor hair needs its original crown backing, preserve/reuse it instead of rebuilding a worse shell.

## Non-production testing
```sh
cd frontend
node --test tests/hair-scalp-audit.test.mjs
npm run typecheck
```

The tests exercise query parsing and the production guard. They do **not** test appearance, Blender geometry, actual GPU timing or source GLB nodes. These still require local browser/Blender execution. Current branch changes do not publish or deploy anything.

## Failure handling
- If `backing` makes the hair appear like an obvious helmet: restore the normal view; backing isn't suitable for this style as-is.
- If `legacy-cap` intersects forehead/ears: keep it as a negative control, not a fitting solution.
- If no material is named `Crown backing`, the backing mode can look identical to baseline. Verify actual imported mesh/material names.
- If a cap is already present because a hood is equipped, no second cap is made; isolate headwear for a cleaner test.
- If no imported hairstyle is installed or rig compatibility fails, the preview's usual fallback applies and there is nothing meaningful to compare.
