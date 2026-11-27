// World-space points in the persistent garage, shared by the props, camera and menu labels.
export const GARAGE_MENU_LANDMARKS = {
  enter_world: [-5.60, 1.20, -4.30],
  wardrobe: [.05, 1.40, -2.40],
  vehicle: [-1.28, .70, .68],
  world_editor: [1.68, .90, -.15],
} as const;
export type GarageMenuStation = keyof typeof GARAGE_MENU_LANDMARKS;
