# BRZ garage preview

The staging garage uses the verified BRZ asset. The source export retains its original mesh names. Preview meshes carry readable cabin aliases and left or right tags, and their materials are cloned before preview colors are applied. Cabin colors are stored in the current browser. The staging controls are available in the garage's Paint panel. Body contains the wiper sweep control.

| Cabin group | Left side | Right side |
| --- | --- | --- |
| Seat upholstery | `Mesh132_red1_0` | `Mesh134_red1_0` |
| Seat shell | `Mesh132_black1_0` | `Mesh134_black1_0` |
| Harness strap | `Mesh129__Color_A08_6_0` | `Mesh133__Color_A08_6_0` |
| Harness buckle | `Mesh129__Color_B05_3_0` | `Mesh133__Color_B05_3_0` |
| Harness mount | `Mesh129_black1_0` | `Mesh133_black1_0` |
| Floor rail | `Mesh131_black1_0` | `Mesh136_black1_0` |
| Seat brace | `Mesh130__Color_C03_1_0` | `Mesh135__Color_C03_1_0` |

`Mesh128_black1_0` is the steering wheel rim and `Mesh128__Color_B05_3_0` is the steering wheel trim. The preview splits the parking brake and shift knob out of `Mesh117_black1_0`. Dedicated paddles need a verified mesh or partition. Splits check the source name, triangle count and one vertex fingerprint before altering the preview.

The left door grip is bound to `Mesh141_body_0` and the right grip to `Mesh156_body_0`. The steering-wheel side determines the driver door and lead hand. Get into the BRZ continues from the driver door, while Get into passenger seat approaches the other door and leads with the left foot. The passenger sits against the passenger seat fit measured from the two upholstery meshes. Close driver door and Close passenger door walk around the open panel, then push and release the door from outside its swing. The trunk grip sits at the release recess above the plate, located using `TRUNK_04`. The wiper blades and arms split into two pivots, with the mounts in `WINDSHIELD_WIPERS_01` stationary.

Get out of driver seat and Get out of passenger seat use the inside release on the selected door. The driver's lever is component 246 in `Mesh139_black1_0`. The matching passenger lever is in `Mesh162_black1_0`. Each lever has its own verified mesh partition and pivot. It turns before the door hinge moves and springs back after release. After the door opens, the driver ducks and steps over the sill with the near foot first, then turns outside and uses the fitted close animation. After entering either seat, the near hand takes the fixed interior pull and follows it through closure.

The hood moves with its liner, vents, and `HOOD_ARM` hinge hardware. Facing the front, the driver bends toward the `HOOD_LATCH_LOCK` safety catch, then raises and holds the hood with the left hand. The right hand raises the rod from `HOOD_LATCH` and seats it against the underside of `HOOD_FRAME`. At 39 degrees of hood lift, the roughly 92-degree rod swing meets the measured attachment point within 2 mm. Close hood reverses this sequence. Inspect engine keeps the hood supported while the driver leans in from the front.

In staging, Inspect engine braces the left hand on the front support and touches the intake with the right fingertips. Tweak engine is available with the hood propped. The driver picks up a wrench at her right hip, braces with her left hand, seats the open jaw over the fitting, turns it, and stows the wrench before Close hood becomes available again. Contact locators are fitted to the surfaces of `ENGINE_04` and `ENGINE` in the streamed GLB. The gesture runs entirely in the garage preview.

The walk-up path treats the measured vehicle footprint as an obstacle and adds space for the active rig's shoulder width. The path eases through turns and acceleration. Stride length comes from the rig, with fixed shoe plants and alternating arm swing. During the door pull, the standing position clears the swept footprint. The arm solver follows the moving grip. During a low reach the shoes stay grounded and the knees bend along the side of the car. Check playback, hand contact, prop fit and clothing clearance on a physical phone.

The next garage action takes over the current standing transform. Reset interaction returns the driver to the original parking pose. An open door contributes a horizontal obstacle made from the measured panel bounds and its current hinge angle. The feet use the garage floor for support. The emotes camera frames the active panel and stays inside the garage walls as it moves.

## Shared-world movement

The shared Open World currently uses the vehicle input and physics pipeline. The character library has a Run 01 pose. Walking and driving in the same hub need a grounded on-foot controller, retained avatar position when switching actions, and server-owned seat occupancy. A first mobile pass can use a move stick and one interaction button to switch between the nearby door and the seated controls. Add run and jump grounded transitions before extending the system to actions such as punching.
