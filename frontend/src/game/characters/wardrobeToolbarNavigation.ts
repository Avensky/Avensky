import { FORM_CONTROL_SELECTOR, usableFormControl } from "../social/formRows";

const GROUP_SELECTOR = "[data-wardrobe-focus-group]";
const groupOrder = ["angles", "rotation", "zoom", "content"];

export function wardrobeFocusGroup(element: Element | null) {
  return element?.closest<HTMLElement>(GROUP_SELECTOR)?.dataset.wardrobeFocusGroup;
}

/** The tool order stays stable as the page reflows and inspectors open or close. */
export function createWardrobeToolbarNavigation() {
  const lastControl = new Map<string, HTMLElement>();
  let currentGroup: string | undefined;
  let indicated: HTMLElement | undefined;

  function indicate(control?: HTMLElement) {
    if (indicated === control) return;
    indicated?.removeAttribute("data-wardrobe-navigation-focus");
    indicated = control;
    indicated?.setAttribute("data-wardrobe-navigation-focus", "");
  }

  function focusControl(control: HTMLElement) {
    // A touch can select a different toolbar while native focus stays on this very control.
    remember(control);
    indicate(control);
    if (control === document.activeElement) control.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    else control.focus({ preventScroll: true });
  }

  function remember(target: EventTarget | null, pointer = false) {
    if (!(target instanceof window.Element)) return;
    if (pointer) indicate();
    const group = wardrobeFocusGroup(target);
    if (!group) {
      indicate();
      if (target.closest(".menu-frame-header, [role=tablist][data-controller-tab-only]")) currentGroup = undefined;
      return;
    }
    const control = target.closest<HTMLElement>(FORM_CONTROL_SELECTOR);
    if (control && usableFormControl(control)) {
      currentGroup = group;
      lastControl.set(group, control);
      if (indicated) indicate(control);
    }
  }

  function cycle(root: HTMLElement, direction: number) {
    const index = groupOrder.indexOf(currentGroup ?? "");
    const start = index < 0 && direction < 0 ? 0 : index;
    for (let step = 1; step <= groupOrder.length; step++) {
      const group = groupOrder[(start + step * direction + groupOrder.length) % groupOrder.length];
      const previous = lastControl.get(group);
      if (previous && root.contains(previous) && wardrobeFocusGroup(previous) === group && usableFormControl(previous)) {
        focusControl(previous);
        return;
      }
      const panes = root.querySelectorAll<HTMLElement>(`[data-wardrobe-focus-group="${group}"]`);
      for (const pane of panes) {
        if (pane.closest("[hidden],[inert]")) continue;
        // Prefer the active shot without applying it again or activating a content action.
        const selected = group === "angles" && pane.querySelector<HTMLElement>('[aria-pressed="true"]');
        const target = selected && usableFormControl(selected) ? selected
          : Array.from(pane.querySelectorAll<HTMLElement>(FORM_CONTROL_SELECTOR)).find(usableFormControl);
        if (target) {
          focusControl(target);
          return;
        }
      }
    }
  }

  return { remember, cycle };
}
