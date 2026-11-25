import { useProgress } from "@react-three/drei";
import { useUIStore } from "../store";
import { useEffect, useMemo } from "react";
import { isAssetLoadingComplete } from "./tools/assetLoading";

export function ModeLoadingScreen() {
  const { active, progress, item, loaded, total } = useProgress();

  const isModeLoading = useUIStore((s) => s.isModeLoading);
  const screen = useUIStore((s) => s.screen);
  const loadingLabel = useUIStore((s) => s.loadingLabel);
  const finishModeLoading = useUIStore((s) => s.finishModeLoading);

  const assetsReady = isAssetLoadingComplete({ active, progress, total });

  const shownProgress = useMemo(() => {
    if (!isModeLoading || assetsReady) return 100;
    return Math.max(1, Math.min(100, progress));
  }, [isModeLoading, assetsReady, progress]);

  useEffect(() => {
    if (!isModeLoading) return;

    if (assetsReady) {
      const t = window.setTimeout(() => {
        finishModeLoading();
      }, 900);

      return () => window.clearTimeout(t);
    }
  }, [assetsReady, isModeLoading, finishModeLoading]);

  // Selection already has the shared garage while its assets
  // load. Keep the readiness gate, without covering it with a second loader.
  if (
    !isModeLoading ||
    screen === "mode_select" ||
    screen === "queue" ||
    screen === "sandbox_setup" ||
    screen === "hero_select"
  )
    return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center overflow-hidden garage-mode-loading">

      <div className="relative z-10 w-[min(90vw,560px)] rounded-2xl border garage-loading-panel p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.4em] garage-loading-brand">
          AVENSKY
        </p>

        <h1 className="mt-3 text-3xl font-black">
          {loadingLabel}
        </h1>

        <p className="mt-2 truncate font-mono text-xs garage-loading-muted">
          {item || "Initializing systems..."}
        </p>

        <div className="mt-6 h-3 overflow-hidden rounded-full border garage-loading-track">
          <div
            className="h-full garage-loading-fill transition-all duration-200"
            style={{ width: `${Math.round(shownProgress)}%` }}
          />
        </div>

        <div className="mt-3 flex justify-between font-mono text-xs garage-loading-muted">
          <span>
            {total > 0 ? `${loaded}/${total} files` : "preparing mode"}
          </span>
          <span>{Math.round(shownProgress)}%</span>
        </div>
      </div>
    </div>
  );
}
