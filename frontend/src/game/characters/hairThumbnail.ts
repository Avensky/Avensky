import { Mesh, Vector3, type Object3D } from "three";

import { framePortraitMeshes } from "./portraitRendering";

const viewDepth = { front: 1, side: .48, back: -.72 };
export type HairThumbnailView = keyof typeof viewDepth;

/** Frame the complete cut, including every skinned primitive beneath its export node. */
export function frameHairThumbnail(root: Object3D, parts: Object3D[], view: HairThumbnailView) {
  const displayed = new Set<Mesh>();
  for (const part of parts) part.traverseVisible(node => {
    if (node instanceof Mesh) displayed.add(node);
  });
  const direction = new Vector3(.94, .07, viewDepth[view]);
  return framePortraitMeshes(root, direction, node => displayed.has(node));
}
