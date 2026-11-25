// Touch and hardware keyboards use the native form without loading the game UI.
(() => {
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
  try {
    if (Array.from(navigator.getGamepads?.() ?? []).some(Boolean)) load();
  } catch { /* Native controls also work when the browser restricts gamepads. */ }
})();
