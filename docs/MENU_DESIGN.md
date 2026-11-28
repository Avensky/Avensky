# Avensky’s approved garage menus

Use sign-in, character selection, and character creation as the references for new garage menus. Carry their input behavior and visual language into the final game. Profile uses the same header and navigation rules. Selecting a character opens the Garage. Its four stations are the main menu.

## Each input has a job

| Intent | Controller | Keyboard | Behavior |
| --- | --- | --- | --- |
| Cycle the primary header | LB / RB | Q / E | Move through reachable header tabs in visual order and wrap at the ends. Content tabs open their preview. Back and account actions take focus and wait for confirmation. |
| Cycle a secondary row | LT / RT | 1 / 3 | Switch the visible channels, such as Base, Roots, Highlights, and Tips. Preserve the chosen value when opening another channel. |
| Browse choices and settings | D-pad | Arrow keys / WASD | Follow the visible rows and columns, including after a phone rotates. The left stick also browses creator choices and Profile settings. Up/Down stays in the Profile settings list. |
| Confirm | A | Enter | Activate the focused control once. A tap activates its target directly. Preview an unselected roster character first, then confirm the selected tile to enter. |
| Back or finish editing | B | Esc | Give the open editor or expanded row the first chance to handle Back. Leaving the creator’s name input keeps the text. Use explicit Log out for ending a session. |

Show useful focus on entry. Sign-in starts on Email with the mobile keyboard put away. The roster starts on the active character, or Create character for an empty roster. Accent the actual control so the selection remains visible after switching from touch to a controller. Hover can give the same reversible preview as focus. Reserve navigation away, saving, submitting, and logging out for activation.

Let real text inputs handle typing, autofill, and password managers. While editing, letters such as Q and E belong to the field. Provide a way to tuck the keyboard away, then restore focus to the row. Every action should be reachable with the game bindings alone.

## Layout by screen

| Screen | Keep |
| --- | --- |
| Sign-in | Signed-in players go to character selection. The signed-out screen has the logo and Avensky name flush at the upper left. Email, password with centered eye control, Sign in, and Forgot password form a compact, vertically centered stack of translucent bars. Put status and errors in their own space so the form stays put. Show account actions after authentication. |
| Character selection | Branded header on the left, joined Log out and Profile tabs on the right. Give the outer Profile tab the prominent face and Log out the smaller one. Use portrait tiles and short details beside each portrait. Put Manage on the selected character. Keep the selected actor visible while managing it and as the Garage opens. |
| Garage | Keep the selected character in the room. Frame Enter World at the middle of the three overhead doors opposite the 0999 sign, Wardrobe at the mirror and lockers, Vehicle at the service bay, and World Editor at the map table. Focusing a station moves the camera. On touch, the first tap on a different station previews it. A second tap or Continue opens it. In portrait, use a two-by-two tile grid with the character visible above. Keep the Avensky Back tab at the upper left for returning to the roster, Career, Social and Settings in the joined upper-right header, and Continue at the bottom right. |
| Character creation | The angled Avensky Back control participates in the primary tab cycle. Show visual tiles and swatches, with one caption below Hairstyle, Eyes, and Eyeliner. Keep Continue/Create in a compact bottom-right action with a glyph and open space behind it. Choose the name on Personality. Appearance tabs use quiet emotes. Previewing a personality blends into its gestures and changes the wardrobe while preserving the player’s chosen face, hair, and colors. |
| Profile | Keep the selected character gesturing in the same garage as the roster. Show touch feedback as soon as the player presses the tab, and show loading in the panel while Profile data is pending. Use the branded header for Back. Back closes the open settings row first and then returns to the screen that opened Profile. |

Use the shared angled-header scale and theme tokens. Mirror the right-hand cuts, join adjacent tabs edge to edge, and highlight the tab face or accent edge. Keep icons inside the tab free of extra focus boxes. Use the main menu’s 65% row surface, one continuous border around chamfered edges, short labels, and a clear accent for selection. In a joined stack, cut the upper corners on the first bar and the lower corners on the last. Keep text and glyphs fully legible over the scene.

