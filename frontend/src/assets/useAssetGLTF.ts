import { useGLTF } from "@react-three/drei";
import { assetUrl } from "./runtimeAssets";
import { embeddedTextureImages } from "./embeddedTextureImages";

type Options = [
  useDraco?: Parameters<typeof useGLTF>[1],
  useMeshopt?: Parameters<typeof useGLTF>[2],
  extendLoader?: Parameters<typeof useGLTF>[3],
];

function imageOptions([draco, meshopt, extend]: Options): Options {
  return [draco, meshopt, loader => {
    loader.register(embeddedTextureImages);
    extend?.(loader);
  }];
}

export function useAssetGLTF(url: string, ...options: Options) {
  return useGLTF(assetUrl(url), ...imageOptions(options));
}

useAssetGLTF.preload = (url: string, ...options: Options) => useGLTF.preload(assetUrl(url), ...imageOptions(options));
