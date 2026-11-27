import { requestSocial, SocialCommandDenied, socialConnectionGeneration } from "../../net/socialClient";

let sequence = 0;

/** A ticket owns only the seat acquired for this boarding attempt. The server
 * compares it under its room-operation lock before releasing the car and slot. */
export function garageAdmission(signal: AbortSignal) {
  const token = "garage-" + (++sequence).toString(36);
  const connection = socialConnectionGeneration();
  let world: number | undefined;
  let provisioned: boolean | undefined;
  let result: boolean | undefined;
  let acknowledged = false;
  let attempts = 0;
  let pending: Promise<void> | undefined;
  function settle() {
    if (pending || acknowledged || result === undefined || world === undefined ||
        provisioned === false || socialConnectionGeneration() !== connection) return pending;
    attempts++;
    pending = requestSocial("garage_departure_finish", { world_id: world, garage_departure: token, entered: result })
      .then(() => { acknowledged = true; })
      // Disconnect disposes all provisional seats. A late join reply may retry a
      // failed early release on this same socket; a newer ticket always wins.
      .catch(error => {
        if (!(error instanceof SocialCommandDenied) && attempts < 3 && socialConnectionGeneration() === connection)
          setTimeout(settle, attempts * 500);
      }).finally(() => { pending = undefined; });
    return pending;
  }
  function finish(entered: boolean) {
    signal.removeEventListener("abort", cancel);
    result ??= entered;
    void settle();
  }
  function cancel() { finish(false); }
  signal.addEventListener("abort", cancel, { once: true });
  return {
    get ticket() { return provisioned ? token : undefined; },
    async join(worldId: number) {
      signal.throwIfAborted();
      world = worldId;
      try {
        const reply = await requestSocial("world_join", {world_id:worldId, garage_departure:token});
        provisioned = reply.garage_departure === token;
        return reply;
      } catch (error) {
        if (error instanceof SocialCommandDenied) provisioned = false;
        throw error;
      } finally {
        // A lost join ACK can still leave a real seat. A conditional release is
        // harmless if the server denied admission or has already accepted a retry.
        if (result !== undefined) void Promise.resolve(pending).then(settle);
      }
    },
    finish,
  };
}
