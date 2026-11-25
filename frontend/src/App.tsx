import { lazy, Suspense, useEffect } from "react";
import { Keyboard } from "./controls/Keyboard";
import { GameController } from "./controls/GameController";
import { useMobilePortrait } from "./controls/useMobilePortrait";
import { releaseWeaponSource } from "./combat/turretControls";
import { connectRustServer } from "./net/rustSocket";
import { startInputSender, stopInputSender } from "./net/inputSender";
import { useInputStore } from "./store/input/inputStore";
import "./App.css";
import { OnScreenKeyboard } from "./components/text/OnScreenKeyboard";
import { useUIStore } from "./store/menus/uiStore";
import { GarageMenuBackdrop } from "./game/welcome/GarageMenuBackdrop";
import { WelcomeScreen } from "./game/welcome/WelcomeScreen";
import { useAppTheme } from "./theme";

const GameUI = lazy(() => import("./game/GameUI").then(module => ({ default: module.GameUI })));

export default function App() {
  const mobilePortrait = useMobilePortrait();
  const welcome = useUIStore((state) => state.screen === "welcome");
  const showGarageBackdrop = useUIStore(state =>
    state.isModeLoading || state.overlay === "team_lineup" || (state.screen !== "sandbox" && state.screen !== "world_builder"));
  const rotate = mobilePortrait && !welcome;
  useAppTheme();

  useEffect(() => {
    if (rotate) {
      useInputStore.getState().releaseControls();
      releaseWeaponSource("pointer");
    }
  }, [rotate]);

  // The shared backdrop adopts the startup room before this cover is removed.
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      document.getElementById("startup-screen")?.remove(),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  // Connect to Rust server on mount
  useEffect(() => {
    connectRustServer();
  }, []);

  // Onboarding needs the social socket, but has no driving input to send.
  useEffect(() => {
    if (welcome) return;
    startInputSender(60);
    return () => {
      stopInputSender();
    };
  }, [welcome]);

  return (
    <div className="canvas-container">
      <div className="game-viewport" inert={rotate}>
        <GarageMenuBackdrop visible={showGarageBackdrop} />
        {welcome ? <WelcomeScreen /> : <Suspense fallback={null}><GameUI /></Suspense>}
        {!rotate && <OnScreenKeyboard />}
      </div>
      {rotate ? (
        <div className="mobile-rotate-screen" role="status">
          <svg width="64" height="64" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="7" y="19" width="34" height="21" rx="3" />
            <path d="M30 7a15 15 0 0 0-19 6m0-7v7h7m18 14v5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1>Rotate to play</h1>
          <p>Turn your device sideways for the widescreen view.</p>
        </div>
      ) : <><Keyboard /><GameController /></>}
    </div>
  );
}
