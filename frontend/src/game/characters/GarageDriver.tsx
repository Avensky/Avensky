import type { MirrorCheckFit } from "./mirrorCheck";
import { useGarageParking } from "../preview/garageParkingStore";
import { RosterRigHandoff } from "./RosterRigHandoff";
import { measureFittingBody } from "./fullBodyFraming";
import { CharacterTurntable } from "./CharacterTurntable";
import { usesFittedAnimation } from "./animationFit";
import { clothingColors } from "./clothingPieces";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAssetGLTF } from "../../assets/useAssetGLTF";
import { useFrame, useThree } from "@react-three/fiber";
import { AnimationMixer, type Group, type Object3D } from "three";
import { buildEmoteClips, type CreatorEmoteMode } from "./garageEmotes";
import { useRosterEmoteCycle } from "../preview/useRosterEmoteCycle";
import { DriverBag } from "./DriverBag";
import { SELECTION_POSES, holdCharacterPose } from "./selectionPoses";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { ROOK_ID, VILLAGER_ID, characterLook, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import { GarageEmotePlayer, type VictoryPlayback } from "./GarageEmotePlayer";
import { CharacterLoadingEffect } from "./CharacterLoadingEffect";
import { SpaceBunsMotion } from "./fittedWardrobe/SpaceBunsMotion";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { DressContactMotion } from "./fittedWardrobe/DressContactMotion";
import { WedgeSandalMotion } from "./fittedWardrobe/WedgeSandalMotion";
import { applyVillagerLook, prepareVillager, villagerModelUrl } from "./villagerModel";
import type { GarageLeanFit } from "./garageLean";
import type { GarageCockpit } from "../preview/garageCockpit";
import { PreviewLoadingStatus } from "../preview/PreviewLoadingSeal";
import { prepareGaragePointLights } from "../preview/garagePointLights";
import { isCompactPreview } from "../preview/previewBudget";
import { failCockpitPreview, useCharacterPreviewStore } from "./characterPreviewStore";
import { useCommittedResource } from "./useCommittedResource";
import type { WardrobeRemoval } from "./wardrobeGarments";
import { resolveWardrobePreview, type WardrobeAssetSources, type WardrobeAssetTier, type WardrobePreview } from "./wardrobePreviewAssets";

const DRIVER_TILT: [number, number, number] = [-.095, -.16, -.045];
type WardrobeAssetListener = (url: string, scene: Object3D | null) => void;
type VillagerPlayback = {
  bag: boolean; previewPacks?: boolean; leanFit?: GarageLeanFit; mirrorFit?: MirrorCheckFit;
  victory?: VictoryPlayback; cockpit?: GarageCockpit; paused: boolean; upright: boolean; rosterPreview?: boolean;
  creatorEmotes?: CreatorEmoteMode; coverage?: { value: number };
  onSettled?: (available: boolean, rigId?: string) => void;
};

function WardrobeAsset({ url, onReady }: { url: string; onReady: WardrobeAssetListener }) {
  const { scene } = useAssetGLTF(url);
  useLayoutEffect(() => onReady(url, scene), [url, scene, onReady]);
  return null;
}

function MissingWardrobeAsset({ url, onReady }: { url: string; onReady: WardrobeAssetListener }) {
  useLayoutEffect(() => onReady(url, null), [url, onReady]);
  return null;
}

function MissingRosterHair({ url }: { url: string }) {
  // A failed optional attachment keeps the natural hair. On leaving this
  // selection discard the rejected loader promise so returning can retry.
  useEffect(() => () => useAssetGLTF.clear(url), [url]);
  return null;
}

function MissingCharacterModel({ cockpit, onSettled }: { cockpit?: GarageCockpit; onSettled?: VillagerPlayback["onSettled"] }) {
  useLayoutEffect(() => onSettled?.(false), [onSettled]);
  const waiting = useCharacterPreviewStore(s => Boolean(cockpit && s.insideCar));
  useEffect(() => {
    if (waiting) failCockpitPreview("The character model is unavailable.");
  }, [waiting]);
  return <PreviewLoadingStatus label="Character model unavailable" />;
}

function VillagerDriver({ url: preferredUrl, look, kind, villageKind, fallback, ...playback }: VillagerPlayback & {
  url: string; look: CharacterLook; kind: WardrobeAssetTier; villageKind: WardrobeAssetTier; fallback: ReactNode;
}) {
  const [active, setActive] = useState<WardrobePreview>();
  const boarding = useGarageParking(s => Boolean(playback.rosterPreview && s.departurePhase));
  const [sources, setSources] = useState<WardrobeAssetSources>({});
  const onReady = useCallback<WardrobeAssetListener>((asset, loaded) => setSources(current => current[asset] === loaded
    ? current : { ...current, [asset]: loaded }), []);
  const { scene, pendingUrls, optionalHairUrl, unavailable, preview } = useMemo(() => resolveWardrobePreview({
    preferredUrl, look, kind, villageKind, sources, previous: active, allowStockHair: playback.rosterPreview,
  }), [preferredUrl, look, kind, villageKind, sources, active, playback.rosterPreview]);
  // A late optional hair or clothing download can prepare a different skeleton.
  // Finish boarding on the dressed rig the player saw walk up to the door.
  if (preview !== active && (!boarding || active?.look.character.id !== look.character.id)) setActive(preview);
  const failedRig = scene === null && active && active.look.character.id !== look.character.id;
  useLayoutEffect(() => {
    if (failedRig) playback.onSettled?.(false);
  }, [failedRig, playback.onSettled]);

  const status = scene === null ? "Character model unavailable"
    : pendingUrls.length ? "Loading garments" : unavailable ? "Garment unavailable" : undefined;
  const renderActor = (shown: WardrobePreview, coverage?: { value: number }) => <AssetBoundary key={shown.scene.uuid} fallback={fallback}>
    <ReadyVillager preview={shown} {...playback} coverage={coverage} />
  </AssetBoundary>;
  return <>
    {optionalHairUrl && <AssetBoundary key={optionalHairUrl} fallback={<MissingRosterHair url={optionalHairUrl} />}>
      <Suspense fallback={null}><WardrobeAsset url={optionalHairUrl} onReady={onReady} /></Suspense>
    </AssetBoundary>}
    {pendingUrls.map(asset => <AssetBoundary key={asset} fallback={<MissingWardrobeAsset url={asset} onReady={onReady} />}>
      <Suspense fallback={null}><WardrobeAsset url={asset} onReady={onReady} /></Suspense>
    </AssetBoundary>)}
    {active ? <>
      {playback.rosterPreview ? <RosterRigHandoff preview={active} requested={look.character.id} creating={Boolean(playback.creatorEmotes)}>
        {renderActor}
      </RosterRigHandoff> : renderActor(active)}
      {status && !(playback.rosterPreview && pendingUrls.length) && <PreviewLoadingStatus label={status} />}
    </> : scene === null ? fallback : playback.victory ? <CharacterLoadingEffect />
      : <PreviewLoadingStatus label={scene ? "Loading garments" : "Loading driver"} />}
  </>;
}

function HighCollarMotion({ update }: { update: () => void }) {
  // The emote mixer and cockpit IK both run at a negative frame priority.
  useFrame(update, 0);
  return null;
}

function ReadyVillager({ preview, bag, previewPacks, leanFit, mirrorFit, victory, cockpit, paused, upright, rosterPreview, creatorEmotes, onSettled, coverage }: VillagerPlayback & { preview: WardrobePreview }) {
  const { look, scene, garments, garmentBody, corsetScene, corsetSet, hairSource } = preview;
  const femaleWithBag = look.female && bag;
  const wetEyes = !victory;
  const fitted = usesFittedAnimation(look);
  // Appearance edits can recreate the removal array without changing the rig.
  const removalKey = [...look.removedClothing].sort().join(",");
  const removedClothing = useMemo(() => removalKey ? removalKey.split(",") as WardrobeRemoval[] : [], [removalKey]);
  const createModel = useCallback(() => {
    const model = prepareVillager(scene, {
      female: look.female, animateFace: true, bag: femaleWithBag, wetEyes, fitted, garments, garmentBody, hairSource, removedClothing,
      corsetSource: corsetScene && corsetSet ? { set: corsetSet, scene: corsetScene } : undefined,
    });
    if (rosterPreview) prepareGaragePointLights(model.root, "subject", coverage);
    return model;
  }, [scene, look.female, removedClothing, femaleWithBag, wetEyes, fitted, garments, garmentBody, hairSource, corsetScene, corsetSet, rosterPreview, coverage]);
  const model = useCommittedResource(createModel);
  useLayoutEffect(() => { if (model) onSettled?.(true, look.character.id); }, [model, onSettled, look.character.id]);
  return model ? <>
    <DressContactMotion root={model.root} source={garmentBody} active={Boolean(previewPacks)} />
    <WedgeSandalMotion root={model.root} active={Boolean(previewPacks)} />
    {model.fittedHair && look.appearance.hair === "Space_Buns" && <SpaceBunsMotion root={model.root} hair={model.fittedHair} />}
    {model.ponySway && <PonyMotion sway={model.ponySway} paused={paused} />}
    <PreparedVillager model={model} look={look} bag={bag} previewPacks={previewPacks}
      leanFit={leanFit} mirrorFit={mirrorFit} victory={victory} cockpit={cockpit} paused={paused} upright={upright} rosterPreview={rosterPreview} creatorEmotes={creatorEmotes} />
  </> : null;
}

// A reduced-motion selection shows the same stance without advancing the mixer.
function HeldSelectionPose({ root }: { root: Object3D }) {
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    const mixer = new AnimationMixer(root);
    const [clip] = buildEmoteClips(root, [holdCharacterPose(SELECTION_POSES[0])]);
    mixer.clipAction(clip).play();
    mixer.update(0);
    root.updateMatrixWorld(true);
    invalidate();
    return () => { mixer.uncacheRoot(root); };
  }, [root, invalidate]);
  return <primitive object={root} dispose={null} />;
}

