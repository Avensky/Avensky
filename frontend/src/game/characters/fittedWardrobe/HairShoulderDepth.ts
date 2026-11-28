import {
  Color, DoubleSide, Matrix4, MeshDepthMaterial, NearestFilter,
  OrthographicCamera, RGBADepthPacking, Scene, SkinnedMesh, WebGLRenderTarget,
  type Object3D, type WebGLRenderer,
} from "three";

const RESOLUTION = 256;

export function prepareHairShoulderDepth(root: Object3D) {
  const body = root.getObjectByName("fitting-room-body");
  const dress = root.getObjectByName("wardrobe-local-tennis-dress");
  const sources: SkinnedMesh[] = [];
  if (body instanceof SkinnedMesh) sources.push(body);
  dress?.traverse(part => {
    if (part instanceof SkinnedMesh && !Array.isArray(part.material) && !part.material.transparent) {
      sources.push(part);
    }
  });
  const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
  const scene = new Scene();
  const target = new WebGLRenderTarget(RESOLUTION, RESOLUTION, {
    minFilter: NearestFilter,
    magFilter: NearestFilter,
  });
  const camera = new OrthographicCamera(-.34, .34, 1.67, .99, .02, .66);
  camera.position.z = -.33;
  camera.lookAt(0, 0, 0);
  camera.updateMatrix();
  const cameraLocal = camera.matrix.clone();
  camera.matrixAutoUpdate = false;
  const surfaces = sources.map(source => {
    const proxy = source.clone(false);
    proxy.material = material;
    proxy.matrixAutoUpdate = false;
    proxy.frustumCulled = false;
    scene.add(proxy);
    return { source, proxy };
  });
  const clearColor = new Color();
  const projection = new Matrix4();
  let initialized = false;
  return {
    projection,
    texture: target.texture,
    texel: 1 / RESOLUTION,
    sample(renderer: WebGLRenderer) {
      camera.matrix.multiplyMatrices(root.matrixWorld, cameraLocal);
      camera.updateMatrixWorld(true);
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      if (initialized && !surfaces.length) return;
      for (const { source, proxy } of surfaces) {
        proxy.geometry = source.geometry;
        proxy.matrix.copy(source.matrixWorld);
        proxy.morphTargetInfluences = source.morphTargetInfluences;
      }
      const previous = renderer.getRenderTarget();
      const alpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      try {
        renderer.setRenderTarget(target);
        renderer.setClearColor(0xffffff, 1);
        renderer.clear(true, true, false);
        if (surfaces.length) renderer.render(scene, camera);
        initialized = true;
      } finally {
        renderer.setRenderTarget(previous);
        renderer.setClearColor(clearColor, alpha);
      }
    },
    dispose() {
      material.dispose();
      target.dispose();
    },
  };
}
