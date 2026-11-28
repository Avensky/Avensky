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
import { loadedGarageWorkshop, loadGarageWorkshop } from "./heroes/loadGarageWorkshop";
import { MenuLoadingStatus } from "../components/menus/MenuLoadingStatus";
import type { CharacterChoice } from "./characters/characterCatalog";
import type { CharacterTab } from "./characters/CharacterPage";
import { useCharacterPreviewStore } from "./characters/characterPreviewStore";
import { characterEmoteNeedsGarage } from "./characters/characterPreviewStage";
import { GarageWorldReveal } from "./preview/GarageWorldReveal";
import { useGarageParking } from "./preview/garageParkingStore";
import { useAlphaFlow } from "./alpha/useAlphaFlow";
import "../theme/theme.css";
import { FullCanvas } from "../FullCanvas";
import { useUIStore } from "../store";
import { VehiclePreview } from "./preview";
import { MainMenu } from "./menus/MainMenu";
import { PauseMenu } from "./menus/PauseMenu";
import { ModeLoadingScreen } from "./ModeLoadingScreen";
import { SandboxSetup } from "./modes/sandbox/SandboxSetup";
import { CockpitPanel } from "../ui/Cockpit/CockpitPanel";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSocialStore } from "../store/social/socialStore";
import { inviteCodeFromUrl } from "./social/invitationLinks";
import { SettingsMenu } from "./menus/SettingsMenu";
import { CareerMenu } from "./menus/CareerMenu";
import { MissionsMenu } from "./menus/MissionsMenu";
import { SessionMenu } from "./menus/SessionMenu";
import { VehicleMenu } from "./menus/VehicleMenu";
import { PerformanceOverlay } from "../performance/PerformanceOverlay";
import { useRenderSettingsStore } from "../store/presentation/renderSettingsStore";
import { ModeSelection } from "./alpha/ModeSelection";
import { QueueScreen } from "./alpha/QueueScreen";

const LazyWorkshop = lazy(loadGarageWorkshop);
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
const WorldContents = lazy(() => import("./modes/WorldContents"));
const DebugMenu = lazy(() => import("../components/debugger/DebugMenu").then(module => ({ default: module.DebugMenu })));
const DrivingOverlay = lazy(() => import("../ui/DrivingHUD").then(module => ({ default: module.DrivingOverlay })));


function GarageWorkshopScene({ entry }: { entry: "wardrobe" | "vehicle" | null }) {
  const Workshop = loadedGarageWorkshop() ?? LazyWorkshop;
  const [tab, setTab] = useState<CharacterTab | null>(entry === "wardrobe" ? "appearance" : null);
  const [draft, setDraft] = useState<CharacterChoice | null>(null);
  const [roomReady, setRoomReady] = useState(false);
  const camera = useCharacterPreviewStore(s => s.camera);
  const emote = useCharacterPreviewStore(s => s.emote?.id);
  const insideCar = useCharacterPreviewStore(s => s.insideCar);
  return <>
    <Workshop onCharacterViewChange={setTab} onCharacterPreviewChange={setDraft} />
    <FullCanvas preview roomReady={roomReady}>
      <VehiclePreview previewScreen="heroes" heroLayout awaitingHero onRoomReadyChange={setRoomReady}
        characterDraft={draft} wardrobeOpen={tab !== null} fittingRoom={tab === "appearance"}
        characterOnly={tab !== null && !characterEmoteNeedsGarage(tab, camera, emote, insideCar)} />
    </FullCanvas>
  </>;
}

export function GameUI() {
  useAlphaFlow();
  const hud = useRenderSettingsStore((s) => s.hud);
  const screen = useUIStore((s) => s.screen);
  const overlay = useUIStore((s) => s.overlay);
  const isModeLoading = useUIStore((s) => s.isModeLoading);
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
  const menuPreview = screen === "hero_select" || screen === "mode_select"
    || screen === "sandbox_setup";
  const previewScreen = menuPreview ? screen : null;
  const needsCanvas = previewScreen !== null || screen === "sandbox"
    || screen === "world_builder";
  const heroOwner = useSocialStore(s=>s.view?.profile.id??s.profileOwner??"guest");
  const station = useUIStore(s => s.workshopEntry);
  const [collapsed, setCollapsed] = useState(false);
  const [roomReady, setRoomReady] = useState(false);

  const surface = useRef<HTMLDivElement>(null);
  const garageHandoff = useGarageParking(state => state.committingDeparture) && screen === "sandbox";
  const worldCover = !garageHandoff && (screen === "sandbox" || screen === "world_builder") &&
    (isModeLoading || overlay === "team_lineup");
  return (
    <div ref={surface} className="relative game-wrapper" data-garage-handoff={garageHandoff || undefined}
      inert={garageHandoff} aria-busy={garageHandoff || undefined} data-live-world={screen === "sandbox" || undefined} data-world-cover={worldCover || undefined}>
      <HeroLoadoutSync />
      <MinimapSessionLifecycle />
      <CtfMissionLifecycle />
      {screen === "heroes" && <Suspense fallback={<div className="garage-menu-notice">
        <MenuLoadingStatus>Opening {station === "vehicle" ? "Vehicle" : station === "wardrobe" ? "Wardrobe" : "garage"}…</MenuLoadingStatus>
      </div>}>
        <GarageWorkshopScene key={heroOwner} entry={station} />
      </Suspense>}
      {/* Requires Canvas */}
      {needsCanvas && (
        <FullCanvas
          roomReady={roomReady}
          covered={worldCover}
          preview={previewScreen !== null}
        >
          {previewScreen !== null && (
            <VehiclePreview
              onRoomReadyChange={setRoomReady}
              previewScreen={previewScreen}
              heroLayout={previewScreen !== "sandbox_setup"}
              awaitingHero={previewScreen === "hero_select"}
            />
          )}
          {(screen === "world_builder" || screen === "sandbox") && (
            <Suspense fallback={null}>
              <WorldContents screen={screen} editorOpen={overlay === "world_builder"} />
              {garageHandoff && <GarageWorldReveal surface={surface} />}
            </Suspense>
          )}
        </FullCanvas>
      )}

      {/* UI Overlay */}
      {screen === "sandbox" && !overlay && (
        <Suspense fallback={null}><DrivingOverlay hud={hud} /></Suspense>
      )}
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
      {overlay === "debug_menu" && (
        <Suspense fallback={null}><DebugMenu /></Suspense>
      )}
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
      {!garageHandoff && <ModeLoadingScreen />}
    </div>
  );
}
