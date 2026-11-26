# Avensky’s approved garage menus

Use sign-in, character selection, and character creation as the references for new garage menus. Carry their input behavior and visual language into the final game. Profile uses the same header and navigation rules. The main menu is the current destination after character selection.

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
| Character selection | Branded header on the left, joined Log out and Profile tabs on the right. Give the outer Profile tab the prominent face and Log out the smaller one. Use portrait tiles, short details beside each portrait, and a Create character tile. Keep the selected actor visible as the main menu opens. |
| Character creation | The angled Avensky Back control participates in the primary tab cycle. Show visual tiles and swatches, with one caption below Hairstyle, Eyes, and Eyeliner. Keep Continue/Create in a compact bottom-right action with a glyph and open space behind it. Choose the name on Personality. Appearance tabs use quiet emotes. Previewing a personality blends into its gestures and changes the wardrobe while preserving the player’s chosen face, hair, and colors. |
| Profile | Keep the left Avensky brand and Back affordance, and the joined right account tabs. Use that header for Back. Open one settings row at a time. Back closes the row first and then returns to the screen that opened Profile. |

Use the shared angled-header scale and theme tokens. Mirror the right-hand cuts, join adjacent tabs edge to edge, and highlight the tab face or accent edge. Keep icons inside the tab free of extra focus boxes. Use the main menu’s 65% row surface, one continuous border around chamfered edges, short labels, and a clear accent for selection. In a joined stack, cut the upper corners on the first bar and the lower corners on the last. Keep text and glyphs fully legible over the scene.

Keep touch targets at least 44 CSS pixels where the player taps. Use the shared game button for new touch controls, with an accessible name, role, and selected or expanded state. Decorative images and labels stay inert. A single touch release should produce a single action. In landscape, protect controls from curved edges. In portrait, clear the status bar once and extend the garage behind the bottom safe area. Keep mobile text entry from displacing the game canvas.

## One garage and one camera

Mount the real 3D garage once. Sign-in, the roster, the creator, Profile, the main menu, and garage views in Play and Heroes change the UI, actor, or camera shot on that scene. On cold entry, show the logo on neutral black, reveal the garage, then fade in the controls. On return or logout, retain the canvas and fade the UI layers. Keep the header’s size steady throughout its fade.

Use the shared warm brown garage as the default. Let the fixtures illuminate the room and the mechanic’s floor catch their reflections. The segmented wall sign reads 0999 with its first zero dark. In the login resting shot the left corner pillar sits near the middle and the right edge meets the middle of the far pillar. Change the environment and its theme at their shared source so the result carries through every garage screen.

Move the camera from its **displayed position and lens**, including during an unfinished move or after a drag. Looks frames the face, Eyes brings both irises close, and Makeup keeps the eyes and lips together. Measure the landmarks on the displayed rig. Honor reduced motion with settled framing. In the roster the left stick or a background drag orbits the room, while the right stick or dragging the actor turns the character. Login orbit eases back to rest. Use cached portraits for tiles and schedule rendering when something visible changes. Keep the vehicle platform tied to the presence of a vehicle.

## Where to make changes

| Change | Start here |
| --- | --- |
| Entry branding, credentials, header geometry and surfaces | [Shared sign-in markup](../frontend/src/theme/garageEntry.ts), [theme palettes](../frontend/src/theme/palettes.json), [angled header CSS](../frontend/public/images/angled-header.css), [entry CSS](../frontend/public/images/garage-entry.css) |
| Joined header actions, roster, creation, and Profile | [GarageEntryHeader](../frontend/src/game/welcome/GarageEntryHeader.tsx), [CharacterRoster](../frontend/src/game/welcome/CharacterRoster.tsx), [CharacterCreator](../frontend/src/game/welcome/CharacterCreator.tsx), [GarageProfilePanel](../frontend/src/game/characters/GarageProfilePanel.tsx) |
| Tab faces, secondary rows, and activation | [MenuTabButton](../frontend/src/components/menus/MenuTabButton.tsx), [SecondaryTabRow](../frontend/src/components/menus/SecondaryTabRow.tsx), [GameButton](../frontend/src/components/GameButton.tsx), [input routing](../frontend/src/controls/inputRouting.ts) |
| Scene lifetime, camera destinations, and interpolation | [LiveGarage](../frontend/src/game/preview/LiveGarage.tsx), [rosterCamera](../frontend/src/game/preview/rosterCamera.ts), [GarageCameraTravel](../frontend/src/game/preview/garageCameraTravel.ts) |

## Before merging a menu change

- Walk sign-in → roster → creator → Back → Profile → Back → main menu. Open Profile from the main menu and return there. Check focus after every handoff and verify one live garage canvas through logout.
- Try the same route with keyboard, controller, and touch. Cycle across both ends of a header. Move through settings, edit a field, back out, and confirm one press produces one action.
- Check desktop, phone landscape, and phone portrait, including an installed Home Screen launch. Look for obscured corners, a bottom strip, clipped hair, duplicate borders, or a notice that moves a form.
- Switch camera tabs rapidly, interrupt a move with a drag, and repeat with reduced motion. Verify the actor and camera stay continuous. Record which checks used actual hardware and which used browser emulation.
