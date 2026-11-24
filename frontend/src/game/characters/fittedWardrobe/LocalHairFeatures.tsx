import { fittedHairOptions } from './alphaAssets';
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HairPaletteControls } from "./HairPaletteControls";
import { useCharacterPreviewStore } from "../characterPreviewStore";

export type LocalHairOption = { id: string; label: string; url: string };

export const hairOptions: LocalHairOption[] = fittedHairOptions;
export const useLocalHairstyle = create<{id:string; choose:(id:string)=>void}>()(
  persist(set => ({id:"stock",choose:id=>set({id})}),{name:"avensky-fitting-hairstyle-v1"}),
);

export function LocalHairFeatures() {
  const id = useLocalHairstyle(state=>state.id);
  const choose = useLocalHairstyle(state=>state.choose);
  return <>
    <label className="character-setting" data-controller-row>Preview hairstyle
      <select className="menu-control" aria-label="Preview hairstyle" value={hairOptions.some(style=>style.id===id)?id:"stock"}
        onChange={event=>{
          choose(event.target.value);
          useCharacterPreviewStore.setState(s=>({camera:"Face",zoom:1,emote:null,focusRevision:s.focusRevision+1}));
        }}>
        <option value="stock">Character hairstyle</option>
        {hairOptions.map(style=><option key={style.id} value={style.id}>{style.label}</option>)}
      </select>
    </label>
    {hairOptions.some(style=>style.id===id) && <HairPaletteControls />}
  </>;
}
