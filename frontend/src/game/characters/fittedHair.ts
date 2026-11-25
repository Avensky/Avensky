import { Bone, Skeleton, SkinnedMesh, type Object3D } from "three";

// Blender and the shipped Vesper GLB serialize the same bind pose in different joint orders.
function actorBonesInHairOrder(mesh: SkinnedMesh, actor: Skeleton) {
  const names = new Map(actor.bones.map(bone => [bone.name, bone]));
  const bones = mesh.skeleton.bones.map(bone => names.get(bone.name));
  if (bones.length === 0 || bones.length !== actor.bones.length || new Set(bones).size !== bones.length
    || !bones.every((bone): bone is Bone => bone !== undefined)) return;
  return bones;
}

export function fitsHairRig(source: Object3D | undefined, actor: Skeleton | undefined): source is SkinnedMesh {
  return source instanceof SkinnedMesh && Boolean(actor && actorBonesInHairOrder(source, actor));
}

export function bindFittedHair(source: Object3D | undefined, actor: Skeleton) {
  if (!(source instanceof SkinnedMesh)) return;
  const bones = actorBonesInHairOrder(source, actor);
  if (!bones) return;
  const mesh = source.clone(false);
  mesh.bind(new Skeleton(bones, source.skeleton.boneInverses), source.bindMatrix);
  mesh.frustumCulled = false;
  return mesh;
}
