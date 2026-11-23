import { MathUtils } from "three";

export const OPEN_BRZ_HOOD = "interact-hood";
export const CLOSE_BRZ_HOOD = "interact-close-hood";
export const INSPECT_BRZ_ENGINE = "inspect-engine";
export const BRZ_HOOD_SECONDS = 3.75;

export function sampleBrzHood(seconds: number, closing = false) {
  const time = MathUtils.clamp(closing ? BRZ_HOOD_SECONDS - seconds : seconds, 0, BRZ_HOOD_SECONDS);
  const ease = (a: number, b: number) => MathUtils.smoothstep(time, a, b);
  const hood = .12 * ease(.60, .80) + .88 * ease(.98, 1.94);
  return {
    hood,
    catch: ease(.51, .66) * (1 - ease(.80, .98)),
    prop: ease(2.38, 3.18),
    leftGrip: ease(.08, .45) * (1 - ease(3.18, 3.68)),
    leftToLip: ease(.62, .96),
    rightGrip: ease(1.98, 2.36) * (1 - ease(3.18, 3.65)),
    lean: .50 * ease(.05, .40) * (1 - ease(.94, 1.65))
      + .39 * ease(1.96, 2.32) * (1 - ease(2.56, 3.60)),
  };
}