Keep touch targets at least 44 CSS pixels where the player taps. Use the shared game button for new touch controls, with an accessible name, role, and selected or expanded state. Decorative images and labels stay inert. A single touch release should produce a single action. In landscape, protect controls from curved edges. In portrait, clear the status bar once and extend the garage behind the bottom safe area. Keep mobile text entry from displacing the game canvas.

Delete character belongs to the roster. Open it from Manage, keep the actor in the garage, and identify the character by its saved name. Start the confirmation on Cancel. The player must enter the name exactly, including capitalization, and then activate Delete character separately. Finishing text entry only puts the keyboard away. Use the server’s updated roster to pick the next character or focus Create character when the last slot is deleted.

## Shared header and character names

Use `GarageBrandTab` and `GarageEntryHeader` for the garage menus and the shared angled tab system for scene menus. The A-shaped logo is the first letter of **Avensky**. Place **VENSKY** beside it with letter spacing appropriate to a single word. Preserve the full brand name for assistive technology. The public sign-in header and React menus use the same mark, word spacing and geometry.

Each edge has two sizes. The brand or Back tab on the far left and the outer action on the far right use the taller face. Their neighbors toward the middle use the shorter face, currently five-sixths of the outer height. Switching screens or selecting an inner tab must preserve both heights, the common top line and the outer padding. A screen supplies its actions. Change face heights, slants, wordmark spacing and device insets in the [shared header stylesheet](../frontend/public/images/angled-header.css).

Center icons and letters within the painted face. Give touch controls at least 44 CSS pixels of usable height, including when a short face leaves some of the hit target below it. Apply each safe-area inset once. Keep both corner faces flush to the screen and use the shared inline padding to clear the notch. In portrait, clear the status bar at the header level. Compare the same corner on the roster, in Profile and in the creator at the same viewport and text scale.

Draw one continuous top edge across the joined right tabs and a single diagonal divider at each join, using the same theme accent as the left tab. The outer tab stays prominent. Focus and selection use the lower accent edge. Check the top line and dividers in two contrasting themes and compare the brand position with and without Back, including at a 35 px landscape header height.

Display character names with an initial capital for each part, as in **Vesper Vega** or **O’Neil**. Preserve intentionally mixed spelling such as **McKay**. Use the shared formatter when rendering a character name. Keep the original text for editing, saving and the exact-name deletion prompt. Profile’s **Display name** is the account name and keeps its owner’s spelling. [Character name formatter](../frontend/src/game/characters/characterName.ts)

## From character creation to garage customization

The creator took the fitting room’s visual choices and gave each decision its own tab. Go from Gender → Looks → Skin tone → Hairstyle → Hair color → Eyes → Makeup → Personality. The last step includes the player’s name. Personality changes starter clothing and gestures while retaining earlier appearance choices.

Apply the same pattern when adding a garage option.

1. **Start in the room.** Open Wardrobe from the mirror and lockers and Vehicle from the service bay. Frame the selected character or vehicle in the existing garage. Keep the last valid preview visible while a newly selected asset loads. Use cached images for choice tiles.
2. **Give the decision a place.** Put the major task in the primary header. Use a secondary row for related choices, such as garment categories or paint and lights. Reveal detail for the active choice. Use a collapsible row for occasional controls such as fit details and material adjustments. Keep tab navigation separate from moving through the option grid.
3. **Show what changes.** Crop hair tiles to include the crown and ends, eye tiles to the eyes, and garment or vehicle tiles to the relevant silhouette. Put the active name below the choices when the image conveys the difference. Use the current theme for focus, a checkmark for the applied item, and accessible names and states for both. Let the live subject show the result of an edit.
4. **Fit the phone.** In landscape, reserve the stage on the left and put choices in a scrollable inspector on the right. In portrait, place choices below the subject. Scroll the options within their own region. Keep the current feature and the action reachable at once, even with enlarged menu text. Use shared chamfered surfaces, header insets, hit targets, and a compact action glyph in the footer. Leave the surrounding garage visible.
5. **Keep ownership explicit.** A garment try-on or vehicle preview can change the scene immediately. Equip commits the outfit. Set main confirms the vehicle separately from its appearance edits. Keep existing profile and device save destinations, delayed-save feedback, and retry behavior. Back should return focus to the item or station the player came from. If a tile opens another panel under the player’s finger, the original tile owns the entire tap. The newly revealed control takes a fresh press.

