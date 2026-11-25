import { fittedHairOptions } from './alphaAssets';
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HairPaletteControls } from "./HairPaletteControls";
import { useCharacterPreviewStore } from "../characterPreviewStore";

export type LocalHairOption = { id: string; label: string; url: string; mesh?: string };

export const STOCK_HAIR_ID = "stock";
export const STOCK_HAIR_LABEL = "Long braid and bonnet";
export const hairOptions: LocalHairOption[] = fittedHairOptions;

/** The bonnet belongs to the character's original braid, not imported hair previews. */
export const previewStockBonnet = (preview: boolean, villager: boolean, id: string) => preview && villager && id === STOCK_HAIR_ID;
export const useLocalHairstyle = create<{id:string; choose:(id:string)=>void}>()(
  persist(set => ({id:STOCK_HAIR_ID,choose:id=>set({id})}),{name:"avensky-fitting-hairstyle-v1"}),
);

export function LocalHairFeatures() {
  const id = useLocalHairstyle(state=>state.id);
  const choose = useLocalHairstyle(state=>state.choose);
  return <>
    <label className="character-setting" data-controller-row>Preview hairstyle
      <select className="menu-control" aria-label="Preview hairstyle" value={hairOptions.some(style=>style.id===id)?id:STOCK_HAIR_ID}
        onChange={event=>{
          choose(event.target.value);
          // A color/style change while already focused on the face must not
          // restart the camera transition or snap the view behind the garage.
          const view = useCharacterPreviewStore.getState();
          if (view.camera !== "Face" || view.emote) {
            useCharacterPreviewStore.setState(s=>({camera:"Face",zoom:1,emote:null,focusRevision:s.focusRevision+1}));
          }
        }}>
        <option value={STOCK_HAIR_ID}>{STOCK_HAIR_LABEL}</option>
        {hairOptions.map(style=><option key={style.id} value={style.id}>{style.label}</option>)}
      </select>
    </label>
    {hairOptions.some(style=>style.id===id) && <HairPaletteControls />}
  </>;
}
