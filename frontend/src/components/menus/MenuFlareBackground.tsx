import { useEffect, useRef, useState } from "react";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";

function MenuFlareLoop() {
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const ref = useRef<HTMLVideoElement>(null);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReducedMotion(preference?.matches ?? false);
    preference?.addEventListener("change", update);
    return () => preference?.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const video = ref.current;
    if (reducedMotion || systemReducedMotion || !video) return;
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    const play = () => {
      if (document.visibilityState !== "hidden" && video.paused) {
        void video.play()?.catch(() => {
          // The still stays visible until this device allows playback.
        });
      }
    };
    video.addEventListener("loadeddata", play, { once: true });
    document.addEventListener("visibilitychange", play);
    document.addEventListener("pointerup", play, { capture: true, passive: true });
    document.addEventListener("keydown", play, { capture: true });
    play();
    return () => {
      video.removeEventListener("loadeddata", play);
      document.removeEventListener("visibilitychange", play);
      document.removeEventListener("pointerup", play, true);
      document.removeEventListener("keydown", play, true);
    };
  }, [reducedMotion, systemReducedMotion]);
  if (reducedMotion || systemReducedMotion) return null;
  return <video ref={ref} autoPlay loop muted playsInline preload="auto" poster="/images/purple-sunflare.webp"
    src="/images/purple-sunflare-loop.mp4" onError={event => { event.currentTarget.hidden = true; }} />;
}

export function MenuFlareBackground({ animated = false }: { animated?: boolean }) {
  return <div aria-hidden="true" className="menu-flare-background">{animated && <MenuFlareLoop />}</div>;
}
