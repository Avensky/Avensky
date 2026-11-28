import { BufferGeometry, DoubleSide, MathUtils, Ray, SkinnedMesh, type Intersection, type Object3D } from "three";
import { wardrobeCoverageSurface } from "../wardrobeCoverage";
import { clothingPieceFor, type ClothingPiece } from "../clothingPieces";
import { HAIR_PIECES } from "./hairGroom";

const leftBraid = HAIR_PIECES.findIndex(([id]) => id === "left-braid");
const rightBraid = HAIR_PIECES.findIndex(([id]) => id === "right-braid");
const tail = HAIR_PIECES.findIndex(([id]) => id === "ponytail");
const sliceHeight = .008;
const jawHeight = 1.465;
const braidGap = .003;
const rearClothing = new Set<ClothingPiece>(["shirt", "corset", "coat"]);
const chestClothing = new Set<ClothingPiece>([...rearClothing, "dress", "bra", "collar", "armor", "harness"]);
type TorsoSurface = { mesh: SkinnedMesh; rear: boolean };

type Strand = { section: number; top: number; bottom: number; rootY: number; rootCount: number; hangX: number; hangCount: number; inner: number[] };

function strandProfiles(meshes: SkinnedMesh[]) {
  const profiles = new Map<number, Strand>();
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    const groom = mesh.geometry.getAttribute("_avensky_groom");
    if (groom?.itemSize !== 3 || groom.count !== position.count) continue;
    for (let i = 0; i < position.count; i++) {
      const section = Math.round(groom.getZ(i));
      if (section !== leftBraid && section !== rightBraid && section !== tail) continue;
      let strand = profiles.get(section);
      if (!strand) {
        strand = { section, top: -Infinity, bottom: Infinity, rootY: 0, rootCount: 0, hangX: 0, hangCount: 0, inner: [] };
        profiles.set(section, strand);
      }
      const y = position.getY(i), z = position.getZ(i);
      if (section !== tail && y <= jawHeight) {
        strand.hangX += position.getX(i);
        strand.hangCount++;
      }
      if (groom.getX(i) < .035) {
        strand.rootY += y;
        strand.rootCount++;
      }
      strand.top = Math.max(strand.top, y);
      strand.bottom = Math.min(strand.bottom, y);
      // The innermost card at each height rests on the body. Keep the relief of
      // neighboring locks, including the short locks on either side of the tail.
      const row = Math.round(y / sliceHeight);
      strand.inner[row] = section === tail ? Math.max(strand.inner[row] ?? -Infinity, z)
        : Math.min(strand.inner[row] ?? Infinity, z);
    }
  }
  for (const { inner, top, bottom } of profiles.values()) {
    let last = Math.round(bottom / sliceHeight);
    for (let row = last + 1; row <= Math.round(top / sliceHeight); row++) {
      if (inner[row] === undefined) continue;
      for (let j = last + 1; j < row; j++) inner[j] = MathUtils.lerp(inner[last], inner[row], (j - last) / (row - last));
      last = row;
    }
  }
  return profiles;
}

