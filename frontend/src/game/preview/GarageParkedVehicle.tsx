import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, Color, Group, Material, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { assetAvailable } from "../../assets/runtimeAssets";
import { vehicleLodUrl } from "../../vehicles/assetCatalog";
import { fleetArt, retainFleetArt, subscribeFleetArt } from "../../vehicles/fleetAssets";
import { FACTORY_APPEARANCE, useHeroLoadouts } from "../../vehicles/cosmetics/heroLoadouts";
import { garagePaintedFinish } from "./garagePaintedFinish";
import { useGarageParkingVehicle } from "./garageParkingVehicle";
import { applyPaintFinish } from "./garageVehiclePaint";
import { PreviewContactShadow } from "./PreviewContactShadow";

export type GarageCarFootprint = { width: number; length: number; height: number };

function exteriorPlacement(scene: Group) {
  const bounds = new Box3().setFromObject(scene);
  const center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3());
  return {
    offset: [-center.x, -bounds.min.y, -center.z] as [number, number, number],
    footprint: { width: size.x, length: size.z, height: size.y },
  };
}

/** The same floor-centered, +Z-facing exterior stays under the moving car pivot
 * from parking to departure. A decoded fleet seed is available before the first request. */
export function GarageParkedVehicle({ onFootprint }: { onFootprint?: (size: GarageCarFootprint) => void }) {
  const { model } = useGarageParkingVehicle();
  const appearance = useHeroLoadouts(state => state.loadouts[model]) ?? FACTORY_APPEARANCE;
  const currentArt = useCallback(() => fleetArt(model, "medium"), [model]);
  const art = useSyncExternalStore(subscribeFleetArt, currentArt, currentArt);
  const invalidate = useThree(state => state.invalidate);
  const host = useRef<Group>(null);
  const finishes = useRef<Array<{ material: MeshStandardMaterial; factory: Color }>>([]);
  const placement = useMemo(() => art && exteriorPlacement(art.scene), [art]);

  useEffect(() => {
    if (assetAvailable(vehicleLodUrl(model, "medium"))) return retainFleetArt(model, "medium");
  }, [model]);

  useLayoutEffect(() => {
    if (!art || !host.current) return;
    const exterior = art.scene.clone(true);
    const materials = new Map<Material, Material>();
    // Geometry and textures belong to the shared fleet cache. Only the local
    // finish is owned here so changing garage paint cannot recolor traffic.
    exterior.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const own = (source: Material) => {
        const existing = materials.get(source);
        if (existing) return existing;
        const material = source.clone();
        if (material instanceof MeshStandardMaterial) {
          material.onBeforeCompile = garagePaintedFinish;
          if (node.name === "paint" || material.name === "paint") {
            finishes.current.push({ material, factory: material.color.clone() });
          }
        }
        materials.set(source, material);
        return material;
      };
      node.material = Array.isArray(node.material) ? node.material.map(own) : own(node.material);
    });
    host.current.add(exterior);
    invalidate();
    return () => {
      exterior.removeFromParent();
      finishes.current = [];
      for (const material of materials.values()) material.dispose();
      invalidate();
    };
  }, [art, invalidate]);

  useLayoutEffect(() => {
    for (const { material, factory } of finishes.current) {
      if (/^#[0-9a-f]{6}$/i.test(appearance.body)) material.color.set(appearance.body);
      else material.color.copy(factory);
      applyPaintFinish(material, .45, appearance.finish, appearance.metallic);
    }
    invalidate();
  }, [art, appearance, invalidate]);

  useLayoutEffect(() => {
    if (placement) onFootprint?.(placement.footprint);
  }, [onFootprint, placement]);

  if (!placement || !art) return null;
  return <group name="garage-parked-vehicle" userData={{ model, tier: art.tier }}>
    <group ref={host} position={placement.offset} />
    <PreviewContactShadow footprint={[placement.footprint.width, placement.footprint.length]} />
  </group>;
}
