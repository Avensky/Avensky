import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";
import { useGarageParking } from "./garageParkingStore";
import { boardGarageCar } from "./boardGarageCar";

export function GarageBoardingPerformance({ model, characterId }: { model: VehicleModelId; characterId?: string }) {
  const boarding = useRef<ReturnType<typeof boardGarageCar> | null>(null);
  const elapsed = useRef(0);
  const scene = useThree(s => s.scene), invalidate = useThree(s => s.invalidate);
  useLayoutEffect(() => {
    elapsed.current = 0;
    if (!characterId) {
      useGarageParking.getState().failDeparture("Choose a character from the roster before entering the Harbor.");
      return;
    }
    const timeout = window.setTimeout(() => {
      if (!boarding.current && useGarageParking.getState().departurePhase === "boarding")
        useGarageParking.getState().failDeparture("Your character or vehicle is still loading. Try Enter World again.");
    }, 45000);
    invalidate();
    return () => {
      window.clearTimeout(timeout);
      boarding.current?.dispose();
      boarding.current = null;
      invalidate();
    };
  }, [invalidate, model, characterId]);
  useFrame((_, delta) => {
    const session = useGarageParking.getState();
    if (!session.departurePhase) return;
    if (!boarding.current) {
      const actor = scene.getObjectByName("roster-character-pivot") as Group | undefined;
      const actorAsset = actor?.userData.actorAsset;
      if (actorAsset && actorAsset.rigId === characterId && actorAsset.available === false) {
        session.failDeparture("Your character could not load. Try Enter World again or choose another character.");
        return;
      }
      const driver = actor?.getObjectByName("garage-driver")?.children.find(child => child.getObjectByName("head"));
      const vehicle = scene.getObjectByName("garage-parked-vehicle");
      // The two asset owners wake the canvas when their real meshes mount; a slow
      // download does not spend frames polling, or send an empty car to the Harbor.
      if (!actor?.isGroup || !driver || actorAsset?.rigId !== characterId || !actorAsset?.available ||
          vehicle?.userData.model !== model || !vehicle.children[0]?.children.length) return;
      try {
        boarding.current = boardGarageCar(actor, driver, model);
      } catch (error) {
        session.failDeparture(error instanceof Error ? error.message : "The character could not reach the driver door.");
        return;
      }
    }
    elapsed.current += Math.min(delta, .25);
    const seated = boarding.current.sample(elapsed.current);
    if (session.departurePhase === "boarding") {
      if (seated) session.finishBoarding();
      invalidate();
    }
  }, -1.15);
  return null;
}
