import { useAssetGLTF } from "../../assets/useAssetGLTF";
import { useRenderSettingsStore } from "../../store/presentation/renderSettingsStore";
import type { MapSnapshot } from "../../store/world/worldStore";
import { useEditorPreferences } from "../../worldBuilder/state/editorPreferences";
import { roadAsset } from "../../worldBuilder/roads/roadCatalog";
import { HARBOR_FACADES } from "../../world/props/HarborStructures";

/** Warm a bounded set of the arriving map's live assets in the same GLTF cache
 * used by RoadModel and HarborBuildingLods. More distant detail still streams. */
export function preloadWorldApproach(map: MapSnapshot) {
  const { cityQuality, environmentMode } = useRenderSettingsStore.getState();
  if (environmentMode !== "glb" && environmentMode !== "hybrid") return;
  const detail = useEditorPreferences.getState().detail;
  const urls = new Set<string>();
  for (const item of map.authored_layout?.objects ?? []) {
    if (item.piece === "coastal-building") urls.add(HARBOR_FACADES);
    const road = item.road?.asset ?? (item.piece === "coastal-road"
      ? (Math.min(item.size[0], item.size[2]) >= 12 ? "road_wide" : "road_narrow") : undefined);
    if (road) {
      const lod = item.road?.lod;
      const automatic = typeof lod === "number" ? lod : cityQuality === "fast" ? 1 : 0;
      const level = detail === "low" ? 2 : detail === "high" ? 0 : automatic;
      const url = roadAsset(road)?.lods[level]?.url;
      if (url) urls.add(url);
    }
    if (urls.size >= 3) break;
  }
  for (const url of urls) useAssetGLTF.preload(url, "/draco/");
}
