import { Bone, Group, Skeleton, SkinnedMesh, type Object3D } from "three";

// Blender and the shipped Vesper GLB serialize the same bind pose in different joint orders.
function hairBindings(source: Object3D, actor: Skeleton) {
  const names = new Map(actor.bones.map((bone, index) => [bone.name, { bone, inverse: actor.boneInverses[index] }]));
  const bindings: { mesh: SkinnedMesh; bones: Bone[] }[] = [];
  let compatible = true;
  source.traverse(mesh => {
    if (!(mesh instanceof SkinnedMesh)) return;
    const bones = mesh.skeleton?.bones.map((bone, index) => {
      const match = names.get(bone.name), inverse = mesh.skeleton.boneInverses[index];
      return match && inverse && match.inverse.elements.every((n, i) => Math.abs(n - inverse.elements[i]) < .0001) ? match.bone : undefined;
    }) ?? [];
    if (!bones.length || bones.length !== actor.bones.length || new Set(bones).size !== bones.length ||
      !bones.every((bone): bone is Bone => bone !== undefined)) compatible = false;
    else bindings.push({ mesh, bones });
  });
  return compatible && bindings.length ? bindings : undefined;
}

export function fitsHairRig(source: Object3D | undefined, actor: Skeleton | undefined) {
  return Boolean(source && actor && hairBindings(source, actor));
}

export function bindFittedHair(source: Object3D | undefined, actor: Skeleton) {
  if (!source) return;
  const bindings = hairBindings(source, actor);
  if (!bindings) return;
  const group = new Group();
  group.name = source.name;
  for (const { mesh, bones } of bindings) {
    if (!Array.isArray(mesh.material) && mesh.material.name.endsWith("Crown backing")) continue;
    const bound = mesh.clone(false);
    bound.bind(new Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
    bound.frustumCulled = false;
    group.add(bound);
  }
  return group;
}
