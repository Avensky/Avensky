import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, Group, Mesh, Raycaster, Vector2, Vector3, type Intersection } from "three";
import type { CharacterChoice } from "../characters/characterCatalog";
import type { CreatorEmoteMode } from "../characters/garageEmotes";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { getGarageMotion, setGaragePreview, type GarageEntryShot } from "./LiveGarage";
import { useUIStore } from "../../store/menus/uiStore";
import { MAIN_MENU_ITEMS } from "../menus/menuItems";
import { usePersonalGarage } from "../../store/social/personalGarage";
import { useGarageEditor } from "../../worldBuilder/garage/garageEditorState";
import { garageRoomEditorCamera } from "./garageRoomEditorCamera";
import { garageStationAnchor } from "./garageMenuLandmarks";
import { garageMenuCamera } from "./garageMenuCamera";
import { boardingCamera } from "./garageBoarding";
import { useGarageParkingVehicle } from "./garageParkingVehicle";
import { GarageParkingMotion } from "./GarageParkingMotion";
import { garageParkingCamera, garageParkingPose } from "./garageParkingCamera";
import { useGarageParking } from "./garageParkingStore";
import { GarageExitApron } from "./GarageExitApron";
import { useSocialStore } from "../../store/social/socialStore";
import { GarageMenuMarkers } from "./garageMenuMarkers";
import { GarageMenuFurnishings } from "./GarageMenuFurnishings";
import { MAX_PITCH, MAX_YAW } from "./garageEntryInteraction";
import { PreviewContactShadow } from "./PreviewContactShadow";
import { bindRosterSticks } from "./rosterStickControls";
import { ROSTER_HEADING, rosterCamera, type CharacterGarageShot, type CharacterGarageView, type CreatorFrame } from "./rosterCamera";

const GarageBoardingPerformance = lazy(() => import("./GarageBoardingPerformance").then(module => ({ default: module.GarageBoardingPerformance })));
const GarageDriver = lazy(() => import("../characters/GarageDriver").then(module => ({ default: module.GarageDriver })));
export type GarageCharacterSelection = { choice: CharacterChoice; mode: CharacterGarageView; creatorFrame?: CreatorFrame; creatorEmotes?: CreatorEmoteMode };

function LoadingBoarding() {
  useLayoutEffect(() => {
    const timeout = window.setTimeout(() => {
      useGarageParking.getState().failDeparture("The driver animation is still loading. Try Enter World again.");
    }, 45000);
    return () => window.clearTimeout(timeout);
  }, []);
  return null;
}

function UnavailableBoarding() {
  useLayoutEffect(() => {
    useGarageParking.getState().failDeparture("The driver animation could not load. Try Enter World again.");
  }, []);
  return null;
}

function UnavailableRosterActor({ settled }: { settled: (available: boolean) => void }) {
  useLayoutEffect(() => settled(false), [settled]);
  return null;
}

type ActorShot = GarageEntryShot & Partial<Pick<CharacterGarageShot, "fitPortrait">>;

function RosterActor({ choice, mode, creatorEmotes, shot }: GarageCharacterSelection & { shot: ActorShot }) {
  const pivot = useRef<Group>(null);
  const actorAsset = useMemo(() => ({ rigId: choice.id, available: undefined as boolean | undefined }), [choice.id]);
  const portraitRig = useRef<{ shot: ActorShot; id: string } | null>(null);
  const gl = useThree(s => s.gl);
  const camera = useThree(s => s.camera);
  const invalidate = useThree(s => s.invalidate);
  const settled = useCallback((available: boolean, rigId?: string) => {
    if (available && rigId !== choice.id) return;
    actorAsset.available = available;
    if (mode !== "main") shot.subject = available ? "ready" : "unavailable";
    invalidate();
  }, [actorAsset, shot, mode, choice.id, invalidate]);
  useFrame(() => {
    if ((mode !== "profile" && mode !== "create") || shot.subject !== "ready" || !pivot.current) return;
    if (portraitRig.current?.shot === shot && portraitRig.current.id === choice.id) return;
    // The starter rigs have different proportions. Measure once on the dressed
    // actor after loading, before the shared camera applies its view for this frame.
    const eyes = mode === "create" && pivot.current.getObjectByName("villager-eye-focus");
    const head = eyes || pivot.current.getObjectByName("head");
    const waist = pivot.current.getObjectByName("spine_03");
    if (!head || !waist) return;
    const position = head.getWorldPosition(new Vector3());
    const waistHeight = waist.getWorldPosition(new Vector3()).y + .03;
    shot.fitPortrait?.(position.y + (eyes ? 0 : .065), waistHeight, position.x, position.z);
    portraitRig.current = { shot, id: choice.id };
  }, -1.25);
  useLayoutEffect(() => {
    const turn = (radians: number) => {
      if (!radians || !pivot.current || useGarageParking.getState().departurePhase) return;
      pivot.current.rotation.y = (pivot.current.rotation.y + radians) % (Math.PI * 2);
      invalidate();
    };
    const ray = new Raycaster(), xy = new Vector2();
    const nearActor = new Box3(new Vector3(-.75, -.1, -.75), new Vector3(.75, 2.05, .75));
    const hits: Intersection[] = [];
    shot.actor = {
      turn,
      hit(clientX, clientY) {
        const rect = gl.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height || !pivot.current || useGarageParking.getState().departurePhase) return false;
        xy.set(2 * (clientX - rect.left) / rect.width - 1, 1 - 2 * (clientY - rect.top) / rect.height);
        ray.setFromCamera(xy, camera);
        if (!ray.ray.intersectsBox(nearActor)) return false;
        // Test actual visible outfit geometry once on press. Captured moves use only their X delta.
        const actor = pivot.current.getObjectByName("garage-driver");
        hits.length = 0;
        actor?.traverseVisible(part => {
          if (!hits.length && part instanceof Mesh) part.raycast(ray, hits);
        });
        return hits.length > 0;
      },
    };
    return () => { delete shot.actor; };
  }, [gl, camera, invalidate, shot]);
  return <group name="roster-character-pivot" ref={pivot} userData={{ actorAsset }} rotation-y={ROSTER_HEADING}>
    <PreviewContactShadow footprint={[.52, .46]} />
    <AssetBoundary resetKey={choice.id} fallback={<UnavailableRosterActor settled={settled} />}>
      <Suspense fallback={null}><GarageDriver choice={choice} upright rosterPreview creatorEmotes={creatorEmotes}
        paused={mode === "profile"} onSettled={settled} /></Suspense>
    </AssetBoundary>
  </group>;
}