// Fit once in bind space. Each grid ray is shared by all strands; a strand
// never needs to raycast or solve a collision while the actor animates.
function torsoDepth(body: SkinnedMesh, garments: TorsoSurface[], range: readonly [number, number]) {
  const surfaces = [{ mesh: body, rear: true }, ...garments].flatMap(source => {
    const surface = wardrobeCoverageSurface(source.mesh.geometry, range);
    return surface ? [{ surface, ...source }] : [];
  });
  type Depth = { depth: number; skin: Map<string, number> };
  const ray = new Ray();
  // A face braid is narrower than a rear lock. Sample its actual footprint
  // closely enough to avoid a fold sitting several millimetres to its side.
  function gridScale(step: number) {
    return { step, first: Math.floor(range[0] / step), last: Math.ceil(range[1] / step) };
  }
  const frontGrid = gridScale(.0035), rearGrid = gridScale(.008);
  const grid = new Map<number, Depth | undefined>();
  function sampleGrid(x: number, y: number, rear: boolean) {
    const { step } = rear ? rearGrid : frontGrid;
    const sign = rear ? -1 : 1, key = sign * ((x + 256) * 1024 + y);
    if (grid.has(key)) return grid.get(key);
    ray.origin.set(x * step, y * step, sign * .4);
    ray.direction.set(0, 0, -sign);
    let nearest = .4, contact: Intersection | undefined, source: SkinnedMesh | undefined;
    for (const { surface, mesh, rear: supportsRear } of surfaces) {
      if (rear && (!supportsRear || (mesh !== body && y * step > 1.42))) continue;
      const hit = surface.raycastFirst(ray, DoubleSide, 0, nearest);
      if (hit) { nearest = hit.distance; source = mesh; contact = hit; }
    }
    const result = source ? { depth: .4 - nearest, skin: new Map<string, number>() } : undefined;
    const joints = source?.geometry.getAttribute("skinIndex"), weights = source?.geometry.getAttribute("skinWeight");
    if (result && source && joints && weights && contact?.face && contact.barycoord) {
      const corners = [contact.face.a, contact.face.b, contact.face.c];
      corners.forEach((vertex, corner) => {
        const fraction = contact.barycoord!.getComponent(corner);
        for (let slot = 0; slot < 4; slot++) {
          const w = fraction * weights.getComponent(vertex, slot);
          if (w <= 0) continue;
          const name = source.skeleton.bones[joints.getComponent(vertex, slot)].name;
          result.skin.set(name, (result.skin.get(name) ?? 0) + w);
        }
      });
    }
    grid.set(key, result);
    return result;
  }
  // A hanging lock bridges the hollow under the chin and the lip of a
  // collar. Two sweeps bound the slope of its supporting curve in both
  // directions while holding it outside each sampled fold of the garment.
  const columns = new Map<number, (Depth | undefined)[]>();
  function column(x: number, rear: boolean) {
    const key = (rear ? -1 : 1) * (x + 256);
    const existing = columns.get(key);
    if (existing) return existing;
    const { step, first, last } = rear ? rearGrid : frontGrid;
    const profile: (Depth | undefined)[] = new Array(last - first + 1);
    function support(row: number, candidate: Depth | undefined, fall: number) {
      if (candidate && candidate.depth - fall > (profile[row]?.depth ?? -Infinity)) {
        profile[row] = { depth: candidate.depth - fall, skin: candidate.skin };
      }
    }
    const edge = rear ? 1 : 0;
    for (let row = first; row <= last; row++) {
      for (let dx = -edge; dx <= edge; dx++) support(row - first, sampleGrid(x + dx, row, rear), Math.abs(dx) * .002);
    }
    const fall = step * (rear ? .55 : 1.3);
    for (let j = 1; j < profile.length; j++) support(j, profile[j - 1], fall);
    for (let j = profile.length - 2; j >= 0; j--) support(j, profile[j + 1], fall);
    columns.set(key, profile);
    return profile;
  }
  return {
    sample(x: number, y: number, rear: boolean, skin?: Map<string, number>) {
      const { step, first, last } = rear ? rearGrid : frontGrid;
      const xx = x / step, col = Math.floor(xx), yy = MathUtils.clamp(y / step, first, last) - first;
      const row = Math.floor(yy);
      let sum = 0, weight = 0;
      for (let a = 0; a < 2; a++) {
        const profile = column(col + a, rear);
        for (let b = 0; b < 2; b++) {
          const hit = profile[Math.min(row + b, profile.length - 1)];
          if (!hit) continue;
          const w = (a ? xx - col : 1 - (xx - col)) * (b ? yy - row : 1 - (yy - row));
          sum += w * hit.depth;
          weight += w;
          if (skin && !rear && w > 0) for (const [bone, influence] of hit.skin) skin.set(bone, (skin.get(bone) ?? 0) + w * influence);
        }
      }
      if (weight < .001) return;
      if (skin && weight < .999) for (const [bone, influence] of skin) skin.set(bone, influence / weight);
      return (rear ? -sum : sum) / weight;
    },
    dispose() { for (const { surface } of surfaces) surface.geometry.dispose(); },
  };
}

