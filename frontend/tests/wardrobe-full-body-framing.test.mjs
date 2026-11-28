import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from "three";
import { FITTING_BODY_DIRECTION, fullBodyZoom, measureFittingBody } from "../src/game/characters/fullBodyFraming.ts";

test("the dressed rig fills the open stage from headwear to shoes in both phone orientations", () => {
  const stage = new Group(), rig = new Group();
  stage.position.set(1,.023,2);
  stage.rotation.y = Math.PI / 2;
  stage.add(rig);
  const addPart = (width, height, depth, centerY) => {
    const part = new Mesh(new BoxGeometry(width,height,depth));
    part.position.y = centerY;
    rig.add(part);
    return part;
  };
  addPart(.92,.70,.78,.70); // full skirt
  addPart(.65,.60,.32,1.25);
  addPart(.24,.28,.22,1.63); // head and hair
  addPart(.41,.17,.29,.085);
  addPart(20,20,20,0).visible = false;
  const frame = measureFittingBody(rig, stage);
  assert.ok(Math.abs(frame.centerY - 1.77/2) < 1e-6, "measure height relative to the stage floor");
  for (const [w,h,x,y,freeW,freeH] of [[390,844,6,93,378,429],[844,390,12,43,399,308],[390,844,14,74,155,520]]) {
    const fov = Math.max(w < h ? 60 : 33, 2 * Math.atan(Math.tan(75*Math.PI/360) * h/w) * 180/Math.PI);
    const camera = new PerspectiveCamera(fov,w/h);
    const target = stage.localToWorld(new Vector3(0,frame.centerY,0));
    camera.position.copy(FITTING_BODY_DIRECTION).applyQuaternion(stage.quaternion).multiplyScalar(frame.distance).add(target);
    camera.lookAt(target);
    camera.zoom = fullBodyZoom(frame, fov, h, freeW, freeH);
    camera.setViewOffset(w,h,w/2-x-freeW/2,h/2-y-freeH/2,w,h);
    camera.updateMatrixWorld();
    for (let turn=0; turn < Math.PI*2; turn+=Math.PI/12) {
      rig.rotation.y = turn;
      rig.updateWorldMatrix(true,true);
      let top = Infinity, bottom = -Infinity;
      rig.traverseVisible(part => {
        if (!part.isMesh) return;
        const vertices = part.geometry.attributes.position;
        for (let i=0;i<vertices.count;i++) {
          const projected = new Vector3().fromBufferAttribute(vertices,i).applyMatrix4(part.matrixWorld).project(camera);
          const px = (projected.x+1)*w/2, py = (1-projected.y)*h/2;
          assert.ok(px>=x && px<=x+freeW && py>=y && py<=y+freeH, `clipped at ${w}×${h}`);
          top = Math.min(top,py);
          bottom = Math.max(bottom,py);
        }
      });
      if (freeW>300) assert.ok(bottom-top>=.77*freeH, `character uses the portrait/landscape stage at ${w}×${h}`);
    }
  }
});
