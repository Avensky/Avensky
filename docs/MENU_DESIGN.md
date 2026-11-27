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
| Profile | Keep the left Avensky brand and Back affordance, and the joined right account tabs. Use that header for Back. Open one settings row at a time. Back closes the row first and then returns to the screen that opened Profile. |

Use the shared angled-header scale and theme tokens. Mirror the right-hand cuts, join adjacent tabs edge to edge, and highlight the tab face or accent edge. Keep icons inside the tab free of extra focus boxes. Use the main menu’s 65% row surface, one continuous border around chamfered edges, short labels, and a clear accent for selection. In a joined stack, cut the upper corners on the first bar and the lower corners on the last. Keep text and glyphs fully legible over the scene.

Keep touch targets at least 44 CSS pixels where the player taps. Use the shared game button for new touch controls, with an accessible name, role, and selected or expanded state. Decorative images and labels stay inert. A single touch release should produce a single action. In landscape, protect controls from curved edges. In portrait, clear the status bar once and extend the garage behind the bottom safe area. Keep mobile text entry from displacing the game canvas.

Delete character belongs to the roster. Open it from Manage, keep the actor in the garage, and identify the character by its saved name. Start the confirmation on Cancel. The player must enter the name exactly, including capitalization, and then activate Delete character separately. Finishing text entry only puts the keyboard away. Use the server’s updated roster to pick the next character or focus Create character when the last slot is deleted.

## Shared header and character names

Use `GarageEntryHeader` for the garage entry and account actions, and the shared angled tab system for scene menus. Keep geometry and theme colors in the shared styles. A page supplies the tabs, icons and actions it needs. Align the Back arrow, logo and wordmark to the vertical center of the visible tab face. On short landscape screens the touch target can extend below the face. Apply the device safe area once at the edge of the header.

Draw one continuous top edge across the joined right tabs and a single diagonal divider at each join, using the same theme accent as the left tab. The outer tab stays prominent. Focus and selection use the lower accent edge. Check the top line and dividers in two contrasting themes and compare the brand position with and without Back, including at a 35 px landscape header height.

Display character names with an initial capital for each part, as in **Vesper Vega** or **O’Neil**. Preserve intentionally mixed spelling such as **McKay**. Use the shared formatter when rendering a character name. Keep the original text for editing, saving and the exact-name deletion prompt. Profile’s **Display name** is the account name and keeps its owner’s spelling. [Character name formatter](../frontend/src/game/characters/characterName.ts)

## One garage and one camera

Mount the real 3D garage once. Sign-in, the roster, the creator, Profile, the Garage stations, and views in Play and Heroes change the UI, actor, or camera shot on that scene. On cold entry, show the logo on neutral black, reveal the garage, then fade in the controls. On return or logout, retain the canvas and fade the UI layers. Keep the header’s size steady throughout its fade.

The shared room has a vehicle entrance wall with three roll-up doors and a personnel exit at each end. On first entry the ribbed doors are already in the room. Visiting the Garage stations loads the shared shutter texture. Each door has its own opening height. Keep this detail mounted across subsequent menu changes.

Use the shared warm brown garage as the default. Let the fixtures illuminate the room and the mechanic’s floor catch their reflections. The segmented wall sign reads 0999 with its first zero dark. In the login resting shot the left corner pillar sits near the middle and the right edge meets the middle of the far pillar. Change the environment and its theme at their shared source so the result carries through every garage screen.

Move the camera from its **displayed position and lens**, including during an unfinished move or after a drag. Looks frames the face, Eyes brings both irises close, and Makeup keeps the eyes and lips together. Measure the landmarks on the displayed rig. Honor reduced motion with settled framing. In the roster the left stick or a background drag orbits the room, while the right stick or dragging the actor turns the character. Login orbit eases back to rest. Use cached portraits for tiles and schedule rendering when something visible changes. Keep the vehicle platform tied to the presence of a vehicle.

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
- Release each direction in turn and verify focus follows the visible stations, including in portrait. Drive out with the widest road vehicle. Check shutter clearance, parking and resuming, and retrying a failed world connection.
- Cold-start Enter World. Capture a frame with the character standing, at the door, seated, leaving through the shutter, and in the admitted world. Check that loading overlaps boarding, that repeated confirmation creates one spawn request, and that the final garage frame stays visible until the destination draws. Repeat with delayed assets, a rejected admission, reduced motion and a second account.
- Move and rotate a furnishing in World Editor, save, and revisit from another session on the same account. Confirm that another account and the shared Harbor retain their own layouts. Check that discarding a draft restores its placement, label and collision.
- Try the same route with keyboard, controller, and touch. Cycle across both ends of a header. Move through settings, edit a field, back out, and confirm one press produces one action.
- Check desktop, phone landscape, and phone portrait, including an installed Home Screen launch. Look for obscured corners, a bottom strip, clipped hair, duplicate borders, or a notice that moves a form.
- Switch camera tabs rapidly, interrupt a move with a drag, and repeat with reduced motion. Verify the actor and camera stay continuous. Record which checks used actual hardware and which used browser emulation.
