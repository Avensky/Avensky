import { MathUtils } from "three";

export const OPEN_BRZ_HOOD = "interact-hood";
export const CLOSE_BRZ_HOOD = "interact-close-hood";
export const INSPECT_BRZ_ENGINE = "inspect-engine";
export const TWEAK_BRZ_ENGINE = "tweak-engine";
export const BRZ_HOOD_SECONDS = 3.75;
export const BRZ_INSPECT_SECONDS = 2.9;
export const BRZ_TWEAK_SECONDS = 5.15;

export function sampleBrzEngine(time: number, tweaking: boolean) {
  const duration = tweaking ? 3.5 : BRZ_INSPECT_SECONDS;
  const ease = (start: number, end: number) => MathUtils.smoothstep(time - (tweaking ? .85 : 0), start, end);
  const turn = tweaking ? ease(1.1, 1.55) - 1.65 * ease(1.60, 2.03) + .65 * ease(2.13, 2.48) : 0;
  const brace = ease(.22, .80) * (1 - ease(duration - .58, duration - .21));
  const reach = ease(.37, 1.05) * (1 - ease(duration - .56, duration - .22));
  return {
    lean: .56 * ease(0, .72) * (1 - ease(duration - .56, duration)),
    look: .20 * ease(.24, .73) * (1 - ease(duration - .47, duration)),
    brace, reach,
    hover: .16 * (1 - ease(.72, 1.08) + ease(duration - .62, duration - .36)),
    turn: .35 * turn,
    curl: tweaking ? .46 * ease(.86, 1.17) * (1 - ease(2.42, 2.73)) : .12 * reach,
    pickup: tweaking ? MathUtils.smoothstep(time, .10, .58) * (1 - MathUtils.smoothstep(time, 4.75, 5.10)) : 0,
    carried: tweaking && time >= .58 && time < 4.75,
  };
}

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
