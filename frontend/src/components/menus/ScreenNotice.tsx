import { useEffect, useLayoutEffect, useState } from "react";
import "./screenNotice.css";

export const SCREEN_NOTICE_MS = 4000;
const EXIT_FADE_MS = 140;
const MAX_VISIBLE = 3;
type NoticeRole = "alert" | "status";

/** A source owns one timed line. Works in both the React game and the pre-login account portal. */
export function createScreenNotice() {
  let line: HTMLParagraphElement | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let expiry: Animation | undefined;
  function clear() {
    clearTimeout(timeout);
    expiry?.cancel();
    expiry = undefined;
    const host = line?.parentElement;
    line?.remove();
    line = undefined;
    if (host && !host.childElementCount) host.remove();
  }
  function show(message: string, role: NoticeRole = "status", label?: string) {
    if (!message) { clear(); return; }
    clearTimeout(timeout);
    let host = document.querySelector<HTMLElement>(".screen-notices");
    if (!host) {
      host = document.createElement("aside");
      host.className = "screen-notices";
      host.setAttribute("aria-label", "Notifications");
      (document.fullscreenElement ?? document.body).append(host);
    }
    if (!line) {
      line = document.createElement("p");
      line.className = "screen-notice";
      line.setAttribute("aria-atomic", "true");
    }
    line.setAttribute("role", role);
    if (line.parentElement !== host) host.append(line);
    if (label) {
      const heading = document.createElement("small");
      heading.textContent = label;
      line.replaceChildren(heading, " " + message);
    } else {
      line.textContent = message;
    }
    while (host.childElementCount > MAX_VISIBLE) host.firstElementChild?.remove();
    expiry?.cancel();
    if (line.animate) {
      const reduced = document.documentElement.dataset.reduceMotion === "true" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      expiry = line.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: EXIT_FADE_MS, delay: SCREEN_NOTICE_MS - EXIT_FADE_MS,
        easing: reduced ? "steps(1, end)" : "ease-in", fill: "forwards",
      });
      // Anchor expiry to publication, even if asset loading delays the first animation frame.
      expiry.startTime = performance.now();
    }
    timeout = setTimeout(clear, SCREEN_NOTICE_MS);
  }
  return { show, clear };
}

/** A dismissed editor cannot publish a late asynchronous result into another screen. */
export function useScreenNotice() {
  const [source] = useState(() => {
    const notice = createScreenNotice();
    let active = false;
    return {
      publish: (message: string, role?: NoticeRole, label?: string) => { if (active) notice.show(message, role, label); },
      mount: () => {
        active = true;
        return () => { active = false; notice.clear(); };
      },
    };
  });
  useLayoutEffect(() => source.mount(), [source]);
  return source.publish;
}

export function ScreenNotice({ message, eventId, role, label }: { message?: string | null; eventId?: string | number; role?: NoticeRole; label?: string }) {
  const show = useScreenNotice();
  useEffect(() => { show(message ?? "", role, label); }, [show, message, eventId, role, label]);
  return null;
}