/** Install just the selected actor in the already-mounted room; row thumbnails have no scene. */
export function RosterGaragePreview({ choice, mode, creatorFrame, creatorEmotes }: Omit<GarageCharacterSelection, "choice"> & { choice?: CharacterChoice }) {
  const driving = useGarageParking(s => mode === "main" && s.driving);
  const departure = useGarageParking(s => mode === "main" ? s.departurePhase : null);
  const boarding = departure === "boarding";
  const rolling = driving || departure === "rolling" || departure === "outside";
  const { model } = useGarageParkingVehicle();
  const reduced = Boolean(departure && (document.documentElement.dataset.reduceMotion === "true" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const departureView = reduced ? "still" : rolling ? "chase" : boarding ? "door" : undefined;
  const parkingKey = useSocialStore(s => {
    const profile = s.view?.profile;
    return profile ? JSON.stringify([profile.id, profile.active_character_id]) : "local";
  });
  const station = useUIStore(state => mode === "main"
    ? MAIN_MENU_ITEMS[state.selectedMenuIndexById.main]?.id ?? "enter_world" : undefined);
  const editorFrame = useGarageEditor(s => mode === "main" && s.page === "room" ? s.cameraProp : null);
  // Ignore other furniture while pointing at a station, including drag updates
  // in the room editor. Keep the same camera shot throughout the gesture.
  const stationPose = usePersonalGarage(s => editorFrame ? null :
    station === "wardrobe" ? s.layout.lockers : station === "world_editor" ? s.layout.desk : null);
  // Changing rigs has a new measured endpoint. Color and makeup changes keep
  // the existing shot and in-flight interpolation.
  const creatorRig = mode === "create" ? choice?.id : undefined;
  const shot = useMemo(() => {
    if (departureView === "chase") return garageParkingCamera();
    if (departureView) return boardingCamera(model, departureView === "still");
    if (editorFrame) return garageRoomEditorCamera(editorFrame);
    if (station) return garageMenuCamera(station, garageStationAnchor(station, stationPose, garageParkingPose));
    return rosterCamera(mode === "main" ? "roster" : mode, creatorFrame);
  }, [departureView, model, editorFrame, mode, station, stationPose, creatorFrame, creatorRig]);
  useLayoutEffect(() => {
    setGaragePreview({ shot, loadBayDetail: mode === "main", demand: true, shadows: false, contents: <>
      {choice && !driving && !editorFrame && <RosterActor shot={shot} choice={choice} mode={mode} creatorEmotes={creatorEmotes} />}
      {mode === "main" && <>
        <GarageMenuFurnishings />
        {departure && <AssetBoundary resetKey={parkingKey} fallback={<UnavailableBoarding />}>
          <Suspense fallback={<LoadingBoarding />}><GarageBoardingPerformance model={model} characterId={choice?.id} /></Suspense>
        </AssetBoundary>}
        <GarageParkingMotion parkingKey={parkingKey} />
        <GarageExitApron driving={rolling} />
        {!driving && !departure && !editorFrame && <GarageMenuMarkers />}
      </>}
    </> });
  }, [choice, mode, creatorEmotes, shot, driving, rolling, departure, model, editorFrame, parkingKey]);
  // Reframe the same actor when switching panels. Release the scene only on leaving this preview.
  useLayoutEffect(() => () => setGaragePreview(null), []);
  useLayoutEffect(() => {
    const motion = getGarageMotion();
    if (driving || departure || editorFrame) {
      motion.stickYaw = motion.stickPitch = 0;
      return;
    }
    return bindRosterSticks((x, y, turn, elapsed) => {
      const yaw = -x * MAX_YAW, pitch = y * MAX_PITCH;
      if (yaw !== (motion.stickYaw ?? 0) || pitch !== (motion.stickPitch ?? 0)) {
        if (!motion.stickYaw && !motion.stickPitch || !yaw && !pitch) motion.lastInput = performance.now();
        motion.stickYaw = yaw;
        motion.stickPitch = pitch;
        motion.invalidate?.();
      }
      if (turn) shot.actor?.turn(turn * elapsed * 2.6);
    });
  }, [shot, driving, departure, editorFrame]);
  return null;
}
