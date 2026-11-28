import { LoadingManager, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import type { WardrobePortraitJob } from "./characterPortraitJob";
import { framePortraitMeshes, loadPortraitAsset, renderPortraitImage } from "./portraitRendering";
import { prepareVillager, applyVillagerLook } from "./villagerModel";
import { clothingPieceFor, type ClothingPiece } from "./clothingPieces";
import { usesFittedAnimation } from "./animationFit";
import { resolveWardrobePreview } from "./wardrobePreviewAssets";

function frameItem(root: Object3D, allowedNodes?: readonly string[], piece?: ClothingPiece) {
  // Some garment files contain both fits or the whole Village actor. Keep one
  // matching garment subtree and retain its skeleton in the scene graph.
  const selected = allowedNodes?.map(name => root.getObjectByName(name)).find(Boolean);
  if (allowedNodes && !selected) throw Error("Garment geometry unavailable.");
  const visible = new Set<Object3D>();
  selected?.traverse(part => visible.add(part));

  return framePortraitMeshes(root, new Vector3(.22, .07, 1), part =>
    (!selected || visible.has(part)) && (!piece || clothingPieceFor(part) === piece) &&
    (Array.isArray(part.material) || !part.material.userData.runtimeExclude));
}

export async function preparePortraitOutfit(job: Extract<WardrobePortraitJob, { kind: "outfit" }>, loader: GLTFLoader) {
  const sources: Record<string, Object3D | null> = {};
  for (;;) {
    const { preview, pendingUrls, unavailable } = resolveWardrobePreview({
      preferredUrl: job.modelUrl, kind: "portrait", villageKind: "portrait", sources, look: job.look,
    });
    if (!pendingUrls.length) {
      if (unavailable || !preview) throw Error("The saved outfit is unavailable.");
      const { look, scene, garments, garmentBody, hairSource, corsetScene, corsetSet } = preview;
      const model = prepareVillager(scene, {
        female: look.female, bag: look.female && job.bag, fitted: usesFittedAnimation(look),
        wetEyes: true, garments, garmentBody, hairSource, removedClothing: look.removedClothing,
        corsetSource: corsetScene && corsetSet ? { set: corsetSet, scene: corsetScene } : undefined,
      });
      applyVillagerLook(model, look);
      return model;
    }
    await Promise.all(pendingUrls.map(async url => {
      sources[url] = await loadPortraitAsset(loader, url).catch(() => null);
    }));
  }
}

export async function renderWardrobeThumbnail(job: WardrobePortraitJob) {
  const manager = new LoadingManager();
  const decoder = new DRACOLoader(manager).setDecoderPath("/draco/").setWorkerLimit(1);
  const loader = new GLTFLoader(manager).setDRACOLoader(decoder).setMeshoptDecoder(MeshoptDecoder);
  let model: ReturnType<typeof prepareVillager> | undefined;
  try {
    if (job.kind === "outfit") {
      model = await preparePortraitOutfit(job, loader);
      return await renderPortraitImage(model.root, frameItem(model.root, undefined, job.piece), 256);
    }
    const source = await loadPortraitAsset(loader, job.modelUrl);
    return await renderPortraitImage(source, frameItem(source, job.nodes), 256);
  } finally {
    model?.dispose();
    decoder.dispose();
  }
}
