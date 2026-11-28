import { useEffect, useLayoutEffect, useState } from "react";
import "./screenNotice.css";

export const SCREEN_NOTICE_MS = 4000;
const MAX_VISIBLE = 3;
type NoticeRole = "alert" | "status";

/** A source owns one timed line. Works in both the React game and the pre-login account portal. */
export function createScreenNotice() {
  let line: HTMLParagraphElement | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  function clear() {
    clearTimeout(timeout);
    const host = line?.parentElement;
    line?.remove();
    line = undefined;
    if (host && !host.childElementCount) host.remove();
  }
  function show(message: string, role: NoticeRole = "status") {
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
    line.textContent = message;
    while (host.childElementCount > MAX_VISIBLE) host.firstElementChild?.remove();
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
      publish: (message: string, role?: NoticeRole) => { if (active) notice.show(message, role); },
      mount: () => {
        active = true;
        return () => { active = false; notice.clear(); };
      },
    };
  });
  useLayoutEffect(source.mount, [source]);
  return source.publish;
}

export function ScreenNotice({ message, eventId, role }: { message?: string | null; eventId?: string | number; role?: NoticeRole }) {
  const show = useScreenNotice();
  useEffect(() => { show(message ?? "", role); }, [show, message, eventId, role]);
  return null;
}
