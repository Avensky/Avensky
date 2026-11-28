import type { ReactNode } from "react";
import { GameButton } from "../../components/GameButton";
import { PreviewToolIcon } from "../preview/PreviewToolIcon";
import { PreviewVisibilityToggle } from "../preview/PreviewVisibilityToggle";
import { PreviewZoomSlider } from "../preview/PreviewZoomSlider";
import { CHARACTER_ZOOM_MIN, CHARACTER_ZOOM_MAX, useCharacterPreviewStore } from "./characterPreviewStore";

export function FittingAngleRail({ children }: { children: ReactNode }) {
  return <aside data-wardrobe-focus-group="angles" className="dressing-camera-shortcuts fitting-camera-toolbar" aria-label="Fitting room camera shortcuts">
    <div className="wardrobe-camera-presets">{children}</div>
  </aside>;
}

export function FittingZoomRail({ insideCar }: { insideCar: boolean }) {
  const zoom = useCharacterPreviewStore(state => state.zoom);
  function resetView() {
    useCharacterPreviewStore.setState(s => ({ zoom: 1, focusRevision: s.focusRevision + 1 }));
  }
  return <div data-wardrobe-focus-group="zoom" className="dressing-preview-zoom fitting-camera-toolbar" role="group" aria-label="Camera framing"
    data-controller-row data-controller-columns="1">
    {!insideCar && <>
      <GameButton variant="menu" className="fitting-tool-icon chamfered-frame" aria-label="Reset view" title="Reset view"
        pressFeedback onPress={resetView}><PreviewToolIcon icon="reframe" /></GameButton>
      <PreviewZoomSlider label="Preview zoom" min={CHARACTER_ZOOM_MIN} max={CHARACTER_ZOOM_MAX} step={.05}
        value={zoom} valueText={`${Math.round(zoom * 100)}%`} onChange={value => useCharacterPreviewStore.setState({ zoom: value })} />
    </>}
    <PreviewVisibilityToggle className="chamfered-frame" />
  </div>;
}
