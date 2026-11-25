import { disconnectRustServer } from "./rustSocket";
import { useSocialStore } from "../store/social/socialStore";
import { useChatStore } from "../store/chat/chatStore";
import { useUIStore } from "../store/menus/uiStore";
import { useTextKeyboardStore } from "../store/text/keyboardStore";
import { useAlphaStore } from "../store/alpha/alphaStore";
import { useMatchResultsStore } from "../store/session/matchResultsStore";
import { useSelectionStore } from "../store/selection/selectionStore";
import { useMissionRadioStore } from "../store/missions/missionRadioStore";
import { useHeroLoadouts } from "../vehicles/cosmetics/heroLoadouts";
import { useCharacterPreviewStore } from "../game/characters/characterPreviewStore";
import { resetHub } from "../game/hub/hubStore";
import { resetHubControls } from "../game/hub/hubControls";

/** Socket recovery keeps player-owned state. A confirmed logout ends that ownership. */
export function endPlayerSession() {
  disconnectRustServer();
  resetHub();
  resetHubControls();
  useSocialStore.setState(useSocialStore.getInitialState());
  useChatStore.setState({ notices: [] });
  useTextKeyboardStore.setState({ session: null });
  useHeroLoadouts.setState(useHeroLoadouts.getInitialState());
  useAlphaStore.setState(useAlphaStore.getInitialState());
  useMatchResultsStore.setState(useMatchResultsStore.getInitialState());
  useMissionRadioStore.setState(useMissionRadioStore.getInitialState());
  useCharacterPreviewStore.setState(useCharacterPreviewStore.getInitialState());
  useSelectionStore.setState(useSelectionStore.getInitialState());
  useUIStore.setState(useUIStore.getInitialState());
}
