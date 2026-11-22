import roster from "../../../../packages/wardrobe-catalog/vehicle-drivers.json";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";

type Starter = { name: string; outfit: string; color: string; accent: string };
type Gender = "female" | "male";
export type VehicleDriver = Starter & { id: string; gender: Gender; vehicle: VehicleModelId };
const pairs: Partial<Record<VehicleModelId, Record<Gender, Starter>>> = roster;

export function driversForVehicle(vehicle: VehicleModelId): VehicleDriver[] {
  const pair = pairs[vehicle];
  if (!pair) return [];
  return (["female", "male"] as const).map(gender => ({
    ...pair[gender], id: vehicle + "-" + gender, gender, vehicle,
  }));
}

export const VEHICLE_DRIVERS = Object.keys(roster)
  .flatMap(vehicle => driversForVehicle(vehicle as VehicleModelId));

export function findVehicleDriver(id: string | null | undefined) {
  return VEHICLE_DRIVERS.find(driver => driver.id === id);
}
