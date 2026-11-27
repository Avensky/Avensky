import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { UI_THEMES } from "../../theme/catalog";
import { garagePropFootprint, type GarageRoomLayout } from "../../game/preview/garageServiceLayout";
import { useGarageEditor } from "./garageEditorState";

const corners = new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]);

export function GaragePropSelection({ layout }: { layout: GarageRoomLayout }) {
  const selected = useGarageEditor(s => s.selected);
  const accent = usePreferencesStore(s => UI_THEMES[s.theme].accent);
  const box = garagePropFootprint(selected, layout[selected]);
  return <lineLoop name="garage-edit-selection" rotation-y={box.yaw} position={[box.x, .035, box.z]}
    scale={[box.halfWidth + .07, 1, box.halfLength + .07]}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[corners, 3]}/></bufferGeometry>
    <lineBasicMaterial color={accent} toneMapped={false}/>
  </lineLoop>;
}
