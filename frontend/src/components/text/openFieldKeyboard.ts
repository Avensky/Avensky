import { useTextKeyboardStore } from "../../store/text/keyboardStore";

/** Edit the same native control used by touch, autofill and form submission. */
export function openFieldKeyboard(field: HTMLInputElement, updateValue?: (value: string) => void,
  focusAfter?: { cancel: HTMLElement | null; done: HTMLElement | null; preserveOnExit?: boolean }) {
  useTextKeyboardStore.getState().open({
    id: field.id || field.name,
    label: field.labels?.[0]?.textContent?.trim() || field.placeholder,
    value: field.value,
    initial: field.value,
    maxLength: field.maxLength >= 0 ? field.maxLength : 254,
    nativeInput: field,
    secret: field.autocomplete === "current-password" || field.type === "password",
    returnFocus: focusAfter?.cancel ?? field,
    acceptFocus: focusAfter?.done,
    preserveOnExit: focusAfter?.preserveOnExit,
    onChange(value) {
      if (updateValue) { updateValue(value); return; }
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    },
  }, true);
}
