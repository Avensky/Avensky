import { lazy, Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, Group, Mesh, Raycaster, Vector2, Vector3, type Intersection } from "three";
import type { CharacterChoice } from "../characters/characterCatalog";
import type { SelectionPoseId } from "../characters/selectionPoses";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { getGarageMotion, setGaragePreview, type GarageEntryShot } from "./LiveGarage";
import { MAX_PITCH, MAX_YAW } from "./garageEntryInteraction";
import { PreviewContactShadow } from "./PreviewContactShadow";
import { bindRosterSticks } from "./rosterStickControls";
import { ROSTER_HEADING, rosterCamera } from "./rosterCamera";

const GarageDriver = lazy(() => import("../characters/GarageDriver").then(module => ({ default: module.GarageDriver })));
type Selection = { choice: CharacterChoice; pose?: SelectionPoseId };

function RosterActor({ choice, pose, shot }: Selection & { shot: GarageEntryShot }) {
  const pivot = useRef<Group>(null);
  const gl = useThree(s => s.gl);
  const camera = useThree(s => s.camera);
  const invalidate = useThree(s => s.invalidate);
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
    <AssetBoundary fallback={null}>
      <Suspense fallback={null}><GarageDriver choice={choice} upright selectionPose={pose} /></Suspense>
    </AssetBoundary>
  </group>;
}

/** Install just the selected actor in the already-mounted room; row thumbnails have no scene. */
export function RosterGaragePreview({ choice, pose = "pose-pocket-stance", creating = false }: Selection & { creating?: boolean }) {
  const shot = useMemo(() => rosterCamera(creating), [creating]);
  useLayoutEffect(() => {
    setGaragePreview({ shot, demand: true, shadows: false, contents: <RosterActor shot={shot} choice={choice} pose={pose} /> });
  }, [choice, pose, shot]);
  useLayoutEffect(() => {
    const motion = getGarageMotion();
    const unbind = bindRosterSticks((x, y, turn, elapsed) => {
      const yaw = -x * MAX_YAW, pitch = y * MAX_PITCH;
      if (yaw !== (motion.stickYaw ?? 0) || pitch !== (motion.stickPitch ?? 0)) {
        if (!motion.stickYaw && !motion.stickPitch || !yaw && !pitch) motion.lastInput = performance.now();
        motion.stickYaw = yaw;
        motion.stickPitch = pitch;
        motion.invalidate?.();
      }
      if (turn) shot.actor?.turn(turn * elapsed * 2.6);
    });
    return () => {
      unbind();
      setGaragePreview(null);
    };
  }, [shot]);
  return null;
}
