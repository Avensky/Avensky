import { Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, type Material } from "three";

const brass = new Color("#b39160");
type Finish = "linen" | "twill" | "silk" | "quilt" | "leather" | "cord";
const finishSettings: Record<Finish, { roughness: number; relief: number; repeat: number }> = {
  linen: { roughness: .89, relief: 1.08, repeat: 12 },
  twill: { roughness: .79, relief: 1.27, repeat: 10 },
  silk: { roughness: .48, relief: .86, repeat: 16 },
  quilt: { roughness: .82, relief: 1.67, repeat: 10 },
  leather: { roughness: .59, relief: 1.35, repeat: 7 },
  cord: { roughness: .73, relief: 1.3, repeat: 9 },
};
const fabricMaps = new Map<Finish, DataTexture>();

function fabricMap(finish: Finish) {
  const existing = fabricMaps.get(finish);
  if (existing) return existing;
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const warp = (x / size) * Math.PI * 2, weft = (y / size) * Math.PI * 2;
    // All repeats match at the edges. The quilts get their actual seams from the source normal atlas.
    const yarn = finish === "leather"
      ? 11 * Math.cos(warp * 5 + Math.sin(weft * 6)) * Math.cos(weft * 5 - Math.sin(warp * 4))
      : finish === "silk" ? 6 * Math.cos(warp * 5) + 2 * Math.sin(weft * 3)
        : finish === "linen" ? 14 * Math.cos(warp * 5) * Math.cos(weft * 5) + 5 * Math.cos(warp + weft)
          : (finish === "cord" ? 16 : 12) * Math.cos(5 * warp + 4 * weft) + 5 * Math.cos(weft * 6);
    const offset = (y * size + x) * 4;
    pixels.fill(Math.round(233 + yarn), offset, offset + 3);
    pixels[offset + 3] = 255;
  }
  const texture = new DataTexture(pixels, size, size);
  texture.name = `Medieval ${finish}`;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.setScalar(finishSettings[finish].repeat);
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  fabricMaps.set(finish, texture);
  return texture;
}

function dressFinish(id: string, name: string, channel: string): Finish {
  if (/(?:belt|bag)/i.test(name)) return "leather";
  if (/(?:straps|laces)/i.test(name) || channel === "laces") return "cord";
  if (id === "medieval-07" && /crop/i.test(name) || id === "medieval-08" && /jerkin/i.test(name)) return "quilt";
  if (id === "medieval-02" && channel === "trim" || id === "medieval-04" && /^dress/i.test(name)) return "silk";
  if (channel === "fabric" && id !== "linen-nightgown" && !id.includes("kaftan")) return "twill";
  return "linen";
}

export function restoreDressMaterial(material: Material, id: string, channel: string, hasUVs: boolean) {
  if (!(material instanceof MeshStandardMaterial)) return;
  if (channel === "hardware") {
    material.color.lerp(brass, .64);
    material.metalness = .65;
    material.roughness = .41;
    if (material.normalMap) material.normalScale.multiplyScalar(.7);
    return;
  }
  const finish = dressFinish(id, material.name, channel);
  const { roughness, relief } = finishSettings[finish];
  if (material.normalMap) material.normalScale.multiplyScalar(relief);
  if (hasUVs && !material.map) material.map = fabricMap(finish);
  if (finish === "leather") material.color.multiplyScalar(.56);
  material.metalness = 0;
  material.roughness = roughness;
}
