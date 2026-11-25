# Character fitting-room camera and hairstyle audit (2026-11-25)

## Findings from the source audit

- The fitted hairstyle selector used a second, build-injected hair *list* in addition to the existing `packages/wardrobe-catalog/fitted-hair.json` manifest. Each new model must already have a private catalog entry with ID, label, mesh and URL for S3 streaming; the UI now derives the options directly from that single catalog (filtered by installed asset IDs), so adding another catalog record automatically grows the selector without editing UI code or enabling a feature flag.
- The previous `CharacterPage` calculated a new `removedClothing` array when choosing any fitted hairstyle solely to hide the bonnet; this re-created the skinned character and garment setup and could drop the preview during asset loading. The preview now leaves the outfit data untouched and changes bonnet visibility directly on the existing model. The original hairstyle is named **Long braid and bonnet**; choosing it restores the bonnet, while other hairstyles hide it.
- The camera previously obtained its desired world orientation from the *rotating character actor* for Full body, Face and Selected item. A user turn moved the camera around the room, potentially behind opaque walls. In character-only fitting views, its desired direction is now fixed to the authored stage front while actor rotation remains independent; background camera orbit is limited to a safe range.
- Opening **Emotes** also forced a switch from the stable character-only preview to the vehicle stage even when no car interaction was selected. The stage now changes only for true garage/vehicle poses (car door, hood, side mirror, leaning, cockpit or Whole car view), so ordinary gestures and pose browsing remain on the same character stage.
- Tab changes updated `focusRevision` and smooth-slerped the camera from one eye position to another, which could trace a path through garage walls. The fitting camera now cuts to its safe target for tab/preset changes and when an outfit anchor reappears. During temporary wardrobe GLB loading, the last valid framing is retained instead of flying to the generic garage camera.
- `DressingRoom` automatically reset the camera on mount and restored a stale saved state on unmount. Changing Appearance/Body/Details therefore introduced needless camera jumps; only a vehicle-only view is retired when entering the fitting room.

## Regression coverage

`frontend/tests/wardrobe-preview.test.mjs` now checks every fitted catalog style in the preview list, the bonnet's stock-vs-imported behavior and invariance of the character-only camera offset across actor yaw. The staging CI additionally compiles the frontend and exercises existing wardrobe model fitting and receipt/roll-back tests.

## Visual acceptance pass still required on real devices

1. On the authenticated staging site: Characters → Body → Hair. Confirm the menu contains Long braid and bonnet, both legacy fitted styles and all current private-catalog styles. Choose stock → bonnet appears. Choose an imported style → bonnet disappears. Switch back → bonnet returns.
2. At Full body, Face, Hands and Selected item, drag the character through 360°, including while wearing long hair and corsets. The model should rotate inside a fixed camera view without an opaque garage wall or black frame.
3. Switch rapidly between Details, Body, Appearance and Emotes, then switch camera shortcuts and zoom. The preview should remain in frame, preserving the chosen view except when a vehicle-only view is invalid.
4. In Appearance, try dresses, skirts, corsets, hats and Saved outfits, including a model that has not finished loading. The previous character should remain while the next asset streams; changing outfit should not reset the camera outside the garage.
5. Repeat the above on a mobile widescreen viewport with the compact renderer. Review GPU console/context-loss logs and R3F remount warnings if any remaining black frames are observed.

These fixes address code-level causes. **Do not claim visual black-frame elimination until the in-app/mobile check has been performed**. Do not weaken the production asset/license gate or put third-party binaries in GitHub as part of this camera audit.
