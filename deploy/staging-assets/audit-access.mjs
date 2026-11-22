import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { storageKey } from "./object-store.mjs";
import { readVerifiedRelease } from "./verify-release.mjs";

const run = promisify(execFile);
const region = "us-west-2";
const bucket = process.env.AVENSKY_ASSET_BUCKET;
const [file] = process.argv.slice(2);
if (!file || !bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
  throw new Error("Set AVENSKY_ASSET_BUCKET and pass a verified staging release file");
}

async function awsJson(...args) {
  const { stdout } = await run("aws", [
    ...args, "--region", region, "--output", "json", "--no-cli-pager", "--no-cli-auto-prompt",
  ], { timeout: 30_000 });
  return JSON.parse(stdout);
}

const release = readVerifiedRelease(file);
const { rules, crossAccountGrants } = await awsJson(
  "lightsail", "get-buckets", "--bucket-name", bucket,
  "--query", "buckets[0].{rules:accessRules,crossAccountGrants:readonlyAccessAccounts}",
);
if (rules?.getObject !== "private") throw new Error("Lightsail must default objects to private");
if (crossAccountGrants?.length) {
  console.warn("Review %d bucket-wide cross-account grants against the staging asset terms", crossAccountGrants.length);
}

const keys = [...new Set(Object.entries(release.assets).map(([path, entry]) =>
  storageKey(path, entry.sha256, release.objects[path].layout)))];
if (!keys.length) throw new Error("The staging release has no objects to audit");
const pending = keys.values();
let failures = 0;

async function auditNext() {
  for (const key of pending) {
    try {
      const acl = await awsJson("s3api", "get-object-acl", "--bucket", bucket, "--key", key);
      if (!acl.Owner?.ID || !acl.Grants?.length) throw new Error("Missing owner or ACL grants");
      const extraGrant = acl.Grants.some(grant => grant.Grantee?.Type !== "CanonicalUser"
        || grant.Grantee.ID !== acl.Owner.ID);
      if (extraGrant) throw new Error("ACL grants access beyond the object owner");
      const path = key.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(`https://${bucket}.s3.${region}.amazonaws.com/${path}`, {
        method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(15_000),
      });
      if (response.status !== 403) throw new Error("Anonymous HEAD returned HTTP " + response.status);
    } catch (error) {
      console.error("%s: %s", key, error.stderr?.trim() || error.message);
      failures++;
    }
  }
}

await Promise.all(Array.from({ length: 8 }, auditNext));
if (failures) {
  console.error("%d of %d staging objects failed the access audit", failures, keys.length);
  process.exitCode = 1;
} else {
  console.log("Audited %d Avensky release objects. All have owner-only ACLs and reject anonymous access.", keys.length);
}
