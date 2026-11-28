import type { ReactNode } from "react";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { PreviewToolButton } from "./PreviewToolButton";
import { PREVIEW_BOOT_ICON, PREVIEW_HAND_ICON, PreviewCameraChoiceIcon } from "./PreviewToolIcon";

const FRAME = "M8 3H3v5m13-5h5v5m0 8v5h-5M3 16v5h5";
const VIEW_ICONS: Record<string, string> = {
  "Full body": `${FRAME} M12 6h.01M8 10l4 1 4-1m-4 1v4m0 0-2 3m2-3 2 3`,
  Face: `${FRAME} M8 8l4-2 4 2v6l-4 3-4-3zm2 3h.01m4 0h.01m-3 3h2`,
  Hair: "M4 19c2-3 0-5 1-10a7 7 0 0 1 14 0c1 5-1 7 1 10m-8-14c-1 4-3 6-6 7m6-7c1 4 3 6 6 7",
  Eyes: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  Makeup: "M8 14h8v7H8zm2 0V7l4-4v11",
  "Upper body": "M8 5l4 3 4-3 4 3-2 5-2-1v7H8v-7l-2 1-2-5zM12 8v11",
  Waist: "M7 5v5l-2 9h14l-2-9V5M6 13h4m4 0h4m-8-2h4v4h-4z",
  Hands: PREVIEW_HAND_ICON,
  Feet: PREVIEW_BOOT_ICON,
  Back: `${FRAME} M7 13l2-5 3-1 3 1 2 5m-5-6v10m-3-3h6`,
  Left: `${FRAME} M17 12H7m0 0 4-4m-4 4 4 4`,
  Right: `${FRAME} M7 12h10m0 0-4-4m4 4-4 4`,
  Showroom: `${FRAME} M7 11l1-3h8l1 3 2 2v3H5v-3zM8 13h1m6 0h1`,
  "High Angle": `${FRAME} M12 6v11m-4-4 4 4 4-4`,
  "Driver Door": "M5 5h11l3 7v7H5zM5 12h14m-10 3h3",
  Cockpit: "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM4 11h16m-8 0v9",
  Chase: `${FRAME} M6 15v-4l2-2h8l2 2v4H6zm2-2h1m6 0h1`,
  Dashboard: "M4 17a8 8 0 1 1 16 0zm8-1 4-5m-8 2h.01m4-4h.01",
};

export function PreviewCameraViewIcon({ view, driver = false }: { view: string; driver?: boolean }) {
  if (view === "Whole car") return <MenuIcon name="vehicles" />;
  if (view === "Full body" && driver) return <MenuIcon name="cockpit" />;
  return <PreviewCameraChoiceIcon path={VIEW_ICONS[view] ?? FRAME} />;
}

export type PreviewCameraSelectProps<View extends string> = {
  views: readonly View[];
  view: View;
  onViewChange: (view: View) => void;
  label?: string;
  viewLabels?: Partial<Record<View, string>>;
  vertical?: boolean;
  allowReselect?: boolean;
};

export function PreviewCameraSelect<View extends string>({
  views, view, onViewChange, label = "Preview camera", viewLabels, vertical = false, allowReselect = false, showDriverIcon = false, children,
}: PreviewCameraSelectProps<View> & { showDriverIcon?: boolean; children?: ReactNode }) {
  return <div className="fitting-camera-select" role="group" aria-label={label}>
    <div className="fitting-camera-choices" role="group" aria-label="Views" data-controller-row data-controller-columns={vertical ? 1 : 7}>
      {views.map(item => {
        const name = viewLabels?.[item] ?? item;
        return <PreviewToolButton key={item} label={name} data-camera-choice={item}
          aria-pressed={view === item} onClick={() => { if (allowReselect || view !== item) onViewChange(item); }}><PreviewCameraViewIcon view={item} driver={showDriverIcon} /></PreviewToolButton>;
      })}
    </div>
    {children}
  </div>;
}
