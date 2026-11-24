import { BufferAttribute, BufferGeometry, Matrix4, Triangle, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const clearance = .0015;

export function prepareDressContactFit(root, bodySource) {
  const dress = root.getObjectByName('wardrobe-local-tennis-dress');
  const skin = root.getObjectByName('fitting-room-body');
  if (!dress || !skin || !bodySource?.index) return;
  const parts = [];
  dress.traverse(part => { if (part.isSkinnedMesh) parts.push(part); });
  const opaque = parts.find(part => !part.material.transparent);
  const sheer = parts.find(part => part.material.transparent);
  if (!opaque || !sheer) return;

  const source = opaque.geometry;
  const cloth = source.attributes.position;
  const protectedVertices = new Set(sheer.geometry.index.array);
  const panel = [];
  const byLocation = new Map();
  const vertexToSite = new Map();
  for (const index of new Set([...source.index.array, ...protectedVertices])) {
    const x = cloth.getX(index), y = cloth.getY(index), z = cloth.getZ(index);
    const key = [x, y, z].map(n => Math.round(n * 1e5)).join(',');
    let site = byLocation.get(key);
    if (!site) {
      site = { indices: [], near: new Set(), point: new Vector3(), move: new Vector3(), next: new Vector3(),
        upper: y > 1.14, lower: y < 1.007 };
      byLocation.set(key, site);
      panel.push(site);
    }
    site.indices.push(index);

    vertexToSite.set(index, site);
  }
  for (const index of [source.index, sheer.geometry.index]) for (let i = 0; i < index.count; i += 3) {
    const a = vertexToSite.get(index.getX(i));
    const b = vertexToSite.get(index.getX(i + 1));
    const c = vertexToSite.get(index.getX(i + 2));
    a.near.add(b).add(c);
    b.near.add(a).add(c);
    c.near.add(a).add(b);
  }

  const positions = bodySource.attributes.position;
  const indices = [];
  const corners = new Set();
  for (let i = 0; i < bodySource.index.count; i += 3) {
    const tri = [bodySource.index.getX(i), bodySource.index.getX(i + 1), bodySource.index.getX(i + 2)];
    if (tri.some(v => positions.getY(v) <= .49 || positions.getY(v) >= 1.47 || Math.abs(positions.getX(v)) >= .285)) continue;
    indices.push(...tri);
    for (const index of tri) corners.add(index);
  }
  const posed = new BufferGeometry().setIndex(indices);
  const surface = new BufferAttribute(new Float32Array(positions.count * 3), 3);
  posed.setAttribute('position', surface);
  for (const i of corners) surface.setXYZ(i, positions.getX(i), positions.getY(i), positions.getZ(i));
  const tree = new MeshBVH(posed, { indirect: true });

  const sheerSource = sheer.geometry;
  const sheerGeometry = sheerSource.clone();
  sheer.geometry = sheerGeometry;
  const sheerFit = sheerGeometry.attributes.position;
  const geometry = source.clone();
  opaque.geometry = geometry;
  const fit = geometry.attributes.position;
  const worldToRoot = new Matrix4(), bodyToRoot = new Matrix4(), clothToRoot = new Matrix4(), inverseSkin = new Matrix4();
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), point = new Vector3(), normal = new Vector3(), delta = new Vector3();
  const axisX = new Vector3(), axisY = new Vector3(), axisZ = new Vector3(), base = new Vector3(), posedBase = new Vector3();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  let corrected = [];

  function reset() {
    for (const index of corrected) write(index, cloth.getX(index), cloth.getY(index), cloth.getZ(index));
    if (corrected.length) fit.needsUpdate = sheerFit.needsUpdate = true;
    corrected = [];
  }

  function write(index,x,y,z) {
    fit.setXYZ(index,x,y,z);
    if(protectedVertices.has(index)) sheerFit.setXYZ(index,x,y,z);
  }

  function apply(mode) {
    reset();
    if (!mode) return;
    root.updateWorldMatrix(true, false);
    root.updateMatrixWorld(true);
    worldToRoot.copy(root.matrixWorld).invert();
    bodyToRoot.multiplyMatrices(worldToRoot, skin.matrixWorld);
    clothToRoot.multiplyMatrices(worldToRoot, opaque.matrixWorld);
    for (const index of corners) {
      skin.getVertexPosition(index, point).applyMatrix4(bodyToRoot);
      surface.setXYZ(index, point.x, point.y, point.z);
    }
    tree.refit();

    const movable = panel.filter(site => site.upper || (mode === 'seated' && site.lower));
    const contact = new Set();
    for (const site of movable) {
      site.move.set(0, 0, 0);
      opaque.getVertexPosition(site.indices[0], site.point).applyMatrix4(clothToRoot);
    }

    function signedClearance(at) {
      if (!tree.closestPointToPoint(at, hit, 0, .075) || hit.distance > .075) return .075;
      const k = hit.faceIndex * 3;
      Triangle.getNormal(a.fromBufferAttribute(surface, indices[k]), b.fromBufferAttribute(surface, indices[k + 1]),
        c.fromBufferAttribute(surface, indices[k + 2]), normal);
      return delta.copy(at).sub(hit.point).dot(normal);
    }

    function close(site, iterations) {
      for (let pass = 0; pass < iterations; pass++) {
        point.copy(site.point).add(site.move);
        const distance = signedClearance(point);
        if (distance >= clearance - .00015) return;
        site.move.addScaledVector(normal, clearance - distance).clampLength(0, .072);
        contact.add(site);
      }
    }

    function clearFromClosestSide(site) {
      if (signedClearance(point.copy(site.point).add(site.move)) >= -.00025) return;
      const right = Math.sign(site.point.x) || 1;
      const directions = [
        new Vector3(0,1,0), new Vector3(right,0,0), new Vector3(-right,0,0),
        new Vector3(0,0,1), new Vector3(0,0,-1), new Vector3(0,-1,0),
        new Vector3(right,1,0), new Vector3(-right,1,0), new Vector3(0,1,1),
        new Vector3(0,1,-1), new Vector3(right,0,1), new Vector3(right,0,-1),
      ].map(v=>v.normalize());
      for (let distance=.002; distance<=.06; distance+=.002) {
        for (const direction of directions) {
          point.copy(site.point).addScaledVector(direction,distance);
          if (signedClearance(point) < clearance) continue;
          site.move.copy(direction).multiplyScalar(distance);
          return;
        }
      }
    }
    for (const site of movable) close(site, 5);
    const adjacent = new Set(contact);
    for (const site of contact) for (const other of site.near) if (other.upper || (mode === 'seated' && other.lower)) adjacent.add(other);
    for (let pass = 0; pass < 4; pass++) {
      for (const site of adjacent) {
        site.next.set(0, 0, 0);
        for (const neighbor of site.near) if (adjacent.has(neighbor)) site.next.add(neighbor.move);
        site.next.divideScalar(Math.max(1, site.near.size)).lerp(site.move, .57);
      }
      for (const site of adjacent) {
        site.move.copy(site.next);
        close(site, 5);
      }
    }
    for (const site of adjacent) {
      clearFromClosestSide(site);
      if (site.move.lengthSq() < 1e-10) continue;
      for (const index of site.indices) {
        base.fromBufferAttribute(cloth, index);
        opaque.applyBoneTransform(index, posedBase.copy(base)).applyMatrix4(clothToRoot);
        opaque.applyBoneTransform(index, axisX.copy(base).add(a.set(1, 0, 0))).applyMatrix4(clothToRoot).sub(posedBase);
        opaque.applyBoneTransform(index, axisY.copy(base).add(a.set(0, 1, 0))).applyMatrix4(clothToRoot).sub(posedBase);
        opaque.applyBoneTransform(index, axisZ.copy(base).add(a.set(0, 0, 1))).applyMatrix4(clothToRoot).sub(posedBase);
        inverseSkin.makeBasis(axisX, axisY, axisZ);
        if (Math.abs(inverseSkin.determinant()) < .025) continue;
        point.copy(site.move).applyMatrix4(inverseSkin.invert()).add(base);
        write(index, point.x, point.y, point.z);
        corrected.push(index);
      }
    }
    if (corrected.length) fit.needsUpdate = sheerFit.needsUpdate = true;

  }

  return { apply, dispose() { opaque.geometry = source; sheer.geometry = sheerSource; geometry.dispose(); sheerGeometry.dispose(); posed.dispose(); } };
}
