import { useState } from "react";
import { BRZ_CABIN_PARTS, type BrzCabinColors } from "../preview/brzCabin";
import { useBrzCabinStudio } from "./vehicleStudioStore";

export function BrzCabinColorControls() {
  const colors = useBrzCabinStudio(state => state.colors);
  const setColor = useBrzCabinStudio(state => state.setColor);
  const [selected, setSelected] = useState<keyof BrzCabinColors>("seat-fabric");
  const part = BRZ_CABIN_PARTS.find(item => item.id === selected)!;
  return <div data-controller-rows>
    <label data-controller-row>Cabin part<select value={selected} onChange={event => setSelected(event.target.value as keyof BrzCabinColors)}>
      {BRZ_CABIN_PARTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
    <label data-controller-row>{part.label} color<input type="color" value={colors[selected] ?? "#35373c"}
      onChange={event => setColor(selected, event.target.value)} /></label>
    <button type="button" className="menu-control" data-controller-row disabled={!colors[selected]} onClick={() => setColor(selected)}>Restore factory color</button>
    <p className="vehicle-studio-meta">Staging preview · colors are saved on this device.</p>
  </div>;
}
