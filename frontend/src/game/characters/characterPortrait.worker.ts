import { assetUrl } from "../../assets/runtimeAssets";
import {
  ACESFilmicToneMapping, Box3, DirectionalLight, HemisphereLight, LoadingManager, Mesh, OrthographicCamera,
  Scene, Vector3, WebGLRenderer, type Object3D,
} from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { installedHairStyles } from "./characterCatalog";
import type { CharacterPortraitJob, CharacterPortraitResult } from "./characterPortraitJob";
import { applyVillagerLook, prepareVillager } from "./villagerModel";
import { getWardrobeActorBody, getWardrobeBodyDonor, WARDROBE_BODY_DONOR_URLS } from "./wardrobeBody";

const PORTRAIT_SIZE = 192;

async function loadPortraitOutfit(
  source: Object3D, dress: NonNullable<CharacterPortraitJob["dress"]>, loadScene: (url: string) => Promise<Object3D>,
) {
  const skeleton = getWardrobeActorBody(source)?.skeleton;
  if (!skeleton) return;
  const [fittingBodyUrl, legacyBodyUrl] = WARDROBE_BODY_DONOR_URLS;
  const loadDonor = (url: string) => loadScene(url).then(scene => getWardrobeBodyDonor(scene, skeleton), () => undefined);
  const loaded = await Promise.all([
    loadScene(dress.url),
    getWardrobeBodyDonor(source, skeleton) ?? loadDonor(fittingBodyUrl),
  ]).catch(() => undefined);
  if (!loaded) return;
  const [garment, primaryDonor] = loaded;
  const body = primaryDonor ?? await loadDonor(legacyBodyUrl);
  if (body) return { garment: { item: dress.item, scene: garment }, body };
}

async function renderPortrait({ look, modelUrl, dress }: CharacterPortraitJob) {
  if (typeof OffscreenCanvas === "undefined") throw Error("Offscreen character portraits are unavailable.");

  const manager = new LoadingManager();
  const decoder = new DRACOLoader(manager).setDecoderPath("/draco/").setWorkerLimit(1);
  const loader = new GLTFLoader(manager).setDRACOLoader(decoder).setMeshoptDecoder(MeshoptDecoder);
  let model: ReturnType<typeof prepareVillager> | undefined;
  let renderer: WebGLRenderer | undefined;
  try {
    const loadScene = async (url: string) => {
      try {
        return (await loader.loadAsync(assetUrl(url))).scene;
      } catch (error) {
        const original = __CHARACTER_MODEL_FALLBACKS__[url];
        if (!original) throw error;
        return (await loader.loadAsync(assetUrl(original))).scene;
      }
    };
    const source = await loadScene(modelUrl).catch(() => { throw Error("The character model is unavailable."); });

    const selectedHair = installedHairStyles(look.character.id).find(style => style.id === look.appearance.hair);
    const [outfit, hairSource] = await Promise.all([
      dress ? loadPortraitOutfit(source, dress, loadScene) : undefined,
      selectedHair ? loadScene(selectedHair.url).then(scene => scene.getObjectByName(selectedHair.mesh), () => undefined) : undefined,
    ]);
    model = prepareVillager(source, {
      female: look.female,
      hairSource,
      garments: outfit && [outfit.garment],
      garmentBody: outfit?.body,
      removedClothing: outfit && look.removedClothing,
    });
    applyVillagerLook(model, look);
    for (const name of ["CLOTH_BOTTOM_SKIRT", "CLOTH_FEET_SHOES", "CLOTH_UNDER_UNDERSKIRT", "CLOTH_BOTTOM_TROUSERS", "CLOTH_FEET_BOOTS"]) {
      const part = model.root.getObjectByName(name);
      if (part) part.visible = false;
    }

    const head = model.root.getObjectByName("head");
    if (!head) throw Error("The character portrait needs a head anchor.");
    const scene = new Scene();
    const keyLight = new DirectionalLight(0xffefe1, 2);
    keyLight.position.set(3, 4, 5);
    scene.add(model.root, keyLight, new HemisphereLight(0xe5eeff, 0x73685e, 1.25));

    model.root.updateMatrixWorld(true);
    const center = head.getWorldPosition(new Vector3());
    // The anchor is near the jaw. Use the authored bounds of visible headwear
    // and hair, including fitted hair, to leave space above the actual crown.
    const bounds = new Box3();
    let crown = center.y + .16;
    const fittedHair = model.fittedHair;
    model.root.traverseVisible(object => {
      if (!(object instanceof Mesh)) return;
      if (object !== fittedHair && !/hair|hat|bonnet|head_face/i.test(object.name)) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (object.geometry.boundingBox) {
        bounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
        crown = Math.max(crown, bounds.max.y);
      }
    });
    const bottom = center.y - .23;
    const top = crown + .05;
    const half = (top - bottom) / 2;
    center.y = (top + bottom) / 2;
    center.z += .018;
    const camera = new OrthographicCamera(-half, half, half, -half, .1, 10);
    camera.position.copy(center).add(new Vector3(.4, .08, 2));
    camera.lookAt(center);

    const canvas = new OffscreenCanvas(PORTRAIT_SIZE, PORTRAIT_SIZE);
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(PORTRAIT_SIZE, PORTRAIT_SIZE, false);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.setClearColor(0, 0);
    renderer.render(scene, camera);
    return await canvas.convertToBlob({ type: "image/webp", quality: .90 });
  } finally {
    model?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    decoder.dispose();
  }
}

self.addEventListener("message", async ({ data }: MessageEvent<CharacterPortraitJob>) => {
  let reply: CharacterPortraitResult;
  try {
    reply = { image: await renderPortrait(data) };
  } catch (error) {
    reply = { error: error instanceof Error ? error.message : "Could not create the character portrait." };
  }
  self.postMessage(reply);
}, { once: true });
