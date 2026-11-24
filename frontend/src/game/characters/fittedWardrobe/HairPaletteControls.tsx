import { HAIR_COLOR_THEMES, HAIR_COLOR_ZONES, useHairPaletteStore } from "./hairPalette";

const zoneLabels = { base: "Base", roots: "Roots", highlights: "Highlights", tips: "Tips" };
const themes = Object.entries(HAIR_COLOR_THEMES);

export function HairPaletteControls() {
  const palette = useHairPaletteStore(state => state.palette);
  const original = useHairPaletteStore(state => state.original);
  const reset = useHairPaletteStore(state => state.reset);
  const setPalette = useHairPaletteStore(state => state.setPalette);
  const activeTheme = themes.find(([, theme]) => HAIR_COLOR_ZONES.every(zone => palette[zone] === theme[zone])
    && palette.highlightStrength === theme.highlightStrength && palette.tipBlend === theme.tipBlend)?.[0] ?? "";

  return <div className="hair-palette" role="group" aria-label="Hairstyle colors">
    <label className="character-setting" data-controller-row>Color theme
      <select className="menu-control" value={original ? "original" : activeTheme} onChange={event => {
        if (event.target.value === "original") { reset(); return; }
        const theme = themes.find(([name]) => name === event.target.value);
        if (theme) setPalette(theme[1]);
      }}>
        <option value="original">Original colors</option>
        <option value="" disabled>Custom</option>
        {themes.map(([name]) => <option key={name} value={name}>{name}</option>)}
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
    <button className="menu-control" type="button" data-controller-row onClick={reset}>Reset hair colors</button>
  </div>;
}
