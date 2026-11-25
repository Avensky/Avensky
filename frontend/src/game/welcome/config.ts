export const stagingAccountPortal = import.meta.env.MODE === "staging" && typeof window !== "undefined"
  && window.location.hostname === "staging.avensky.com";

export const PLAYER_ONBOARDING = stagingAccountPortal || import.meta.env.VITE_PLAYER_ONBOARDING === "1";

export const entryAssets = stagingAccountPortal ? "/__alpha/entry" : "/images";
