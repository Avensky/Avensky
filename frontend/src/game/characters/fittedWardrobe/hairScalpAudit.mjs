/**
 * Dev/staging-only visual comparison of Vesper's imported hair foundation.
 * Never changes saved hairstyle, outfit state, or production behavior.
 */
export function parseHairScalpAudit(search, enabled) {
  if (!enabled) return "off";
  const mode = new URLSearchParams(search).get("hairScalpAudit");
  switch (mode) {
    case "baseline":
    case "backing":
    case "legacy-cap":
    case "cap-only":
      return mode;
    default:
      return "off";
  }
}
