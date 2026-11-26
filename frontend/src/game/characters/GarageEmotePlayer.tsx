import { MIRROR_MAKEUP_EMOTES, makeupPreviewEmote, type MirrorCheckFit } from "./mirrorCheck";
import { useFittingTurnStore } from "./fittingControlsStore";
import { useContext, useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AnimationMixer, LoopOnce, MathUtils, type AnimationAction, type Group, type Object3D } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { AUTOMATIC_GARAGE_EMOTE_IDS, buildEmoteClips, buildGarageEmotes, findGaragePreviewEmote, garageBreathing } from "./garageEmotes";
import { driverFaceTargets } from "./villagerFace";
import { skipHiddenCharacterRaycasts } from "./characterPreviewRaycast";
import { failCockpitPreview, useCharacterPreviewStore } from "./characterPreviewStore";
import { DriverBag } from "./DriverBag";
import { availableVictoryEmotes, type VictoryEmoteId } from "./victoryEmotes";
import { GARAGE_LEAN_ID, garageLeanPose, type GarageLeanFit } from "./garageLean";
import { COCKPIT_TAKES, type CockpitTake } from "./cockpitEmotes";
import { createEmoteProp, type EmoteProp, type EmotePropModel } from "./emoteProps";
import { bindFlagPoleGrip } from "./flagPoleGrip";
import type { CockpitPlayback, GarageCockpit } from "../preview/garageCockpit";
import { BRZ_ENTRY_SECONDS, BRZ_EXIT_SECONDS, DRIVE_OUT_DURATION, GARAGE_ENTRY_DURATION, GARAGE_ENTRY_START_SECONDS,
  sampleBrzEntry, sampleBrzExit, sampleDriveOut } from "../preview/garageDriveMotion";
import { useGarageDrive } from "../preview/garageDriveStore";

import { personalityEmote, type CharacterPersonality } from "./characterPersonality";
import type { PieceColors } from "./clothingPieces";
import { keepHeldProp } from "./emotePropNotes";
import { SELECTION_HOLD, selectionEmote, type SelectionPoseId } from "./selectionPoses";
import { POSE_SEQUENCE_ID, POSE_START_HOLD_SECONDS, posePackEmote } from "./posePack";
import { CREATED_EMOTE_ID, createdEmoteClip } from "./emoteAuthoring";
import { CLOSE_DRIVER_DOOR, CLOSE_PASSENGER_DOOR, ENTER_DRIVER, ENTER_PASSENGER, GaragePanelTarget, InteractionChair, OPEN_DRIVER_DOOR, SIT_IN_CHAIR, chairSitClip,
  garageDoorForEmote, garagePanelForEmote, isDoorClosing, preparePanelOpening } from "./garageInteractions";
import { prepareBrzApproach } from "../preview/brzApproach";
import { CLOSE_BRZ_HOOD, INSPECT_BRZ_ENGINE, TWEAK_BRZ_ENGINE } from "./brzHoodMotion";
import { useVehicleStudioStore } from "../heroes/vehicleStudioStore";

const FADE_SECONDS = .52;

export type VictoryPlayback = { id: VictoryEmoteId; onFinish: () => void };

type CabinState = {
  cabin: CockpitPlayback | null;
  driveSeconds: number;
  take: { clip: CockpitTake; seconds: number } | null;
  doorOnly: boolean;
  preview: ReturnType<typeof useCharacterPreviewStore.getState>["emote"];
  idle: AnimationAction;
  rest: number;
};

function leaveCabin(current: CabinState | null, restSeconds: number) {
  if (!current?.cabin) return;
  current.cabin.stop();
  current.cabin = null;
  current.doorOnly = false;
  current.driveSeconds = 0;
  current.take = null;
  current.preview = null;
  current.idle.reset().setEffectiveWeight(1).play();
  current.rest = restSeconds;
}

