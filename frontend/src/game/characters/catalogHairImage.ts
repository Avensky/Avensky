import type { PortraitJob } from "./characterPortraitJob";

const CACHE = "avensky-catalog-hair-images";
const REVISION = "X-Avensky-Preview";
const MAX_IMAGES = 48;
const FRAMING = "clothed-three-quarter-v1";

/** Only the fixed catalog models use disk storage. A release or framing change
 * replaces the image for that cut in the same slot. */
export async function catalogHairImage(
  job: PortraitJob, portraitKey: string, releaseId: string | undefined, render: () => Promise<Blob>,
) {
  if (!releaseId || "kind" in job || !job.hairstylePreview) return render();

  const rig = encodeURIComponent(job.look.character.id);
  const style = encodeURIComponent(job.look.appearance.hair);
  const slot = `/__wardrobe-thumbnails/${rig}/${style}`;
  const revision = encodeURIComponent(JSON.stringify([FRAMING, releaseId, portraitKey]));
  let cache: Cache | undefined;
  try {
    cache = await globalThis.caches?.open(CACHE);
    const stored = await cache?.match(slot);
    if (stored?.headers.get(REVISION) === revision) {
      const image = await stored.blob();
      if (image.size && image.type.startsWith("image/")) return image;
    }
  } catch {
    // Storage may be unavailable for this origin or browser session.
  }
  const image = await render();
  if (cache) void saveImage(cache, slot, revision, image).catch(() => {});
  return image;
}

async function saveImage(cache: Cache, slot: string, revision: string, image: Blob) {
  await cache.put(slot, new Response(image, { headers: { [REVISION]: revision } }));
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_IMAGES)).map(key => cache.delete(key)));
}
