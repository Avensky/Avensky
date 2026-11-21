import { useGLTF } from "@react-three/drei";
import { assetUrl } from "./runtimeAssets";

type Options = [
  useDraco?: Parameters<typeof useGLTF>[1],
  useMeshopt?: Parameters<typeof useGLTF>[2],
  extendLoader?: Parameters<typeof useGLTF>[3],
];

export function useAssetGLTF(url: string, ...options: Options) {
  return useGLTF(assetUrl(url), ...options);
}

useAssetGLTF.preload = (url: string, ...options: Options) => useGLTF.preload(assetUrl(url), ...options);
