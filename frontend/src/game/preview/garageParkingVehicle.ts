import { HEROES } from "../../store/alpha/alphaStore";
import { useHeroLoadouts } from "../../vehicles/cosmetics/heroLoadouts";
import { vehicleSystems } from "../../vehicles/vehicleSystems";

const loanCar = HEROES.find(hero => hero.id === "brz")!;

/** The physical parking bay and the Open World hand-off share the same road vehicle. */
export function garageParkingVehicle(defaultHero: string) {
  const saved = HEROES.find(hero => hero.id === defaultHero);
  const hero = saved && vehicleSystems(saved.vehicle) === "road" ? saved : loanCar;
  return { model: hero.vehicle, heroId: hero.id, name: hero.name, loaner: hero !== saved };
}

export function useGarageParkingVehicle() {
  return garageParkingVehicle(useHeroLoadouts(state => state.defaultHero));
}
