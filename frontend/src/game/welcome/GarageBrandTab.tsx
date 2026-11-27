import type { ComponentPropsWithRef } from "react";
import { GameButton } from "../../components/GameButton";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { garageBrandIdentity } from "../../theme/garageEntry";
import { entryAssets } from "./config";

const { logo, name } = garageBrandIdentity(entryAssets);

type Props = Omit<ComponentPropsWithRef<typeof GameButton>, "children" | "variant"> & { showLogo?: boolean };

export function GarageBrandTab({ showLogo = true, onPress, className = "", ...props }: Props) {
  const identity = <>{showLogo && <img src={logo} width={26} height={26} alt="" draggable={false} />}<span>{name}</span></>;
  if (!onPress) return <div className="garage-entry-brand">{identity}</div>;
  return <GameButton {...props} variant="custom" className={`garage-entry-brand garage-entry-brand-back ${className}`}
    title="Back" onPress={onPress}><MenuIcon name="back" />{identity}</GameButton>;
}
