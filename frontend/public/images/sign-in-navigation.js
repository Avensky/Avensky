// Native forms still work without JavaScript. Keep the mounted Three scene when
// the session advances to another form or the protected game document.
(() => {
  if (window.avenskyPortalNavigation) return;
  const gameStyles = new Set();
  let pending = false;
  function portalPath(url) {
    return url.origin === location.origin && (url.pathname === "/sign-in" || url.pathname.startsWith("/__alpha/"));
  }
  function showError(text) {
    const card = document.querySelector(".garage-entry-card");
    if (!card) return;
    const message = card.querySelector('[role="alert"]') ?? card.appendChild(document.createElement("p"));
    message.setAttribute("role", "alert");
    message.textContent = text;
    window.dispatchEvent(new Event("avensky:portal-notice"));
  }
  function showPortalForm(page, next, main) {
    window.dispatchEvent(new Event("avensky:leave-portal-form"));
    main.querySelectorAll("script").forEach(script => script.remove());
    document.querySelector("main.garage-entry-body").replaceWith(main);
    history.replaceState(null, "", next);
    document.title = page.title;
    if (main.querySelector("#link-code, input[name=deviceToken]")) {
      const script = document.createElement("script");
      script.src = "/__alpha/invite.js";
      document.head.append(script);
    }
    window.dispatchEvent(new Event("avensky:portal-form"));
  }
  function includeLink(link, base) {
    const href = new URL(link.getAttribute("href"), base);
    if (href.origin !== location.origin || Array.from(document.head.querySelectorAll("link")).some(
      existing => existing.rel === link.rel && existing.href === href.href)) return;
    link.href = href.href;
    document.head.append(link);
  }
  function suspendGameStyles() {
    for (const link of document.head.querySelectorAll('link[rel=stylesheet]')) {
      if (!link.disabled && new URL(link.href).pathname.startsWith("/assets/")) {
        gameStyles.add(link);
        link.disabled = true;
      }
    }
  }
  // The protected game can also be opened directly with an existing cookie.
  // In either direction only the interface changes ownership. Keep the room.
  async function showSignIn(signOut) {
    const request = (path, options) => fetch(path, {
      credentials: "same-origin", mode: "same-origin", cache: "no-store", ...options,
    });
    let response = signOut
      ? await request("/__alpha/sign-out", { method: "POST", body: new URLSearchParams() })
      : await request("/sign-in");
    // An expired session may already have been disconnected by another tab.
    if (signOut && response.status === 403) response = await request("/sign-in");
    const next = new URL(response.url);
    if (!response.ok || next.origin !== location.origin || next.pathname !== "/sign-in")
      throw Error("The staging account could not return to sign-in. Try again.");
    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    const main = page.querySelector("main.garage-entry-body");
    const header = page.querySelector(".garage-entry-header");
    const room = document.querySelector("[data-live-garage]");
    if (!room || !header || !main?.querySelector('form.garage-credentials[action="/sign-in"]'))
      throw Error("The sign-in page is unavailable. Try again.");
    // A socket expiry and an explicit logout can both finish at this form.
    if (document.body.classList.contains("garage-entry") && document.querySelector("main.garage-entry-body")) {
      if (location.pathname !== next.pathname) showPortalForm(page, next.pathname, main);
      return;
    }
    if (document.body.classList.contains("garage-entry")) {
      showPortalForm(page, next.pathname, main);
      return;
    }
    for (const link of page.querySelectorAll('link[rel=stylesheet]')) includeLink(link, next);
    window.dispatchEvent(new Event("avensky:leave-game"));
    suspendGameStyles();
    document.body.classList.add("garage-entry");
    document.body.append(room, header, main);
    history.replaceState(null, "", next.pathname);
    document.title = page.title;
    if (!document.querySelector('script[src="/__alpha/entry/sign-in-input.js"]')) {
      const script = document.createElement("script");
      script.src = "/__alpha/entry/sign-in-input.js";
      document.head.append(script);
    }
    window.dispatchEvent(new Event("avensky:portal-form"));
  }
  window.avenskyPortalNavigation = { showSignIn };
  async function navigate(url, options) {
    if (pending) return;
    pending = true;
    try {
      if (url.pathname === "/__alpha/sign-out" && options?.method === "POST") {
        await showSignIn(true);
        return;
      }
      const response = await fetch(url, { ...options, credentials: "same-origin", mode: "same-origin" });
      const next = new URL(response.url);
      if (!response.headers.get("content-type")?.includes("text/html")) throw Error();
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      const main = page.querySelector("main.garage-entry-body");
      if (main && portalPath(next)) {
        showPortalForm(page, next.pathname + next.search + url.hash, main);
        return;
      }
      if (!response.ok || next.origin !== location.origin || next.pathname !== "/" || !page.querySelector("#root"))
        throw Error();
      const modules = [...page.querySelectorAll('script[type=module][src]')].map(el => new URL(el.getAttribute("src"), next));
      if (!modules.length || modules.some(src => src.origin !== next.origin || !src.pathname.startsWith("/assets/")))
        throw Error("The game entry is unavailable.");
      const previousMain = document.querySelector("main.garage-entry-body").cloneNode(true);
      previousMain.querySelector(".garage-gamepad-controls")?.remove();
      previousMain.querySelector(".garage-entry-card")?.removeAttribute("data-controls-ready");
      const previousHeader = document.querySelector(".garage-entry-header");
      const previousUrl = location.href;
      window.dispatchEvent(new Event("avensky:leave-portal-form"));
      const room = document.querySelector("[data-live-garage]");
      document.querySelector("main.garage-entry-body").remove();
      document.querySelector(".garage-entry-header")?.remove();
      document.body.classList.remove("garage-entry");
      history.replaceState(null, "", "/");
      for (const link of gameStyles) link.disabled = false;
      gameStyles.clear();
      document.title = page.title;
      const startup = document.createElement("div");
      startup.id = "startup-screen";
      startup.append(room);
      const root = document.createElement("div");
      root.id = "root";
      document.body.append(startup, root);
      // These are the same module URLs as the public entry, so React and the
      // renderer retain their identity as the protected bundle starts.
      try {
        if (window.dispatchEvent(new Event("avensky:resume-game", { cancelable: true }))) {
          for (const link of page.querySelectorAll('link[rel=stylesheet],link[rel=modulepreload],link[rel=icon]'))
            includeLink(link, next);
          for (const module of modules) await import(module.href);
        }
      } catch {
        suspendGameStyles();
        // A failed bundle request leaves the room and a usable sign-in form in place.
        document.body.append(room);
        document.getElementById("startup-screen")?.remove();
        document.getElementById("root")?.remove();
        document.body.classList.add("garage-entry");
        if (previousHeader) document.body.append(previousHeader);
        document.body.append(previousMain);
        history.replaceState(null, "", previousUrl);
        window.dispatchEvent(new Event("avensky:portal-form"));
        throw Error("The game could not start.");
      }
    } catch {
      showError("Couldn’t open the next screen. Check your connection and try again.");
    } finally { pending = false; }
  }
  window.addEventListener("avensky:portal-navigate", event => {
    if (!document.body.classList.contains("garage-entry")) return;
    const url = new URL(event.detail, location.href);
    if (portalPath(url) || url.href === location.origin + "/") void navigate(url);
  });
  document.addEventListener("submit", event => {
    const form = event.target;
    if (!document.body.classList.contains("garage-entry") || !(form instanceof HTMLFormElement) || form.method !== "post") return;
    const url = new URL(form.action);
    if (!portalPath(url)) return;
    event.preventDefault();
    void navigate(url, { method: "POST", body: new URLSearchParams(new FormData(form, event.submitter)) });
  });
  document.addEventListener("click", event => {
    const link = event.target.closest?.("a[href]");
    if (!document.body.classList.contains("garage-entry") || !link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
    const url = new URL(link.href);
    if (!portalPath(url) && url.href !== location.origin + "/") return;
    event.preventDefault();
    void navigate(url);
  });
})();
