import { useTextKeyboardStore } from "../../store/text/keyboardStore";

/** Edit the same native control used by touch, autofill and form submission. */
export function openFieldKeyboard(field: HTMLInputElement) {
  useTextKeyboardStore.getState().open({
    id: field.id || field.name,
    label: field.labels?.[0]?.textContent?.trim() || field.placeholder,
    value: field.value,
    initial: field.value,
    maxLength: field.maxLength >= 0 ? field.maxLength : 254,
    secret: field.autocomplete === "current-password" || field.type === "password",
    returnFocus: field,
    onChange(value) {
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    },
  }, true);
}
