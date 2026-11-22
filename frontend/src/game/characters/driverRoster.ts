import { useSocialStore } from "../../store/social/socialStore";
import roster from "../../../../packages/wardrobe-catalog/vehicle-drivers.json";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";

type Starter = { name: string; outfit: string; color: string; accent: string };
type Gender = "female" | "male";
export type VehicleDriver = Starter & { id: string; gender: Gender; vehicle: VehicleModelId };
const pairs: Partial<Record<VehicleModelId, Record<Gender, Starter>>> = roster;

function builtinsForVehicle(vehicle: VehicleModelId): VehicleDriver[] {
  const pair = pairs[vehicle];
  if (!pair) return [];
  return (["female", "male"] as const).map(gender => ({
    ...pair[gender], id: vehicle + "-" + gender, gender, vehicle,
  }));
}

export const VEHICLE_DRIVERS = Object.keys(roster)
  .flatMap(vehicle => builtinsForVehicle(vehicle as VehicleModelId));

export function sharedDrivers(overrides: VehicleDriver[] = useSocialStore.getState().view?.roster ?? []) {
  if (!overrides.length) return VEHICLE_DRIVERS;
  const drivers = new Map(VEHICLE_DRIVERS.map(driver => [driver.id, driver]));
  for (const driver of overrides) drivers.set(driver.id, driver);
  return [...drivers.values()];
}

export function driversForVehicle(vehicle: VehicleModelId, overrides?: VehicleDriver[]) {
  return sharedDrivers(overrides).filter(driver => driver.vehicle === vehicle);
}

export function findVehicleDriver(id: string | null | undefined) {
  return useSocialStore.getState().view?.roster?.find(driver => driver.id === id) ?? VEHICLE_DRIVERS.find(driver => driver.id === id);
}