| Garage station | Path through the live preview |
| --- | --- |
| Wardrobe | Open Appearance at the mirror. Choose Outfits, Clothing or Accessories, then a category supported by the current rig. Outfits includes saved looks. Open one item to inspect or try it on. Back returns to its tile. |
| Vehicle | Open Vehicles with the main car in view, or the first available vehicle on a fresh profile. A tile previews that vehicle. Customize opens Appearance, with Paint, Body, Lights and Portrait in the secondary row. Performance and Abilities are primary tabs. Back from Customize returns to the chooser. An explicit Set main hold changes the account's main vehicle. |

| Reference | Guidance for implementation |
| --- | --- |
| Skin, hair, garments and paint | Reuse the shared swatch and secondary row. Supply the material’s own palette and supported channels. Hair can expose base, roots, highlights and tips. Car paint has separate finish and metallic controls. Use the UI theme accent on the control border and the actual material color inside the swatch. Provide a selected name or check alongside color. |
| Saved outfits and garage vehicles | Give each item one tile. Distinguish the item being inspected from the equipped outfit or main vehicle. Keep the subject large enough to judge the change before committing. |
| Emotes and fit | Use the existing motion search, action/object shortcuts, favorites and playback on the dressed actor. The references also propose Recent, a queue of complete motions and side-by-side outfit-fit comparison. These are design targets. The current keyframe authoring tool edits an individual motion. |
| New wardrobe categories | Organize garments by what the player is dressing. The reference groups Outerwear, Sweaters, Corsets, Base tops and Underwear under Tops. Surface groups as their catalog items become available and keep existing item identities and layer rules. |

Start from [creator options](../frontend/src/game/welcome/CreatorOption.tsx), [creator color channels](../frontend/src/game/welcome/CreatorColors.tsx) and [shared swatches](../frontend/src/components/menus/ColorSwatch.tsx). The [workshop](../frontend/src/game/heroes/HeroWorkshop.tsx) owns station entry and the return path. [CharacterPage](../frontend/src/game/characters/CharacterPage.tsx) and [DressingRoom](../frontend/src/game/characters/DressingRoom.tsx) own character preview and clothing choices. [VehicleStudio](../frontend/src/game/heroes/VehicleStudio.tsx) presents the vehicle controls and [HeroSaveQueue](../frontend/src/game/heroes/HeroSaveQueue.ts) serializes loadout saves.

## One garage and one camera

Mount the real 3D garage once. Sign-in, the roster, the creator, Profile, the Garage stations, and views in Play and Heroes change the UI, actor, or camera shot on that scene. On cold entry, show the logo on neutral black, reveal the garage, then fade in the controls. On return or logout, retain the canvas and fade the UI layers. Keep the header’s size steady throughout its fade.

The shared room has a vehicle entrance wall with three roll-up doors and a personnel exit at each end. On first entry the ribbed doors are already in the room. Visiting the Garage stations loads the shared shutter texture. Each door has its own opening height. Keep this detail mounted across subsequent menu changes.

Use the shared warm brown garage as the default. Let the fixtures illuminate the room and the mechanic’s floor catch their reflections. The segmented wall sign reads 0999 with its first zero dark. In the login resting shot the left corner pillar sits near the middle and the right edge meets the middle of the far pillar. Change the environment and its theme at their shared source so the result carries through every garage screen.

Move the camera from its **displayed position and lens**, including during an unfinished move or after a drag. Looks frames the face, Eyes brings both irises close, and Makeup keeps the eyes and lips together. Measure the landmarks on the displayed rig. In the roster the left stick or a background drag orbits the room, while the right stick or dragging the actor turns the character. Use cached portraits for tiles and schedule rendering when something visible changes. Keep the vehicle platform tied to the presence of a vehicle.

