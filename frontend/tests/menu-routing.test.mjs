import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let server, ui, route, preferences, canDrive, canNavigateMenu, alpha, mainItems, garageEditor;
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  ui = (await server.ssrLoadModule("/src/store/menus/uiStore.ts")).useUIStore;
  alpha = (await server.ssrLoadModule("/src/store/alpha/alphaStore.ts")).useAlphaStore;
  garageEditor = (await server.ssrLoadModule("/src/worldBuilder/garage/garageEditorState.ts")).useGarageEditor;
  mainItems = (await server.ssrLoadModule("/src/game/menus/menuItems.ts")).MAIN_MENU_ITEMS;
  ({
    routeMenuAction: route,
    canDrive,
    canNavigateMenu,
  } = await server.ssrLoadModule("/src/controls/inputRouting.ts"));
  preferences = await server.ssrLoadModule(
    "/src/store/preferences/preferencesStore.ts",
  );
  globalThis.window = new EventTarget();
});
after(async () => {
  delete globalThis.window;
  await server?.close();
});

test("every pause row routes correctly and navigation follows the split menu", () => {
  [
    null,
    "debug_menu",
    "settings",
    "vehicle_select",
    "cockpit",
    "missions",
    "career",
    "leave_game",
    "social",
  ].forEach((target, index) => {
    ui.setState({ screen: "sandbox", overlay: "pause", isModeLoading: false });
    ui.getState().setActiveMenuIndex(index);
    route("activate");
    assert.equal(ui.getState().overlay, target, `pause row ${index}`);
    assert.equal(ui.getState().screen, "sandbox");
  });
  ui.setState({ overlay: "pause" });
  ui.getState().setActiveMenuIndex(0);
  route("up");
  assert.equal(ui.getState().getActiveMenuIndex(), 3);
  route("down");
  assert.equal(ui.getState().getActiveMenuIndex(), 4);
  route("next_tab");
  assert.equal(ui.getState().getActiveMenuIndex(), 6);
  route("previous_tab");
  assert.equal(ui.getState().getActiveMenuIndex(), 4);
});

test("garage station navigation wraps without opening a destination or disturbing match preferences", () => {
  const ids = mainItems.map(item => item.id);
  assert.deepEqual(ids, ["enter_world", "wardrobe", "vehicle", "world_editor"]);
  alpha.getState().chooseMode("competitive");
  alpha.getState().chooseTeamSize(3);
  ui.setState({ screen: "main", overlay: null, isModeLoading: false });
  ui.getState().setActiveMenuIndex(0);
  route("up");
  assert.equal(ui.getState().getActiveMenuIndex(), ids.length - 1);
  route("down");
  assert.equal(ui.getState().getActiveMenuIndex(), 0);
  for (const station of ["wardrobe", "vehicle"]) {
    ui.getState().setScreen("main");
    ui.getState().setActiveMenuIndex(ids.indexOf(station));
    assert.equal(ui.getState().screen, "main");
    route("activate");
    assert.equal(ui.getState().screen, "heroes");
    assert.equal(ui.getState().workshopEntry, station);
    assert.equal(alpha.getState().lastMatchMode, "competitive");
    assert.equal(alpha.getState().teamSize, 3);
  }
  ui.getState().setScreen("main");
  ui.getState().setActiveMenuIndex(ids.indexOf("world_editor"));
  route("activate");
  assert.equal(ui.getState().screen, "main");
  assert.equal(garageEditor.getState().page, "projects");
  assert.equal(ui.getState().overlay, null);
  garageEditor.setState({page: null});
});

test("panel input never activates the underlying main menu and Back returns to the correct parent", () => {
  const received = [];
  const handler = (event) => received.push(event.detail);
  window.addEventListener("avenlab:panel-action", handler);
  try {
    ui.setState({ screen: "main", overlay: "settings", isModeLoading: false });
    for (const action of ["up", "next_tab", "left", "activate", "back"])
      route(action);
    assert.deepEqual(received, ["up", "next_tab", "left", "activate", "back"]);
    assert.equal(ui.getState().screen, "main");
    ui.setState({ screen: "sandbox", overlay: "career" });
    ui.getState().backToParentMenu();
    assert.equal(ui.getState().overlay, "pause");
    route("back");
    assert.equal(ui.getState().overlay, null);
    ui.setState({ screen: "settings", overlay: null });
    ui.getState().backToParentMenu();
    assert.equal(ui.getState().screen, "main");
  } finally {
    window.removeEventListener("avenlab:panel-action", handler);
  }
});

