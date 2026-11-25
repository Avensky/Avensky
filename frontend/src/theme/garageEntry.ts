import { APP_BRANDING } from "./branding.ts";

export const GARAGE_ENTRY_STORAGE_KEY = "avensky-portal-backdrop";
export const GARAGE_ENTRY_POSTER = "garage-entry.87218bf4bd50.webp";

// This markup is also rendered by the standalone Node portal before React loads.
// All interpolation here is from app configuration. Form values stay in native inputs.
function escapeText(text: string) {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function garageBackdrop(assets: "/images" | "/__alpha/entry") {
  return `<div class="garage-entry-scene" aria-hidden="true">
    <div class="garage-entry-plate"><img class="garage-entry-photo" src="${assets}/${GARAGE_ENTRY_POSTER}" width="1680" height="775" alt="" decoding="async" fetchpriority="low"><span class="garage-entry-sign">${escapeText(APP_BRANDING.garageSign)}</span></div>
  </div>`;
}

export function garageBrandHeader(assets: "/images" | "/__alpha/entry") {
  return `<header class="garage-entry-header angled-tab-header">
    <div class="garage-entry-brand"><img src="${assets}/logo.svg" width="40" height="40" alt="">
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