When the player releases a manual orbit, hold the inspection angle for **12 seconds of inactivity**, then ease back to the current shot. Browsing the controls restarts that interval. A new drag takes over immediately and selecting a different camera preset takes precedence. Pause the idle timer while the app is hidden and give the player a fresh interval on return. Reduced motion uses the settled frame. While the angle is held, the timer alone should never require continuous frames. [Shared orbit timing](../frontend/src/game/preview/garageOrbitIdle.ts)

## Moving through the Garage

Use the displayed station button positions to choose the next focus in the pressed direction. Recheck when the camera reframes or the viewport rotates. Stop at an edge, and move only once per press or stick deflection. A stationary pointer keeps the player's current selection while the camera moves. LB/RB and Q/E still own the header.

Use the room itself to explain the stations. A short label and a familiar icon sit on a translucent chamfered plate. Keep the footer open and the character visible. Retain the 2×2 station layout on narrow screens and reserve the joined header for Back, Career, Social and Settings.

The Garage is a personal space for the signed-in account. World Editor at the drafting desk opens the choice between arranging the personal garage and editing a world project. Keep the garage visible when editing furniture. The editable groups are the desk, lockers, stocked shelf, tool chest, floor jack and engine hoist. Drag a prop in the room or on the World Editor floor plan. Directional input moves a prop in 0.25 m steps, and the rotation controls turn it 15°. A draft updates the physical props, their station markers, and their collision footprints together. Save commits to that account, and Discard restores its saved placement. Preserve the sightline to the lockers and a clear route through the bay doors. The default layout puts the tools at the edges and matching tires on the shelf. Reserve the center for a future turntable and lift.

Enter World starts the trip from the Garage. Keep the selected character in view as they walk to the driver’s door, get seated, and roll through the opening. Begin preparing the shared Harbor during boarding. Show errors in the Garage and let the player retry. If boarding is canceled or a spawn fails, release the Harbor seat reserved for that attempt. Preserve any seat the player held before starting. Reveal gameplay when the server has confirmed the player, vehicle, and map and the live world has drawn a frame. Hold the last garage frame during the blend, then release its preview. Reduced motion gets a short handoff.

Drive is a separate choice for players who want to steer the car out themselves. Tap Drive, press F, or press Xbox X. Steer with the left stick, accelerate with RT, and brake or reverse with LT. On keyboard use the driving bindings or arrow keys. Park with B, Esc, or the touch action. An approaching car opens its bay. Keep the physics clearance in sync with the visible shutter, and wait for the rear of the car to clear before joining the Harbor. Keep the garage on screen until the server confirms the player's vehicle and map.

Introduce assets at the first screen that can use them. Sign-in needs the room itself. The roster adds the selected actor. The Garage stations add the equipped road car and workshop props. The seat and moving driver’s door become active for boarding. Begin warming the admitted map when the player chooses Enter World, using the same asset caches as gameplay. Tie the reveal to a painted frame. Re-entering a menu should reuse the scene and the models already introduced.

## Where to make changes

