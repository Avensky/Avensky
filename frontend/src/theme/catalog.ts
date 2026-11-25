import {applyTeamIdentityColors} from './matchTeamTheme.ts';
import palettes from './palettes.json' with { type: 'json' };

/** Base palettes are always available. Never gate readable UI behind progress. */
// The staging sign-in portal and the React app import the same palette JSON.
// Do not maintain a separate list of login colors.
export const UI_THEMES = palettes as typeof palettes & {
  [Name in keyof typeof palettes]: { readonly scheme: "dark" | "light" }
};
export type UITheme = keyof typeof UI_THEMES;
export const isUITheme = (value: unknown): value is UITheme =>
  typeof value === "string" && Object.hasOwn(UI_THEMES, value);
export type GarageTheme = UITheme | "auto";
export const selectedGarageTheme = (s: { theme: UITheme; garageEffects: { theme: GarageTheme } }): UITheme =>
  s.garageEffects.theme === "auto" ? s.theme : s.garageEffects.theme;
export function applyUITheme(theme: UITheme, garage: UITheme = theme) {
  const palette = UI_THEMES[theme],
    root = document.documentElement;
  root.dataset.uiTheme = theme;
  root.dataset.garageTheme = garage;
  root.dataset.uiScheme = palette.scheme;
  root.style.colorScheme = palette.scheme;
  for (const name of Object.keys(palette) as (keyof typeof palette)[]) {
    if (name === "label" || name === "scheme") continue;
    const colors = name.startsWith("garage-") ? UI_THEMES[garage] : palette;
    root.style.setProperty(`--app-${name}`, colors[name]);
  }
  applyTeamIdentityColors(root, palette.scheme);
}