function RosterEmotePlayer({ root, look, bag, paused, creatorEmotes }: { root: Object3D; look: CharacterLook; bag: boolean; paused: boolean; creatorEmotes?: CreatorEmoteMode }) {
  const cycle = useRosterEmoteCycle(root, paused, look.appearance.personality ?? (creatorEmotes ? "neutral" : "friendly"), bag, creatorEmotes);
  const colors = clothingColors(look, "bag");
  if (cycle.paused) return <>
    <HeldSelectionPose root={root} />
    {bag && <DriverBag driver={root} colors={colors} />}
  </>;
  return <GarageEmotePlayer root={root} bag={bag} bagColors={colors} rosterEmote={cycle.emote} onSelectionEnd={cycle.onSelectionEnd} />;
}

function PonyMotion({ sway, paused }: { sway: NonNullable<ReturnType<typeof prepareVillager>["ponySway"]>; paused: boolean }) {
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const systemMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  useFrame(({ invalidate }, delta) => {
    const enabled = !paused && !reducedMotion && !systemMotion.matches && !document.hidden && !useCharacterPreviewStore.getState().insideCar;
    if (sway.step(delta, enabled)) invalidate();
  });
  return null;
}

function PreparedVillager({ model, look, bag, previewPacks, leanFit, mirrorFit, victory, cockpit, paused, upright, rosterPreview, creatorEmotes }:
  VillagerPlayback & { model: ReturnType<typeof prepareVillager>; look: CharacterLook }) {
  const invalidate = useThree(s => s.invalidate);
  const departing = useGarageParking(s => Boolean(rosterPreview && s.departurePhase));
  const stage = useRef<Group>(null);
  useLayoutEffect(() => {
    applyVillagerLook(model, look);
    if (previewPacks && stage.current) stage.current.userData.fittingBody = measureFittingBody(model.root, stage.current);
    invalidate();
  }, [model, look, previewPacks, invalidate]);
  useLayoutEffect(() => {
    if (model.trialGarments && useCharacterPreviewStore.getState().camera === "Selected item") {
      useCharacterPreviewStore.setState(state => ({ focusRevision: state.focusRevision + 1 }));
    }
  }, [model]);

  return <group name="garage-driver" ref={stage} rotation={upright ? [0, 0, 0] : DRIVER_TILT}>
    {model.detachedCorset?.updateShoulders && <HighCollarMotion update={model.detachedCorset.updateShoulders} />}
    {departing ? <primitive object={model.root} dispose={null} /> : rosterPreview ? <RosterEmotePlayer root={model.root} look={look} bag={bag} paused={paused} creatorEmotes={creatorEmotes} />
      : <GarageEmotePlayer root={model.root} bag={bag} personality={look.appearance.personality} bagColors={clothingColors(look, "bag")} previewPacks={previewPacks} leanFit={leanFit} mirrorFit={mirrorFit} victory={victory} cockpit={cockpit} paused={paused} />}
  </group>;
}

