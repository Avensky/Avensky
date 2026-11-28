import { preparePortraitOutfit, renderWardrobeThumbnail } from "./wardrobeThumbnail.worker";
import { Box3, LoadingManager, Mesh, OrthographicCamera, Vector3, type Object3D } from "three";
import { frameHairThumbnail, type HairThumbnailView } from "./hairThumbnail";
import { loadPortraitAsset, renderPortraitImage } from "./portraitRendering";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { installedHairStyles } from "./characterCatalog";
import type { CharacterPortraitJob, CharacterPortraitResult, PortraitJob } from "./characterPortraitJob";
import { applyVillagerLook, prepareVillager } from "./villagerModel";
import { getWardrobeActorBody, getWardrobeBodyDonor, WARDROBE_BODY_DONOR_URLS } from "./wardrobeBody";

const PORTRAIT_SIZE = 192;
const HAIRSTYLE_SIZE = 320;

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

function characterCamera(model: ReturnType<typeof prepareVillager>) {
  const head = model.root.getObjectByName("head");
  if (!head) throw Error("The character portrait needs a head anchor.");
  const center = head.getWorldPosition(new Vector3());
  // The anchor is near the jaw. Use the authored bounds of visible headwear
  // and hair, including fitted hair, to leave space above the actual crown.
  const bounds = new Box3();
  let crown = center.y + .16;
  const fittedHair = model.fittedHair;
  model.root.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    if (object.parent !== fittedHair && !/hair|hat|bonnet|head_face/i.test(object.name)) return;
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
  return camera;
}

async function renderPortrait({ look, modelUrl, dress, hairstylePreview }: CharacterPortraitJob) {
  if (typeof OffscreenCanvas === "undefined") throw Error("Offscreen character portraits are unavailable.");

  const manager = new LoadingManager();
  const decoder = new DRACOLoader(manager).setDecoderPath("/draco/").setWorkerLimit(1);
  const loader = new GLTFLoader(manager).setDRACOLoader(decoder).setMeshoptDecoder(MeshoptDecoder);
  let model: ReturnType<typeof prepareVillager> | undefined;
  try {
    const loadScene = (url: string) => loadPortraitAsset(loader, url);
    const selectedHair = installedHairStyles(look.character.id).find(style => style.id === look.appearance.hair);
    if (hairstylePreview) {
      // Most fitted exports contain the complete cut and its rest skeleton.
      // Only styles fitted against the wearer's body need a character model.
      const hairScene = selectedHair ? await loadScene(selectedHair.url).catch(() => undefined) : undefined;
      const fitted = hairScene && selectedHair ? hairScene.getObjectByName(selectedHair.mesh) : undefined;
      if (selectedHair && !fitted) throw Error("The hairstyle preview is unavailable.");
      let root: Object3D;
      let cut: Object3D | undefined;
      let view: HairThumbnailView = "side";
      const parts: Object3D[] = [];
      if (selectedHair?.editableGroom && fitted) {
        view = "back";
        model = prepareVillager(await loadScene(modelUrl), { female: look.female, hairSource: fitted });
        applyVillagerLook(model, look);
        root = model.root;
        cut = model.fittedHair;
      } else if (fitted && hairScene) {
        root = hairScene;
        cut = fitted;
      } else {
        if (look.appearance.hair !== "natural") throw Error("The hairstyle preview is unavailable.");
        root = await loadScene(modelUrl);
        cut = root.getObjectByName(look.female ? "HAIR_HAIR20" : "HAIR_SHORT");
        const bonnet = look.female && root.getObjectByName("ACC_HAT");
        if (bonnet) {
          // The front three-quarter angle shows the fringe and braid together.
          view = "front";
          parts.push(bonnet);
        }
      }
      if (!cut) throw Error("The hairstyle preview is unavailable.");
      parts.push(cut);
      return await renderPortraitImage(root, frameHairThumbnail(root, parts, view), HAIRSTYLE_SIZE);
    }
    const layeredOutfit = look.corset || look.wardrobe || look.bra !== undefined ||
      Object.keys(look.garments ?? {}).some(slot => slot !== "dress") ||
      look.removedClothing.some(piece => !look.outfitRemovals.includes(piece));
    if (layeredOutfit) {
      model = await preparePortraitOutfit({ kind: "outfit", look, modelUrl, bag: false }, loader);
      model.root.updateMatrixWorld(true);
      return await renderPortraitImage(model.root, characterCamera(model), PORTRAIT_SIZE);
    }
    const source = await loadScene(modelUrl).catch(() => { throw Error("The character model is unavailable."); });
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

    model.root.updateMatrixWorld(true);
    return await renderPortraitImage(model.root, characterCamera(model), PORTRAIT_SIZE);
  } finally {
    model?.dispose();
    decoder.dispose();
  }
}

self.addEventListener("message", async ({ data }: MessageEvent<PortraitJob>) => {
  let reply: CharacterPortraitResult;
  try {
    reply = { image: "kind" in data ? await renderWardrobeThumbnail(data) : await renderPortrait(data) };
  } catch (error) {
    reply = { error: error instanceof Error ? error.message : "Could not create the character portrait." };
  }
  self.postMessage(reply);
}, { once: true });