function setBlinkWeight(targets: ReturnType<typeof driverFaceTargets>, weight: number) {
  for (const { mesh, index } of targets) mesh.morphTargetInfluences![index] = weight;
}

export function GarageEmotePlayer({ root, bag = false, previewPacks = false, leanFit, mirrorFit, victory, cockpit, personality = "friendly", bagColors, paused = false, selectionPose, onSelectionEnd }: {
  root: Object3D; personality?: CharacterPersonality; bagColors?: PieceColors; bag?: boolean; previewPacks?: boolean; leanFit?: GarageLeanFit; mirrorFit?: MirrorCheckFit; victory?: VictoryPlayback; cockpit?: GarageCockpit; paused?: boolean; selectionPose?: SelectionPoseId; onSelectionEnd?: () => void;
}) {
  const invalidate = useThree(s => s.invalidate);
  const contextFit = useRef("");
  const lastInteraction = useRef<string | undefined>(undefined);
  const heldProp = useRef<Group>(null);
  const chairSeat = useRef<Group>(null);
  const panel = useContext(GaragePanelTarget);
  const panelPlayback = useRef<{
    opening: NonNullable<ReturnType<typeof preparePanelOpening>>;
    approach?: ReturnType<typeof prepareBrzApproach>;
    seconds: number;
    finished: boolean;
  } | null>(null);
  const openDoorApproach = useRef<ReturnType<typeof prepareBrzApproach>>(undefined);
  const exteriorHandoff = useRef<ReturnType<typeof prepareBrzApproach>>(undefined);
  const exitSeconds = useRef(0);
  const chairRequested = useCharacterPreviewStore(s => previewPacks && s.emote?.id === SIT_IN_CHAIR);
  const chairShown = useRef(false);
  useLayoutEffect(() => {
    if (previewPacks) return () => { chairShown.current = false; };
  }, [previewPacks]);
  const baseClips = useRef<{ root: Object3D; bag: boolean; clips: ReturnType<typeof buildGarageEmotes> }>(null);
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const rosterEmote = selectionPose ? selectionEmote(selectionPose) : undefined;
  const selection = Boolean(rosterEmote);
  const held = useRef<{ wake: number; ready: boolean; until: number } | null>(null);
  const rosterFrameAt = useRef<number | null>(null);
  const restSeconds = previewPacks ? 4.5 : 2.35;
  const player = useRef<CabinState & {
    mixer: AnimationMixer;
    actions: Map<string, AnimationAction>;
    props: Map<EmoteProp, EmotePropModel>;
    fitFlag?: () => void;
    automatic: AnimationAction[];
    active: AnimationAction | null;
    release: { elapsed: number; weight: number } | null;
    next: number;
    clicked: { id: string } | null;
    blink: ReturnType<typeof driverFaceTargets>;
    elapsed: number;
  }>(null);

  useLayoutEffect(() => {
    if (previewPacks) return skipHiddenCharacterRaycasts(root);
  }, [root, previewPacks]);

  useLayoutEffect(() => () => {
    if (selection) return;
    const current = player.current;
    const playback = panelPlayback.current;
    const view = useCharacterPreviewStore.getState();
    playback?.opening.stop();
    if (panel?.hinge.part.startsWith("door-") && playback?.finished && playback.approach && view.insideCar && current) {
      openDoorApproach.current = playback.approach;
    } else if (playback?.approach && view.emote && !view.insideCar && !reducedMotion) {
      playback.approach.releasePose();
      exteriorHandoff.current = playback.approach;
    } else playback?.approach?.stop();
    if (view.brzDoorReady) useCharacterPreviewStore.setState({ brzDoorReady: false });
    if (view.brzDoorBusy) useCharacterPreviewStore.setState({ brzDoorBusy: false });
    if (view.brzHoodBusy) useCharacterPreviewStore.setState({ brzHoodBusy: false });
    if (playback && !view.insideCar && view.brzExiting) useCharacterPreviewStore.setState({ brzExiting: false });
    panelPlayback.current = null;
    if (panel && current) current.idle.reset().setEffectiveWeight(1).play();
  }, [root, panel, reducedMotion, selection]);
  useLayoutEffect(() => () => {
    openDoorApproach.current?.stop();
    openDoorApproach.current = undefined;
    exteriorHandoff.current?.stop();
    exteriorHandoff.current = undefined;
    exitSeconds.current = 0;
    if (previewPacks) useCharacterPreviewStore.setState({ brzExitReady: false, brzExiting: false });
  }, [root, previewPacks]);

  useLayoutEffect(() => {
    if (!cockpit || reducedMotion) return;
    if (previewPacks) {
      useCharacterPreviewStore.setState({ cockpitAvailable: true });
      return () => {
        leaveCabin(player.current, restSeconds);
        useCharacterPreviewStore.setState({ cockpitAvailable: false });
      };
    }
    useGarageDrive.setState({ ready: true });
    return () => {
      leaveCabin(player.current, restSeconds);
      useGarageDrive.getState().leaveVehicle();
    };
  }, [cockpit, bag, reducedMotion, previewPacks, restSeconds]);

  useLayoutEffect(() => {
    if (!previewPacks || !leanFit || reducedMotion) return;
    useCharacterPreviewStore.setState({ leanAvailable: true });
    return () => useCharacterPreviewStore.setState({ leanAvailable: false });
  }, [previewPacks, leanFit, reducedMotion]);

  useLayoutEffect(() => {
    if (!previewPacks || !mirrorFit || reducedMotion) return;
    useCharacterPreviewStore.setState({ mirrorAvailable: true });
    return () => useCharacterPreviewStore.setState({ mirrorAvailable: false });
  }, [previewPacks, mirrorFit, reducedMotion]);

  useEffect(() => {
    if (baseClips.current?.root !== root || baseClips.current.bag !== bag) baseClips.current = null;
    if (reducedMotion) return;
    const mixer = new AnimationMixer(root);
    const celebration = victory && availableVictoryEmotes(bag).find(emote => emote.id === victory.id);
    // These tracks bind to the prepared rig's UUIDs. A preview-mode change
    // resets playback and disposes temporary props, but can reuse the base tracks.
    let startupClips = baseClips.current?.clips;
    if (selection) {
      // Between roster emotes the neutral rig is at rest, so it can stop drawing.
      startupClips = buildEmoteClips(root, [{ id: "001", name: "Neutral", duration: 1, keys: [[0, {}], [1, {}]] }]);
    } else if (victory) {
      startupClips = buildEmoteClips(root, celebration ? [garageBreathing(bag), celebration] : [garageBreathing(bag)]);
    } else if (!startupClips) {
      startupClips = buildGarageEmotes(root, bag);
      baseClips.current = { root, bag, clips: startupClips };
    }
    const [breathing, ...clips] = startupClips;
    const idle = mixer.clipAction(breathing).play();
    if (previewPacks && useCharacterPreviewStore.getState().playbackPaused) mixer.update(0);
    const actions = new Map(clips.map(clip => [clip.name.split(" ")[0], mixer.clipAction(clip).setLoop(LoopOnce, 1)]));
    actions.set("001", mixer.clipAction(breathing.clone()).setLoop(LoopOnce, 1));
    const automatic = [...AUTOMATIC_GARAGE_EMOTE_IDS, ...(bag ? ["bag-lift", "bag-check"] : [])]
      .flatMap(id => actions.get(id) ?? []);
    const blink = selection ? [] : driverFaceTargets(root, "blink");
    const active = celebration ? actions.get(celebration.id)!.reset().setEffectiveWeight(0).play() : null;
    const props = new Map<EmoteProp, EmotePropModel>();
    player.current = { mixer, idle, actions, props,
      automatic, active, release: null, cabin: null, doorOnly: false, driveSeconds: 0, take: null, rest: restSeconds, next: 0, clicked: null, blink, elapsed: 0, preview: null };
    if (selection) invalidate();
    return () => {
      player.current?.cabin?.stop();
      player.current = null;
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      props.forEach(prop => prop.dispose());
      setBlinkWeight(blink, 0);
    };
  }, [reducedMotion, root, bag, victory, previewPacks, restSeconds, selection, invalidate]);

  useLayoutEffect(() => {
    if (!rosterEmote) return;
    rosterFrameAt.current = null;
    invalidate();
    return () => {
      if (held.current) window.clearTimeout(held.current.wake);
      held.current = null;
    };
  }, [root, rosterEmote, paused, invalidate]);

  useFrame((_, delta) => {
    const current = player.current;
    if (paused || !current || (previewPacks && useCharacterPreviewStore.getState().playbackPaused)) return;
    if (rosterEmote && current.preview === rosterEmote && !current.active) return;
    const hold = held.current;
    if (hold && !hold.ready) return;
    held.current = null;
    let step = Math.min(delta, .1);
    if (rosterEmote) {
      // GPU stalls and demand-render sleeps are visible elapsed time. Start the
      // clock on this request's first frame so the preceding neutral rest is free.
      const now = performance.now();
      step = rosterFrameAt.current === null ? 0 : (now - rosterFrameAt.current) / 1000;
      rosterFrameAt.current = now;
      if (hold && current.active) step = Math.max(step, hold.until - current.active.time);
    }
    if (current.blink.length) {
      current.elapsed += step;
      const phase = current.elapsed % 8.2;
      const age = phase - (phase < 4 ? 2.4 : 6.15);
      const blink = MathUtils.smoothstep(age, 0, .066) * (1 - MathUtils.smoothstep(age, .075, .19));
      setBlinkWeight(current.blink, blink);
    }
    const view = useCharacterPreviewStore.getState();
    const drive = useGarageDrive.getState();
    const garageStation = !selection && !previewPacks && drive.stage !== "idle";
    const driveOut = garageStation && drive.stage !== "station";
    const preview = rosterEmote ?? (previewPacks ? view.emote : garageStation ? drive.steering : current.clicked);
    const driving = garageStation || (previewPacks && view.insideCar);
    if (!selection && !view.insideCar && view.brzExitReady) useCharacterPreviewStore.setState({ brzExitReady: false });
    if (!view.brzExiting) exitSeconds.current = 0;
    if (exteriorHandoff.current && !view.emote && !view.insideCar) {
      exteriorHandoff.current.stop();
      exteriorHandoff.current = undefined;
    }
    if (openDoorApproach.current && !view.insideCar && !view.brzExiting) {
      leaveCabin(current, restSeconds);
      openDoorApproach.current.stop();
      openDoorApproach.current = undefined;
    }
    const doorOnly = previewPacks && !view.insideCar && preview?.id === OPEN_DRIVER_DOOR && drive.hasDoor;
    const enterPassenger = preview?.id === ENTER_PASSENGER;
    const enterSeat = enterPassenger || preview?.id === ENTER_DRIVER;
    const fittedDoor = panel?.clearance && panel.hinge.part.startsWith("door-") && garageDoorForEmote(preview?.id);
    if (panel && preview && (garagePanelForEmote(preview.id) === panel.hinge.part || fittedDoor)) {
      if (!panelPlayback.current || current.preview !== preview) {
        leaveCabin(current, restSeconds);
        const previous = panelPlayback.current;
        if (enterSeat && previous?.finished && previous.approach
          && Math.abs(panel.hinge.angle - panel.hinge.open) < .005) {
          useCharacterPreviewStore.setState({ insideCar: true, brzPassenger: enterPassenger, emote: null });
          return;
        }
        const closingDoor = isDoorClosing(preview.id);
        const exitApproach = view.brzExiting && closingDoor ? openDoorApproach.current : undefined;
        if (exitApproach) {
          exitApproach.resumeAtDoor();
          openDoorApproach.current = undefined;
        }
        const previousApproach = previous?.approach ?? exitApproach ?? exteriorHandoff.current;
        const alreadyAtPanel = previous?.finished && (panel.hinge.hoodProp || fittedDoor)
          && !closingDoor && !isDoorClosing(current.preview?.id) ? previous.approach : undefined;
        exteriorHandoff.current = undefined;
        previous?.opening.stop();
        if (previousApproach && !alreadyAtPanel) {
          previousApproach.releasePose();
          previousApproach.resumeAtDoor();
        }
        current.active?.stop();
        current.active = null;
        current.release = null;
        current.idle.stop();
        current.preview = preview;
        const approach = alreadyAtPanel ?? (panel.clearance && panel.actor.current
          ? prepareBrzApproach(root, panel.actor.current, panel.clearance, panel.hinge, closingDoor, previousApproach?.restoreParked) : undefined);
        const opening = preparePanelOpening(root, panel.hinge, preview.id === INSPECT_BRZ_ENGINE, Boolean(approach), approach?.outward, preview.id);
        if (!opening || (panel.clearance && !approach)) {
          (approach ?? previousApproach)?.stop();
          current.idle.reset().setEffectiveWeight(1).play();
          useCharacterPreviewStore.setState({ emote: null, brzExiting: false, cockpitError: preview.id === TWEAK_BRZ_ENGINE
            ? "Open and prop the BRZ hood before tweaking the engine." : "This driver cannot reach the selected panel." });
          return;
        }
        panelPlayback.current = { opening, approach, seconds: alreadyAtPanel?.duration ?? 0, finished: false };
        if (panel.hinge.hoodProp) {
          useCharacterPreviewStore.setState({ brzHoodBusy: true });
        }
        if (fittedDoor) useCharacterPreviewStore.setState({ brzDoorBusy: true });
      }
      if (heldProp.current) heldProp.current.visible = false;
      const playback = panelPlayback.current;
      const travel = playback.approach?.duration ?? 0;
      const end = travel + playback.opening.duration;
      playback.seconds = Math.min(end, playback.seconds + step);
      const positionDriver = () => playback.approach?.sample(playback.seconds, step);
      if (playback.seconds >= travel) playback.opening.sample(playback.seconds - travel, positionDriver);
      else positionDriver();
      if (playback.seconds < end) invalidate();
      else if (!playback.finished) {
        playback.finished = true;
        if (panel.hinge.hoodProp) useVehicleStudioStore.getState().setPart("hood", preview.id !== CLOSE_BRZ_HOOD);
        if (view.brzHoodBusy) useCharacterPreviewStore.setState({ brzHoodBusy: false });
        if (fittedDoor && (panel.hinge.part === "door-left" || panel.hinge.part === "door-right")) {
          useVehicleStudioStore.getState().setPart(panel.hinge.part, !isDoorClosing(preview.id));
          useCharacterPreviewStore.setState({ brzDoorBusy: false, brzExiting: false });
        }
        if (enterSeat) useCharacterPreviewStore.setState({ insideCar: true, brzPassenger: enterPassenger, emote: null });
        if (doorOnly && playback.approach) useCharacterPreviewStore.setState({ brzDoorReady: true });
      }
      return;
    }
    if (current.cabin && (current.doorOnly !== doorOnly || (doorOnly && current.preview !== preview))) {
      leaveCabin(current, restSeconds);
    }
    if (heldProp.current) heldProp.current.visible = keepHeldProp(
      current.active?.getClip().name.split(" ")[0] ?? (preview !== current.preview ? preview?.id : null),
      driving || doorOnly || preview?.id === SIT_IN_CHAIR);
    if (cockpit && (garageStation || (previewPacks && view.cockpitAvailable && (view.insideCar || doorOnly))) && !victory) {
      if (!current.cabin) {
        current.active?.stop();
        current.active = null;
        current.release = null;
        current.idle.stop();
        current.clicked = null;
        current.preview = null;
        const approach = openDoorApproach.current;
        approach?.resumeAtDoor();
        if (approach) current.driveSeconds = GARAGE_ENTRY_START_SECONDS;
        current.cabin = cockpit(root, previewPacks, Boolean(approach), view.brzPassenger && view.insideCar);
        current.doorOnly = doorOnly;
        if (!current.cabin || (doorOnly && !current.cabin.hasDoor)) {
          leaveCabin(current, restSeconds);
          current.idle.reset().setEffectiveWeight(1).play();
          const error = "This driver could not be fitted to the selected vehicle.";
          if (garageStation) useGarageDrive.setState({ stage: "idle", error });
          else if (doorOnly) useCharacterPreviewStore.setState({ emote: null, cockpitError: error });
          else failCockpitPreview(error);
          return;
        }
        if (approach) useVehicleStudioStore.getState().setPart(approach.part, false);
      }
      if (preview !== current.preview) {
        current.preview = preview;
        const clip = COCKPIT_TAKES.find(take => take.id === preview?.id);
        current.take = clip ? { clip, seconds: 0 } : null;
      }
      if (doorOnly) {
        // Stop before entry begins so the actor opens the door and stays outside.
        current.driveSeconds = Math.min(current.driveSeconds + step, 1.2);
        current.cabin.sample(null, 0, sampleDriveOut(current.driveSeconds));
        if (current.driveSeconds < 1.2) invalidate();
        return;
      }
      const exitDoor = current.cabin.exitDoor;
      if (view.brzExiting && view.insideCar && exitDoor) {
        exitSeconds.current = Math.min(BRZ_EXIT_SECONDS, exitSeconds.current + step);
        current.cabin.sample(null, 0, undefined, sampleBrzExit(exitSeconds.current));
        if (exitSeconds.current < BRZ_EXIT_SECONDS) {
          invalidate();
          return;
        }
        // The last exit frame is the same exterior stance used to enter.
        // Release the cockpit without returning the actor to the parked pose.
        leaveCabin(current, restSeconds);
        openDoorApproach.current?.resumeAtDoor();
        exitDoor.angle = exitDoor.open;
        exitDoor.pivot.rotation[exitDoor.axis] = exitDoor.open;
        useVehicleStudioStore.getState().setPart(exitDoor.part, true);
        useCharacterPreviewStore.setState({ insideCar: false, brzPassenger: false, brzExitReady: false,
          emote: { id: view.brzPassenger ? CLOSE_PASSENGER_DOOR : CLOSE_DRIVER_DOOR } });
        return;
      }
      const fittedEntry = previewPacks && view.insideCar && Boolean(exitDoor?.interiorPull);
      const seatDuration = fittedEntry ? BRZ_ENTRY_SECONDS : GARAGE_ENTRY_DURATION;
      const enteringCharacter = previewPacks && current.cabin.hasDoor && current.driveSeconds < seatDuration;
      const take = current.take;
      if (take && !enteringCharacter) {
        take.seconds += step;
        if (take.seconds >= take.clip.duration) current.take = null;
      }
      const duration = drive.sequence === "entry" || enteringCharacter ? seatDuration : DRIVE_OUT_DURATION;
      const alreadyParked = current.driveSeconds >= duration && !take;
      if (driveOut && alreadyParked) return;
      const sampleEntry = fittedEntry && enteringCharacter ? sampleBrzEntry : sampleDriveOut;
      const drivePose = driveOut || enteringCharacter
        ? sampleEntry(current.driveSeconds = Math.min(current.driveSeconds + step, duration)) : undefined;
      const stage = drive.sequence === "entry" && current.driveSeconds >= GARAGE_ENTRY_DURATION ? "station" : drivePose?.stage;
      if (!previewPacks && stage && stage !== drive.stage) useGarageDrive.setState({ stage });
      current.cabin.sample(enteringCharacter ? null : current.take?.clip.id ?? null,
        current.take ? current.take.seconds / current.take.clip.duration : 0, drivePose);
      if (exitDoor && view.insideCar && current.driveSeconds >= seatDuration && !view.brzExitReady) {
        useCharacterPreviewStore.setState({ brzExitReady: true });
      }
      if (enteringCharacter && current.driveSeconds < seatDuration) invalidate();
      return;
    }
    leaveCabin(current, restSeconds);
    const inspectingFace = previewPacks && (view.camera === "Face" || view.camera === "Selected item") && !preview;
    if (inspectingFace) {
      current.active?.stop();
      current.active = null;
      current.release = null;
      current.rest = restSeconds;
      current.idle.setEffectiveWeight(1);
    }
    const sequence = previewPacks ? view.emote?.sequence : undefined;
    const created = previewPacks ? view.emote?.created : undefined;
    let continueFromHold = false;
    if (!victory && preview !== current.preview && current.active) {
      // A matching held pose is already the first frame of the next sequence.
      const heldPose = current.preview?.sequence?.to ?? current.preview?.id;
      continueFromHold = Boolean(sequence && sequence.from === heldPose && !current.release
        && current.active.clampWhenFinished && current.active.paused);
      if (continueFromHold) {
        current.active.stop();
        current.active = null;
      } else current.release ??= { elapsed: 0, weight: current.active.getEffectiveWeight() };
    }
    if (!victory && preview !== current.preview && !current.active) {
      current.preview = preview;
      // One composed take per mixer. Replacing it avoids caching every combination.
      for (const id of [POSE_SEQUENCE_ID, CREATED_EMOTE_ID, SIT_IN_CHAIR]) {
        const previous = current.actions.get(id);
        if (previous) {
          current.mixer.uncacheAction(previous.getClip());
          current.actions.delete(id);
        }
      }
      const nextFit = JSON.stringify([mirrorFit, leanFit]);
      if (nextFit !== contextFit.current) {
        for (const id of [...MIRROR_MAKEUP_EMOTES.map(item => item.id), GARAGE_LEAN_ID]) {
          const previous = current.actions.get(id);
          if (previous) { previous.stop(); current.mixer.uncacheAction(previous.getClip()); current.actions.delete(id); }
        }
        contextFit.current = nextFit;
      }
      let action = preview ? current.actions.get(preview.id) : undefined;
      if (!action && preview) {
        const pose = previewPacks ? posePackEmote(preview.id, sequence) : undefined;
        if (preview.id === SIT_IN_CHAIR || created) current.idle.stop();
        const interaction = preview.id === SIT_IN_CHAIR ? chairSitClip(root, chairSeat.current ?? undefined) : undefined;
        if (preview.id === SIT_IN_CHAIR && !interaction) {
          useCharacterPreviewStore.setState({ emote: null, cockpitError: "A chair is unavailable for this driver." });
          current.idle.reset().play();
          return;
        }
        const emote = interaction ?? (created ? createdEmoteClip(created) : pose)
          ?? (previewPacks ? makeupPreviewEmote(preview.id, mirrorFit) : undefined)
          ?? (preview.id === GARAGE_LEAN_ID && leanFit ? garageLeanPose(leanFit) : findGaragePreviewEmote(preview.id, bag));
        if (emote) {
          // The solver needs the rest skeleton. Release mixer bindings before
          // compiling one clip, then keep it for the rest of this preview.
          current.idle.stop();
          if (emote.prop && !current.props.has(emote.prop)) {
            const prop = createEmoteProp(emote.prop);
            current.props.set(emote.prop, prop);
            root.add(prop.root);
            if (emote.prop === "flag") current.fitFlag = bindFlagPoleGrip(root, prop);
          }
          action = current.mixer.clipAction(buildEmoteClips(root, [emote], current.props)[0]).setLoop(LoopOnce, 1);
          action.clampWhenFinished = Boolean(pose || interaction);
          current.actions.set(preview.id, action);
          current.idle.reset().play();
        }
      }
      if (action) {
        const weight = continueFromHold ? 1 : 0;
        current.active = action.reset().setEffectiveWeight(weight).play();
        if (continueFromHold) current.active.time = POSE_START_HOLD_SECONDS;
        current.idle.setEffectiveWeight(1 - weight);
      }
    }
    if (current.active) {
      const { active, release } = current;
      const duration = active.getClip().duration;
      const time = active.time + step;
      if (view.loopEmote && previewPacks && preview && preview === current.preview && !active.clampWhenFinished && !release && time >= duration) {
        active.reset().setEffectiveWeight(0).play();
        current.idle.setEffectiveWeight(1);
        return;
      }
      if (release) release.elapsed += step;
      if ((!active.clampWhenFinished && time >= duration) || (release && release.elapsed >= FADE_SECONDS)) {
        active.stop();
        current.active = null;
        current.release = null;
        current.rest = restSeconds;
        current.idle.setEffectiveWeight(1);
        if (current.clicked === current.preview) current.clicked = null;
        victory?.onFinish();
        if (rosterEmote && !release && current.preview === rosterEmote) {
          if (heldProp.current) heldProp.current.visible = true;
          onSelectionEnd?.();
        }
      } else {
        const clipWeight = MathUtils.smoothstep(active.clampWhenFinished ? time : Math.min(time, duration - time), 0, FADE_SECONDS);
        const weight = release ? Math.min(clipWeight, release.weight * (1 - MathUtils.smoothstep(release.elapsed, 0, FADE_SECONDS))) : clipWeight;
        active.setEffectiveWeight(weight);
        current.idle.setEffectiveWeight(1 - weight);
      }
    } else if (!selection && !victory && !inspectingFace && (!previewPacks || view.automaticEmotes)) {
      current.rest -= step;
      if (current.rest <= 0) {
        const action = current.automatic[current.next];
        current.next = (current.next + 1) % current.automatic.length;
        current.active = action.reset().setEffectiveWeight(0).play();
      }
    }
    current.mixer.update(step);
    current.fitFlag?.();
    if (rosterEmote && (current.active || current.preview !== rosterEmote)) {
      const active = current.active;
      const until = rosterEmote.duration * SELECTION_HOLD.to;
      if (!current.release && current.preview === rosterEmote && active
        && active.time >= rosterEmote.duration * SELECTION_HOLD.from && active.time < until) {
        // Both hold keys are identical. Camera redraws leave the rig alone.
        const wake = window.setTimeout(() => {
          if (held.current?.wake !== wake) return;
          held.current.ready = true;
          invalidate();
        }, (until - active.time) * 1000);
        held.current = { wake, until, ready: false };
      } else invalidate();
    }
  }, cockpit ? -.5 : -.125);

  if (chairRequested) chairShown.current = true;
  return <group>
    {previewPacks && <InteractionChair visible={chairRequested || chairShown.current} seatRef={chairSeat} />}
    <primitive object={root} dispose={null} onClick={(event: import("@react-three/fiber").ThreeEvent<MouseEvent>) => {
      if (selection || paused || victory || reducedMotion || !player.current || player.current.cabin || useCharacterPreviewStore.getState().brzExiting
        || event.delta > 3 || performance.now() < useFittingTurnStore.getState().suppressClickUntil) return;
      event.stopPropagation();
      const id = personalityEmote(personality, lastInteraction.current);
      lastInteraction.current = id;
      if (previewPacks) useCharacterPreviewStore.setState({ emote: { id }, playbackPaused: false });
      else player.current.clicked = { id };
      invalidate();
    }} />
    {bag && <group ref={heldProp}><DriverBag driver={root} colors={bagColors} /></group>}
  </group>;
}
