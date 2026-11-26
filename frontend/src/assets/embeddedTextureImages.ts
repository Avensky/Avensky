import { TextureLoader } from "three";
import type { GLTFParser } from "three/addons/loaders/GLTFLoader.js";

type ImageParser = Pick<GLTFParser, "json" | "textureLoader" | "loadImageSource"> & {
  options: Pick<GLTFParser["options"], "manager">;
};

/** Keep embedded GLB images in the document's img-src path. ImageBitmapLoader
 * fetches the temporary blob URL, which the retained sign-in document blocks. */
export function embeddedTextureImages(parser: ImageParser) {
  return {
    name: "AvenskyEmbeddedTextureImages",
    beforeRoot() {
      if (typeof document !== "undefined" && "isImageBitmapLoader" in parser.textureLoader &&
          parser.json.images?.some((image: { bufferView?: number }) => image.bufferView !== undefined)) {
        const images = new TextureLoader(parser.options.manager);
        const load = parser.loadImageSource.bind(parser);
        parser.loadImageSource = (index, loader) => load(index,
          loader === parser.textureLoader && parser.json.images[index].bufferView !== undefined ? images : loader);
      }
      return null;
    },
  };
}