function insideOfStrand(strand: Strand, y: number) {
  const row = MathUtils.clamp(y / sliceHeight, Math.round(strand.bottom / sliceHeight), Math.round(strand.top / sliceHeight));
  return MathUtils.lerp(strand.inner[Math.floor(row)], strand.inner[Math.ceil(row)], row % 1);
}

function hangingBraid(strand: Strand, chest: ReturnType<typeof torsoDepth>) {
  if (!strand.hangCount || strand.section === tail) return;
  const x = strand.hangX / strand.hangCount;
  const release = MathUtils.clamp(jawHeight, strand.bottom, strand.top);
  const from = insideOfStrand(strand, release);
  // Drop a plumb line from the jaw until the wearer actually supports the
  // braid. In particular, an empty neck hollow cannot pull a hanging braid in.
  let touching = false;
  for (let y = release; y >= strand.bottom; y -= .005) {
    const surface = chest.sample(x, y, false);
    const hit = surface !== undefined && surface + braidGap >= from;
    if (hit && touching) return { release, landing: y + .005, from, to: from };
    touching = hit;
  }
  // An authored groom can sit entirely forward of a slimmer wearer. Join
  // the release point to the chest over the free length, then let the tips
  // rest on the local garment, even when it recedes behind that line.
  const landing = Math.max(strand.bottom, release - .135);
  const surface = chest.sample(x, landing, false);
  return { release, landing, from, to: surface === undefined ? from : surface + braidGap };
}

