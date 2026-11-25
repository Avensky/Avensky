import {SurveyMap} from "../ui/Minimap/SurveyMap";
import {MinimapSessionLifecycle} from "../ui/Minimap/MinimapSessionLifecycle";
import {CtfMissionLifecycle} from "./stats/CtfMissionLifecycle";
import {MatchResultsScreen} from "./results/MatchResultsScreen";
import {CtfMatchHUD} from "./stats/CtfMatchHUD";
import {MatchScoreboard} from "./stats/MatchScoreboard";
import {TeamLineup} from "./stats/TeamLineup";
import {HeroAbilities} from "./heroes/HeroAbilities";
import {openHeroGuide} from "../store/hud/heroGuideStore";
import { CombatHUD } from "../combat/CombatHUD";
import { HeroLoadoutSync } from "./heroes/HeroLoadoutSync";
import type { CharacterChoice } from "./characters/characterCatalog";
import type { CharacterTab } from "./characters/CharacterPage";
import { useCharacterPreviewStore } from "./characters/characterPreviewStore";
import { characterEmoteNeedsGarage } from "./characters/characterPreviewStage";
import { useAlphaFlow } from "./alpha/useAlphaFlow";
import "../theme/theme.css";
import { FullCanvas } from "../FullCanvas";
import { useUIStore } from "../store";
import type { MenuScreen } from "../store/menus/uiStore";
import { VehiclePreview } from "./preview";
import { MainMenu } from "./menus/MainMenu";
import { PauseMenu } from "./menus/PauseMenu";
import { ModeLoadingScreen } from "./ModeLoadingScreen";
import { Sandbox, SandboxSetup } from "./modes/sandbox/index";
import { DebugMenu } from "../components/debugger/DebugMenu";
import { DrivingOverlay } from "../ui/DrivingHUD";
import { CockpitPanel } from "../ui/Cockpit/CockpitPanel";
import { lazy, Suspense, useEffect, useState } from "react";
import { useSocialStore } from "../store/social/socialStore";
import { inviteCodeFromUrl } from "./social/invitationLinks";
import { SettingsMenu } from "./menus/SettingsMenu";
import { CareerMenu } from "./menus/CareerMenu";
import { MissionsMenu } from "./menus/MissionsMenu";
import { SessionMenu } from "./menus/SessionMenu";
import { VehicleMenu } from "./menus/VehicleMenu";
import { Cameras } from "../effects";
import { PerformanceOverlay } from "../performance/PerformanceOverlay";
import { useRenderSettingsStore } from "../store/presentation/renderSettingsStore";
import { ModeSelection } from "./alpha/ModeSelection";
import { useBuilderStore } from "../worldBuilder/state/builderStore";
import { QueueScreen } from "./alpha/QueueScreen";

const HeroWorkshop = lazy(() => import("./heroes/HeroWorkshop").then(module => ({ default: module.HeroWorkshop })));
const HeroSelection = lazy(() => import("./alpha/HeroSelection").then(module => ({ default: module.HeroSelection })));

const WorldBuilderPanel = lazy(() =>
  import("../worldBuilder/panels/WorldBuilderPanel").then((m) => ({
    default: m.WorldBuilderPanel,
  })),
);
const SocialPanel = lazy(() =>
  import("./social/SocialPanel").then((module) => ({
    default: module.SocialPanel,
  })),
);
const WorldBuilderScene = lazy(
  () => import("../worldBuilder/scene/WorldBuilderScene"),
);


