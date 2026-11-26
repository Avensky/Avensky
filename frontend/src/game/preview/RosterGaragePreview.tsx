import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, Group, Mesh, Raycaster, Vector2, Vector3, type Intersection } from "three";
import type { CharacterChoice } from "../characters/characterCatalog";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { getGarageMotion, setGaragePreview } from "./LiveGarage";
import { MAX_PITCH, MAX_YAW } from "./garageEntryInteraction";
import { PreviewContactShadow } from "./PreviewContactShadow";
import { bindRosterSticks } from "./rosterStickControls";
import { ROSTER_HEADING, rosterCamera, type CharacterGarageShot, type CharacterGarageView, type CreatorFrame } from "./rosterCamera";

const GarageDriver = lazy(() => import("../characters/GarageDriver").then(module => ({ default: module.GarageDriver })));
export type GarageCharacterSelection = { choice: CharacterChoice; mode: CharacterGarageView; creatorFrame?: CreatorFrame };

function UnavailableRosterActor({ settled }: { settled: (available: boolean) => void }) {
  useLayoutEffect(() => settled(false), [settled]);
  return null;
}

function RosterActor({ choice, mode, creatorFrame, shot }: GarageCharacterSelection & { shot: CharacterGarageShot }) {
  const pivot = useRef<Group>(null);
  const portraitRig = useRef<{ shot: CharacterGarageShot; id: string } | null>(null);
  const gl = useThree(s => s.gl);
  const camera = useThree(s => s.camera);
  const invalidate = useThree(s => s.invalidate);
  const settled = useCallback((available: boolean, rigId?: string) => {
    if (available && rigId !== choice.id) return;
    shot.subject = available ? "ready" : "unavailable";
    invalidate();
  }, [shot, choice.id, invalidate]);
  useFrame(() => {
    if ((mode !== "profile" && mode !== "create") || shot.subject !== "ready" || !pivot.current) return;
    if (portraitRig.current?.shot === shot && portraitRig.current.id === choice.id) return;
    // The starter rigs have different proportions. Measure once on the dressed
    // actor after loading, before the shared camera applies its view for this frame.
    const head = pivot.current.getObjectByName("head");
    const waist = pivot.current.getObjectByName("spine_03");
    if (!head || !waist) return;
    const position = new Vector3();
    shot.fitPortrait(head.getWorldPosition(position).y + .065, waist.getWorldPosition(position).y + .03);
    portraitRig.current = { shot, id: choice.id };
  }, -1.25);
  useLayoutEffect(() => {
    const turn = (radians: number) => {
      if (!radians || !pivot.current) return;
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
        if (!rect.width || !rect.height || !pivot.current) return false;
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
  return <group name="roster-character-pivot" ref={pivot} rotation-y={ROSTER_HEADING}>
    <PreviewContactShadow footprint={[.52, .46]} />
    <AssetBoundary resetKey={choice.id} fallback={<UnavailableRosterActor settled={settled} />}>
      <Suspense fallback={null}><GarageDriver choice={choice} upright rosterPreview creating={mode === "create"}
        paused={mode === "profile" || (mode === "create" && creatorFrame !== "outfit")} onSettled={settled} /></Suspense>
    </AssetBoundary>
  </group>;
}

/** Install just the selected actor in the already-mounted room; row thumbnails have no scene. */
export function RosterGaragePreview({ choice, mode, creatorFrame }: GarageCharacterSelection) {
  // Changing rigs has a new measured endpoint. Color and makeup changes keep
  // the existing shot and in-flight interpolation.
  const creatorRig = mode === "create" ? choice.id : undefined;
  const shot = useMemo(() => rosterCamera(mode, creatorFrame), [mode, creatorFrame, creatorRig]);
  useLayoutEffect(() => {
    setGaragePreview({ shot, demand: true, shadows: false, contents: <RosterActor shot={shot} choice={choice} mode={mode} creatorFrame={creatorFrame} /> });
  }, [choice, mode, creatorFrame, shot]);
  // Reframe the same actor when switching panels. Release the scene only on leaving this preview.
  useLayoutEffect(() => () => setGaragePreview(null), []);
  useLayoutEffect(() => {
    const motion = getGarageMotion();
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
  }, [shot]);
  return null;
}
