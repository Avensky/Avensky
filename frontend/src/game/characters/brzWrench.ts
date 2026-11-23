import { ExtrudeGeometry, Mesh, MeshStandardMaterial, Quaternion, Shape, Vector3, type Object3D } from "three";

export const BRZ_WRENCH_REACH = .135;

/** The handle is the local origin and the open jaw is on the positive Z axis. */
export function createBrzWrench(root: Object3D) {
  const outline = new Shape();
  outline.moveTo(-.007, -.029);
  outline.lineTo(.007, -.029);
  outline.lineTo(.008, .115);
  outline.lineTo(.021, .129);
  outline.lineTo(.020, .153);
  outline.lineTo(.011, .155);
  outline.lineTo(.009, .133);
  outline.lineTo(-.009, .133);
  outline.lineTo(-.011, .155);
  outline.lineTo(-.020, .153);
  outline.lineTo(-.021, .129);
  outline.lineTo(-.008, .115);
  outline.closePath();
  const mesh = new Mesh(new ExtrudeGeometry(outline, { depth: .006, bevelEnabled: false }),
    new MeshStandardMaterial({ color: "#aab3b9", metalness: .68, roughness: .31 }));
  mesh.name = "brz-engine-wrench";
  mesh.geometry.rotateX(Math.PI / 2).translate(0, .003, 0);
  root.add(mesh);
  mesh.visible = false;
  const worldYaw = new Quaternion(), localYaw = new Quaternion(), up = new Vector3(0, 1, 0);
  return {
    place(grip: Vector3, direction: Vector3, visible: boolean) {
      mesh.position.copy(root.worldToLocal(grip));
      worldYaw.setFromAxisAngle(up, Math.atan2(direction.x, direction.z));
      mesh.quaternion.copy(root.getWorldQuaternion(localYaw).invert().multiply(worldYaw));
      mesh.visible = visible;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}
