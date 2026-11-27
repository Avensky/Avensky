import { DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3, type Object3D } from "three";
import { garagePaintedFinish } from "./garagePaintedFinish";
import type { GarageCarFootprint } from "./GarageParkedVehicle";

/** The compact fleet art batches body, trim and glass by material. Sample the same
 * doorway on each batch so its actual paint and glass swing away together. The
 * workshop car keeps its usual three batches outside the short boarding shot. */
export function installFleetDoor(car: Group, exterior: Object3D, seat: readonly number[],
  dimensions: GarageCarFootprint, gullwing: boolean) {
  const hinge = new Group();
  hinge.name = "garage-driver-door";
  const side = Math.sign(seat[0]);
  const { width, height } = dimensions;
  const front = seat[2] + .77, back = seat[2] - .63;
  hinge.position.set(side * width * (gullwing ? .20 : .445), height * (gullwing ? .94 : .46), front);
  car.add(hinge);
  car.updateWorldMatrix(true, true);
  const toLocal = car.matrixWorld.clone().invert(), shift = new Matrix4().makeTranslation(-hinge.position.x, -hinge.position.y, -hinge.position.z);
  const resets: Array<() => void> = [];
  const inside = `vec3 p = vGarageDoorPoint;
    float upper = smoothstep(${height*.53}, ${height*.95}, p.y);
    bool panel = p.x * ${side.toFixed(1)} > ${width*(gullwing ? .19 : .30)}
      && p.y > ${height*.13} && p.y < ${height*(gullwing ? .98 : .91)}
      && p.z > ${back} + .09 * upper && p.z < ${front} - .40 * upper;`;
  exterior.traverse(node => {
    if (!(node instanceof Mesh) || !(node.material instanceof MeshStandardMaterial)) return;
    const bind = toLocal.clone().multiply(node.matrixWorld);
    const original = node.material;
    function masked(part: boolean) {
      const mat = original.clone();
      mat.side = part ? DoubleSide : original.side;
      mat.customProgramCacheKey = () => `garage-entry-${part}-${inside}`;
      mat.onBeforeCompile = (shader, renderer) => {
        garagePaintedFinish.call(mat, shader, renderer);
        shader.uniforms.garageDoorBind = { value: bind };
        shader.vertexShader = shader.vertexShader.replace("#include <common>",
          "#include <common>\nuniform mat4 garageDoorBind; varying vec3 vGarageDoorPoint;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGarageDoorPoint = (garageDoorBind * vec4(position, 1.)).xyz;");
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vGarageDoorPoint;")
          .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\n${inside}\nif (${part ? "!" : ""}panel) discard;`);
      };
      return mat;
    }
    const bodyMaterial = masked(false), doorMaterial = masked(true);
    const panel = new Mesh(node.geometry, doorMaterial);
    panel.matrixAutoUpdate = false;
    panel.matrix.multiplyMatrices(shift,bind);
    hinge.add(panel);
    node.material = bodyMaterial;
    resets.push(() => { node.material = original; bodyMaterial.dispose(); doorMaterial.dispose(); });
  });
  const axis = gullwing ? new Vector3(0,0,1) : new Vector3(0,1,0);
  return {
    set(open: number) { hinge.quaternion.setFromAxisAngle(axis, side * (gullwing ? 1.0 : -1.01) * open); },
    dispose() { hinge.removeFromParent(); resets.forEach(reset => reset()); },
  };
}
