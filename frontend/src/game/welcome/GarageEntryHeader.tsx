import { GameButton } from "../../components/GameButton";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { garageBrandContents } from "../../theme/garageEntry";
import { entryAssets } from "./config";

const brand = { __html: garageBrandContents(entryAssets) };

type AccountActions = {
  profileOpen: boolean;
  busy: boolean;
  onProfile: () => void;
  onLogOut: () => void;
};

export function GarageEntryHeader({ loginEntry, account }: { loginEntry: boolean; account?: AccountActions }) {
  if (!loginEntry && !account) return null;
  return <header className="garage-entry-header angled-tab-header">
    {loginEntry && <div className="garage-entry-brand" dangerouslySetInnerHTML={brand} />}
    {account && <nav className="garage-entry-actions" aria-label="Account actions" data-controller-row data-controller-header-action>
      <GameButton variant="custom" className="garage-entry-action garage-entry-action--logout" aria-label="Log out" title="Log out"
        onPress={account.onLogOut} disabled={account.busy}><MenuIcon name="leave_game" /></GameButton>
      <GameButton variant="custom" className="garage-entry-action garage-entry-action--profile" aria-label="Profile" title="Profile"
        aria-pressed={account.profileOpen} onPress={account.onProfile} disabled={account.busy}><MenuIcon name="profile" /></GameButton>
    </nav>}
  </header>;
}