| Change | Start here |
| --- | --- |
| Entry branding, credentials, header geometry and surfaces | [Shared sign-in markup](../frontend/src/theme/garageEntry.ts), [theme palettes](../frontend/src/theme/palettes.json), [angled header CSS](../frontend/public/images/angled-header.css), [entry CSS](../frontend/public/images/garage-entry.css) |
| Joined header actions, roster, creation, and Profile | [GarageBrandTab](../frontend/src/game/welcome/GarageBrandTab.tsx), [GarageEntryHeader](../frontend/src/game/welcome/GarageEntryHeader.tsx), [CharacterRoster](../frontend/src/game/welcome/CharacterRoster.tsx), [CharacterCreator](../frontend/src/game/welcome/CharacterCreator.tsx), [GarageProfilePanel](../frontend/src/game/characters/GarageProfilePanel.tsx) |
| Tab faces, secondary rows, and activation | [MenuTabButton](../frontend/src/components/menus/MenuTabButton.tsx), [SecondaryTabRow](../frontend/src/components/menus/SecondaryTabRow.tsx), [GameButton](../frontend/src/components/GameButton.tsx), [input routing](../frontend/src/controls/inputRouting.ts) |
| Garage stations | [Station labels](../frontend/src/game/menus/menuItems.ts), [projected controls](../frontend/src/game/menus/MainMenu.tsx), [shared prop and camera coordinates](../frontend/src/game/preview/garageMenuLandmarks.ts), [station camera](../frontend/src/game/preview/garageMenuCamera.ts), [furnishings](../frontend/src/game/preview/GarageMenuFurnishings.tsx) |
| Personal garage editing | [World Editor room controls](../frontend/src/worldBuilder/garage/GarageEditor.tsx), [account layout](../frontend/src/store/social/personalGarage.ts), [server save](../avenlab-server/src/server/garage.rs) |
| Enter World presentation | [Boarding](../frontend/src/game/preview/boardGarageCar.ts), [destination preload](../frontend/src/game/alpha/preloadGarageDestination.ts), [first world frame](../frontend/src/game/preview/GarageWorldReveal.tsx) |
| Parking and drive-out | [Workshop placement](../frontend/src/game/preview/garageServiceLayout.ts), [parking physics](../frontend/src/game/preview/garageParkingPhysics.ts), [shutter movement](../frontend/src/game/preview/garageBayMotion.ts), [Harbor handoff](../frontend/src/game/alpha/driveIntoOpenWorld.ts) |
| Scene lifetime, camera destinations, and interpolation | [LiveGarage](../frontend/src/game/preview/LiveGarage.tsx), [rosterCamera](../frontend/src/game/preview/rosterCamera.ts), [GarageCameraTravel](../frontend/src/game/preview/garageCameraTravel.ts) |

## Before merging a menu change

- Walk sign-in → roster → creator → Back → Profile → Back → main menu. From the main menu, use the branded Back tab to reach the roster and open Profile. Confirm all four stations and all three right header actions are reachable. Check focus after every handoff and verify one live garage canvas through logout.
- At the lockers, try on an outfit, inspect a piece, then back out before equipping. Check the equipped outfit and focus on return. Repeat and equip the trial. Compare both starter rigs. At the service bay, preview another vehicle and change its paint. Confirm that the original main stays marked until the Set main hold completes. Reopen each station and check the saved state.
- Check the settled 3D preview with the inspector open. Measure the standing character from crown to shoes against the uncovered area in each orientation. Both should be visible with a small margin, and the outfit should fill most of the available height. Check Face and Selected item separately. For a vehicle, check that its full footprint stays visible through a turn at the default zoom.
- In phone portrait and short landscape, orbit to inspect a seam or a body panel. Release, browse a control near the end of the hold, and verify the camera stays put for a fresh interval. Let it return, interrupt it with another drag and change to a specific shot. Repeat with reduced motion and after backgrounding the app. Check that the inspector scrolls without moving the camera and only one garage canvas remains.
- On a landscape phone, tap Profile during a gesture, return to the roster, and reopen it. The same actor should finish the gesture and continue its usual rest and emote cycle. Repeat with a delayed account response. The tab should acknowledge the tap immediately, pending work should be visible, and Back should remain usable. With reduced motion, the loading status should still be readable.
- Release each direction in turn and verify focus follows the visible stations, including in portrait. Drive out with the widest road vehicle. Check shutter clearance, parking and resuming, and retrying a failed world connection.
- Cold-start Enter World. Capture a frame with the character standing, at the door, seated, leaving through the shutter, and in the admitted world. Check that loading overlaps boarding, that repeated confirmation creates one spawn request, and that the final garage frame stays visible until the destination draws. Repeat with delayed assets, a rejected admission, reduced motion and a second account.
- Move and rotate a furnishing in World Editor, save, and revisit from another session on the same account. Confirm that another account and the shared Harbor retain their own layouts. Check that discarding a draft restores its placement, label and collision.
- Try the same route with keyboard, controller, and touch. Cycle across both ends of a header. Move through settings, edit a field, back out, and confirm one press produces one action.
- Check desktop, phone landscape, and phone portrait, including an installed Home Screen launch. Look for obscured corners, a bottom strip, clipped hair, duplicate borders, or a notice that moves a form.
- Switch camera tabs rapidly, interrupt a move with a drag, and repeat with reduced motion. Verify the actor and camera stay continuous. Record which checks used actual hardware and which used browser emulation.
