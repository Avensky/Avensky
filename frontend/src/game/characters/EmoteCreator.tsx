import { useScreenNotice } from "../../components/menus/ScreenNotice";
import { useState } from "react";
import { CHARACTER_POSE_GROUPS } from "./posePack";
import { CREATED_EMOTE_ID, CREATOR_EASE, CREATOR_FACING, CREATOR_HANDS, CREATOR_MAX_FRAMES, creatorTimeline, defaultEmoteFrame, writeCreatedEmotes, type CreatedEmote, type EmoteFrame } from "./emoteAuthoring";
import { useCharacterPreviewStore } from "./characterPreviewStore";

export function EmoteCreator({ disabled, owner, saved, onSave }: {
  disabled: boolean; owner: string; saved: CreatedEmote[]; onSave: (emotes: CreatedEmote[]) => void;
}) {
  const [draft, setDraft] = useState<CreatedEmote>(() => ({
    id: crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(16).padStart(2, "0")).join(""),
    name: "", frames: [defaultEmoteFrame(), defaultEmoteFrame("pose-greeting")],
  }));
  const [selected, setSelected] = useState(0);
  const setMessage = useScreenNotice();
  const frame = draft.frames[selected];
  const timeline = creatorTimeline(draft.frames);
  const update = (change: Partial<EmoteFrame>) => {
    setDraft(emote => ({ ...emote, frames: emote.frames.map((item, index) => index === selected ? { ...item, ...change } : item) }));
    setMessage("");
  };
  function preview() {
    useCharacterPreviewStore.setState({ emote: { id: CREATED_EMOTE_ID, created: draft }, playbackPaused: false, loopEmote: false, cockpitError: null });
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    const entry = { ...draft, name: draft.name.trim() };
    const next = [entry, ...saved.filter(item => item.id !== entry.id)];
    try {
      writeCreatedEmotes(owner, next);
      onSave(next);
      setMessage("Emote saved on this device.");
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : "Could not save the emote."); }
  }
  return <form className="emote-creator" onSubmit={save}>
    <h2>Emote creator</h2>
    <label className="character-setting" data-controller-row>Emote name
      <input className="menu-control" name="name" required maxLength={48} value={draft.name}
        onChange={event => { setDraft({ ...draft, name: event.target.value }); setMessage(""); }} />
    </label>
    {saved.length > 0 && <label className="character-setting" data-controller-row>Open saved emote
      <select className="menu-control" value="" onChange={event => {
        const entry = saved.find(item => item.id === event.target.value);
        if (entry) { setDraft(entry); setSelected(0); setMessage(""); }
      }}><option value="">Choose an emote</option>{saved.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
    </label>}
    <div className="emote-creator-track">
      {(["Body", "Hands"] as const).map(lane => <div key={lane} className="emote-creator-lane" data-controller-row>
        <span>{lane}</span>{draft.frames.map((item, index) => <button key={index} type="button" className="menu-control"
          aria-pressed={selected === index} aria-label={`${lane} keyframe ${index + 1} at ${timeline.markers[index].toFixed(2)} seconds`}
          onClick={() => setSelected(index)}>{lane === "Body" ? timeline.markers[index].toFixed(1) + "s" : item.hands === "Pose default" ? "Pose" : item.hands}</button>)}
      </div>)}
    </div>
    <small>{timeline.duration.toFixed(2)} seconds total</small>
    <fieldset>
      <legend>Selected pose · {selected + 1} of {draft.frames.length}</legend>
      <label className="character-setting" data-controller-row>Body pose
        <select className="menu-control" value={frame.pose} onChange={event => update({ pose: event.target.value })}>
          {CHARACTER_POSE_GROUPS.map(group => <optgroup key={group.group} label={group.group}>
            {group.poses.map(pose => <option key={pose.id} value={pose.id}>{pose.name}</option>)}
          </optgroup>)}
        </select>
      </label>
      <label className="character-setting" data-controller-row>Hold (seconds)
        <input className="menu-control" type="number" min=".1" max="5" step=".05" required value={frame.hold}
          onChange={event => update({ hold: Number(event.target.value) })} />
      </label>
      <label className="character-setting" data-controller-row>Hands
        <select className="menu-control" value={frame.hands} onChange={event => update({ hands: event.target.value as EmoteFrame["hands"] })}>
          {CREATOR_HANDS.map(item => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="character-setting" data-controller-row>Transition
        <select className="menu-control" value={frame.ease} onChange={event => update({ ease: event.target.value as EmoteFrame["ease"] })}>
          {CREATOR_EASE.map(item => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="character-setting" data-controller-row>Facing
        <select className="menu-control" value={frame.facing} onChange={event => update({ facing: event.target.value as EmoteFrame["facing"] })}>
          {CREATOR_FACING.map(item => <option key={item}>{item}</option>)}
        </select>
      </label>
    </fieldset>
    <div className="emote-creator-actions" data-controller-row>
      <button type="button" className="menu-control" disabled={disabled || draft.frames.some(item => !Number.isFinite(item.hold) || item.hold < .1 || item.hold > 5)}
        onClick={preview}>Preview</button>
      <button type="button" className="menu-control" disabled={draft.frames.length >= CREATOR_MAX_FRAMES} onClick={() => {
        setDraft({ ...draft, frames: [...draft.frames.slice(0, selected + 1), defaultEmoteFrame(), ...draft.frames.slice(selected + 1)] });
        setSelected(selected + 1);
      }}>Add pose</button>
      <button type="button" className="menu-control" disabled={draft.frames.length < 2} onClick={() => {
        setDraft({ ...draft, frames: draft.frames.filter((_, index) => index !== selected) });
        setSelected(Math.max(0, selected - 1));
      }}>Remove pose</button>
      <button type="submit" className="menu-control">Save emote</button>
    </div>
  </form>;
}