/** Fit tagged Mia locks once for this wearer. Shared GLB attributes remain immutable. */
export function fitMiaPonytail(hair: Object3D, actor: Object3D, body: SkinnedMesh) {
  const meshes: SkinnedMesh[] = [];
  hair.traverse(part => { if (part instanceof SkinnedMesh) meshes.push(part); });
  const profiles = strandProfiles(meshes);
  if (!profiles.size) return () => {};
  const surfaces: TorsoSurface[] = [];
  actor.traverseVisible(part => {
    if (!(part instanceof SkinnedMesh)) return;
    const piece = clothingPieceFor(part);
    if (piece && chestClothing.has(piece) && part.geometry !== body.geometry) {
      surfaces.push({ mesh: part, rear: rearClothing.has(piece) });
    }
  });
  const spans = [...profiles.values()];
  const depth = torsoDepth(body, surfaces, [Math.min(...spans.map(s => s.bottom)) - .02, Math.max(...spans.map(s => s.top)) + .02]);
  const hanging = new Map(spans.map(strand => [strand.section, hangingBraid(strand, depth)]));
  const owned: BufferGeometry[] = [];
  for (const mesh of meshes) {
    const original = mesh.geometry;
    const source = original.getAttribute("position");
    const groom = original.getAttribute("_avensky_groom");
    if (groom?.itemSize !== 3 || groom.count !== source.count) continue;
    const boneIndices = new Map(mesh.skeleton.bones.map((bone, index) => [bone.name, index]));
    const influences = new Map<string, number>();
    const ranked = new Array<number>(4), joints = new Array<number>(4);
    const spine = boneIndices.get("spine_05");
    // A cloned geometry owns its modified positions/weights and releases them
    // with this actor. Avoid cloning crown-only primitives.
    let geometry: BufferGeometry | undefined;
    for (let i = 0; i < source.count; i++) {
      const strand = profiles.get(Math.round(groom.getZ(i)));
      if (!strand) continue;
      const rear = strand.section === tail;
      const oldY = source.getY(i), x = source.getX(i), z = source.getZ(i);
      const anchor = strand.rootCount ? strand.rootY / strand.rootCount : strand.top;
      const drop = Math.max(0, anchor - oldY);
      const loose = MathUtils.smoothstep(groom.getX(i), .04, .27);
      // Carry each front braid down past the top edge of a bodice. Its
      // authored length remains available to settle on the chest underneath.
      const shortened = rear ? oldY + drop * .28 * loose : oldY;
      const contact = loose * MathUtils.smoothstep(drop, .025, rear ? .105 : .14)
        * (rear ? 1 : 1 - MathUtils.smoothstep(shortened, 1.39, 1.49));
      geometry ??= original.clone();
      influences.clear();
      const surface = contact ? depth.sample(x, shortened, rear, influences) : undefined;
      const inner = insideOfStrand(strand, oldY);
      // Preserve the taper and folds. At the nape let the hair pass through
      // the collar; below it the loose lengths lie against the torso.
      const relief = MathUtils.clamp(z - inner, rear ? -.028 : 0, rear ? 0 : .009);
      let fittedZ = z;
      if (surface !== undefined) {
        let target = surface + (rear ? -.005 : braidGap) + relief;
        const hang = hanging.get(strand.section);
        if (hang && shortened > hang.landing - .02) {
          const span = Math.max(.001, hang.release - hang.landing);
          const t = MathUtils.smoothstep((hang.release - shortened) / span, 0, 1);
          const line = MathUtils.lerp(hang.from, hang.to, t) + relief;
          const free = MathUtils.smoothstep(shortened, hang.landing - .02, hang.landing);
          target += free * Math.max(0, line - target);
        }
        fittedZ = MathUtils.lerp(z, target, contact);
        if (!rear) fittedZ = MathUtils.lerp(fittedZ, Math.max(fittedZ, surface + .0025),
          loose * (1 - MathUtils.smoothstep(shortened, 1.39, 1.45)));
      }
      geometry.getAttribute("position").setXYZ(i, x, shortened, fittedZ);
      if (!contact) continue;
      const indices = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
      if (!indices || !weights) continue;
      if (rear && contact === 1 && spine !== undefined) {
        indices.setXYZW(i, spine, 0, 0, 0);
        weights.setXYZW(i, 1, 0, 0, 0);
        continue;
      }
      // The braids inherit the weights of the actual garment triangle beneath
      // them. Its chest motion can differ from a single spine joint during emotes.
      if (influences.size) {
        for (const [bone, w] of influences) influences.set(bone, w * contact);
      } else influences.set("spine_05", contact);
      for (let slot = 0; slot < 4; slot++) {
        const name = mesh.skeleton.bones[indices.getComponent(i, slot)].name;
        const originalWeight = weights.getComponent(i, slot) * (1 - contact);
        if (originalWeight) influences.set(name, (influences.get(name) ?? 0) + originalWeight);
      }
      ranked.fill(0);
      joints.fill(0);
      for (const [bone, w] of influences) {
        const index = boneIndices.get(bone);
        if (index === undefined || w <= ranked[3]) continue;
        let slot = 3;
        while (slot > 0 && w > ranked[slot - 1]) {
          ranked[slot] = ranked[slot - 1];
          joints[slot] = joints[slot - 1];
          slot--;
        }
        ranked[slot] = w;
        joints[slot] = index;
      }
      const total = ranked[0] + ranked[1] + ranked[2] + ranked[3];
      if (total > 0) {
        indices.setXYZW(i, joints[0], joints[1], joints[2], joints[3]);
        weights.setXYZW(i, ranked[0] / total, ranked[1] / total, ranked[2] / total, ranked[3] / total);
      }
    }
    if (geometry) {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      mesh.geometry = geometry;
      owned.push(geometry);
    }
  }
  depth.dispose();
  return () => owned.forEach(geometry => geometry.dispose());
}
