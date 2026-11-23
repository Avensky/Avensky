import { useEffect, useState } from "react";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";

function MenuFlareLoop() {
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReducedMotion(preference?.matches ?? false);
    preference?.addEventListener("change", update);
    return () => preference?.removeEventListener("change", update);
  }, []);
  if (reducedMotion || systemReducedMotion) return null;
  return <video autoPlay loop muted playsInline preload="none" src="/images/purple-sunflare-loop.mp4" />;
}

export function MenuFlareBackground({ animated = false }: { animated?: boolean }) {
  return <div aria-hidden="true" className="menu-flare-background">{animated && <MenuFlareLoop />}</div>;
}
