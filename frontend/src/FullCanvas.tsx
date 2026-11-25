import { setGaragePreview } from "./game/preview/LiveGarage";
import { useUIStore } from "./store/menus";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useRenderSettingsStore } from "./store/presentation/renderSettingsStore";
import { PerformanceProbe } from "./performance/PerformanceProbe";

import { ScoreboardSceneCover } from "./game/stats/ScoreboardSceneCover";
import { usePreferencesStore } from "./store/preferences/preferencesStore";
import { isCompactPreview, PREVIEW_FRAME_MS } from "./game/preview/previewBudget";

const compactViewport = () => isCompactPreview(window.innerWidth);
function subscribeViewport(listener: () => void) {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

function PreviewFrameClock() {
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    let frame = 0;
    let previous = -Infinity;
    const tick = (now: number) => {
      // Match display paints so the compact preview takes even steps.
      if (now - previous >= PREVIEW_FRAME_MS - 2) {
        previous = now;
        invalidate();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [invalidate]);
  return null;
}

function RevealPreview() {
  const shown = useRef(false);
  const canvas = useThree(s => s.gl.domElement);
  useEffect(() => () => { delete canvas.dataset.previewReady; }, [canvas]);
  useFrame(({ gl }) => {
    if (shown.current) return;
    shown.current = true;
    // Reveal after this frame's renderer/composer completes, on its existing loop.
    queueMicrotask(() => {
      gl.domElement.dataset.previewReady = "true";
    });
  }, -100);
  return null;
}

export function FullCanvas({
  children,
  preview = false,
  paused = false,
  covered = false,
  roomReady = false,
}: {
  children: ReactNode;
  preview?: boolean;
  paused?: boolean;
  covered?: boolean;
  roomReady?: boolean;
}) {
  const authoring = useUIStore(
    (s) => s.screen === "world_builder" || s.overlay === "world_builder",
  );
  const dpr = useRenderSettingsStore((s) => s.dpr);
  const shadows = useRenderSettingsStore((s) => s.shadows);
  const reducedMotion = usePreferencesStore(s => s.reducedMotion);
  const compact = useSyncExternalStore(subscribeViewport, compactViewport, () => false) && preview;
  const demand = authoring || paused || (preview && (compact || reducedMotion));
  const previewSlot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!preview) return;
    setGaragePreview({
      demand, shadows: shadows && !compact, dpr: compact ? Math.min(dpr, 1) : dpr,
      contents: <>
        {roomReady && <RevealPreview />}
        {compact && !paused && !reducedMotion && <PreviewFrameClock />}
        <ScoreboardSceneCover /><PerformanceProbe />{children}
      </>,
    });
  }, [preview, demand, compact, shadows, dpr, roomReady, paused, reducedMotion, children]);
  useLayoutEffect(() => {
    if (!preview) return;
    const room = document.querySelector<HTMLElement>("[data-live-garage]");
    const home = document.querySelector(".garage-menu-backdrop");
    if (room) previewSlot.current?.append(room);
    return () => {
      setGaragePreview(null);
      if (room && home) home.append(room);
    };
  }, [preview]);
  if (preview) return <div ref={previewSlot} className="garage-preview-slot" aria-hidden="true" />;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100svh", // mobile-safe viewport height
        overflow: "hidden",
        touchAction: "none",
        visibility: covered ? "hidden" : undefined,
        // background: "black",
        zIndex: 0,
      }}
    >
      <Canvas
        frameloop={demand ? "demand" : "always"}
        camera={{ position: [0, 10, 20], fov: 50, far: 2000 }}
        dpr={compact ? Math.min(dpr, 1) : dpr}
        shadows={shadows && !compact}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
      >
        <ScoreboardSceneCover />
        <PerformanceProbe />
        {children}
      </Canvas>
    </div>
  );
}
