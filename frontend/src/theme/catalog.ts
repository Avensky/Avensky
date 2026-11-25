import {applyTeamIdentityColors} from './matchTeamTheme.ts';
import palettes from './palettes.json';

/** Base palettes are always available. Never gate readable UI behind progress. */
// The staging sign-in portal and the React app import the same palette JSON.
// Do not maintain a separate list of login colors.
export const UI_THEMES = palettes as typeof palettes & {
  [Name in keyof typeof palettes]: { readonly scheme: "dark" | "light" }
};
export type UITheme = keyof typeof UI_THEMES;
export const isUITheme = (value: unknown): value is UITheme =>
  typeof value === "string" && Object.hasOwn(UI_THEMES, value);
export function applyUITheme(theme: UITheme) {
  const palette = UI_THEMES[theme],
    root = document.documentElement;
  root.dataset.uiTheme = theme;
  root.dataset.uiScheme = palette.scheme;
  root.style.colorScheme = palette.scheme;
  for (const [name, value] of Object.entries(palette))
    if (name !== "label" && name !== "scheme")
      root.style.setProperty(`--app-${name}`, value);
  applyTeamIdentityColors(root, palette.scheme);
}