export function GameUI() {
  useAlphaFlow();
  const workspace = useBuilderStore((s) => s.workspace);
  const hud = useRenderSettingsStore((s) => s.hud);
  const screen = useUIStore((s) => s.screen);
  const overlay = useUIStore((s) => s.overlay);
  const isModeLoading = useUIStore((s) => s.isModeLoading);
  const vehicleAuthoring = workspace === "vehicle" && overlay === "world_builder";
  const socialReady = useSocialStore((s) => Boolean(s.view));
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = inviteCodeFromUrl(url.href);
    if (!socialReady || !code) return;
    useSocialStore.setState({ entryCode: code });
    url.searchParams.delete("world_invite");
    window.history.replaceState(null, "", url);
    useUIStore.getState().setScreen("social");
  }, [socialReady]);
  const menuPreview = screen === "heroes" || screen === "hero_select" || screen === "mode_select"
    || screen === "sandbox_setup";
  // Main and the waiting line cover a previous preview without warming a new scene.
  const [lastMenuPreview, setLastMenuPreview] = useState<MenuScreen | null>(null);
  const retainedPreview = (screen === "main" || screen === "queue") && !isModeLoading ? lastMenuPreview : null;
  const previewScreen = menuPreview ? screen : retainedPreview;
  if (previewScreen !== lastMenuPreview) setLastMenuPreview(previewScreen);
  const needsCanvas = previewScreen !== null || screen === "sandbox"
    || screen === "world_builder";
  const heroOwner = useSocialStore(s=>s.view?.profile.id??s.profileOwner??"guest");
  const [characterTab, setCharacterTab] = useState<CharacterTab | null>(null);
  const [characterDraft, setCharacterDraft] = useState<CharacterChoice | null>(null);
  const previewCamera = useCharacterPreviewStore(s => s.camera);
  const previewEmoteId = useCharacterPreviewStore(s => s.emote?.id);
  const previewInsideCar = useCharacterPreviewStore(s => s.insideCar);
  // Opening the Emotes panel must not swap the model onto a moving vehicle
  // stage; only actual garage interaction shots need that environment.
  const vehicleEmote = characterEmoteNeedsGarage(characterTab, previewCamera, previewEmoteId, previewInsideCar);
  const [collapsed, setCollapsed] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const previewPaused = retainedPreview !== null;

  const worldCover = (screen === "sandbox" || screen === "world_builder") &&
    (isModeLoading || overlay === "team_lineup");
  return (
    <div className="relative game-wrapper" data-live-world={screen === "sandbox" || undefined} data-world-cover={worldCover || undefined}>
      <HeroLoadoutSync />
      <MinimapSessionLifecycle />
      <CtfMissionLifecycle />
      {screen === "heroes" && <Suspense fallback={<div role="status" className="menu-loading">Opening Heroes…</div>}>
        <HeroWorkshop key={heroOwner} onCharacterViewChange={setCharacterTab} onCharacterPreviewChange={setCharacterDraft} />
      </Suspense>}
      {/* Requires Canvas */}
      {needsCanvas && (
        <FullCanvas
          roomReady={roomReady}
          paused={previewPaused}
          covered={retainedPreview !== null || worldCover}
          preview={previewScreen !== null}
        >
          {previewScreen !== null && (
            <VehiclePreview
              onRoomReadyChange={setRoomReady}
              previewScreen={previewScreen}
              heroLayout={previewScreen !== "sandbox_setup"}
              awaitingHero={previewScreen === "hero_select" || previewScreen === "heroes"}
              characterDraft={screen === "heroes" ? characterDraft : null}
              wardrobeOpen={screen === "heroes" && characterTab !== null}
              characterOnly={screen === "heroes" && characterTab !== null && !vehicleEmote}
              fittingRoom={screen === "heroes" && characterTab === "appearance"}
              stationary={previewPaused}
            />
          )}
          {screen === "world_builder" && (
            <Suspense fallback={null}>
              <WorldBuilderScene />
            </Suspense>
          )}
          {screen === "sandbox" && (
            <>
              {(overlay !== "world_builder" || vehicleAuthoring) && <Sandbox />}
              {overlay === "world_builder" && !vehicleAuthoring && (
                <Suspense fallback={null}>
                  <WorldBuilderScene />
                </Suspense>
              )}
            </>
          )}

          {screen === "sandbox" && (overlay !== "world_builder" || vehicleAuthoring) && <Cameras />}
        </FullCanvas>
      )}

      {/* UI Overlay */}
      {screen === "sandbox" && !overlay && <DrivingOverlay hud={hud} />}
      {screen === "sandbox" && <CombatHUD />}
      {screen === "sandbox" && !overlay && hud && <CtfMatchHUD />}

      <Suspense
        fallback={
          <div role="status" className="menu-loading">
            Opening game menu…
          </div>
        }
      >
        {screen === "hero_select" && <HeroSelection />}
        {screen === "mode_select" && <ModeSelection />}
        {screen === "queue" && <QueueScreen />}
        {screen === "sandbox_setup" && (
          <SandboxSetup collapsed={collapsed} setCollapsed={setCollapsed} />
        )}
      </Suspense>
      <MatchScoreboard onAbilities={openHeroGuide} />
      {screen === "sandbox" && <TeamLineup />}
      {overlay === "hero_abilities" && <HeroAbilities />}
      {overlay === "match_results" && <MatchResultsScreen />}
      {/* Menus */}
      {screen === "main" && <MainMenu />}
      {screen === "sandbox" && overlay === "pause" && <PauseMenu />}
      {overlay === "debug_menu" && <DebugMenu />}
      {(overlay === "settings" || (screen === "settings" && !overlay)) && (
        <SettingsMenu />
      )}
      {(overlay === "career" || (screen === "career" && !overlay)) && (
        <CareerMenu />
      )}
      {(overlay === "missions" || (screen === "missions" && !overlay)) && (
        <MissionsMenu />
      )}
      {overlay === "vehicle_select" && <VehicleMenu />}
      {overlay === "leave_game" && <SessionMenu />}
      {(screen === "social" || overlay === "social") && (
        <Suspense
          fallback={
            <div role="status" className="menu-loading">
              Opening worlds and social…
            </div>
          }
        >
          <SocialPanel />
        </Suspense>
      )}
      {screen === "sandbox" && overlay === "survey_map" && <SurveyMap/>}
      {screen === "sandbox" && overlay === "cockpit" && <CockpitPanel />}
      {(screen === "world_builder" ||
        (screen === "sandbox" && overlay === "world_builder")) && (
        <Suspense fallback={null}>
          <WorldBuilderPanel />
        </Suspense>
      )}

      {screen === "sandbox" && !overlay && <PerformanceOverlay />}
      <ModeLoadingScreen />
    </div>
  );
}
