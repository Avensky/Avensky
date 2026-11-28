import { Mesh, Vector3, type Object3D } from "three";

import { framePortraitMeshes } from "./portraitRendering";

const viewOffset = {
  front: [.94, .07, 1.35], side: [.94, .07, .48],
  profile: [-.94, .055, -.15], back: [.94, .07, -.72],
} as const;
export type HairThumbnailView = keyof typeof viewOffset;

/** The face and the complete cut set the crop. The surrounding dressed actor stays visible. */
export function frameHairThumbnail(root: Object3D, parts: Object3D[], view: HairThumbnailView) {
  const framed = new Set<Mesh>();
  const face = root.getObjectByName("HEAD_FACE4") ?? root.getObjectByName("HEAD_WARRIOR");
  for (const part of face ? [...parts, face] : parts) part.traverseVisible(node => {
    if (node instanceof Mesh) framed.add(node);
  });
  const direction = new Vector3(...viewOffset[view]);
  return framePortraitMeshes(root, direction, node => framed.has(node), { isolate: false });
}
