import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { GameButton } from "../../components/GameButton";
import { useMenuInputDevice } from "../../components/controller/useMenuInputDevice";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { openFieldKeyboard } from "../../components/text/openFieldKeyboard";
import { bindWelcomeMenuPanel, menuActionForKey, type MenuAction } from "../../controls/inputRouting";
import { useMobilePortrait } from "../../controls/useMobilePortrait";
import { deleteRosterCharacter } from "../../net/socialClient";
import type { CharacterSlot } from "../../store/social/socialStore";
import { useTextKeyboardStore } from "../../store/text/keyboardStore";
import { styleName } from "../characters/characterStyles";
import { navigateFormRows } from "../social/formRows";

type Props = {
  owner: string;
  slot: CharacterSlot;
  connected: boolean;
  onClose: () => void;
  onDeleted: () => void;
};

export function RosterCharacterManager({ owner, slot, connected, onClose, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null);
  const cancel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const remembered = useRef(new WeakMap<HTMLElement, number>());
  const device = useMenuInputDevice();
  const portrait = useMobilePortrait();
  const id = useId();
  const fieldId = id + "-name";
  const canDelete = confirming && connected && !submitting && typedName === slot.name;

  function back() {
    if (pending.current) return;
    if (!confirming) { onClose(); return; }
    setTypedName("");
    setError("");
    setConfirming(false);
  }

  async function remove() {
    if (!canDelete || pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setError("");
    try {
      await deleteRosterCharacter(owner, slot.id, typedName);
      onDeleted();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not delete this character. Try again.");
      pending.current = false;
      setSubmitting(false);
      cancel.current?.focus({ preventScroll: true });
    }
  }

  function navigate(action: MenuAction) {
    const active = document.activeElement;
    if (!panel.current || pending.current || useTextKeyboardStore.getState().session) return;
    if (action === "back") {
      if (active === field.current && field.current) cancel.current?.focus({ preventScroll: true });
      else back();
    } else if (action === "activate") {
      if (field.current && active === field.current) {
        openFieldKeyboard(field.current, setTypedName, { cancel: cancel.current, done: cancel.current, preserveOnExit: true });
      } else if (active instanceof HTMLElement && panel.current.contains(active)) active.click();
    } else if (action === "up" || action === "down" || action === "left" || action === "right") {
      navigateFormRows(panel.current, active instanceof HTMLElement ? active : null, action, remembered.current);
    }
  }

  const onPanelAction = useEffectEvent((event: Event) => navigate((event as CustomEvent<MenuAction>).detail));
  useEffect(() => {
    window.addEventListener("avenlab:panel-action", onPanelAction);
    return () => {
      window.removeEventListener("avenlab:panel-action", onPanelAction);
      const keyboard = useTextKeyboardStore.getState();
      if (keyboard.session?.id === fieldId) keyboard.close(true);
    };
  }, [fieldId]);
  useLayoutEffect(() => {
    if (panel.current) return bindWelcomeMenuPanel(panel.current);
  }, []);
  useLayoutEffect(() => {
    cancel.current?.focus({ preventScroll: true });
  }, [confirming]);

  function keyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target === field.current) {
      if (event.key !== "Escape" && event.key !== "Enter") return;
      event.preventDefault(); event.stopPropagation();
      cancel.current?.focus({ preventScroll: true });
      return;
    }
    const action = menuActionForKey(event);
    if (!action) return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat) navigate(action);
  }

  return <div className="character-roster" data-input-device={device} data-portrait={portrait || undefined}>
    <section ref={panel} className="roster-choices roster-manager" role="dialog" aria-modal="true"
      aria-labelledby={id} aria-describedby={confirming ? id + "-warning" : undefined} data-controller-rows onKeyDown={keyDown}>
      <div className="roster-manager-summary chamfered-frame">
        <h2 id={id}>{confirming ? "Delete character?" : slot.name}</h2>
        {confirming
          ? <p id={id + "-warning"}>Permanently removes <strong>{slot.name}</strong> and their progress from this server.</p>
          : <p>{styleName(slot.style)} · Level {slot.level}</p>}
      </div>
      {confirming ? <>
        <div className="roster-confirm-field chamfered-frame" data-controller-row>
          <label htmlFor={fieldId}>Type <strong>{slot.name}</strong> exactly to confirm</label>
          <input ref={field} id={fieldId} type="text" value={typedName} aria-label="Character name"
            autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={submitting}
            onChange={event => { setTypedName(event.currentTarget.value); setError(""); }} />
        </div>
        {error && <p className="roster-manager-error" role="alert">{error}</p>}
        <div className="roster-manager-actions" data-controller-row>
          <GameButton key="cancel" ref={cancel} variant="custom" className="chamfered-frame" disabled={submitting}
            onPress={back}>Cancel</GameButton>
          <GameButton key="confirm" variant="custom" className="chamfered-frame roster-destructive" disabled={!canDelete}
            onPress={() => void remove()}><MenuIcon name="trash" />{submitting ? "Deleting…" : "Delete character"}</GameButton>
        </div>
      </> : <div className="roster-manager-actions" data-controller-row>
        <GameButton key="back" ref={cancel} variant="custom" className="chamfered-frame" onPress={onClose}>
          <MenuIcon name="back" />Back</GameButton>
        <GameButton key="start" variant="custom" className="chamfered-frame roster-destructive" disabled={!connected}
          onPress={() => setConfirming(true)}><MenuIcon name="trash" />Delete character</GameButton>
      </div>}
    </section>
  </div>;
}
