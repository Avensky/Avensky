import { fitMirrorCheck, nearestSideMirror, type MirrorCheckFit } from "../characters/mirrorCheck";
import { FACTORY_APPEARANCE, useHeroLoadouts } from "../../vehicles/cosmetics/heroLoadouts";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useAssetGLTF } from "../../assets/useAssetGLTF";
import { disposeVehicleAsset } from "./disposeVehicleAsset";
import { prepareVehicleVisual } from "../../vehicles/tools/vehicleMaterials";
import {
  VEHICLE_MODEL_PATHS,
  type VehicleModelId,
} from "../../vehicles/tools/vehicleModelPaths";
import { fitPreviewToPlatform, measureDriverLean, measurePreviewBounds } from "./previewPlacement";
import { PreviewContactShadow } from "./PreviewContactShadow";
import { applyShowroomHighlights, applyShowroomPaint } from "./garageVehiclePaint";
import { prepareGarageVehiclePaint } from "./garageVehiclePaint";
import {createVehiclePartRig,advanceVehiclePartRig,availableVehicleParts,boundsInRoot,brzDriverSide,measureDriverDoor,type VehiclePartHinge} from "./vehiclePartRig";
import {useBrzCabinStudio,useVehicleStudioStore} from "../heroes/vehicleStudioStore";
import {MathUtils,Mesh,MeshStandardMaterial,Vector3,type Color,type Group,type Object3D} from "three";
import { ROOK_ID, type CharacterChoice } from "../characters/characterCatalog";
import {useFrame,useThree} from "@react-three/fiber";
import {applyWindowTone} from "./windowTones";
import {vehicleSystems} from "../../vehicles/vehicleSystems";
import { prepareGarageCockpit, type GarageCockpit } from "./garageCockpit";
import { garageDoorForEmote, garagePanelForEmote, type GaragePanel } from "../characters/garageInteractions";
import { GARAGE_STATIONS, garageStationCamera } from "./garageStations";
import { usePreviewPaint } from "./usePreviewPaint";
import { splitAe86DriverDoor } from "./ae86DriverDoor";
import { splitGarageSteering } from "./splitGarageSteering";
import { splitTimecarDriverDoor } from "./timecarDriverDoor";
import { garageCamera, useGarageDrive } from "./garageDriveStore";
import { useCharacterPreviewStore } from "../characters/characterPreviewStore";
import { prepareGarageDashboard } from "./garageDashboard";
import { GarageVehicleDiagnosticsScene } from "./GarageVehicleDiagnosticsScene";
import { garageMounts, useGarageDiagnostics } from "./garageDiagnosticsStore";
import { prepareGarageHeadlightGlass } from "./garageHeadlightGlass";
import { GarageMaterialization } from "./GarageMaterialization";
import { batchStaticVehicleMeshes } from "../../vehicles/tools/staticVehicleBatches";
import { BRZ_GARAGE_ENABLED, prepareBrzCabin } from "./brzCabin";
import { fitBrzEngineBay } from "./brzEngineBay";
import { prepareBrzHardware } from "./brzHardware";
import type { BrzClearance } from "./brzApproach";
import { useCommittedResource } from "../characters/useCommittedResource";

import { VehicleDragVolume } from "./PreviewTurntable";

export type VehiclePreviewDriverFit = {
  model: VehicleModelId;
  position: [number, number, number];
  scale: number;
  yaw: number;
  lean?: ReturnType<typeof measureDriverLean>;
  mirror?: MirrorCheckFit;
  cockpit?: GarageCockpit;
  panels?: Partial<Record<GaragePanel | "driver-door" | "passenger-door", { hinge: VehiclePartHinge; position: [number, number, number]; yaw: number }>>;
  clearance?: BrzClearance;
};

type VehicleLayout = {
  model: VehicleModelId;
  measurements: ReturnType<typeof measurePreviewBounds>;
  door: ReturnType<typeof measureDriverDoor>;
};
// Exact bounds and ray tests depend on the imported geometry, not the paint or
// the current platform scale. Let the GLTF cache own their lifetime.
const layouts = new WeakMap<Object3D, VehicleLayout>();
const leanFits = new WeakMap<VehicleLayout, { fit: ReturnType<typeof measureDriverLean> }>();
const NO_PARTS: VehiclePartHinge[] = [];

