import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const region = "us-west-2";
const expiry = 300;

export function storageKey(path, sha256, layout) {
  return layout === "flat" ? "staging" + path : "staging/objects/" + sha256;
}

export async function presignAsset(key) {
  const bucket = process.env.AVENSKY_ASSET_BUCKET;
  if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("Set AVENSKY_ASSET_BUCKET to the private Lightsail bucket name");
  const endpoint = "s3." + region + ".amazonaws.com";
  try {
    const { stdout } = await exec("aws", ["s3", "presign", "s3://" + bucket + "/" + key,
      "--region", region, "--endpoint-url", "https://" + endpoint,
      "--expires-in", String(expiry), "--no-cli-auto-prompt"], { timeout: 15_000 });
    const url = new URL(stdout.trim());
    if (url.protocol !== "https:" || url.username || url.password
      || ![bucket + "." + endpoint, endpoint].includes(url.hostname)) {
      throw new Error("Unexpected Lightsail object endpoint");
    }
    return url;
  } catch {
    // CLI exceptions can contain credentials or signed URLs.
    throw new Error("AWS could not sign a staging object request");
  }
}

export function signedObjectReader(sign = presignAsset, request = fetch) {
  const signed = new Map();
  return async (key, { signal, range, etag } = {}) => {
    let item = signed.get(key);
    if (!item || item.refreshAt <= Date.now()) {
      const url = sign(key).catch(error => {
        if (signed.get(key)?.url === url) signed.delete(key);
        throw error;
      });
      item = { url, refreshAt: Date.now() + (expiry - 60) * 1000 };
      signed.set(key, item);
    }
    const response = await request(await item.url, {
      signal,
      headers: { ...(range && { Range: range }), ...(etag && { "If-Match": etag }) },
      redirect: "error",
    });
    if (response.status === 403 && signed.get(key) === item) signed.delete(key);
    return response;
  };
}
