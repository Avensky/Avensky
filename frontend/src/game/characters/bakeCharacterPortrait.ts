import type { PortraitJob, CharacterPortraitResult } from "./characterPortraitJob";

type PendingPortrait = { result: Promise<string>; abort: AbortController; viewers: number };
const portraits = new Map<string, string>();
const pendingPortraits = new Map<string, PendingPortrait>();
const listeners = new Set<() => void>();
const CACHE_SIZE = 24;
// One transient WebGL context across all menu portraits. Waiting requests hold
// their saved looks only and can be canceled before they load any model.
let workerAvailable = Promise.resolve();

export const peekCharacterPortrait = (key: string) => portraits.get(key) ?? null;
export function subscribeCharacterPortrait(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function startPortrait(key: string, input: PortraitJob): PendingPortrait {
  const abort = new AbortController();
  let worker: Worker | undefined;
  const image = workerAvailable.then(() => {
    abort.signal.throwIfAborted();
    return new Promise<Blob>((resolve, reject) => {
      worker = new Worker(new URL("./characterPortrait.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<CharacterPortraitResult>) => {
        if ("image" in data) resolve(data.image);
        else reject(Error(data.error));
      };
      worker.onerror = event => reject(Error(event.message || "Character portrait worker failed."));
      worker.onmessageerror = () => reject(Error("Character portrait worker returned unreadable data."));
      abort.signal.addEventListener("abort", () => reject(abort.signal.reason), { once: true });
      worker.postMessage(input);
    });
  }).finally(() => worker?.terminate());
  workerAvailable = image.then(() => {}, () => {});
  const result = image.then(blob => {
    abort.signal.throwIfAborted();
    const src = URL.createObjectURL(blob);
    if (portraits.size >= CACHE_SIZE) {
      const [oldKey, oldSrc] = portraits.entries().next().value!;
      portraits.delete(oldKey);
      URL.revokeObjectURL(oldSrc);
    }
    portraits.set(key, src);
    for (const listener of listeners) listener();
    return src;
  });
  return { result, abort, viewers: 0 };
}

export function bakeCharacterPortrait(key: string, input: PortraitJob, signal: AbortSignal) {
  const cached = peekCharacterPortrait(key);
  if (cached) return Promise.resolve(cached);
  if (signal.aborted) return Promise.reject(signal.reason);
  const job = pendingPortraits.get(key) ?? startPortrait(key, input);
  pendingPortraits.set(key, job);
  job.viewers++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    signal.removeEventListener("abort", release);
    if (--job.viewers === 0) {
      pendingPortraits.delete(key);
      job.abort.abort();
    }
  };
  signal.addEventListener("abort", release, { once: true });
  return job.result.finally(release);
}
