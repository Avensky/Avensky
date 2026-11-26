import { entryAssets, stagingAccountPortal } from "./config";

type EntryNavigation = { beginHandoff(main: HTMLElement, header: HTMLElement | null): void };
let loading = false;

function installedNavigation() {
  return (window as Window & { avenskyPortalNavigation?: EntryNavigation }).avenskyPortalNavigation;
}

/** Warm the shared visual helper on local form interaction. Authentication never waits for it. */
export function prepareLocalEntryHandoff() {
  if (stagingAccountPortal || installedNavigation() || loading) return;
  loading = true;
  const script = document.createElement("script");
  script.src = entryAssets + "/sign-in-navigation.js";
  script.async = true;
  script.onload = script.onerror = () => {
    loading = false;
    script.remove();
  };
  document.head.append(script);
}

export function beginLocalEntryHandoff(main: HTMLElement) {
  installedNavigation()?.beginHandoff?.(main, main.querySelector(".garage-entry-header"));
}
