import { Group, MathUtils, Mesh, Quaternion, Vector3, type Object3D } from "three";
import { splitVehicleAssembly } from "./splitGarageSteering";

// Fingerprints and triangle ranges from the streamed BRZ export. Splits remain
// in the preview scene and are skipped if the source geometry changes.
const SUPPORT = { sourceName: "HOOD_LATCH", material: "black1", count: 978, vertex: 20,
  point: [-.453236, .658195, -1.830351], ranges: [[8, 35], [99, 103], [187, 322]] } as const;
const WIPER_LEFT = { sourceName: "WINDSHIELD_WIPERS", material: "black1", count: 1371, vertex: 14,
  point: [-.647384, .782647, -.976575], ranges: [[6, 14], [146, 323], [377, 409], [427, 457]] } as const;
const WIPER_RIGHT = { sourceName: "WINDSHIELD_WIPERS", material: "black1", count: 1371, vertex: 0,
  point: [.494293, .831712, -.817978], ranges: [[0, 6], [14, 146], [323, 377], [409, 427]] } as const;
const PARKING_BRAKE = { sourceName: "Mesh117_black1_0", material: "black1", count: 10719, vertex: 197,
  point: [-.086615, .534124, -.240677], ranges: [[91, 97], [123, 135], [149, 167], [251, 257], [273, 285], [3525, 3573]] } as const;
const SHIFT_KNOB = { sourceName: "Mesh117_black1_0", material: "black1", count: 10719, vertex: 56,
  point: [-.002882, .586392, -.284395], ranges: [[30, 62], [85, 91], [109, 113], [170, 174], [201, 251], [772, 1116],
    [1732, 1760], [1784, 1814], [2093, 2149], [2469, 2527]] } as const;

export type BrzHoodProp = {
  grip: Object3D;
  tip: Object3D;
  fit(frame: Object3D): Object3D;
  place(amount: number): void;
};

export function prepareBrzHardware(root: Group) {
  const assemblies: NonNullable<ReturnType<typeof splitVehicleAssembly>>[] = [];
  const localPoint = (source: Mesh, point: readonly [number, number, number]) =>
    root.worldToLocal(source.localToWorld(new Vector3(...point)));
  function split(section: typeof SUPPORT | typeof WIPER_LEFT | typeof WIPER_RIGHT | typeof PARKING_BRAKE | typeof SHIFT_KNOB,
    id: string, at: readonly [number, number, number]) {
    const source = root.getObjectByName(section.sourceName);
    if (!(source instanceof Mesh)) return undefined;
    const assembly = splitVehicleAssembly(root, [section], `${id}-pivot`, localPoint(source, at));
    if (!assembly) return undefined;
    assemblies.push(assembly);
    assembly.root.children[0].name = id;
    return assembly.root;
  }
  root.updateWorldMatrix(true, true);
  const rodSource = root.getObjectByName(SUPPORT.sourceName);
  const rod = split(SUPPORT, "brz-hood-prop-rod", [.239, .637, -1.935]);
  const prop: BrzHoodProp | undefined = rod && rodSource instanceof Mesh ? (() => {
    const end = localPoint(rodSource, [-.490, .650, -1.808]).sub(rod.position);
    const grip = new Group(), tip = new Group();
    grip.position.copy(end).multiplyScalar(.92);
    tip.position.copy(end);
    grip.name = "brz-prop-grip";
    tip.name = "brz-prop-tip";
    rod.add(grip, tip);
    const upright = new Vector3(0, 1, 0), parked = end.normalize(), target = new Vector3();
    const raised = new Quaternion().setFromUnitVectors(parked, upright), rest = new Quaternion(), inserted = new Quaternion();
    let socket: Object3D | undefined;
    return {
      grip, tip,
      fit(frame) {
        socket = new Group();
        socket.name = "brz-hood-prop-socket";
        // Underside vertex on HOOD_FRAME. At 39 degrees the original rod
        // spans this point to within 2 mm without changing its length.
        socket.position.set(.309387, .633555, -1.968785);
        frame.add(socket);
        return socket;
      },
      place(amount) {
        if (amount <= .76 || !socket) {
          rod.quaternion.slerpQuaternions(rest, raised, MathUtils.clamp(amount / .76, 0, 1));
          return;
        }
        target.copy(root.worldToLocal(socket.getWorldPosition(target))).sub(rod.position).normalize();
        inserted.setFromUnitVectors(parked, target);
        rod.quaternion.slerpQuaternions(raised, inserted, (amount - .76) / .24);
      },
    };
  })() : undefined;
  const wiperSource = root.getObjectByName(WIPER_LEFT.sourceName);
  const axis = wiperSource instanceof Mesh
    ? localPoint(wiperSource, [0, .73, -.68]).sub(localPoint(wiperSource, [0, 0, 0])).normalize()
    : new Vector3(0, 1, 0);
  const left = split(WIPER_LEFT, "brz-wiper-left", [-.637, .748, -.929]);
  const right = split(WIPER_RIGHT, "brz-wiper-right", [-.270, .768, -.949]);
  split(PARKING_BRAKE, "brz-parking-brake", [-.081, .446, .052]);
  split(SHIFT_KNOB, "brz-shift-knob", [-.002, .54, -.255]);
  return {
    objects: assemblies.map(item => item.root),
    prop,
    wipers: left && right ? (amount: number) => {
      left.quaternion.setFromAxisAngle(axis, -amount * 1.01);
      right.quaternion.setFromAxisAngle(axis, -amount * .86);
    } : undefined,
    dispose() { for (const assembly of assemblies.reverse()) assembly.dispose(); },
  };
}