function setLampEmission(material: MeshStandardMaterial, color: number | Color, intensity: number) {
  material.emissive.set(color);
  material.emissiveIntensity = intensity;
}

// Shared material preparation retains the TSX fixes without runtime network poses.
export function VehiclePreviewModel({children,platform,model,showroomPath,driver,previewPacks,onSettled,onDriverFit,motion,
  allowDriver = true,garageOpen = false,garageCameraAnchors = garageOpen,summon = false,reducedMotion = false,active = true,diagnostics = garageOpen}:{
  children?: React.ReactNode;
  platform: readonly [number, number];
  model: VehicleModelId;
  showroomPath?: string;
  driver?: CharacterChoice | null;
  previewPacks?: boolean;
  onSettled?: (model: VehicleModelId) => void;
  onDriverFit: (fit: VehiclePreviewDriverFit) => void;
  motion: RefObject<Group | null>;
  allowDriver?: boolean;
  garageOpen?: boolean;
  garageCameraAnchors?: boolean;
  summon?: boolean;
  reducedMotion?: boolean;
  active?: boolean;
  diagnostics?: boolean;
}) {
  const station = GARAGE_STATIONS[model];
  const revealRoot = useRef<Group>(null);
  const revealProgress = useRef(0);
  const [materializing, setMaterializing] = useState(summon);
  const revealActive = materializing && !reducedMotion;
  const invalidate = useThree(state => state.invalidate);
  const savedAppearance = useHeroLoadouts(s => s.draft?.vehicle === model ? s.draft.appearance : s.loadouts[model]);
  const cabinColors = useBrzCabinStudio(s => model === "brz" ? s.colors : undefined);
  const wiperRequest = useBrzCabinStudio(s => model === "brz" ? s.sweep : 0);
  const wiperSweep = useRef({ request: wiperRequest, elapsed: 1.8 });
  const { scene, animations } = useAssetGLTF(showroomPath ?? VEHICLE_MODEL_PATHS[model], "/draco/");
  // Only this stage uses the generated showroom URL. Retain its decoded data
  // in the loader cache, and release its GPU buffers when the car leaves.
  useEffect(() => {
    if (showroomPath) return () => disposeVehicleAsset(scene);
  }, [scene, showroomPath]);
  const driverReady = usePreviewPaint(Boolean(driver && allowDriver));
  const prepared = useMemo(
    () => {
      const visual = prepareVehicleVisual(scene, model);
      const brzHardware = BRZ_GARAGE_ENABLED && model === "brz" && !showroomPath ? prepareBrzHardware(visual.root) : undefined;
      const brzCabin = brzHardware ? prepareBrzCabin(visual.root) : undefined;
      const releaseDoor = model === "ae86" ? splitAe86DriverDoor(visual.root) : undefined;
      const releaseSteering = splitGarageSteering(visual.root, model);
      const gullwing = model === "timecar" ? splitTimecarDriverDoor(visual.root) : undefined;
      prepareGarageVehiclePaint(visual.root, model);
      const dashboard = prepareGarageDashboard(visual.root, GARAGE_STATIONS[model]);
      const headlightGlass = prepareGarageHeadlightGlass(visual.root, garageMounts(model, "headlights"));
      return { ...visual, gullwing, dashboard, headlightGlass, brzHardware, brzCabin, dispose: () => {
        brzCabin?.dispose(); brzHardware?.dispose();
        headlightGlass.dispose(); dashboard?.dispose(); gullwing?.dispose(); releaseSteering?.(); releaseDoor?.(); visual.dispose();
      } };
    },
    [scene, model, showroomPath],
  );
  const vehiclePainted = usePreviewPaint();
  useLayoutEffect(() => {
    if (vehiclePainted) onSettled?.(model);
  }, [vehiclePainted, model, onSettled]);
  useLayoutEffect(() => {
    if (active && materializing) invalidate();
  }, [active, materializing, reducedMotion, invalidate]);
  useFrame((_, delta) => {
    if (!active || !materializing || !revealRoot.current) return;
    const progress = reducedMotion ? 1 : Math.min(1, revealProgress.current + Math.min(.075, delta) / .8);
    revealProgress.current = progress;
    revealRoot.current.scale.setScalar(Math.max(.001, MathUtils.smoothstep(progress, .14, .82)));
    if (progress === 1) setMaterializing(false);
    else invalidate();
  }, -.8);
  const createPartRig = useCallback(() => {
    const parts = showroomPath ? [] : createVehiclePartRig(prepared.root, model);
    const hood = parts.find(part => part.part === "hood");
    const prop = prepared.brzHardware?.prop;
    const frame = prop && prepared.root.getObjectByName("HOOD_FRAME");
    if (hood && prop && frame) {
      hood.open = Math.sign(hood.open) * MathUtils.degToRad(39);
      prop.fit(frame);
      hood.hoodProp = prop;
      hood.engineBay = fitBrzEngineBay(prepared.root);
      hood.support = opening => prop.place(MathUtils.smoothstep(opening, .82, 1));
      const bonnetSkin = prepared.root.getObjectByName("HOOD");
      if (hood.handle && bonnetSkin) {
        hood.handle.position.copy(hood.pivot.worldToLocal(bonnetSkin.localToWorld(new Vector3(.229, .659, -1.985))));
      }
    }
    if (!showroomPath && prepared.gullwing) parts.push(prepared.gullwing.hinge);
    return { parts, dispose() { for (const hinge of parts) hinge.releaseLever?.dispose(); } };
  }, [prepared, model, showroomPath]);
  const rig = useCommittedResource(createPartRig);
  const partRig = rig?.parts ?? NO_PARTS;
  useLayoutEffect(() => {
    if (!rig) return;
    // Door/steering splits require the original primitive indices. Batch only
    // after those splits and hinges, leaving every interactive part separate.
    const batches = batchStaticVehicleMeshes(prepared.root, {
      protectedObjects: [...partRig.flatMap(part => part.latch ? [part.pivot, part.latch] : [part.pivot]),
        ...(prepared.brzHardware?.objects ?? []), ...(prepared.brzCabin?.objects ?? [])],
      protectedNames: station.kind === "wheel" ? station.steeringParts : undefined,
      animations,
    });
    return batches.dispose;
  }, [prepared, rig, partRig, station, animations]);
  const driverDoor = useMemo(() => {
    if (station.kind !== "wheel") return undefined;
    const side = model === "brz" ? brzDriverSide(prepared.root) : Math.sign(station.seat[0]);
    return partRig.find(part => {
      if (part.part !== "door-left" && part.part !== "door-right") return false;
      const across = prepared.root.worldToLocal(part.pivot.getWorldPosition(new Vector3())).x;
      return side * across > 0;
    });
  }, [partRig, prepared, station, model]);
  const passenger = useMemo(() => {
    if (!prepared.brzHardware || !driverDoor || station.kind !== "wheel") return undefined;
    const left = prepared.root.getObjectByName("Mesh132_red1_0");
    const right = prepared.root.getObjectByName("Mesh134_red1_0");
    const door = partRig.find(hinge => hinge.part === (driverDoor.part === "door-left" ? "door-right" : "door-left"));
    if (!left || !right || !door?.handle) return undefined;
    const leftBounds = boundsInRoot(prepared.root, [left]), rightBounds = boundsInRoot(prepared.root, [right]);
    if (leftBounds.isEmpty() || rightBounds.isEmpty()) return undefined;
    const offset = rightBounds.getCenter(new Vector3()).sub(leftBounds.getCenter(new Vector3()));
    const seat = new Vector3(...station.seat).addScaledVector(offset, driverDoor.part === "door-left" ? 1 : -1);
    return { door, seat };
  }, [prepared, driverDoor, partRig, station]);
  const popup = partRig.find(part => part.part === "headlights");
  const cockpitSetup = useMemo(() => ({
    driver: () => prepareGarageCockpit(prepared.root, prepared.glassMaterials, driverDoor, station),
    passenger: passenger && (() => prepareGarageCockpit(prepared.root, prepared.glassMaterials, passenger.door, station, passenger.seat)),
  }), [prepared, driverDoor, station, passenger]);
  const cockpitCache = useRef<{ setup: typeof cockpitSetup; driver?: ReturnType<typeof prepareGarageCockpit>; passenger?: ReturnType<typeof prepareGarageCockpit> }>(null);
  const playCockpit = useCallback<GarageCockpit>((driverRoot, characterPreview, fromOpenDoor, passengerSeat) => {
    const motionGroup = motion.current;
    if (!motionGroup) return null;
    if (cockpitCache.current?.setup !== cockpitSetup) cockpitCache.current = { setup: cockpitSetup };
    const seat = passengerSeat ? "passenger" : "driver";
    const prepare = cockpitCache.current[seat] ??= cockpitSetup[seat]?.();
    return prepare?.(driverRoot, motionGroup, characterPreview, fromOpenDoor) ?? null;
  }, [cockpitSetup, motion]);
  const cockpit = !revealActive && (previewPacks || garageOpen) ? playCockpit : undefined;
  const marine=vehicleSystems(model)==="marine";
  const inspectBody=useVehicleStudioStore(s=>s.activeTab==="body"||s.parts["door-left"]||s.parts["door-right"]);
  const glassStyle=useVehicleStudioStore(s=>s.glassStyle);
  const lensStyle=useGarageDiagnostics(s=>s.tests[model]?.lens??"factory");
  const lamps=useMemo(()=>{
    const navigation=new Set<MeshStandardMaterial>(),searchlights=new Set<MeshStandardMaterial>();
    if (marine) prepared.root.traverse(object=>{
      if(!(object instanceof Mesh))return;
      const objectName=object.name;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const value of materials){
        if(!(value instanceof MeshStandardMaterial))continue;
        const name=`${objectName} ${value.name}`.toLowerCase();
        if (/running_lights|stern_light/.test(name)) navigation.add(value);
        if (/searchligh/.test(name)) searchlights.add(value);
      }
    });
    const all=new Set([...navigation,...searchlights]);
    return {navigation,all,originals:new Map([...all].map(material=>[material,{emissive:material.emissive.clone(),intensity:material.emissiveIntensity}] as const))};
  },[prepared,marine]);
  const lastLampStyle=useRef("");
  useEffect(() => () => prepared.dispose(), [prepared]);
  useEffect(() => {
    if (!prepared.brzHardware?.wipers) return;
    useBrzCabinStudio.setState({wipersReady:true});
    return () => useBrzCabinStudio.setState({wipersReady:false});
  }, [prepared]);
  useEffect(() => {
    prepared.brzCabin?.apply(cabinColors ?? {}, savedAppearance?.seats ?? "factory");
    invalidate();
  }, [prepared, cabinColors, savedAppearance?.seats, invalidate]);
  useEffect(() => { if (prepared.brzHardware?.wipers) invalidate(); }, [prepared, wiperRequest, invalidate]);
  useEffect(()=>{lastLampStyle.current="";},[lamps]);
  useEffect(()=>{
    useVehicleStudioStore.getState().reset();
    if (!showroomPath) useVehicleStudioStore.getState().setAvailable(model,[...availableVehicleParts(partRig)]);
    useGarageDrive.setState({ hasDoor: Boolean(driverDoor) });
    const engineAvailable = partRig.some(part => part.engineBay);
    const exitSupported = Boolean(driverDoor?.interiorHandle && passenger?.door.interiorHandle);
    if (engineAvailable) useCharacterPreviewStore.setState({ brzEngineAvailable: true });
    if (passenger) useCharacterPreviewStore.setState({ brzPassengerAvailable: true });
    if (exitSupported) useCharacterPreviewStore.setState({ brzExitSupported: true });
    return () => {
      if (useVehicleStudioStore.getState().availableVehicle === model) useVehicleStudioStore.getState().setAvailable(null);
      if (engineAvailable) useCharacterPreviewStore.setState({ brzEngineAvailable: false, brzHoodBusy: false });
      if (passenger) useCharacterPreviewStore.setState({ brzPassengerAvailable: false, brzPassenger: false });
      if (exitSupported) useCharacterPreviewStore.setState({ brzExitSupported: false, brzExitReady: false, brzExiting: false });
    };
  },[model,partRig,driverDoor,passenger,showroomPath]);
  useEffect(()=>{
    if (!marine) applyWindowTone(prepared.glassMaterials, glassStyle);
  },[prepared,glassStyle,marine]);
  useEffect(() => {
    if (!garageOpen) return;
    useGarageDiagnostics.getState().setLensCount(model, prepared.headlightGlass.count);
    return () => {
      if (useGarageDiagnostics.getState().lensVehicle === model) useGarageDiagnostics.getState().setLensCount(null, 0);
    };
  }, [garageOpen, model, prepared]);
  useEffect(() => {
    prepared.headlightGlass.apply(garageOpen ? lensStyle : "factory");
  }, [prepared, garageOpen, lensStyle]);
  useEffect(() => {
    const appearance = savedAppearance ?? FACTORY_APPEARANCE;
    applyShowroomPaint(prepared.root, model, "factory", appearance.body === "factory" ? undefined : appearance.body);
    applyShowroomHighlights(prepared.root, .45, appearance.finish, appearance.metallic, model);
  }, [prepared, model, savedAppearance]);
  useFrame((_,delta)=>{
    if (!active || showroomPath) return;
    const studio=useVehicleStudioStore.getState();
    const drive = useGarageDrive.getState();
    const stage = drive.stage;
    prepared.dashboard?.setActive(Boolean((garageOpen && (stage !== "idle" || garageCamera(drive) === "Dashboard")) ||
      (previewPacks && useCharacterPreviewStore.getState().insideCar)));
    prepared.dashboard?.update();
    const preview = useCharacterPreviewStore.getState();
    const activeDoor = garageDoorForEmote(preview.emote?.id);
    const drivenDoor = garageOpen && stage !== "idle" && stage !== "station" ? driverDoor?.part
      : previewPacks && (preview.insideCar || activeDoor)
        ? (activeDoor === "passenger-door" || (preview.insideCar && preview.brzPassenger) ? passenger?.door : driverDoor)?.part
        : undefined;
    const garageLights = garageOpen ? useGarageDiagnostics.getState().tests[model]?.lights : undefined;
    const drivenPanel = previewPacks && garagePanelForEmote(useCharacterPreviewStore.getState().emote?.id);
    advanceVehiclePartRig(partRig,studio.parts,delta,drivenDoor || drivenPanel || undefined,studio.parts.headlights || Boolean(garageLights && garageLights !== "off"));
    if (prepared.brzHardware?.wipers) {
      const sweep = wiperSweep.current;
      const hood = partRig.find(part => part.part === "hood");
      if (wiperRequest !== sweep.request) { sweep.request = wiperRequest; sweep.elapsed = 0; }
      if (studio.parts.hood || (hood && Math.abs(hood.angle) > .025) || drivenPanel === "hood") sweep.elapsed = 1.8;
      if (sweep.elapsed < 1.8) {
        sweep.elapsed = Math.min(1.8, sweep.elapsed + Math.min(delta, .1));
        invalidate();
      }
      prepared.brzHardware.wipers(MathUtils.smoothstep(sweep.elapsed, 0, .67) * (1 - MathUtils.smoothstep(sweep.elapsed, .75, 1.8)));
    }
    if (marine) {
      const {navigation,searchlights}=studio.marineLights;
      const key=`${navigation}:${searchlights}`;
      if(lastLampStyle.current===key)return;
      lastLampStyle.current=key;
      for(const material of lamps.all){
        const active = lamps.navigation.has(material) ? navigation : searchlights;
        const original = lamps.originals.get(material)!;
        setLampEmission(material, active ? 0xffecd4 : original.emissive, active ? .9 : original.intensity);
      }
    }
  });
  // Keep the original measurements when the garage finishes loading; re-reading
  // a mounted model would measure its already-scaled parent a second time.
  const layout = useMemo(() => {
    const cached = layouts.get(scene);
    if (cached?.model === model) return cached;
    const result: VehicleLayout = {
      model,
      measurements: measurePreviewBounds(prepared.root, model),
      door: vehicleSystems(model) === "road" ? measureDriverDoor(prepared.root, model) : null,
    };
    layouts.set(scene, result);
    return result;
  }, [scene, prepared, model]);
  const { measurements, door: doorBounds } = layout;
  const clearance = useMemo(() => prepared.brzHardware ? {
    car: prepared.root, hull: measurements.bounds.clone(), doors: partRig.filter(part => part.doorSweep),
  } : undefined, [prepared, measurements, partRig]);
  const display = useMemo(
    () => fitPreviewToPlatform(measurements, platform),
    [measurements, platform],
  );
  const showroomBounds = useMemo(() => {
    if (measurements.bounds.isEmpty()) return;
    const { min, max } = measurements.bounds;
    const { scale, position } = display;
    // Some cars are centered on their wheels. Include mirrors and other off-center bodywork.
    const x = Math.max(Math.abs(min.x * scale + position[0]), Math.abs(max.x * scale + position[0]));
    const z = Math.max(Math.abs(min.z * scale + position[2]), Math.abs(max.z * scale + position[2]));
    return { radius: Math.hypot(x, z), halfHeight: (max.y - min.y) * scale / 2,
      centerY: (max.y + min.y) * scale / 2 + position[1] };
  }, [measurements, display]);
  const driverScale = marine ? 1.35 : display.scale;
  const panels = useMemo(() => {
    const targets: NonNullable<VehiclePreviewDriverFit["panels"]> = {};
    for (const hinge of partRig) {
      if ((hinge.part !== "hood" && hinge.part !== "trunk") || !hinge.stance) continue;
      const { point, yaw } = hinge.stance;
      targets[hinge.part] = { hinge, position: [point.x * display.scale + display.position[0], .023, point.z * display.scale + display.position[2]], yaw };
    }
    if (clearance && driverDoor?.handle) targets["driver-door"] = { hinge: driverDoor, position: [0, .023, 0], yaw: 0 };
    if (clearance && passenger) targets["passenger-door"] = { hinge: passenger.door, position: [0, .023, 0], yaw: 0 };
    return targets;
  }, [partRig, display, clearance, driverDoor, passenger]);
  const hasDriver = Boolean(driver);
  const rook = driver?.id === ROOK_ID;
  const staging = useMemo(() => {
    const vehicleCenter = measurements.centering.getCenter(new Vector3());
    const doorCenter = doorBounds?.getCenter(new Vector3());
    const side = clearance ? brzDriverSide(prepared.root)
      : station.kind === "wheel" ? Math.sign(station.seat[0]) : doorCenter && doorCenter.x > vehicleCenter.x ? 1 : -1;
    const edge = side < 0
      ? Math.min(doorBounds?.min.x ?? Infinity, measurements.bounds.min.x)
      : Math.max(doorBounds?.max.x ?? -Infinity, measurements.bounds.max.x);
    const along = station.kind === "wheel" ? station.seat[2] : doorCenter?.z;
    if (hasDriver && driverReady && along !== undefined && Number.isFinite(edge) && !leanFits.has(layout)) {
      const fit = measureDriverLean(prepared.root, edge + side * .27, measurements.support.min.y, along, side);
      leanFits.set(layout, { fit });
    }
    const fit = driverReady ? leanFits.get(layout)?.fit : undefined;
    return { side, edge, along, fit };
  }, [doorBounds, measurements, prepared, hasDriver, driverReady, layout, station, clearance]);
  const inset = inspectBody || clearance ? 0 : Math.min(staging.fit?.offset ?? 0, rook ? .14 : .06);
  const lean = useMemo(() => {
    const fit = staging.fit;
    return !rook || inspectBody || !previewPacks || driver?.prop || !fit ? undefined : { ...fit, offset: fit.offset - inset };
  }, [staging.fit, rook, inspectBody, previewPacks, driver?.prop, inset]);
  const driverAcross = staging.edge * display.scale + display.position[0] + staging.side * (.27 - inset) * driverScale;
  // Vehicles without an authored front door still stage beside the front seat.
  const driverAlong = staging.along === undefined ? display.footprint[1] * .12
    : (staging.along + (clearance && previewPacks ? .58 : 0)) * display.scale + display.position[2];
  const mirrorFit = useMemo<MirrorCheckFit | undefined>(() => {
    if (!previewPacks || !driverReady || station.kind !== "wheel" || staging.along === undefined) return undefined;
    const from = new Vector3(staging.edge + staging.side * (.27 - inset), measurements.support.min.y, staging.along);
    const mirror = nearestSideMirror(prepared.root, station, measurements.bounds, from);
    if (!mirror) return undefined;
    return fitMirrorCheck(from, mirror, staging.side);
  }, [previewPacks, driverReady, station, staging, inset, measurements, prepared]);
  const cameraRig = useMemo(() => {
    const size = measurements.bounds.getSize(new Vector3());
    const center = measurements.bounds.getCenter(new Vector3());
    const door = doorBounds?.getCenter(new Vector3()) ?? center;
    const side = staging.side;
    const doorZ = staging.along ?? door.z;
    const height = Math.max(1.3, size.y);
    const width = Math.max(1.65, size.x);
    const length = Math.max(3.2, size.z);
    const shots = [
      { name: "High Angle", at: [center.x, center.y, center.z], eye: [width * .8, length * .93, length * .52] },
      { name: "Driver Door", at: [door.x, Math.min(door.y, measurements.bounds.min.y + size.y * .48), doorZ], eye: [side * width * 1.18, height * .32, -length * .38] },
      { name: "Chase", at: [center.x, center.y, center.z + length * .15], eye: [-width * .57, height * 1.28, -length * 1.14] },
    ];
    const cockpitShot = garageStationCamera(station);
    shots.push({ name: "Cockpit", at: [...cockpitShot.at], eye: [...cockpitShot.eye] });
    if (station.kind === "wheel") {
      const [x, y, z] = station.rim;
      // Look over the rim into the instrument recess. Keep the eye behind the
      // dashboard overhang so the camera cannot enter its solid top surface.
      const eyeY = Math.min(station.roof - .10, y + .22);
      shots.push(model === "timecar"
        ? { name: "Dashboard", at: [x, y + .085, z + .195], eye: [0, .015, -.12] }
        : { name: "Dashboard", at: [x, y + .09, z + .20], eye: [0, eyeY - y - .09, -.32] });
    }
    return shots;
  }, [doorBounds, measurements, staging.side, staging.along, station, model]);
  useLayoutEffect(() => {
    if (!hasDriver || !driverReady) return;
    onDriverFit({ model, position: [driverAcross, .023, driverAlong], scale: driverScale,
      yaw: staging.side * Math.PI / 2, lean, mirror: mirrorFit, cockpit, panels, clearance });
  }, [hasDriver, driverReady, onDriverFit, model, driverAcross, driverAlong, driverScale, staging.side, lean, mirrorFit, cockpit, panels, clearance]);
  return (
    <>
      {active && vehiclePainted && !revealActive && children}
      <group ref={revealRoot} scale={revealActive ? .001 : 1} visible={active}>
        <PreviewContactShadow footprint={display.footprint} offset={display.shadowOffset} />
        <group position={display.position} scale={display.scale} name="selection-vehicle-glb" userData={{ showroomBounds }}>
          {/* Keep the prepared car alive while omitting its meshes from scene traversal. */}
          {active && <primitive object={prepared.root} dispose={null} />}
          {active && <VehicleDragVolume bounds={measurements.bounds} />}
          {active && diagnostics && garageOpen && vehicleSystems(model) === "road" && <GarageVehicleDiagnosticsScene vehicle={model} popup={popup} />}
        </group>
      </group>
      {active && revealActive && <GarageMaterialization subject="vehicle" progress={revealProgress}
        footprint={display.footprint} offset={display.shadowOffset} />}
      {garageCameraAnchors && <group position={display.position} scale={display.scale}>
        {cameraRig.map(shot => <group key={shot.name} name={`garage-view-${shot.name}`}
          position={shot.at as [number, number, number]}>
          <object3D position={shot.eye as [number, number, number]} />
        </group>)}
      </group>}
    </>
  );
}
