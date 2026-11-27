import { useCallback, useLayoutEffect, useMemo, useRef, lazy, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group } from "three";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { garageParkingPose as parked, garageParkingFootprint } from "./garageParkingCamera";
import { garageBayOpening, setGarageBayOpen } from "./garageBayMotion";
import { GARAGE_BAY_DOORS } from "./garageDoorLayout";
import { useGarageParkingVehicle } from "./garageParkingVehicle";
import { approachBay, bodySpan, initialGaragePose, moveGarageCar, rearClearOfBays, type CarFootprint } from "./garageParkingPhysics";
import { GarageDepartureDrive } from "./garageDepartureRoute";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { bindParkingWake, readParkingInput, useGarageParking } from "./garageParkingStore";

import { usePersonalGarage } from "../../store/social/personalGarage";
import { garageParkingObstacles } from "./garageServiceLayout";

const GarageParkedVehicle = lazy(() => import("./GarageParkedVehicle").then(module => ({ default: module.GarageParkedVehicle })));
let retainedKey: string | undefined;

export function GarageParkingMotion({ parkingKey }: { parkingKey: string }) {
  const vehicle = useGarageParkingVehicle();
  const layout = usePersonalGarage(state => state.layout);
  const obstacles = useMemo(() => garageParkingObstacles(layout), [layout]);
  const key = parkingKey + "/" + vehicle.model;
  const host = useRef<Group>(null);
  const car = useRef<CarFootprint>({ width: 2.03, length: 4.34, height: 1.24 });
  const outside = useRef(false);
  const dirty = useRef(true);
  const departure = useRef<GarageDepartureDrive | null>(null);
  const savedPose = useRef<typeof parked | null>(null);
  const activeBay = useRef(-1);
  const wake = useThree(state => state.invalidate);
  useLayoutEffect(() => { departure.current = null; }, [obstacles]);
  const onFootprint = useCallback((dimensions: CarFootprint) => {
    if (Math.abs(dimensions.width - car.current.width) > .01 || Math.abs(dimensions.length - car.current.length) > .01 ||
        Math.abs(dimensions.height - car.current.height) > .01)
      departure.current = null;
    car.current = dimensions;
    Object.assign(garageParkingFootprint, dimensions);
    dirty.current = true;
    wake();
  }, [wake]);
  useLayoutEffect(() => {
    if (retainedKey !== key || rearClearOfBays(parked, car.current)) Object.assign(parked, initialGaragePose());
    retainedKey = key;
    outside.current = false;
    dirty.current = true;
    if (useGarageParking.getState().departurePhase) savedPose.current = { ...parked };
    const unbind = bindParkingWake(wake);
    const unsubscribe = useGarageParking.subscribe((state, previous) => {
      if (state.departurePhase && !previous.departurePhase) {
        savedPose.current = { ...parked };
        departure.current = null;
        outside.current = false;
      } else if (!state.departurePhase && previous.departurePhase) {
        if (savedPose.current) Object.assign(parked, savedPose.current);
        departure.current = null;
        savedPose.current = null;
      }
      if (state.driving === previous.driving && state.departurePhase === previous.departurePhase) return;
      parked.speed = 0;
      if (state.driving) outside.current = false; // Resume an interrupted departure if parked on the apron.
      dirty.current = true;
      wake();
    });
    wake();
    return () => {
      parked.speed = 0;
      unbind();
      unsubscribe();
      if (activeBay.current >= 0) setGarageBayOpen(activeBay.current, false);
      activeBay.current = -1;
      // A later visit to the menu starts inside after a completed world departure.
      if (rearClearOfBays(parked, car.current)) retainedKey = undefined;
    };
  }, [key, wake]);

  useFrame(({ camera }, delta) => {
    if (!host.current) return;
    const session = useGarageParking.getState();
    const phase = session.departurePhase;
    if (!session.driving && !phase && !dirty.current) return;
    dirty.current = false;
    const input = readParkingInput();
    if (phase === "boarding" || phase === "rolling") {
      departure.current ??= new GarageDepartureDrive(parked, car.current, obstacles);
      if (!departure.current.prepare()) {
        session.failDeparture("There’s no driving path from this spot. Use Drive to reposition the car.");
        return;
      }
      if (phase === "rolling" &&
          departure.current.step(parked, delta, garageBayOpening, usePreferencesStore.getState().reducedMotion) === "blocked") {
        session.failDeparture("The path out is blocked. Use Drive to reposition the car.");
        return;
      }
    } else if (session.driving && !session.joining) {
      moveGarageCar(parked, car.current, input, delta, garageBayOpening, obstacles);
    } else parked.speed = 0;
    host.current.position.set(parked.x, 0, parked.z);
    host.current.rotation.y = parked.yaw;
    const bay = approachBay(parked, car.current);
    // After parking, hold a shutter only while the body actually straddles its opening.
    const cleared = rearClearOfBays(parked, car.current);
    const driveUp = (session.driving || phase === "rolling") && (!cleared || parked.speed < 0 || input.throttle < 0);
    const wallZ = GARAGE_BAY_DOORS[0].position[2];
    const inDoor = !cleared && Math.abs(parked.z - wallZ) < bodySpan(car.current, parked.yaw).z + .25;
    // A rejected or delayed handoff leaves the driver on the apron. Keep the
    // sightline through the same doorway until the chase camera also clears it.
    const cameraInBay = (session.driving || !!phase) && cleared && activeBay.current >= 0 && camera.position.z < wallZ + .4;
    const wanted = cameraInBay ? activeBay.current : (driveUp || inDoor ? bay : -1);
    if (activeBay.current !== wanted) {
      if (activeBay.current >= 0) setGarageBayOpen(activeBay.current, false);
      if (wanted >= 0) setGarageBayOpen(wanted, true);
      activeBay.current = wanted;
    }
    if (cleared && phase === "rolling") { parked.speed = 0; session.reachApron(); }
    if (cleared && !outside.current && session.driving) {
      parked.speed = 0;
      void session.depart(vehicle.heroId);
    }
    if (!cleared && outside.current && session.error) session.clearError();
    outside.current = cleared;
    // Boarding owns the actor frames. A slow asset load can sleep once its route is known.
    if (parked.speed || phase === "rolling" || departure.current?.planning) wake();
  }, -1.5);
  return <group name="garage-parked-car-motion" ref={host}>
    <AssetBoundary resetKey={key} fallback={null}>
      <Suspense fallback={null}><GarageParkedVehicle onFootprint={onFootprint} /></Suspense>
    </AssetBoundary>
  </group>;
}
