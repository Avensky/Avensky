import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { observeRosterTile, schedulePortraitWork } from "./CharacterPortrait";
import { bakeCharacterPortrait, peekCharacterPortrait, subscribeCharacterPortrait } from "./bakeCharacterPortrait";
import { characterLook, type CharacterChoice } from "./characterCatalog";
import type { ClothingPiece } from "./clothingPieces";
import type { WardrobePortraitJob } from "./characterPortraitJob";
import { villagerModelUrl } from "./villagerModel";

export type WardrobeTilePreview = Extract<WardrobePortraitJob, { kind: "garment" }> | { kind: "outfit"; choice: CharacterChoice; piece?: ClothingPiece };

function portraitJob(preview: WardrobeTilePreview): WardrobePortraitJob | undefined {
  if (preview.kind === "garment") return preview;
  const look = characterLook(preview.choice);
  const modelUrl = look && (villagerModelUrl(look, "portrait") ?? villagerModelUrl(look, "garage"));
  return look && modelUrl ? { kind: "outfit", look, modelUrl, piece: preview.piece, bag: Boolean(preview.choice.prop) } : undefined;
}

/** Only visible, settled choices may enqueue a single static portrait in the shared worker queue. */
export function WardrobeThumbnail({ preview, children }: { preview: WardrobeTilePreview; children: ReactNode }) {
  const frame = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState("");
  const key = JSON.stringify(["wardrobe", preview]);
  const image = useSyncExternalStore(subscribeCharacterPortrait, () => peekCharacterPortrait(key), () => null);
  const bake = useEffectEvent(() => {
    const controller = new AbortController();
    const job = portraitJob(preview);
    if (job) void bakeCharacterPortrait(key, job, controller.signal).catch(() => {
      if (!controller.signal.aborted) setFailed(key);
    });
    return () => controller.abort();
  });
  useEffect(() => {
    if (frame.current && typeof IntersectionObserver !== "undefined" && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
      return observeRosterTile(frame.current, setVisible);
    }
  }, []);
  useEffect(() => {
    if (visible && !image && failed !== key) return schedulePortraitWork(() => bake(), "catalog");
  }, [visible, image, failed, key]);
  return <span className="wardrobe-thumbnail" ref={frame} aria-hidden="true">
    {image && failed !== key ? <img src={image} alt="" draggable={false} decoding="async" onError={() => setFailed(key)} /> : children}
  </span>;
}
