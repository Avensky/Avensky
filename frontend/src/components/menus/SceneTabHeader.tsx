import type { CSSProperties, ReactNode } from "react";
import type { BackShortcutAction } from "../controller";
import { APP_BRANDING } from "../../theme/branding";
import type { MatchTeam } from "../../theme/matchTeamTheme";
import type { CharacterHeaderProfileProps } from "../../game/characters/CharacterHeaderProfile";
import { MenuFrameHeader } from "./MenuFrame";
import { GarageBrandTab } from "../../game/welcome/GarageBrandTab";
import { AngledGameTab, MenuTabButton } from "./MenuTabButton";
import { useAngledMenuHeader } from "./useAngledMenuHeader";

export type SceneHeaderTab = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  badge?: string;
  grow?: number;
  separatorBefore?: boolean;
};

/** Both layouts share the same tabs and actions. Scenes retain their own input routing. */
export function SceneTabHeader({
  title,
  eyebrow,
  compact = false,
  tabs,
  activeTab,
  onTabChange,
  tablistLabel = title + " sections",
  tablistClassName = "",
  panelId,
  idPrefix,
  showProgress,
  actions,
  character,
  busy = false,
  titleTeam,
  station = false,
  backAction,
}: {
  title: string;
  eyebrow?: string;
  compact?: boolean;
  tabs: readonly SceneHeaderTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  tablistLabel?: string;
  tablistClassName?: string;
  panelId: string;
  idPrefix: string;
  showProgress?: boolean;
  actions?: ReactNode;
  character?: CharacterHeaderProfileProps;
  busy?: boolean;
  titleTeam?: MatchTeam;
  station?: boolean;
  backAction: BackShortcutAction;
}) {
  const angled = useAngledMenuHeader();
  const stationHeader = station && angled;
  const navigation = tabs.length > 0 && (
    <nav className={`${angled ? "angled-header-tabs" : "classic-header-tabs"} ${tablistClassName}`} role="tablist" aria-label={tablistLabel} data-controller-tab-only>
      {tabs.map(tab => stationHeader ?
        <AngledGameTab key={tab.id} id={idPrefix + "-tab-" + tab.id}
          aria-controls={panelId} aria-label={tab.label} title={tab.description}
          selected={activeTab === tab.id} disabled={busy} onPress={() => onTabChange(tab.id)}>
          {tab.label}
        </AngledGameTab> : (
        <MenuTabButton
          key={tab.id}
          id={idPrefix + "-tab-" + tab.id}
          selected={activeTab === tab.id}
          angled={angled}
          separatorBefore={tab.separatorBefore}
          aria-controls={panelId}
          aria-label={tab.description ? `${tab.label}: ${tab.description}` : undefined}
          title={tab.description}
          tabIndex={activeTab === tab.id ? 0 : -1}
          disabled={busy}
          className={angled ? "angled-header-tab--" + tab.id : undefined}
          data-has-badge={tab.badge ? true : undefined}
          style={angled && tab.grow !== undefined ? { "--angled-tab-grow": tab.grow } as CSSProperties : undefined}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.icon && <span className="scene-header-tab-icon">{tab.icon}</span>}
          <span className="scene-header-tab-label">{tab.label}</span>
          {tab.badge && <span className="scene-header-tab-badge">{tab.badge}</span>}
        </MenuTabButton>
      ))}
    </nav>
  );

  return (
    <>
      <MenuFrameHeader
        title={title}
        eyebrow={eyebrow ?? (angled && !compact ? APP_BRANDING.productName : undefined)}
        compact={compact}
        showProgress={showProgress}
        actions={actions}
        character={{ compact: showProgress, ...character, readOnly: busy || character?.readOnly }}
        titleTeam={titleTeam}
        backAction={backAction}
        variant="scene"
        brandBack={stationHeader ? <GarageBrandTab data-header-back aria-label={backAction.label ?? "Back"}
          disabled={backAction.disabled} onPress={backAction.onClick} /> : undefined}
        className={stationHeader ? "garage-station-header garage-entry-header angled-tab-header" : angled ? "angled-tab-header" : undefined}
      >
        {angled && navigation && (stationHeader ? <div className="tabbed-angled-scroll">{navigation}</div> : navigation)}
      </MenuFrameHeader>
      {!angled && navigation}
    </>
  );
}
