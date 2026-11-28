# Personal hero collection

The Garage's Vehicle station has two stages. Choose a vehicle tile to preview it, then choose Customize to edit its appearance, performance or abilities. Back from Customize returns to the chooser. Keep the stage on the garage canvas. Other Heroes and Play entry points retain their own roster routing. For the shared input, layout and camera rules, see the [garage customization pipeline](../../../../docs/MENU_DESIGN.md#from-character-creation-to-garage-customization).

The Vehicle chooser's Set main action uses the existing 1,200 ms hold of Xbox X, keyboard X, or the touch control. The confirmed main retains its badge while another vehicle is previewed. Releasing early, canceling a pointer, losing focus, disconnecting, navigating away or switching vehicle cancels a pending hold. The existing controller polling loop owns gamepad input. Reduced motion and high contrast keep progress readable.

Appearance changes preview immediately and enter HeroSaveQueue. The queue coalesces rapid edits per vehicle, serializes requests and preserves the latest main choice. Back drains it before leaving. Failed requests retain the edit and show NOT SAVED / Retry. Pending asset work remains visibly labelled rather than presented as complete.

hero_loadout_save always edits the authenticated server actor. The server checks hero policy, body color, appearance enums and skin ownership. Client-supplied profile/player target fields cannot edit another player. Profiles persist vehicle-keyed loadouts; live snapshots carry the equipped appearance to other players. Support heroes currently share their chassis appearance.

useHeroLoadouts is an in-memory cache scoped to the current profile; adopting another profile or signing out clears foreign drafts. It no longer reads the old device-wide persisted hero cache. VehiclePreviewModel consumes the current profile's per-car draft/loadout or FACTORY_APPEARANCE, never legacy Garage paint, global bundle, or interface theme. Paint, finish and metallic strength preview immediately; choosing Current Theme Color in Heroes saves a resolved color for that car only.

The skin picker lists Factory and server-reported owned skins. Equips are saved per car; rare bundles remain locked placeholders until inventory/artwork is ready. Body presets are free alpha paint editing, not rare-item unlocks. Base readable UI themes remain independent of cosmetic ownership.

Live AE86/BRZ/Camaro/Supra body materials use authoritative snapshot colors and instance-owned clones. Seat color requests are saved but not rendered: named BRZ front-seat nodes in this export have no mesh/children. Vehicle Editor → Materials lists the per-car seat, stitching, caliper, stripe and steering-wheel mappings requiring artwork and user visual feedback. No GLBs are renamed here.

The footer's hold action uses ControllerAction and ProgressOrbit. Align the glyph with A and B and reserve its space during the hold so the footer stays steady.
