// Native forms still work without JavaScript. Keep the mounted Three scene when
// the session advances to another form or the protected game document.
(() => {
  if (window.avenskyPortalNavigation) return;
  const gameStyles = new Set();
  let pending = false;
  let handoff;
  let finishLogout;
  function usePublicLogo() {
    const logo = "/__alpha/entry/logo.svg";
    // Tabs opened against an earlier release can retain the protected image
    // preload and favicon even after the game gives the document back to sign-in.
    for (const link of document.head.querySelectorAll('link[rel="preload"][as="image"][href="/images/logo.svg"]')) link.href = logo;
    let icon = document.head.querySelector('link[rel="icon"][type="image/svg+xml"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      icon.type = "image/svg+xml";
      icon.href = logo;
      document.head.append(icon);
    } else if (icon.getAttribute("href") !== logo) icon.href = logo;
  }
  if (document.body.classList.contains("garage-entry")) usePublicLogo();
  function finishHandoff() {
    if (!handoff) return;
    clearTimeout(handoff.timer);
    if (handoff.frame) cancelAnimationFrame(handoff.frame);
    if (handoff.roster) handoff.roster.inert = false;
    handoff.layer.remove();
    handoff.status.remove();
    handoff = undefined;
    delete document.documentElement.dataset.entryHandoff;
  }
  function reduceMotion() {
    return document.hidden || document.documentElement.dataset.reduceMotion === "true" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }
  function fadeHandoff() {
    if (!handoff || document.documentElement.dataset.entryHandoff === "fading") return;
    clearTimeout(handoff.timer);
    if (handoff.roster) {
      handoff.roster.inert = false;
      window.dispatchEvent(new Event("avensky:entry-interactive"));
    }
    if (reduceMotion()) {
      finishHandoff();
      return;
    }
    document.documentElement.dataset.entryHandoff = "fading";
    handoff.layer.addEventListener("animationend", event => {
      if (event.target === handoff?.layer) finishHandoff();
    });
    // If styles fail to load or an animation is cancelled, ownership still passes.
    handoff.timer = setTimeout(finishHandoff, 550);
  }
  function fadeAfterPaint() {
    // The first mesh upload can stall a mobile frame. Let that frame present
    // before starting the CSS clock, so a long upload can't skip the blend.
    if (!handoff || handoff.frame) return;
    clearTimeout(handoff.timer);
    if (reduceMotion() || !window.requestAnimationFrame) return fadeHandoff();
    handoff.frame = requestAnimationFrame(() => {
      if (handoff) handoff.frame = requestAnimationFrame(fadeHandoff);
    });
  }
  window.addEventListener("avensky:entry-view", event => {
    if (!handoff || document.documentElement.dataset.entryHandoff !== "waiting") return;
    clearTimeout(handoff.timer);
    handoff.receivedView = true;
    handoff.status.remove();
    if (event.detail === "pending") {
      // Most profiles arrive with the first socket state. Avoid flashing the
      // connection notice between the two forms, but show it on a slow response.
      handoff.timer = setTimeout(fadeAfterPaint, 1100);
    } else if (event.detail === "roster" && !reduceMotion() &&
        !document.querySelector("[data-live-garage][data-garage-unavailable]") &&
        !["framing","framed"].includes(document.documentElement.dataset.garageShot)) {
      // Align the UI with a ready actor; slow/missing assets must never own menu input.
      handoff.roster = document.querySelector(".welcome-screen");
      if (handoff.roster) handoff.roster.inert = true;
      handoff.timer = setTimeout(fadeAfterPaint, 480);
    } else fadeAfterPaint();
  });
  for (const event of ["avensky:roster-framing","avensky:roster-framed"])
    window.addEventListener(event, () => { if (handoff?.roster) fadeAfterPaint(); });
  function signInFace(node) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (!(node instanceof Element)) return document.createTextNode("");
    // Never copy live form controls, input values, hidden data, IDs or links.
    if (node.matches('input[type=hidden],script,.garage-gamepad-controls')) return document.createTextNode("");
    const field = node.matches("input");
    const face = document.createElement(field || node.tagName === "SPAN" ? "span" : node.tagName === "FIELDSET" ? "fieldset" : "div");
    face.className = field ? "garage-handoff-value" : node.className;
    if (node.matches("button,a,[role=button]")) face.classList.add("garage-handoff-action");
    if (field) face.textContent = node.placeholder;
    else {
      if (node.hasAttribute("data-selected")) face.dataset.selected = node.dataset.selected;
      for (const child of node.childNodes) face.append(signInFace(child));
    }
    return face;
  }
  function beginHandoff(main, header) {
    finishLogout?.();
    finishHandoff();
    const layer = document.createElement("div");
    layer.id = "garage-entry-handoff";
    layer.inert = true;
    layer.setAttribute("aria-hidden", "true");
    if (header && getComputedStyle(header).display !== "none") layer.append(header.cloneNode(true));
    const form = main.querySelector("form.garage-credentials");
    if (form) {
      const body = document.createElement("div");
      body.className = "garage-entry-body";
      const card = document.createElement("div");
      card.className = "garage-entry-card";
      // The protected root can change body fonts and viewport layout on mount.
      // Copy the outgoing card's position once before removing its real inputs.
      const bounds = form.closest(".garage-entry-card")?.getBoundingClientRect();
      if (bounds?.width) Object.assign(card.style, { position: "fixed", left: bounds.left + "px",
        top: bounds.top + "px", width: bounds.width + "px", margin: "0" });
      card.append(signInFace(form));
      const recovery = main.querySelector(".garage-recovery");
      if (recovery) card.append(signInFace(recovery));
      body.append(card);
      layer.append(body);
    }
    const status = document.createElement("div");
    status.className = "garage-handoff-status";
    status.setAttribute("role", "status");
    status.textContent = "Loading characters…";
    document.body.append(layer, status);
    document.documentElement.dataset.entryHandoff = "waiting";
    handoff = { layer, status, timer: undefined };
  }
  function retryGame(room, header) {
    finishHandoff();
    suspendGameStyles();
    document.body.append(room);
    document.getElementById("startup-screen")?.remove();
    document.getElementById("root")?.remove();
    document.body.classList.add("garage-entry");
    if (header) document.body.append(header);
    const main = document.createElement("main");
    main.className = "garage-entry-body";
    main.innerHTML = '<section class="garage-entry-card" data-controller-rows data-controls-ready="true" aria-label="Game connection">' +
      '<p role="alert">The game could not load. Try again to continue.</p><nav data-controller-row><a href="/">Retry game</a></nav></section>';
    document.body.append(main);
    window.dispatchEvent(new Event("avensky:portal-form"));
  }
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
    finishLogout?.();
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
  // Capture only references to the visible menu. They remain React's until the
  // confirmed logout removes them. The live room, inputs and account forms are
  // never copied into the outgoing presentation.
  function captureLogout() {
    if (reduceMotion()) return;
    const roster = document.querySelector(".welcome-screen .character-roster");
    const tabs = document.querySelector(".welcome-screen .garage-entry-actions");
    const menu = document.querySelector(".main-menu");
    if (!roster && !tabs && !menu) return;
    const bounds = roster?.getBoundingClientRect();
    const sharedBrand = Boolean(document.querySelector(".welcome-screen .garage-entry-brand"));
    return function revealSignIn(onFinish) {
      finishHandoff();
      finishLogout?.();
      const incoming = document.querySelector("body > main.garage-entry-body, .welcome-screen .garage-entry-body");
      if (!incoming || reduceMotion()) { onFinish?.(); return; }
      const layer = document.createElement("div");
      layer.id = "garage-logout-handoff";
      layer.inert = true;
      layer.setAttribute("aria-hidden", "true");
      if (roster && !roster.isConnected) {
        // Keep the actual portraits and the current scroll position.
        Object.assign(roster.style, { inset: "auto", top: bounds.top + "px", left: bounds.left + "px",
          width: bounds.width + "px", height: bounds.height + "px" });
        layer.append(roster);
      }
      if (tabs && !tabs.isConnected) {
        const header = document.createElement("header");
        header.className = "garage-entry-header angled-tab-header";
        header.append(tabs);
        layer.append(header);
      }
      if (menu && !menu.isConnected && !menu.querySelector("input,textarea,form,canvas")) layer.append(menu);
      if (!layer.childElementCount) { onFinish?.(); return; }
      document.documentElement.dataset.logoutHandoff = "waiting";
      document.getElementById("garage-roster-header-exit")?.remove();
      document.body.append(layer);
      const header = document.querySelector("body > .garage-entry-header, .welcome-screen > .garage-entry-header");
      incoming.dataset.warmSignIn = "";
      if (header) header.dataset.warmSignIn = "";
      let observer, timer, frame;
      const finish = () => {
        if (finishLogout !== finish) return;
        clearTimeout(timer);
        if (frame) cancelAnimationFrame(frame);
        observer?.disconnect();
        document.removeEventListener("visibilitychange", hidden);
        layer.remove();
        incoming.classList.remove("garage-entry-incoming");
        if (header) header.classList.remove("garage-entry-incoming");
        delete document.documentElement.dataset.logoutHandoff;
        finishLogout = undefined;
        onFinish?.();
        // Keep cold-load transitions suppressed through stylesheet retirement and
        // one settled paint, then restore the usual idle/wake fade on this form.
        const restoreIdleFade = () => {
          delete incoming.dataset.warmSignIn;
          if (header) delete header.dataset.warmSignIn;
        };
        if (document.hidden || !incoming.isConnected || !window.requestAnimationFrame) restoreIdleFade();
        else requestAnimationFrame(() => requestAnimationFrame(restoreIdleFade));
      };
      function hidden() { if (document.hidden) finish(); }
      function fade() {
        if (reduceMotion()) { finish(); return; }
        document.documentElement.dataset.logoutHandoff = "fading";
        incoming.classList.add("garage-entry-incoming");
        if (header && !sharedBrand) header.classList.add("garage-entry-incoming");
        layer.classList.add("garage-entry-outgoing");
        layer.addEventListener("animationend", event => { if (event.target === layer) finish(); });
        timer = setTimeout(finish, 550);
      }
      function controlsReady() {
        clearTimeout(timer);
        observer?.disconnect();
        // Give form layout and the first camera frame a paint before starting the blend.
        if (reduceMotion() || !window.requestAnimationFrame) fade();
        else frame = requestAnimationFrame(() => { frame = requestAnimationFrame(fade); });
      }
      finishLogout = finish;
      document.addEventListener("visibilitychange", hidden);
      const card = document.body.classList.contains("garage-entry") && incoming.querySelector(".garage-entry-card");
      if (card && card.dataset.controlsReady !== "true") {
        // The restored form can still be mounting its controller/touch rows.
        observer = new MutationObserver(() => { if (card.dataset.controlsReady === "true") controlsReady(); });
        observer.observe(card, { attributes: true, attributeFilter: ["data-controls-ready"] });
        // The server-rendered form remains usable if its enhancement is delayed.
        timer = setTimeout(() => { card.dataset.controlsReady = "true"; controlsReady(); }, 500);
      } else controlsReady();
    };
  }
  // The protected game can also be opened directly with an existing cookie.
  // In either direction only the interface changes ownership. Keep the room.
  async function showSignIn(signOut, notice) {
    usePublicLogo();
    // Rust can close this player's socket before the revocation response arrives.
    const reveal = signOut ? captureLogout() : undefined;
    const request = (path, options) => fetch(path, {
      credentials: "same-origin", mode: "same-origin", cache: "no-store", ...options,
    });
    let response = signOut
      ? await request("/__alpha/sign-out", { method: "POST", body: new URLSearchParams() })
      // A replacement notification belongs to this socket. A newer tab may
      // already own the shared cookie; fetch only the public form markup.
      : await request("/sign-in", notice ? { credentials: "omit" } : {});
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
    if (notice) {
      const notices = page.createElement("aside");
      notices.className = "garage-notices";
      notices.setAttribute("aria-label", "Announcements and issues");
      const message = page.createElement("p");
      message.setAttribute("role", "status");
      message.textContent = notice;
      notices.append(message);
      main.prepend(notices);
    }
    finishHandoff();
    // A socket expiry and an explicit logout can both finish at this form.
    if (document.body.classList.contains("garage-entry") && document.querySelector("main.garage-entry-body")) {
      if (location.pathname !== next.pathname || notice) showPortalForm(page, next.pathname, main);
      return;
    }
    if (document.body.classList.contains("garage-entry")) {
      showPortalForm(page, next.pathname, main);
      return;
    }
    for (const link of page.querySelectorAll('link[rel=stylesheet]')) includeLink(link, next);
    window.dispatchEvent(new Event("avensky:leave-game"));
    if (!reveal) suspendGameStyles();
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
    reveal?.(suspendGameStyles);
  }
  window.avenskyPortalNavigation = { showSignIn, beginHandoff, captureLogout };
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
      const outgoing = document.querySelector("main.garage-entry-body");
      const previousHeader = document.querySelector("body > .garage-entry-header");
      outgoing.inert = true;
      document.activeElement?.blur?.();
      // Only the verified game document reaches this point. A later module
      // failure retries authenticated GET /, including after a one-time MFA code.
      for (const field of outgoing.querySelectorAll("input,textarea")) {
        field.value = "";
        field.defaultValue = "";
        field.removeAttribute("value");
        if (field.autocomplete?.includes("password")) field.type = "password";
      }
      beginHandoff(outgoing, previousHeader);
      window.dispatchEvent(new Event("avensky:leave-portal-form"));
      const entering = handoff;
      const room = document.querySelector("[data-live-garage]");
      outgoing.remove();
      previousHeader?.remove();
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
          for (const link of page.querySelectorAll('link[rel=stylesheet],link[rel=modulepreload]'))
            includeLink(link, next);
          for (const module of modules) await import(module.href);
        }
        // A release can change underneath a warm page. Older game bundles
        // do not dispatch entry-view, so they must still receive the interface.
        if (handoff === entering && !entering.receivedView) entering.timer = setTimeout(fadeAfterPaint, 1600);
      } catch {
        if (root.isConnected && !document.body.classList.contains("garage-entry")) retryGame(room, previousHeader);
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
