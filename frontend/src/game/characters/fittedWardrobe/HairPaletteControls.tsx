import { useState } from "react";
import { HAIR_COLOR_THEMES, HAIR_COLOR_ZONES, useHairPaletteStore } from "./hairPalette";
import { BRAIDED_PONYTAIL_THEMES, DEFAULT_HAIR_GROOM, HAIR_PIECES, type HairPiece } from "./hairGroom";
import type { HairPalette } from "./hairColors";

const zoneLabels = { base: "Base", roots: "Roots", highlights: "Highlights", tips: "Tips" };
const themes = Object.entries(HAIR_COLOR_THEMES);
const ponytailThemes = Object.entries(BRAIDED_PONYTAIL_THEMES);

export function HairPaletteControls({ style, editableGroom = false }: { style: string; editableGroom?: boolean }) {
  const [piece, setPiece] = useState<HairPiece | "">("");
  const whole = useHairPaletteStore(state => state.palette);
  const native = useHairPaletteStore(state => state.original);
  const setWhole = useHairPaletteStore(state => state.setPalette);
  const resetWhole = useHairPaletteStore(state => state.reset);
  const groom = useHairPaletteStore(state => state.grooms[style] ?? DEFAULT_HAIR_GROOM);
  const setGroom = useHairPaletteStore(state => state.setGroom);
  const override = piece ? groom.pieces[piece] : undefined;
  const palette = override ?? whole;
  const original = piece ? !override : native;
  function setPalette(value: HairPalette) {
    if (piece) setGroom(style, { ...groom, pieces: { ...groom.pieces, [piece]: value } });
    else setWhole(value);
  }
  function reset() {
    if (piece) {
      const pieces = { ...groom.pieces };
      delete pieces[piece];
      setGroom(style, { ...groom, pieces });
    } else {
      resetWhole();
      if (editableGroom) setGroom(style, { ...groom, pieces: {} });
    }
  }
  const options = style === "Mia_01" && editableGroom ? [...ponytailThemes, ...themes] : themes;
  const activeTheme = options.find(([, theme]) => HAIR_COLOR_ZONES.every(zone => palette[zone] === theme[zone])
    && palette.highlightStrength === theme.highlightStrength && palette.tipBlend === theme.tipBlend)?.[0] ?? "";

  return <div className="hair-palette" role="group" aria-label="Hairstyle colors">
    {editableGroom && <label className="character-setting" data-controller-row>Hair section
      <select className="menu-control" value={piece} onChange={event => {
        const selected = HAIR_PIECES.find(([id]) => id === event.target.value);
        setPiece(selected?.[0] ?? "");
      }}>
        <option value="">All hair</option>
        {HAIR_PIECES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>}
    <label className="character-setting" data-controller-row>Color theme
      <select className="menu-control" value={original ? "original" : activeTheme} onChange={event => {
        if (event.target.value === "original") { reset(); return; }
        const theme = options.find(([name]) => name === event.target.value);
        if (theme) setPalette(theme[1]);
      }}>
        <option value="original">{piece ? "Match all hair" : "Original colors"}</option>
        <option value="" disabled>Custom</option>
        {style === "Mia_01" && editableGroom && <optgroup label="Braided Ponytail colors">
          {ponytailThemes.map(([name]) => <option key={name} value={name}>{name}</option>)}
        </optgroup>}
        <optgroup label="Avensky colors">{themes.map(([name]) => <option key={name} value={name}>{name}</option>)}</optgroup>
      </select>
    </label>
    <div className="hair-palette-swatches">
      {HAIR_COLOR_ZONES.map(zone => <label className="character-setting" key={zone} data-controller-row>
        {zoneLabels[zone]}
        <input className="menu-control" type="color" value={palette[zone]}
          onChange={event => setPalette({ ...palette, [zone]: event.target.value })} />
      </label>)}
    </div>
    <label className="character-setting" data-controller-row>Highlight strength
      <input className="menu-control" type="range" min={0} max={1} step={.01} value={palette.highlightStrength}
        onChange={event => setPalette({ ...palette, highlightStrength: event.target.valueAsNumber })} />
    </label>
    <label className="character-setting" data-controller-row>Tip blend
      <input className="menu-control" type="range" min={0} max={1} step={.01} value={palette.tipBlend}
        onChange={event => setPalette({ ...palette, tipBlend: event.target.valueAsNumber })} />
    </label>
    <button className="menu-control" type="button" data-controller-row onClick={reset}>{piece ? "Reset section colors" : "Reset hair colors"}</button>
    {editableGroom && <>
      <label className="character-setting" data-controller-row>Crown volume
        <input className="menu-control" type="range" min={0} max={1} step={.05} value={groom.volume}
          onChange={event => setGroom(style, { ...groom, volume: event.target.valueAsNumber })} />
      </label>
      <label className="character-setting" data-controller-row>Crown strand width
        <input className="menu-control" type="range" min={-1} max={1} step={.05} value={groom.thickness}
          onChange={event => setGroom(style, { ...groom, thickness: event.target.valueAsNumber })} />
      </label>
    </>}
  </div>;
}
