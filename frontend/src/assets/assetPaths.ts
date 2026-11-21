export const ASSET_ROUTE = "/__staging-assets";

const assetExtension = /\.(?:glb|png|jpe?g|webp|avif|ktx2|bin)$/i;

export function isStreamedAsset(path: string) {
  return /^\/(?:models|textures)\//.test(path) && assetExtension.test(path);
}

export function isAssetPath(path: string) {
  return isStreamedAsset(path) && path.split("/").slice(1).every(part =>
    part !== "." && part !== ".." && !/[\\%?#\u0000-\u001f\u007f]/.test(part) && part.length > 0,
  );
}

export function resolveAssetUrl(
  url: string,
  release: { id: string; paths: Record<string, unknown> } | null,
): string {
  if (!release) return url;
  const path = url.split(/[?#]/, 1)[0];
  if (!isStreamedAsset(path)) return url;
  if (!isAssetPath(path) || !Object.hasOwn(release.paths, path)) {
    throw new Error(`Staging asset is missing from release ${release.id}: ${path}`);
  }
  // The release ID already versions caches. Discard legacy per-model query stamps.
  return ASSET_ROUTE + "/" + release.id + path.split("/").map(encodeURIComponent).join("/");
}
