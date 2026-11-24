import { hasAssetUrl, resolveAssetUrl } from "./assetPaths.ts";

declare const __STAGING_ASSET_RELEASE__: { id: string; paths: Record<string, true> } | null;

export const assetUrl = (url: string) => resolveAssetUrl(url, __STAGING_ASSET_RELEASE__);
export const assetAvailable = (url: string) => hasAssetUrl(url, __STAGING_ASSET_RELEASE__);
export const stagingAssetsEnabled = __STAGING_ASSET_RELEASE__ !== null;
