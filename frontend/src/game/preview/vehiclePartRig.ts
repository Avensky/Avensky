import {Box3,Group,Matrix4,Mesh,Raycaster,Vector3,type Object3D} from "three";
import type {VehicleStudioPart} from "../heroes/vehicleStudioStore";
import {AE_HINGE} from "../../vehicles/tools/roadLamps";
import {BRZ_GARAGE_ENABLED} from "./brzCabin";
import type {BrzHoodProp} from "./brzHardware";
import type {BrzEngineBay} from "./brzEngineBay";

export type VehiclePartHinge={part:VehicleStudioPart;pivot:Group;axis:"x"|"y"|"z";closed:number;open:number;angle:number;handle?:Object3D;
  stance?: { point: Vector3; yaw: number }; latch?: Group; latchGrip?: Object3D;
  support?: (opening: number) => void; hoodProp?: BrzHoodProp; engineBay?: BrzEngineBay; doorSweep?: Box3; interiorHandle?: Object3D };
const frontDoor = (side: "left" | "right", letter: "l" | "r") => new RegExp(
  `^(?:.*_)?door(?:_?glass)?[_ .-]*(?:(?:front[_ .-]*)?(?:${side}|${letter})|f${letter}|${letter}f)(?:[_ .-].*)?$`, "i",
);
const rules:Partial<Record<VehicleStudioPart,RegExp>>={
 "door-left":frontDoor("left", "l"),
 "door-right":frontDoor("right", "r"),
 hood:/hood/i,
 trunk:/^(?:.*_)?(?:trunk|boot)(?:[_ .-](?!arms?).*)?$/i,
 headlights:/^(?:headlights?|headlightlenses)$/i,
};
// The BRZ's DOOR_LEFT and DOOR_RIGHT nodes are empty. The moving panels,
// mirrors, handles, window trim and glass are named sibling meshes in the GLB.
const brzDoorMeshes = {
 "door-left": /^(?:Mesh(?:138|139|140|141|142|143|148|149)_.*|WINDOW_(?:FRONT_)?LEFT(?:_TINT)?)$/i,
 "door-right": /^(?:Mesh(?:150|151|152|153|154|155|156|161|162)_.*|WINDOW_(?:FRONT_)?RIGHT(?:_TINT)?)$/i,
};
export function boundsInRoot(root:Object3D,objects:Object3D[]){
 root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),bounds=new Box3();
 for(const object of objects){const world=new Box3().setFromObject(object,true);world.applyMatrix4(inverse);bounds.union(world);}
 return bounds;
}
function meshCandidates(root:Object3D,part:VehicleStudioPart,model:string){
 const brzPattern = part === "door-left" || part === "door-right" ? brzDoorMeshes[part]
  : part === "hood" ? (BRZ_GARAGE_ENABLED ? /^HOOD(?:_FRAME|_ARM|_VENT(?:_FRAME)?)?$/i : /^HOOD(?:_FRAME|_VENT(?:_FRAME)?)?$/i) : undefined;
 const pattern = rules[part];
 if (!pattern) return [] as Mesh[];
 const found:Mesh[]=[];
 root.traverse(object=>{
  if (!(object instanceof Mesh)) return;
  // The AE86 lid is a GLTF group with several material primitives.
  if (part === "headlights") {
   for (let node: Object3D | null = object; node && node !== root; node = node.parent) {
    if (pattern.test(node.name)) { found.push(object); break; }
   }
  } else if ((model === "brz" && brzPattern?.test(object.name))
    || (pattern.test(object.name) && !(part.startsWith("door-") && /rear/i.test(object.name))
      && !/(?:sticker|decal|latch|arm|frame)$/i.test(object.name))) {
   found.push(object);
  }
 });
 return found;
}
export function measureDriverDoor(root: Object3D, model?: string) {
 if (model === "brz") {
  const side = brzDriverSide(root);
  for (const part of ["door-left", "door-right"] as const) {
   const bounds = boundsInRoot(root, meshCandidates(root, part, model));
   if (!bounds.isEmpty() && Math.sign(bounds.getCenter(new Vector3()).x) === side) return bounds;
  }
 }
 const frontLeft = /(?:driver.*door|door.*driver|(?:front|f)[_ .-]*(?:left|l).*door|(?:left|l)[_ .-]*(?:front|f).*door|door[_ .-]*(?:fl|front[_ .-]*left|left[_ .-]*front))/i;
 const explicit: Mesh[] = [], left: Mesh[] = [];
 root.traverse(object => {
  if (!(object instanceof Mesh) || /rear|sticker|decal|latch|arm|frame/i.test(object.name)) return;
  if (frontLeft.test(object.name)) explicit.push(object);
  else if (rules["door-left"]!.test(object.name)) left.push(object);
 });
 const parts = explicit.length ? explicit : left;
 if (parts.length) return boundsInRoot(root, parts);
 const driverWindow = root.getObjectByName("WINDOW_FRONT_LEFT") ?? root.getObjectByName("WINDOW_LEFT");
 if (driverWindow instanceof Mesh) return boundsInRoot(root, [driverWindow]);
 const wheel = model === "ae86" ? root.getObjectByName("SteeringWheel") : null;
 if (wheel) {
  // The AE86 has no named door panel. Stand beside the seat behind its wheel.
  const seat = boundsInRoot(root, [wheel]).getCenter(new Vector3());
  seat.z -= .43;
  return new Box3(seat, seat.clone());
 }
 // Some imports (including Sierra) pack the cab and doors into the body.
 // Use the cab glass and front lamp marker to locate its front seat.
 const glass = root.getObjectByName("GLASS_GEO");
 if (!glass) return null;
 const cab = boundsInRoot(root, [glass]);
 if (cab.isEmpty()) return null;
 const center = cab.getCenter(new Vector3());
 const lamp = root.getObjectByName("HEADLIGHT_L");
 const front = lamp ? root.worldToLocal(lamp.getWorldPosition(new Vector3())).z : cab.max.z;
 const point = new Vector3(cab.min.x, center.y, center.z + Math.sign(front - center.z) * .16 * (cab.max.z - cab.min.z));
 return new Box3(point, point.clone());
}

