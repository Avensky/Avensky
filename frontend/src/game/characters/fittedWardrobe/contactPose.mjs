const joints = [
  'pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r',
  'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r',
];

export function contactPose(root) {
  const rotations = joints.map(name => root.getObjectByName(name)?.quaternion);
  return target => {
    let index = 0;
    for (const q of rotations) {
      const sign = q && q.w < 0 ? -1 : 1;
      target[index++] = q ? sign * q.x : 0;
      target[index++] = q ? sign * q.y : 0;
      target[index++] = q ? sign * q.z : 0;
    }
    return target;
  };
}
