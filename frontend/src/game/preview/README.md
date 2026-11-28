# Vehicle-selection garage

Sign-in, character selection, the Play menu, and Heroes share the live `/models/world/garage_special.glb` object. `LiveGarage.tsx` owns the canvas, the room and the entry camera. `prepareGarageDisplay.ts` applies material changes to the authored meshes. Changes here apply to every garage screen. VehiclePreview adds its actors, camera and optional turntable to that same scene. The empty room renders on demand. Its mechanics floor uses the original continuous slab in BASE_Full. The vehicle owns the display disk and its reflection, so removing the car exposes the same slab.

## How to edit

To change selection-stage placement, edit previewPlacement.ts / garagePlacement.ts. For a placeable garage, change worldBuilder/models and rebuild measured placement colliders; preview decoration must not become guessed physics.

Garage and Wardrobe share camera icons through `PreviewCameraViewIcon`.
Vehicle views use `PreviewCameraSelect` inside the `PreviewCameraAngles`
popover, which owns keyboard focus, Escape and controller Back. Wardrobe uses
`FittingCameraSelect` for the vertical rail of body shots and garment close-ups.
Its inner rotation controls turn the actor, and the outer pair orbit the room.
Adjust shared control styles in
`previewControls.css` and palette colors in the [theme catalog](../../theme/README.md).

## Heroes vehicle loading

The Heroes roster, Identity, and Appearance use a compressed BRZ generated from
the installed full model before frontend dev/build. The preview retains the
named parts, paint materials, and embedded textures. Rebuild it directly with
`node frontend/scripts/build-heroes-vehicle-previews.mjs` from the repository
root. A sparse checkout can use the normal vehicle loader.

Opening the vehicle garage or Emotes requests the original model. The roster
car stays visible until the detailed geometry is ready, and the stage keeps that
car when you return to the same hero. A cold custom header portrait uses the
existing cached image or factory art until the garage opens. Verify the roster
and detailed garage at the same angle before enabling another vehicle.