export function brzDriverSide(root: Object3D) {
 const wheel = BRZ_GARAGE_ENABLED && root.getObjectByName("Mesh128_black1_0");
 return wheel ? Math.sign(boundsInRoot(root, [wheel]).getCenter(new Vector3()).x) || 1 : 1;
}

function moveUnderPivot(root:Object3D,objects:Mesh[],hinge:Vector3,part:VehicleStudioPart,axis:"x"|"y"|"z",open:number):VehiclePartHinge|null{
 if(!objects.length)return null;
 root.updateWorldMatrix(true,true);const world=new Map(objects.map(object=>[object,object.matrixWorld.clone()]));
 const pivot=new Group();pivot.name=`garage-pivot-${part}`;pivot.position.copy(hinge);root.add(pivot);root.updateWorldMatrix(true,true);
 const inverse=pivot.matrixWorld.clone().invert();
 for(const object of objects){object.parent?.remove(object);pivot.add(object);const local=new Matrix4().multiplyMatrices(inverse,world.get(object)!);local.decompose(object.position,object.quaternion,object.scale);object.updateMatrix();}
 return {part,pivot,axis,closed:0,open,angle:0};
}

/** Bind the exterior grip in hinge space so it follows the moving panel. */
export function bindDoorHandle(root: Object3D, hinge: VehiclePartHinge, bounds: Box3, frontSign: number, longAxis: "x" | "z", attachHandle = true) {
 const size = bounds.getSize(new Vector3());
 if (bounds.isEmpty() || size[longAxis] < .35 || size.y < .22) return;
 const widthAxis = longAxis === "z" ? "x" : "z";
 const outer = Math.sign(bounds.getCenter(new Vector3())[widthAxis]);
 const point = bounds.getCenter(new Vector3());
 point[widthAxis] = outer < 0 ? bounds.min[widthAxis] : bounds.max[widthAxis];
 point[longAxis] += -frontSign * size[longAxis] * .31;
 point.y = bounds.min.y + size.y * .53;
 let nearest = .34 ** 2;
 let named: Object3D | undefined;
 const search = bounds.clone().expandByScalar(.14);
 root.traverse(part => {
  if (!/handle|door[_ .-]*grip/i.test(part.name) || /interior|inside|cabin/i.test(part.name)) return;
  const at = part instanceof Mesh ? boundsInRoot(root, [part]).getCenter(new Vector3())
    : root.worldToLocal(part.getWorldPosition(new Vector3()));
  const distance = at.distanceToSquared(point);
  if (!search.containsPoint(at) || distance >= nearest) return;
  nearest = distance;
  named = part;
 });
 if (named) {
  const part = named;
  const at = part instanceof Mesh ? boundsInRoot(root, [part]).getCenter(new Vector3())
    : root.worldToLocal(part.getWorldPosition(new Vector3()));
  point.copy(at);
  if (attachHandle && part instanceof Mesh && part.parent !== hinge.pivot) {
   for (let parent = part.parent; parent && parent !== root; parent = parent.parent) {
    if (parent === hinge.pivot) { named = undefined; break; }
   }
   if (named) hinge.pivot.attach(part);
  }
 }
 const anchor = new Group();
 anchor.name = "garage-exterior-door-handle";
 anchor.position.copy(hinge.pivot.worldToLocal(root.localToWorld(point)));
 hinge.pivot.add(anchor);
 hinge.handle = anchor;
}

