import { ACESFilmicToneMapping, Box3, DirectionalLight, HemisphereLight, Matrix4, Mesh, OrthographicCamera, Scene, Vector3, WebGLRenderer, type Object3D } from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { assetUrl } from "../../assets/runtimeAssets";

export async function loadPortraitAsset(loader: GLTFLoader, url: string): Promise<Object3D> {
  try {
    return (await loader.loadAsync(assetUrl(url))).scene;
  } catch (error) {
    const original = __CHARACTER_MODEL_FALLBACKS__[url];
    if (!original) throw error;
    return (await loader.loadAsync(assetUrl(original))).scene;
  }
}

/** Fit the orthographic image to the displayed meshes in their skinned pose. */
export function framePortraitMeshes(root: Object3D, direction: Vector3, include: (part: Mesh) => boolean) {
  const camera = new OrthographicCamera();
  direction.normalize();
  camera.position.copy(direction);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  root.updateMatrixWorld(true);
  const box = new Box3(), toCamera = new Matrix4(), vertex = new Vector3();
  root.traverseVisible(part => {
    if (!(part instanceof Mesh)) return;
    if (!include(part) || !part.layers.test(camera.layers)) {
      part.layers.disableAll();
      return;
    }
    toCamera.multiplyMatrices(camera.matrixWorldInverse, part.matrixWorld);
    for (let i = 0, count = part.geometry.getAttribute("position").count; i < count; i++) {
      box.expandByPoint(part.getVertexPosition(i, vertex).applyMatrix4(toCamera));
    }
  });
  if (box.isEmpty()) throw Error("The preview contains no visible meshes.");
  const center = box.getCenter(new Vector3()).applyMatrix4(camera.matrixWorld);
  const extent = box.getSize(vertex);
  const half = Math.max(.001, extent.x, extent.y) * .56;
  const distance = extent.z / 2 + half + .02;
  camera.left = camera.bottom = -half;
  camera.right = camera.top = half;
  camera.near = .01;
  camera.far = distance + extent.z / 2 + half;
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

export async function renderPortraitImage(root: Object3D, camera: OrthographicCamera, size: number, lightX = 3) {
  const scene = new Scene();
  const key = new DirectionalLight(0xffefe1, 2);
  key.position.set(lightX, 4, 5);
  scene.add(root, key, new HemisphereLight(0xe5eeff, 0x73685e, 1.25));
  const canvas = new OffscreenCanvas(size, size);
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(size, size, false);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.setClearColor(0, 0);
    renderer.render(scene, camera);
    return await canvas.convertToBlob({ type: "image/webp", quality: .90 });
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
