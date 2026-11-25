# Next character assets for the internal alpha

These are **experiments**, not release blockers or purchases. The goal is to test whether a model is worth keeping before buying production rights. Avoid manual S3 release approval or separate GitHub feature flags: export/fit → private automatic uploader → catalog metadata → merge to main → inspect staging.

## 1. Curly hairstyle candidate

**Status:** candidate / needs fitting and in-app visual test, not yet accepted.

- Use the previously considered curly-hair pack or a better source if the visual quality of strands and curls warrants it. Source licensing and commercial tier are **not confirmed**.
- Fit the curl volume, scalp seam and hairline to the existing female hero and head movement; preserve natural curl silhouette rather than deforming straight hair into curls.
- Compare real-texture strands, dark-to-light color accents and balayage variants under the wardrobe lighting and real mobile LODs.
- Test headwear compatibility, clipping at shoulders/collars, turntable rotation, poses, hair recoloring and frame time; a failed test is useful evidence, not a staging failure.
- Do not buy commercial rights merely to see if the pack works; determine what the specific evaluation license permits, and only license/replace it if selected for distribution.

## 2. Donor-derived Asian facial structure variant

**Status:** donor geometry identified previously; export/integration and visual fit remain to be completed. Exact source provenance and license not established in this document.

- Reuse donor-derived facial topology and rig-compatible data where permitted; **do not replace the hero identity or break the 88-joint body rig**.
- Prototype a customizable facial variant with individually adjustable eyelids, nose bridge, cheeks, jaw and face proportions, rather than treating a broad population as one fixed face template.
- Audit eye/mouth blink and expression shapes, skin material seams, hairstyle/scalp fitting, portrait camera, dressing room and mobile LODs.
- Test hair and facial variants together, including the curly candidate, before deciding which to keep.
- Keep original donor source privately stored, track derivative provenance and licensing before external release.

## Definition of done for **testing**, not publishing

- Assets are inspectable in the authenticated staging wardrobe/identity editor, with no per-model enablement flag or manual verified-manifest step.
- Visible outcomes noted: working, clipping, too heavy, reject, revise, or keep for alpha.
- Production decisions are deferred; when a model is chosen to ship, revisit its source license and any individual/company-size thresholds using [asset clearance](ASSET_CLEARANCE.md).

Neither candidate should delay staging UI, physics, or wardrobe code updates.