export function GarageDriver({ choice, previewPacks, leanFit, mirrorFit, victory, cockpit, upright = false, paused = false, rosterPreview, creatorEmotes, onSettled }: {
  choice: CharacterChoice; previewPacks?: boolean; leanFit?: GarageLeanFit; mirrorFit?: MirrorCheckFit; victory?: VictoryPlayback; cockpit?: GarageCockpit; upright?: boolean; paused?: boolean; rosterPreview?: boolean; creatorEmotes?: CreatorEmoteMode;
  onSettled?: VillagerPlayback["onSettled"];
}) {
  const look = useMemo(() => characterLook(choice), [choice]);
  const compact = useThree(s => isCompactPreview(s.size.width));
  const fallback = <MissingCharacterModel cockpit={cockpit} onSettled={onSettled} />;
  if (!look) return onSettled ? fallback : null;
  const bag = choice.prop === "shop-bag";
  const coatFitsLean = choice.id === ROOK_ID && (choice.outfit === "night-run" || choice.outfit === "race-crew");
  const kind = compact ? "portrait" : "garage";
  // The portrait export has the original mesh and rig with smaller textures.
  const villageKind = victory ? kind : "portrait";
  const url = villagerModelUrl(look, choice.id === VILLAGER_ID ? kind : "garage", villageKind);
  return (
    <CharacterTurntable enabled={Boolean(previewPacks)}>
      {url
        ? <VillagerDriver key={rosterPreview ? "roster" : choice.id} url={url} look={look} kind={kind} villageKind={villageKind} fallback={fallback} bag={bag}
            previewPacks={previewPacks} leanFit={coatFitsLean ? leanFit : undefined} mirrorFit={mirrorFit}
            victory={victory} cockpit={cockpit} paused={paused} upright={upright} rosterPreview={rosterPreview} creatorEmotes={creatorEmotes} onSettled={onSettled} />
        : fallback}
    </CharacterTurntable>
  );
}
