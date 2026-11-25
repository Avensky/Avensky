// Native forms still work without JavaScript. Keep the mounted Three scene when
// the session advances to another form or the protected game document.
(() => {
  const scope = new AbortController();
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
  }
  async function navigate(url, options) {
    if (pending) return;
    pending = true;
    try {
      const response = await fetch(url, { ...options, credentials: "same-origin", mode: "same-origin" });
      const next = new URL(response.url);
      if (!response.headers.get("content-type")?.includes("text/html")) throw Error();
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      const main = page.querySelector("main.garage-entry-body");
      if (main && portalPath(next)) {
        window.dispatchEvent(new Event("avensky:leave-portal-form"));
        // Server-issued invite setup scripts are restarted explicitly below.
        main.querySelectorAll("script").forEach(script => script.remove());
        document.querySelector("main.garage-entry-body").replaceWith(main);
        history.replaceState(null, "", next.pathname + next.search + url.hash);
        document.title = page.title;
        for (const path of ["/__alpha/invite.js"]) {
          if (path.endsWith("invite.js") && !main.querySelector("#link-code, input[name=deviceToken]")) continue;
          const script = document.createElement("script");
          script.src = path;
          document.head.append(script);
        }
        window.dispatchEvent(new Event("avensky:portal-form"));
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
      for (const link of page.querySelectorAll('link[rel=stylesheet],link[rel=modulepreload],link[rel=icon]')) {
        const href = new URL(link.getAttribute("href"), next);
        if (href.origin === next.origin) { link.href = href.href; document.head.append(link); }
      }
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
        for (const module of modules) await import(module.href);
        scope.abort();
      } catch {
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
    const url = new URL(event.detail, location.href);
    if (portalPath(url) || url.href === location.origin + "/") void navigate(url);
  }, { signal: scope.signal });
  document.addEventListener("submit", event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.method !== "post") return;
    const url = new URL(form.action);
    if (!portalPath(url) || url.pathname.endsWith("/sign-out")) return;
    event.preventDefault();
    void navigate(url, { method: "POST", body: new URLSearchParams(new FormData(form, event.submitter)) });
  }, { signal: scope.signal });
  document.addEventListener("click", event => {
    const link = event.target.closest?.("a[href]");
    if (!link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
    const url = new URL(link.href);
    if (!portalPath(url) && url.href !== location.origin + "/") return;
    event.preventDefault();
    void navigate(url);
  }, { signal: scope.signal });
})();
