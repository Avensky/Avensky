import type { HeroWorkshop } from "./HeroWorkshop";

let component: typeof HeroWorkshop | undefined;
let loading: Promise<{ default: typeof HeroWorkshop }> | undefined;

export const loadedGarageWorkshop = () => component;

/** Warm the station UI on approach. Meshes still load with their visible subject. */
export function loadGarageWorkshop() {
  return loading ??= import("./HeroWorkshop").then(module => {
    component = module.HeroWorkshop;
    return { default: component };
  }).catch(error => {
    loading = undefined;
    throw error;
  });
}
