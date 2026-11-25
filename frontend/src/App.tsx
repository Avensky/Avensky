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
import { useSocialStore } from "./store/social/socialStore";
import { PLAYER_ONBOARDING, stagingAccountPortal } from "./game/welcome/config";
import { preloadGarage } from "./game/preview/garageModel";
import { useAppTheme } from "./theme";

const GameUI = lazy(() => import("./game/GameUI").then(module => ({ default: module.GameUI })));

export default function App() {
  const mobilePortrait = useMobilePortrait();
  const welcome = useUIStore((state) => state.screen === "welcome");
  const showGarageBackdrop = useUIStore(state => ["welcome","main","queue","heroes","hero_select","mode_select","sandbox_setup"].includes(state.screen));
  const signedIn = useSocialStore(s => s.stagingSignIn || Boolean(s.registeredProfile && s.view?.profile));
  const rotate = mobilePortrait && !welcome;
  useAppTheme();

  useEffect(() => {
    if (rotate) {
      useInputStore.getState().releaseControls();
      releaseWeaponSource("pointer");
    }
  }, [rotate]);

  // The HTML logo is visible before JavaScript loads. Clear it after React
  // commits the UI without waiting on artwork, WebGL or the game server.
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

  useEffect(() => {
    // On staging the protected app document is delivered after portal sign-in.
    if (stagingAccountPortal || !PLAYER_ONBOARDING || signedIn) preloadGarage();
  }, [signedIn]);

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
