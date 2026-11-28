// The height of the visible region is measured in lengths from the eyes to the waist.
export const PORTRAIT_FOV = 46;
export const creatorFrames = {
  body:   { wide: { eyeLine: .25, torsoSpan: 3.2 }, tall: { eyeLine: .19, torsoSpan: 3.3 } },
  face:   { wide: { eyeLine: .42, torsoSpan: 1.35 }, tall: { eyeLine: .27, torsoSpan: 1.8 } },
  looks:  { wide: { eyeLine: .44, torsoSpan: .86 }, tall: { eyeLine: .33, torsoSpan: 1.08 } },
  makeup: { wide: { eyeLine: .38, torsoSpan: .58 }, tall: { eyeLine: .31, torsoSpan: .73 } },
  eyes:   { wide: { eyeLine: .47, torsoSpan: .34 }, tall: { eyeLine: .32, torsoSpan: .52 } },
  outfit: { wide: { eyeLine: .20, torsoSpan: 4.6 }, tall: { eyeLine: .15, torsoSpan: 3.3 } },
} as const;

export type CreatorFrame = keyof typeof creatorFrames;
export type WardrobePortrait = "Hair" | "Eyes" | "Makeup";

const featureFrames = { Hair: "face", Eyes: "eyes", Makeup: "makeup" } as const;
const focalLength = .5 / Math.tan(PORTRAIT_FOV * Math.PI / 360);

/** Fit the same feature as the creator inside the workshop’s unobstructed stage.
 * The minimum width keeps both eyes, cheeks, or the hair silhouette visible on narrow screens. */
export function wardrobePortraitDistance(feature: WardrobePortrait, eyeToWaist: number,
  canvasHeight: number, stageWidth: number, stageHeight: number, portrait: boolean) {
  const frame = creatorFrames[featureFrames[feature]][portrait ? "tall" : "wide"];
  const widthInTorsoLengths = feature === "Hair" ? .66 : feature === "Makeup" ? .45 : .34;
  const verticalSpan = Math.max(frame.torsoSpan, widthInTorsoLengths * stageHeight / stageWidth) * eyeToWaist;
  return verticalSpan * canvasHeight / stageHeight * focalLength;
}

/** Eye line in the visible panel. Both phone orientations have an unobstructed local stage here. */
export function wardrobeEyeLine(feature: WardrobePortrait) {
  return creatorFrames[featureFrames[feature]].wide.eyeLine;
}
