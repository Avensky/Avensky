import { APP_BRANDING } from "./branding.ts";

export const DEFAULT_GARAGE_THEME = "pit-wall";
export const GARAGE_ENTRY_STORAGE_KEY = "avensky-portal-backdrop";
export const GARAGE_ENTRY_MASK = "garage-wall-mask.4688e14d5cc9.webp";
export const GARAGE_ENTRY_PORTRAIT = "garage-entry-portrait.0044873c6652.webp";
export const GARAGE_ENTRY_POSTER = "garage-entry.35a14b2cd219.webp";

// This markup is also rendered by the standalone Node portal before React loads.
// All interpolation here is from app configuration. Form values stay in native inputs.
function escapeText(text: string) {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function garageBackdrop(assets: "/images" | "/__alpha/entry") {
  return `<avensky-garage-room class="garage-entry-scene" data-finish="${assets}/garage-wall-finish.webp" aria-hidden="true">
    <picture><source media="(orientation: portrait)" srcset="${assets}/${GARAGE_ENTRY_PORTRAIT}">
    <img class="garage-entry-photo" src="${assets}/${GARAGE_ENTRY_POSTER}" width="1680" height="775" alt="" draggable="false" decoding="async"></picture>
  </avensky-garage-room>`;
}

export function garageBrandHeader(assets: "/images" | "/__alpha/entry") {
  return `<header class="garage-entry-header angled-tab-header">
    <div class="garage-entry-brand"><img src="${assets}/logo.svg" width="26" height="26" alt="" draggable="false">
    <span>${escapeText(APP_BRANDING.productName)}</span></div>
  </header>`;
}

export function garageCredentials(portal: boolean) {
  const identity = portal ? "Email" : "Email or account name";
  return `<label class="garage-field" data-controller-row>
    <span class="garage-field-name">${identity}</span><span class="garage-field-icon garage-email" aria-hidden="true"></span>
    <input name="${portal ? "email" : "login"}" type="${portal ? "email" : "text"}" autocomplete="username"
      inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" placeholder="${identity}" required>
  </label>
  <div class="garage-field garage-password" data-controller-row>
    <label for="alpha-password" class="garage-field-name">Password</label><span class="garage-field-icon garage-lock" aria-hidden="true"></span>
    <input id="alpha-password" type="password" name="password" autocomplete="current-password" maxlength="${portal ? 128 : 256}" placeholder="Password" required>
    <button type="button" class="password-toggle garage-eye" aria-controls="alpha-password"${portal ? " hidden" : ""}>Show password</button>
  </div>
  <div data-controller-row><button type="submit" class="garage-sign-in">Sign in</button></div>`;
}
