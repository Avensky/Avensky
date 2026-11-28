# 12 fitted hairstyles on staging

## Braided Ponytail

The wardrobe exposes Braided Ponytail under the existing `Mia_01` save ID. Its
private staging asset adds a root-to-tip coordinate, variation per strand, and
a section index to the fitted strand mesh. The wardrobe uses these to give
the crown, fringe, sides, face braids, nape, bun, and loose ponytail independent
base, root, highlight, and tip colors. Original colors preserve the baked
material. Mia's Blender color ramps are available as reusable themes.

On this fit, crown volume adds up to 3.5 mm of lift and crown strand width
varies by up to 22% on supported sections. The roots and contact areas carry
zero shape displacement. The character renderer fits the rear lengths and both
front braids once against the selected body and visible torso garments. At the
nape, the body guides the fall past raised collars. The loosened rear lengths
are 28% shorter below the tie and the face braids are 9% shorter below their
roots. Keep the crown, tie, individual tips and source GLB intact. The ends
follow the upper torso through head turns. Motion from the head adds a small
spring displacement, with reduced motion and a parked viewport supported.

For a fit review, check the back and both profiles in a stock dress and a
different top. Turn the head during an emote and check both braids against
the chest, including the transition back to neutral. Compare crown, tie and
the relative lengths of the separate locks with the original Blender groom.

Compatible fitted exports can supply `_AVENSKY_GROOM` as a vertex vector
`[rootToTip, variation, sectionIndex]`. See `hairGroom.ts` for the section order.
Optional `_AVENSKY_GROOM_LIFT` and `_AVENSKY_GROOM_WIDTH` vectors store the maximum
displacement in glTF rest space. Meshes without those channels retain the
shared palette behavior. The GLB travels through the authenticated staging
asset catalog.

Keep the fitted hair registry in `packages/wardrobe-catalog/fitted-hair.json`.
The build exposes installed styles by saved ID and GLB node name. Wardrobe,
roster, garage and portraits bind the selected character's saved style,
palette and groom through the same renderer. Fitted exports may contain
several skinned primitives beneath their named node.

## Fit review, 2026-11-28

We rebuilt a private test mesh from the original Mia Blender groom and
bound its approximately 90,000 vertices to the stock Vesper portrait rig.
We checked 3,311 lower front-braid vertices and 792 lower rear vertices
against the posed body and corset in each of three stances. The stances
were rest and opposing head turns of about 25° with a 5° spine bend.
All sampled points cleared the garment. Side and three-quarter WebGL views
also showed the braids hanging through the space below the chin and meeting
the bodice smoothly.

The initial fit took roughly 0.2–0.4 seconds on the shared QA host.
An 8 mm grid supplies the body and clothing samples once per fitted rig.
Dye changes reuse that fit. Animated frames update a spring and shader offset.
This review used a source-derived test export. Checking the exact private
staging GLB and measuring frame timing on a physical phone remain open.

## Staging release

The staging workflow packages the verified asset manifest with the frontend and
records its release ID in the bundle. Keep the Blender source and fitted GLBs
in the private asset pipeline. A change to thumbnail framing or runtime fitting
can reuse the released models. For a replacement GLB, follow the asset release
and staging procedures. [Private assets](CLOUD_ASSETS.md) · [Staging deployment](STAGING_AUTODEPLOY.md)
