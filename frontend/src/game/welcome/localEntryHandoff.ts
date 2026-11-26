import { entryAssets, stagingAccountPortal } from "./config";

type EntryNavigation = {
  beginHandoff(main: HTMLElement, header: HTMLElement | null): void;
  captureLogout?(): (() => void) | undefined;
};
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

export function captureLocalLogout(main: HTMLElement) {
  const navigation = installedNavigation();
  if (navigation?.captureLogout) return navigation.captureLogout();
  return () => main.querySelector(".garage-entry-body")?.classList.add("garage-entry-incoming");
}
