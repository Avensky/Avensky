import { BufferAttribute, BufferGeometry, Matrix4, Triangle, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { contactPose } from './contactPose.mjs';

const clearance = .0015;
const shoulderClearance = .0042;
const smooth = (lo, hi, value) => {
  const t = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

export function prepareDressContactFit(root, bodySource, roundedLeftCuff = false, baked) {
  const dress = root.getObjectByName('wardrobe-local-tennis-dress');
  const skin = root.getObjectByName('fitting-room-body');
  if (!dress || !skin || !bodySource?.index) return;
  const parts = [];
  dress.traverse(part => { if (part.isSkinnedMesh) parts.push(part); });
  const opaque = parts.find(part => !part.material.transparent);
  const sheer = parts.find(part => part.material.transparent);
  if (!opaque || !sheer) return;

  const source = opaque.geometry;
  const skinPosition = skin.geometry.attributes.position;
  const restoredSkin = new Float32Array(skinPosition.count * 3);
  const fittedSkin = new Float32Array(restoredSkin.length);
  const walkingSkin = new Float32Array(restoredSkin.length);
  const seatedSkin = new Float32Array(restoredSkin.length);
  const skirtSkin = [];
  const { skinIndex, skinWeight } = skin.geometry.attributes;
  const waistBones = skin.skeleton.bones.map(({ name }) => /^(pelvis$|spine_|thigh_)/.test(name));
  if (roundedLeftCuff) for (let index = 0; index < skinPosition.count; index++) {
    const x = skinPosition.getX(index), y = skinPosition.getY(index), z = skinPosition.getZ(index);
    // Recess just the rear inside edge of the left upper arm beneath the sleeve.
    const sleeveRelief = y > 1.209 && y < 1.267 && x > .148 && x < .204 && z > -.084 && z < -.026
      ? .010 * (1 - smooth(.007, .028, Math.hypot(x - .176, y - 1.238, z + .055))) : 0;
    if (sleeveRelief) {
      skirtSkin.push(index);
      restoredSkin.set([x, y, z], index * 3);
      fittedSkin.set([x + sleeveRelief, y, z], index * 3);
      walkingSkin.set([x + sleeveRelief, y, z], index * 3);
      seatedSkin.set([x, y, z], index * 3);
      continue;
    }
    if (Math.abs(x) >= .22 || y < .63 || y > 1.165) continue;
    let waistWeight = 0;
    for (let influence = 0; influence < 4; influence++) {
      if (waistBones[skinIndex.getComponent(index, influence)]) waistWeight += skinWeight.getComponent(index, influence);
    }
    if (waistWeight < .5) continue;
    const hip = smooth(.862, .92, y) * (1 - smooth(.952, .986, y));
    const bodiceSeam = smooth(1.024, 1.067, y) * (1 - smooth(1.119, 1.165, y));
    const rearSeat = smooth(.780, .812, y) * (1 - smooth(.854, .884, y))
      * (1 - smooth(-.043, -.015, z)) * (1 - smooth(.079, .119, Math.abs(x)));
    const outerThigh = smooth(.725, .754, y) * (1 - smooth(.850, .884, y))
      * smooth(.121, .156, Math.abs(x)) * smooth(.008, .045, z);
    const lap = smooth(.692, .720, y) * (1 - smooth(.755, .790, y))
      * smooth(.085, .120, Math.abs(x)) * smooth(.025, .056, z);
    const pedalThigh = smooth(.654, .691, y) * (1 - smooth(.724, .762, y))
      * smooth(.089, .118, x) * (1 - smooth(.158, .179, x)) * smooth(.031, .063, z);
    const insideLap = smooth(.635, .661, y) * (1 - smooth(.744, .777, y))
      * smooth(.051, .076, -x) * (1 - smooth(.111, .146, -x)) * smooth(.039, .071, z);
    const step = smooth(.718, .739, y) * (1 - smooth(.748, .768, y))
      * smooth(.115, .143, -x) * smooth(.047, .074, z);
    if (!hip && !bodiceSeam && !rearSeat && !outerThigh && !lap && !pedalThigh && !insideLap && !step) continue;
    skirtSkin.push(index);
    restoredSkin.set([x, y, z], index * 3);
    const fitX = x * (1 - .095 * hip - .035 * bodiceSeam);
    const fitZ = z * (1 - .135 * hip - .065 * bodiceSeam);
    fittedSkin.set([fitX, y, fitZ], index * 3);
    walkingSkin.set([fitX, y, fitZ - .008 * step], index * 3);
    seatedSkin.set([fitX - Math.sign(x) * .017 * outerThigh, y,
      fitZ + .030 * rearSeat - .011 * outerThigh - .020 * lap - .016 * pedalThigh - .018 * insideLap], index * 3);
  }
  let skinMode;
  function fitSkin(mode) {
    if (skinMode === mode || !skirtSkin.length) return;
    skinMode = mode;
    const values = mode === 'seated' ? seatedSkin : mode === 'walk' ? walkingSkin : mode ? fittedSkin : restoredSkin;
    for (const index of skirtSkin) skinPosition.setXYZ(index, values[index * 3], values[index * 3 + 1], values[index * 3 + 2]);
    skinPosition.needsUpdate = true;
  }
  fitSkin('standing');
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
      const shoulder = y > 1.205 || (y > 1.095 && Math.abs(x) > .134 && Math.abs(x) < .37);
      const leftSleeve = smooth(.119, .140, x) * (1 - smooth(.188, .224, x))
        * smooth(1.193, 1.235, y) * (1 - smooth(1.327, 1.359, y));
      site = { indices: [], near: new Set(), point: new Vector3(), move: new Vector3(), next: new Vector3(),
        rest: new Vector3(x, y, z), leftSleeve,
        leftCuff: roundedLeftCuff && x > .174 && x < .269 && y > 1.176 && y < 1.275 && !protectedVertices.has(index),
        upper: y > 1.14 || shoulder, lower: y < 1.007, shoulder,
        clearance: shoulder && !protectedVertices.has(index) ? shoulderClearance : clearance };
      byLocation.set(key, site);
      panel.push(site);
    }
    site.indices.push(index);
    if (protectedVertices.has(index)) {
      site.clearance = clearance;
      site.leftSleeve = 0;
      site.leftCuff = false;
    }

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
  const leftSleeveEdges = [];
  const leftUnderarm = [];
  const seatedLap = [];
  if (roundedLeftCuff) for (let i = 0; i < source.index.count; i += 3) {
    const triangle = [0, 1, 2].map(j => vertexToSite.get(source.index.getX(i + j)));
    if (triangle.every(({ rest }) => rest.x > .095 && rest.x < .205 && rest.y > 1.16 && rest.y < 1.263)) {
      leftUnderarm.push(triangle);
    }
    if (triangle.every(({ rest }) => rest.z > .020 && rest.y > .882 && rest.y < .975)) seatedLap.push(triangle);
  }
  const underarmSites = [...new Set(leftUnderarm.flat())];
  const upperArm = root.getObjectByName('upperarm_l');
  const lowerArm = root.getObjectByName('lowerarm_l');
  const hangingSamples = [[1 / 3, 1 / 3, 1 / 3], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6], [.5, .5, 0], [.5, 0, .5], [0, .5, .5]];
  const visited = new Set();
  for (const site of panel) {
    if (!site.leftSleeve) continue;
    visited.add(site);
    for (const neighbor of site.near) {
      if (visited.has(neighbor) || !neighbor.leftSleeve) continue;
      const length = site.rest.distanceTo(neighbor.rest);
      if (length < .001 || length > .032) continue;
      leftSleeveEdges.push([site, neighbor, Math.max(length * 1.24, length + .004)]);
    }
  }

  const positions = bodySource.attributes.position;
  const indices = [];
  const corners = new Set();
  for (let i = 0; i < bodySource.index.count; i += 3) {
    const tri = [bodySource.index.getX(i), bodySource.index.getX(i + 1), bodySource.index.getX(i + 2)];
    if (tri.some(v => positions.getY(v) <= .49 || positions.getY(v) >= 1.48 || Math.abs(positions.getX(v)) >= .40)) continue;
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
  const midpoint = new Vector3(), edgeLift = new Vector3();
  const sleeveEdge = new Vector3(), sleeveTarget = new Vector3();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const seedPoint = new Vector3();
  const seedTriangle = new Triangle();
  // Seed the exact BVH search with a nearby query's face. Its distance is an
  // upper bound, even after the skin deforms. Keep independent caches per fit mode.
  const cellsByMode = new Map();
  const poseNodes = [...new Set([...skin.skeleton.bones, ...opaque.skeleton.bones, skin, opaque])];
  const morphMeshes = [skin, opaque];
  const pose = new Float64Array(poseNodes.length * 16 + morphMeshes.reduce((sum, mesh) => sum + (mesh.morphTargetInfluences?.length ?? 0), 0));
  let previousMode;
  function changedPose(mode) {
    let changed = mode !== previousMode;
    previousMode = mode;
    let index = 0;
    for (const node of poseNodes) for (const value of node.matrix.elements) {
      if (pose[index] !== value) changed = true;
      pose[index++] = value;
    }
    for (const mesh of morphMeshes) for (const value of mesh.morphTargetInfluences ?? []) {
      if (pose[index] !== value) changed = true;
      pose[index++] = value;
    }
    return changed;
  }
  let corrected = [];
  const readPose = contactPose(root);
  const features = [];
  const bakedMoves = new Float32Array(cloth.count * 3);
  const bakedIndices = new Set();

  function applyBaked(takes) {
    readPose(features);
    let first, second, firstError = Infinity, secondError = Infinity;
    for (const take of takes) {
      let error = 0;
      for (let i = 0; i < features.length; i++) error += (features[i] - take.pose[i]) ** 2;
      if (error < firstError) {
        second = first;
        secondError = firstError;
        first = take;
        firstError = error;
      } else if (error < secondError) {
        second = take;
        secondError = error;
      }
    }
    const blend = firstError < 1e-12 || !second ? 0 : firstError / (firstError + secondError);
    bakedIndices.clear();
    function accumulate(take, weight) {
      if (!weight) return;
      for (let i = 0; i < take.moves.length; i += 4) {
        const index = take.moves[i], offset = index * 3;
        if (!bakedIndices.has(index)) {
          bakedIndices.add(index);
          bakedMoves[offset] = bakedMoves[offset + 1] = bakedMoves[offset + 2] = 0;
        }
        for (let axis = 0; axis < 3; axis++) bakedMoves[offset + axis] += take.moves[i + 1 + axis] * weight / 100000;
      }
    }
    accumulate(first, 1 - blend);
    accumulate(second, blend);
    for (const index of bakedIndices) {
      const offset = index * 3;
      write(index, cloth.getX(index) + bakedMoves[offset], cloth.getY(index) + bakedMoves[offset + 1], cloth.getZ(index) + bakedMoves[offset + 2]);
      corrected.push(index);
    }
    if (corrected.length) fit.needsUpdate = sheerFit.needsUpdate = true;
  }

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
    fitSkin(mode);
    if (!mode) {
      previousMode = undefined;
      reset();
      return;
    }
    root.updateWorldMatrix(true, false);
    root.updateMatrixWorld(true);
    if (!changedPose(mode)) return;
    reset();
    if (baked?.[mode]?.length) {
      applyBaked(baked[mode]);
      return;
    }
    worldToRoot.copy(root.matrixWorld).invert();
    bodyToRoot.multiplyMatrices(worldToRoot, skin.matrixWorld);
    clothToRoot.multiplyMatrices(worldToRoot, opaque.matrixWorld);
    for (const index of corners) {
      skin.getVertexPosition(index, point).applyMatrix4(bodyToRoot);
      surface.setXYZ(index, point.x, point.y, point.z);
    }
    tree.refit();
    let cells = cellsByMode.get(mode);
    if (!cells) cellsByMode.set(mode, cells = new Map());
    if (cells.size > 60000) cells.clear();

    const canMove = site => site.upper || (mode === 'seated' && site.lower)
      || (roundedLeftCuff && site.rest.y > .903 && site.rest.y < 1.16);
    const movable = panel.filter(canMove);
    const contact = new Set();
    for (const site of movable) {
      site.move.set(0, 0, 0);
      opaque.getVertexPosition(site.indices[0], site.point).applyMatrix4(clothToRoot);
    }

    function signedClearance(at) {
      const cell = ((Math.floor(at.x * 240) + 128) * 512 + Math.floor(at.y * 240)) * 512 + Math.floor(at.z * 240) + 256;
      const seed = cells.get(cell);
      let radius = .075;
      if (seed !== undefined) {
        const i = seed * 3;
        seedTriangle.a.fromBufferAttribute(surface, indices[i]);
        seedTriangle.b.fromBufferAttribute(surface, indices[i + 1]);
        seedTriangle.c.fromBufferAttribute(surface, indices[i + 2]);
        seedTriangle.closestPointToPoint(at, seedPoint);
        radius = Math.min(radius, at.distanceTo(seedPoint) + 1e-7);
      }
      if (!tree.closestPointToPoint(at, hit, 0, radius) || hit.distance > .075) return .075;
      cells.set(cell, hit.faceIndex);
      const k = hit.faceIndex * 3;
      Triangle.getNormal(a.fromBufferAttribute(surface, indices[k]), b.fromBufferAttribute(surface, indices[k + 1]),
        c.fromBufferAttribute(surface, indices[k + 2]), normal);
      return delta.copy(at).sub(hit.point).dot(normal);
    }

    function close(site, iterations) {
      for (let pass = 0; pass < iterations; pass++) {
        point.copy(site.point).add(site.move);
        const distance = signedClearance(point);
        if (distance >= site.clearance - .00015) return;
        site.move.addScaledVector(normal, site.clearance - distance).clampLength(0, .072);
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
          if (signedClearance(point) < site.clearance) continue;
          site.move.copy(direction).multiplyScalar(distance);
          return;
        }
      }
    }
    for (const site of movable) close(site, 5);
    const adjacent = new Set(contact);
    for (const site of contact) for (const other of site.near) if (canMove(other)) adjacent.add(other);
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
    // A skin triangle can cross a sleeve edge even when both cloth vertices clear it.
    // Probe the center of affected shoulder edges after smoothing the vertex moves.
    const checked = new Set();
    for (const site of adjacent) {
      if (!site.shoulder || site.clearance !== shoulderClearance) continue;
      checked.add(site);
      for (const neighbor of site.near) {
        if (checked.has(neighbor) || !adjacent.has(neighbor) || neighbor.clearance !== shoulderClearance) continue;
        midpoint.copy(site.point).add(site.move).add(neighbor.point).add(neighbor.move).multiplyScalar(.5);
        const gap = signedClearance(midpoint);
        if (gap >= shoulderClearance) continue;
        edgeLift.copy(normal).multiplyScalar(Math.min(.006, shoulderClearance - gap));
        site.move.add(edgeLift).clampLength(0, .072);
        neighbor.move.add(edgeLift).clampLength(0, .072);
      }
    }
    if (underarmSites.length && upperArm && lowerArm) {
      upperArm.getWorldPosition(axisX).applyMatrix4(worldToRoot);
      lowerArm.getWorldPosition(axisY).applyMatrix4(worldToRoot).sub(axisX).normalize();
      const hanging = 1 - smooth(.42, .63, Math.abs(axisY.x));
      if (hanging > 0) {
        for (const site of underarmSites) site.next.copy(site.move);
        for (let pass = 0; pass < 7; pass++) {
          for (const triangle of leftUnderarm) for (const weights of hangingSamples) {
            midpoint.set(0, 0, 0);
            triangle.forEach((site, i) => midpoint.addScaledVector(site.point, weights[i]).addScaledVector(site.move, weights[i]));
            const gap = signedClearance(midpoint);
            if (gap >= .0011) continue;
            const need = Math.min(.005, (.0011 - gap) * .82) * hanging;
            for (let i = 0; i < triangle.length; i++) {
              const site = triangle[i];
              if (!weights[i]) continue;
              edgeLift.copy(site.move).sub(site.next).addScaledVector(normal, need * weights[i] * 2.2).clampLength(0, .020);
              site.move.copy(site.next).add(edgeLift);
              adjacent.add(site);
            }
          }
        }
      }
    }
    if (mode === 'seated') for (let pass = 0; pass < 2; pass++) {
      for (const triangle of seatedLap) {
        midpoint.set(0, 0, 0);
        for (const site of triangle) midpoint.add(site.point).add(site.move);
        midpoint.multiplyScalar(1 / 3);
        const gap = signedClearance(midpoint);
        if (gap > .0013 || gap < -.024) continue;
        edgeLift.copy(normal).multiplyScalar(Math.min(.004, .0013 - gap));
        for (const site of triangle) {
          if (site.indices.some(index => protectedVertices.has(index))) continue;
          site.move.add(edgeLift).clampLength(0, .018);
          adjacent.add(site);
        }
      }
    }
    for (const site of adjacent) {
      if (site.shoulder) close(site, 2);
      clearFromClosestSide(site);
      if (site.clearance === shoulderClearance) site.move.clampLength(0, .030);
    }
    // Limit the difference between adjacent shoulder displacements so the
    // clearance pass cannot pull a stray point into a visible spike.
    const affectedShoulders = [...adjacent].filter(site => site.clearance === shoulderClearance);
    for (let pass = 0; pass < 3; pass++) {
      for (const site of affectedShoulders) {
        site.next.copy(site.move);
        for (const neighbor of site.near) {
          if (neighbor.clearance !== shoulderClearance || !adjacent.has(neighbor)) continue;
          edgeLift.copy(site.next).sub(neighbor.move);
          const limit = .007 + .32 * site.point.distanceTo(neighbor.point);
          if (edgeLift.lengthSq() <= limit * limit) continue;
          site.next.copy(neighbor.move).add(edgeLift.clampLength(0, limit));
        }
      }
      for (const site of affectedShoulders) site.move.copy(site.next);
    }
    if (mode === 'seated') {
      // Relax the stretched edges of the left sleeve while retaining the
      // underlying skin. The two sides of the sheer panel never enter this pass.
      for (const site of movable) {
        if (!site.leftSleeve) continue;
        point.copy(site.point).add(site.move);
        const gap = signedClearance(point);
        if (gap <= .015 || gap >= .060) continue;
        edgeLift.copy(normal).multiplyScalar(-Math.min(.018, gap - .015) * site.leftSleeve);
        if (signedClearance(sleeveTarget.copy(point).add(edgeLift)) < .004) continue;
        site.move.add(edgeLift).clampLength(0, .030);
        adjacent.add(site);
      }
      function relaxEnd(site, amount) {
        point.copy(site.point).add(site.move);
        const minimumGap = Math.min(.002, signedClearance(point));
        sleeveTarget.copy(point).addScaledVector(sleeveEdge, amount);
        if (signedClearance(sleeveTarget) < minimumGap - .0002) return;
        site.move.addScaledVector(sleeveEdge, amount).clampLength(0, .030);
        adjacent.add(site);
      }
      for (let pass = 0; pass < 4; pass++) {
        for (const [first, second, limit] of leftSleeveEdges) {
          sleeveEdge.copy(second.point).add(second.move).sub(first.point).sub(first.move);
          const length = sleeveEdge.length();
          if (length <= limit) continue;
          sleeveEdge.multiplyScalar(1 / length);
          const amount = Math.min(.0035, .39 * (length - limit));
          relaxEnd(first, amount * first.leftSleeve);
          relaxEnd(second, -amount * second.leftSleeve);
        }
      }
    }
    // The smoothing above can pull the inner cuff back into the upper arm at
    // the end of a swing. Give its rounded edge a small final clearance pass.
    for (const site of movable) {
      if (!site.leftCuff) continue;
      sleeveTarget.copy(site.move);
      for (let pass = 0; pass < 3; pass++) {
        point.copy(site.point).add(site.move);
        const gap = signedClearance(point);
        if (gap >= .0015) break;
        edgeLift.copy(site.move).sub(sleeveTarget).addScaledVector(normal, .0015 - gap).clampLength(0, .010);
        site.move.copy(sleeveTarget).add(edgeLift);
        adjacent.add(site);
      }
    }
    for (const site of adjacent) {
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

  return { apply, dispose() { fitSkin(); opaque.geometry = source; sheer.geometry = sheerSource; geometry.dispose(); sheerGeometry.dispose(); posed.dispose(); } };
}