function bindBrzInteriorHandle(root: Group, hinge: VehiclePartHinge) {
 const left = hinge.part === "door-left";
 const trim = root.getObjectByName(left ? "Mesh139_black1_0" : "Mesh162_black1_0");
 if (!(trim instanceof Mesh)) return;
 // The inner release lever is component 246 of the driver's door trim.
 const x = left ? -.724 : .718;
 const origin = trim.localToWorld(new Vector3(x - Math.sign(x) * .09, .707, -.263));
 const direction = trim.localToWorld(new Vector3(x, .707, -.263)).sub(origin).normalize();
 const hit = new Raycaster(origin, direction).intersectObject(trim, false)[0];
 if (!hit || Math.abs(trim.worldToLocal(hit.point.clone()).x - x) > .008) return;
 const grip = new Group();
 grip.name = "brz-interior-release";
 grip.position.copy(hinge.pivot.worldToLocal(hit.point));
 hinge.pivot.add(grip);
 hinge.interiorHandle = grip;
}

/** Adds temporary presentation hinges only where the GLB has separate panel
 * meshes. This never changes or saves the source GLB or in-game vehicle. */
export function createVehiclePartRig(root:Group,model:string):VehiclePartHinge[]{
 const whole=boundsInRoot(root,[root]),size=whole.getSize(new Vector3());
 const longAxis=size.x>=size.z?"x":"z",widthAxis=longAxis==="x"?"z":"x";
 const headlightMeshes:Mesh[]=[];root.traverse(object=>{if((object as Mesh).isMesh&&/head.?lights?/i.test(object.name))headlightMeshes.push(object as Mesh);});
 const front=headlightMeshes.length?boundsInRoot(root,headlightMeshes).getCenter(new Vector3())[longAxis]:longAxis==="z" ? whole.max.z : whole.min.x;
 const frontSign=front<whole.getCenter(new Vector3())[longAxis]?-1:1;
 const hinges:VehiclePartHinge[]=[];
 for(const part of ["door-left","door-right","hood","trunk","headlights"] as const){
  if(part==="headlights"&&model!=="ae86")continue;
  const objects=meshCandidates(root,part,model);if(!objects.length)continue;
  if (part === "headlights") {
   const hinge = moveUnderPivot(root, objects, new Vector3(...AE_HINGE), part, "x", -Math.PI / 3);
   if (hinge) hinges.push(hinge);
   continue;
  }
  const bounds=boundsInRoot(root,objects),center=bounds.getCenter(new Vector3()),point=center.clone();let axis:"x"|"y"|"z"="y",angle=0;
  if(part==="door-left"||part==="door-right"){
   point[longAxis]=frontSign<0?bounds.min[longAxis]:bounds.max[longAxis];
   point.y=bounds.min.y+bounds.getSize(new Vector3()).y*.35;
   const outer = Math.sign(center[widthAxis]) || (part === "door-left" ? 1 : -1);
   angle = outer * frontSign * (longAxis === "z" ? -1 : 1) * Math.PI / 3;
  }else{
   axis=widthAxis;
   const freeEdge = part === "hood" ? frontSign : -frontSign;
   const skin = model === "brz" && part === "hood" ? objects.find(object => object.name === "HOOD") : undefined;
   const panel = skin ? boundsInRoot(root, [skin]) : bounds;
   point[longAxis] = freeEdge < 0 ? panel.max[longAxis] : panel.min[longAxis];
   // +X rotation sends +Z toward the floor. +Z sends +X upward.
   angle = freeEdge * (longAxis === "z" ? -1 : 1) * Math.PI / 5;
  }
  const hinge=moveUnderPivot(root,objects,point,part,axis,angle);if (hinge) {
   if (part === "door-left" || part === "door-right") {
    bindDoorHandle(root, hinge, bounds, frontSign, longAxis);
    if (model === "brz" && BRZ_GARAGE_ENABLED && hinge.handle) {
     const handle = root.getObjectByName(part === "door-left" ? "Mesh141_body_0" : "Mesh156_body_0");
     if (handle instanceof Mesh) {
      const grip = boundsInRoot(root, [handle]);
      const target = grip.getCenter(new Vector3());
      target.x = target.x < 0 ? grip.min.x : grip.max.x;
      hinge.handle.position.copy(hinge.pivot.worldToLocal(root.localToWorld(target)));
      hinge.doorSweep = boundsInRoot(hinge.pivot, objects);
      bindBrzInteriorHandle(root, hinge);
     }
    }
   }
   else {
    const freeEdge = part === "hood" ? frontSign : -frontSign;
    const grip = center.clone();
    grip[longAxis] = freeEdge < 0 ? bounds.min[longAxis] : bounds.max[longAxis];
    grip.y = bounds.min.y + (bounds.max.y - bounds.min.y) * .7;
    const trunkRelease = BRZ_GARAGE_ENABLED && model === "brz" && part === "trunk" && root.getObjectByName("TRUNK_04");
    if (trunkRelease) boundsInRoot(root, [trunkRelease]).getCenter(grip);
    hinge.handle = new Group();
    hinge.handle.name = `garage-${part}-grip`;
    hinge.handle.position.copy(grip).sub(point);
    hinge.pivot.add(hinge.handle);
    const stand = grip.clone();
    stand[longAxis] = (freeEdge < 0 ? whole.min[longAxis] : whole.max[longAxis]) + freeEdge * .24;
    hinge.stance = { point: stand, yaw: longAxis === "x" ? freeEdge * Math.PI / 2 : freeEdge < 0 ? Math.PI : 0 };
    const latch = model === "brz" && part === "hood" ? root.getObjectByName("HOOD_LATCH_LOCK") : undefined;
    if (latch instanceof Mesh) {
     const lock = boundsInRoot(root, [latch]).getCenter(new Vector3());
     const catchPoint = latch.localToWorld(new Vector3(.020, .629, -1.957));
     hinge.latch = moveUnderPivot(root, [latch], lock, part, axis, 0)?.pivot;
     if (hinge.latch) hinge.latch.name = "garage-pivot-hood-latch";
     if (BRZ_GARAGE_ENABLED && hinge.latch) {
      hinge.latchGrip = new Group();
      hinge.latchGrip.name = "brz-hood-safety-catch";
      hinge.latchGrip.position.copy(hinge.latch.worldToLocal(catchPoint));
      hinge.latch.add(hinge.latchGrip);
     }
    }
   }
   hinges.push(hinge);
  }
 }
 return hinges;
}

export function advanceVehiclePartRig(hinges:VehiclePartHinge[],parts:Record<VehicleStudioPart,boolean>,delta:number,controlled?:VehicleStudioPart,headlights=parts.headlights){
 const blend=1-Math.exp(-Math.max(0,delta)*8);
 for(const hinge of hinges){if(hinge.part===controlled)continue;const opened=hinge.part==="headlights"?headlights:parts[hinge.part];const target=opened?hinge.open:hinge.closed;hinge.angle+= (target-hinge.angle)*blend;hinge.pivot.rotation[hinge.axis]=hinge.angle;hinge.support?.(hinge.angle/hinge.open);}
}

export function availableVehicleParts(hinges:VehiclePartHinge[]){return new Set(hinges.map(hinge=>hinge.part));}
