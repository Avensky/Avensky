// Mount the shared game controls after the garage is ready.
(() => {
  const blockTab = event => { if (event.key === "Tab") event.preventDefault(); };
  window.addEventListener("keydown", blockTab, true);
  window.addEventListener("avensky:leave-portal-form", () => window.removeEventListener("keydown", blockTab, true), { once: true });
  const assets = document.currentScript.src;
  let loading = false;
  function load() {
    if (loading || !document.querySelector(".garage-entry-card")) return;
    loading = true;
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = new URL("sign-in-controller.css", assets).href;
    document.head.append(style);
    import(new URL("sign-in-controller.js", assets).href).catch(() => {
      loading = false;
      style.remove();
    });
  }
  window.addEventListener("gamepadconnected", load);
  window.addEventListener("avensky:garage-ready", load, { once: true });
  if (document.documentElement.dataset.garageReady === "true") load();
  try {
    if (Array.from(navigator.getGamepads?.() ?? []).some(Boolean)) load();
  } catch { /* Native controls also work when the browser restricts gamepads. */ }
})();