test("tab shoulders cannot accidentally leave the garage; loading blocks menu activation", () => {
  let exits = 0;
  const onExit = () => exits++;
  window.addEventListener("avenlab:sandbox-exit", onExit);
  try {
    ui.setState({ screen: "sandbox_setup", overlay: null });
    route("previous_tab");
    route("next_tab");
    assert.equal(exits, 0);
    route("back");
    assert.equal(exits, 1);
    ui.setState({ screen: "main", overlay: null, isModeLoading: true });
    route("activate");
    assert.equal(ui.getState().screen, "main");
  } finally {
    window.removeEventListener("avenlab:sandbox-exit", onExit);
    ui.setState({ isModeLoading: false });
  }
});

test("Sandbox setup navigates all four choices and requests validated Start only from its action row", () => {
  ui.setState({ screen: "sandbox_setup", overlay: null, isModeLoading: false });
  ui.getState().setActiveMenuIndex(0);
  const actions = [];
  const start = () => actions.push("start");
  const exit = () => actions.push("exit");
  window.addEventListener("avenlab:sandbox-start", start);
  window.addEventListener("avenlab:sandbox-exit", exit);
  try {
    for (const expected of [1, 2, 3, 0]) {
      route("down");
      assert.equal(ui.getState().getActiveMenuIndex(), expected);
    }
    route("up");
    assert.equal(ui.getState().getActiveMenuIndex(), 3);
    route("left");
    route("right");
    assert.deepEqual(actions, []);
    route("activate");
    assert.deepEqual(actions, ["exit"]);
    ui.getState().setActiveMenuIndex(2);
    route("left");
    route("right");
    assert.deepEqual(actions, ["exit"]);
    route("activate");
    assert.deepEqual(actions, ["exit", "start"]);
    assert.equal(
      ui.getState().screen,
      "sandbox_setup",
      "only the mounted setup can validate and spawn",
    );
  } finally {
    window.removeEventListener("avenlab:sandbox-start", start);
    window.removeEventListener("avenlab:sandbox-exit", exit);
  }
});

test("corrupt stored preferences cannot disable steering or steal reserved shortcuts", () => {
  const { sanitizePreferences, DEFAULT_BINDINGS } = preferences;
  const sanitized = sanitizePreferences({
    fov: Infinity,
    controllerDeadzone: -5,
    steeringSensitivity: 50,
    menuTextScale: 100,
    bindings: { ...DEFAULT_BINDINGS, forward: "KeyE" },
    favoriteVehicles: ["brz", null, 2],
  });
  assert.equal(sanitized.fov, 75);
  assert.equal(sanitized.controllerDeadzone, 0.05);
  assert.equal(sanitized.steeringSensitivity, 1.5);
  assert.equal(sanitized.menuTextScale, 1.25);
  assert.deepEqual(sanitized.bindings, DEFAULT_BINDINGS);
  assert.deepEqual(sanitized.favoriteVehicles, ["brz"]);
  assert.deepEqual(
    sanitizePreferences({ bindings: { ...DEFAULT_BINDINGS, reverse: "KeyW" } })
      .bindings,
    DEFAULT_BINDINGS,
  );
  assert.equal(
    sanitizePreferences({ bindings: { ...DEFAULT_BINDINGS, forward: "KeyU" } })
      .bindings.forward,
    "KeyU",
  );
});


test("Heroes routes controller actions to its own panel and cannot drive or activate Main behind it", () => {
  ui.setState({screen:"heroes",overlay:null,isModeLoading:false});
  let count=0;const listener=()=>count++;
  window.addEventListener("avenlab:panel-action",listener);
  route("activate");route("back");
  window.removeEventListener("avenlab:panel-action",listener);
  assert.equal(count,2);assert.equal(ui.getState().screen,"heroes");assert.equal(canDrive(),false);
});
