import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h, Fragment } from "react";
import { createRoot } from "react-dom/client";

test("mouse, keyboard and polled gamepad navigate the real menus and preferences", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const previous = new Map();
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLMediaElement.prototype.play = async () => {};
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.document.hasFocus = () => true;
  const pad = {
    connected: true,
    index: 0,
    id: "test-standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
  dom.window.navigator.getGamepads = () => [null, pad];
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  let root;
  try {
    const load = (path) => server.ssrLoadModule(`/src/${path}`);
    const { useUIStore: ui } = await load("store/menus/uiStore.ts");
    const { usePreferencesStore: preferences } = await load(
      "store/preferences/preferencesStore.ts",
    );
    const { useRenderSettingsStore: rendering } = await load(
      "store/presentation/renderSettingsStore.ts",
    );
    const { useInputStore: inputs } = await load("store/input/inputStore.ts");
    const { useSelectionStore: selection } = await load(
      "store/selection/selectionStore.ts",
    );
    const { useNetworkStore: network } = await load(
      "store/session/networkStore.ts",
    );
    const { SandboxSetup } = await load("game/modes/sandbox/SandboxSetup.tsx");
    const { MainMenu } = await load("game/menus/MainMenu.tsx");
    const { HeroSelection } = await load("game/alpha/HeroSelection.tsx");
    const { ModeSelection } = await load("game/alpha/ModeSelection.tsx");
    const { useAlphaStore: alpha } = await load("store/alpha/alphaStore.ts");
    const { MAIN_MENU_ITEMS, PAUSE_MENU_ITEMS } = await load("game/menus/menuItems.ts");
    const { PauseMenu } = await load("game/menus/PauseMenu.tsx");
    const { SettingsMenu } = await load("game/menus/SettingsMenu.tsx");
    const { CareerMenu } = await load("game/menus/CareerMenu.tsx");
    const { MissionsMenu } = await load("game/menus/MissionsMenu.tsx");
    const { SessionMenu } = await load("game/menus/SessionMenu.tsx");
    const { VehicleMenu } = await load("game/menus/VehicleMenu.tsx");
    const { DebugMenu } = await load("components/debugger/DebugMenu.tsx");
    const { PerformanceOverlay } = await load(
      "performance/PerformanceOverlay.tsx",
    );
    const { Keyboard } = await load("controls/Keyboard.ts");
    const { GameController } = await load("controls/GameController.ts");
    function Harness() {
      const screen = ui((s) => s.screen),
        overlay = ui((s) => s.overlay);
      const panel = overlay ?? screen;
      const Component = {
        main: MainMenu,
        hero_select: HeroSelection,
        mode_select: ModeSelection,
        sandbox_setup: SandboxSetup,
        pause: PauseMenu,
        settings: SettingsMenu,
        career: CareerMenu,
        missions: MissionsMenu,
        debug_menu: DebugMenu,
        vehicle_select: VehicleMenu,
        leave_game: SessionMenu,
      }[panel];
      return h(
        Fragment,
        null,
        Component
          ? h(Component, { collapsed: false, setCollapsed: () => {} })
          : null,
        screen === "sandbox" ? h(PerformanceOverlay) : null,
        h(Keyboard),
        h(GameController),
      );
    }
    root = createRoot(document.getElementById("root"));
    const reset = async (screen = "main", overlay = null) =>
      act(async () => {
        ui.setState({
          screen,
          overlay,
          vehicleSelectionParent: null,
          debugMenuParent: "pause",
          isModeLoading: false,
          selectedMenuIndexById: {
            main: 0,
            pause: 0,
            settings: 0,
            sandbox_setup: 0,
          },
        });
      });
    const click = async (element) => {
      assert.ok(element, "element exists");
      await act(async () => element.click());
    };
    const tab = (label) =>
      [...document.querySelectorAll('[role="tab"]')].find(
        (el) => el.textContent === label,
      );
    const row = (id) => document.querySelector(`[data-menu-row="${id}"]`);
    const pauseAction = (id) => document.querySelector(`[data-pause-action="${id}"]`);
    const key = async (code, key = code, options = {}) =>
      act(async () =>
        document.activeElement.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            code,
            key,
            bubbles: true,
            cancelable: true,
            ...options,
          }),
        ),
      );
    const button = async (index) => {
      await act(async () => {
        pad.buttons[index] = { pressed: true, value: 1 };
        await new Promise((resolve) => setTimeout(resolve, 45));
      });
      await act(async () => {
        pad.buttons[index] = { pressed: false, value: 0 };
        await new Promise((resolve) => setTimeout(resolve, 35));
      });
    };
    await reset();
    await act(async () => {
      root.render(h(Harness));
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 40)));

    await t.test(
      "vehicle model changes discard old interpolation poses immediately",
      async () => {
        const { PhysicsInterpolationBuffer } = await load(
          "hooks/usePhysicsInterpolator.ts",
        );
        const buffer = new PhysicsInterpolationBuffer(() => 20);
        const old = {
          id: "driver",
          vehicle_id: "ae86",
          position: [12, 1, 34],
          rotation: [0, 0, 0, 1],
        };
        const next = { ...old, vehicle_id: "tank", position: [12, 2, 34] };
        buffer.setSnapshot("driver", old, { tick: 1, received_at_ms: 0 });
        buffer.setSnapshot("driver", next, { tick: 2, received_at_ms: 20 });
        assert.equal(buffer.getInterpolated("driver", 50, 20), next);
      },
    );
    await t.test(
      "the static sunflare and reduced motion leave the main menu usable",
      async () => {
        await reset();
        assert.ok(document.querySelector(".main-menu .menu-flare-background"));
        const loop = document.querySelector(".main-menu video");
        assert.ok(loop.autoplay && loop.loop && loop.muted && loop.playsInline);
        await key("Enter", "Enter");
        assert.equal(ui.getState().screen, "mode_select");
        await reset();
        await act(async () =>
          preferences.getState().update({ reducedMotion: true }),
        );
        assert.equal(document.querySelector(".main-menu video"), null);
        await button(13);
        assert.equal(ui.getState().getActiveMenuIndex(), 1);
        await act(async () =>
          preferences.getState().update({ reducedMotion: false }),
        );
        assert.ok(document.querySelector(".main-menu .menu-flare-background"));
        assert.ok(document.querySelector(".main-menu video"));
      },
    );
    await t.test(
      "every main-menu entry has the same selected theme for mouse and controller",
      async () => {
        await reset();
        let theme;
        for (let index = 0; index < MAIN_MENU_ITEMS.length; index++) {
          const element = document.querySelectorAll('[role="button"]')[index];
          await act(async () =>
            element.dispatchEvent(
              new dom.window.MouseEvent("pointerover", { bubbles: true }),
            ),
          );
          assert.equal(ui.getState().getActiveMenuIndex(), index);
          assert.equal(element.dataset.selected, "true");
          if (index === 0) theme = element.className;
          else
            assert.equal(
              element.className,
              theme,
              `row ${index} should use the Sandbox theme`,
            );
        }
        assert.deepEqual(
          MAIN_MENU_ITEMS.map((item) => item.id),
          ["play", "explore", "heroes", "career", "social", "settings"],
        );
        await button(12);
        assert.equal(
          document.querySelector('[data-selected="true"]').className,
          theme,
        );
      },
    );
    const pointerPress = async (element) => {
      assert.ok(element);
      await act(async () => {
        element.dispatchEvent(
          new dom.window.MouseEvent("pointerover", { bubbles: true }),
        );
        element.dispatchEvent(
          new dom.window.MouseEvent("pointerup", { bubbles: true, button: 0 }),
        );
        // Native shared actions receive the browser click after pointer-up.
        if (element.tagName === "BUTTON") { element.focus(); element.click(); }
      });
    };
    await t.test(
      "Sandbox arrow keys focus vehicle, environment, Start and Exit and wrap without starting",
      async () => {
        assert.equal(
          document.activeElement.getAttribute("aria-label"),
          "Vehicle selection",
        );
        await key("ArrowRight");
        assert.equal(selection.getState().vehicleIndex, 1);
        await key("Enter", "Enter");
        assert.equal(selection.getState().vehicleIndex, 2);
        assert.equal(
          ui.getState().screen,
          "sandbox_setup",
          "Enter adjusts a selector rather than launching",
        );
        await key("ArrowDown");
        assert.equal(
          document.activeElement.getAttribute("aria-label"),
          "Environment selection",
        );
        await key("ArrowRight");
        assert.equal(ui.getState().screen, "sandbox_setup");
        await key("ArrowDown");
        assert.match(document.activeElement.textContent, /START/);
        await key("ArrowLeft");
        await key("ArrowRight");
        assert.equal(ui.getState().screen, "sandbox_setup");
        await key("ArrowDown");
        assert.match(document.activeElement.textContent, /EXIT/);
        await key("ArrowDown");
        assert.equal(
          document.activeElement.getAttribute("aria-label"),
          "Vehicle selection",
        );
        await key("ArrowUp");
        assert.match(document.activeElement.textContent, /EXIT/);
        await key("Enter", "Enter");
        assert.equal(ui.getState().screen, "main");
      },
    );
    await t.test(
      "Sandbox Exit works as a controller choice, B shortcut, Escape and mouse action",
      async () => {
        await reset("sandbox_setup");
        await button(13);
        await button(13);
        await button(13);
        assert.match(document.activeElement.textContent, /EXIT/);
        await button(0);
        assert.equal(ui.getState().screen, "main");
        await reset("sandbox_setup");
        await button(1);
        assert.equal(ui.getState().screen, "main");
        await reset("sandbox_setup");
        await key("Escape", "Escape");
        assert.equal(ui.getState().screen, "main");
        await reset("sandbox_setup");
        await pointerPress(document.querySelector('[data-sandbox-choice="3"]'));
        assert.equal(ui.getState().screen, "main");
      },
    );
    await t.test("focused Play header Back receives Enter without starting matchmaking", async () => {
      await reset("mode_select");
      const back = document.querySelector(".menu-frame-title [data-header-back]");
      assert(back);
      await act(async () => back.focus());
      await key("Enter", "Enter");
      assert.equal(ui.getState().screen, "main");
    });
    await t.test(
      "tab changes keep one viewport shell, pin navigation and reset only the content scroll",
      async () => {
        for (const [screen, names] of [
          ["missions", ["Overview", "Objectives", "Logistics", "Squad roles"]],
          [
            "career",
            [
              "Statistics",
              "History",
              "Leaderboard",
              "Favorites",
              "Customize",
              "Achievements",
            ],
          ],
          [
            "settings",
            [
              "Display",
              "HUD",
              "Drivetrain",
              "Audio",
              "Keyboard",
              "Controller",
              "Social",
              "Other",
              "Accessibility",
              "Garage",
            ],
          ],
        ]) {
          await reset(screen);
          const shell = document.querySelector('[role="dialog"]');
          const header = shell.querySelector("header");
          const footer = shell.querySelector("footer");
          const content = shell.querySelector('[role="tabpanel"]');
          assert.ok(shell.classList.contains("h-full"));
          assert.ok(shell.classList.contains("w-full"));
          assert.ok(document.querySelector(".tabbed-menu"));
          await click(tab(names.at(-1)));
          for (const name of names) {
            content.scrollTop = 200;
            await click(tab(name));
            assert.equal(document.querySelector('[role="dialog"]'), shell);
            assert.equal(shell.querySelector("header"), header);
            assert.equal(shell.querySelector("footer"), footer);
            assert.equal(shell.querySelector('[role="tabpanel"]'), content);
            assert.equal(content.scrollTop, 0, `${screen} / ${name}`);
            assert.equal(tab(name).getAttribute("aria-selected"), "true");
          }
        }
      },
    );
    await t.test(
      "Settings and Leave hover/click select their actual pause rows",
      async () => {
        for (const target of ["settings", "leave_game"]) {
          await reset("sandbox", "pause");
          const index = PAUSE_MENU_ITEMS.findIndex((item) => item.id === target);
          const element = pauseAction(target);
          await act(async () =>
            element.dispatchEvent(
              new dom.window.MouseEvent("pointerover", { bubbles: true }),
            ),
          );
          assert.equal(ui.getState().getActiveMenuIndex(), index);
          assert.equal(element.dataset.selected, "true");
          await act(async () =>
            element.dispatchEvent(
              new dom.window.MouseEvent("pointerup", {
                bubbles: true,
                button: 0,
              }),
            ),
          );
          assert.equal(ui.getState().overlay, target);
          await key("Escape", "Escape");
          assert.equal(ui.getState().overlay, "pause");
        }
      },
    );
    await t.test(
      "keyboard focus tracks row navigation and Enter opens Settings once",
      async () => {
        await reset("sandbox", "pause");
        await key("KeyQ", "q");
        await key("ArrowDown");
        await key("ArrowDown");
        assert.equal(document.activeElement, pauseAction("settings"));
        await key("Enter", "Enter");
        assert.equal(ui.getState().overlay, "settings");
        assert.equal(
          rendering.getState().dpr,
          1,
          "entering Settings must not also adjust its first row",
        );
      },
    );
    await t.test("the split Game Menu keeps one focus across rails and shows device-specific shortcuts", async () => {
      const previousDevice = preferences.getState().inputDevice;
      try {
        await reset("sandbox");
        await act(async () => preferences.getState().update({ inputDevice: "controller" }));
        await button(9);
        assert.equal(document.activeElement, pauseAction("resume"));
        const footer = document.querySelector(".pause-menu-footer");
        assert.equal(footer.querySelector(".controller-shortcuts kbd").dataset.controllerKey, "MENU");
        assert.equal(footer.querySelectorAll('[data-controller-key="A"]').length, 1);
        assert.ok(pauseAction("resume").querySelector('[data-controller-key="A"]'));
        assert.ok(document.querySelector('.pause-menu-rail[aria-label="Drive"] [data-controller-key="LB"]'));
        assert.ok(document.querySelector('.pause-menu-rail[aria-label="Session"] [data-controller-key="RB"]'));

        await button(4);
        assert.equal(document.activeElement, pauseAction("vehicle_select"));
        await button(13);
        assert.equal(document.activeElement, pauseAction("cockpit"));
        await button(5);
        assert.equal(document.activeElement, pauseAction("career"));
        await button(14);
        assert.equal(document.activeElement, pauseAction("cockpit"));
        await button(13);
        assert.equal(document.activeElement, pauseAction("settings"));
        assert.ok(pauseAction("settings").querySelector(".menu-icon"));
        assert.equal(pauseAction("settings").querySelector("kbd"), null);
        assert.ok(footer.querySelector('.controller-shortcuts [data-controller-key="A"]'));
        assert.equal(pauseAction("resume").querySelector("kbd"), null);

        await button(0);
        assert.equal(ui.getState().overlay, "settings");
        await button(1);
        assert.equal(document.activeElement, pauseAction("settings"));
        await button(1);
        assert.equal(ui.getState().overlay, null);
        await button(9);
        assert.equal(document.activeElement, pauseAction("resume"));

        await act(async () => preferences.getState().update({ inputDevice: "keyboard" }));
        assert.ok(pauseAction("resume").querySelector(".menu-icon"));
        assert.equal(pauseAction("resume").querySelector("kbd"), null);
        assert.ok(document.querySelector('.pause-menu-footer .controller-shortcuts:last-child [data-keyboard-key="Enter"]'));
        assert.equal(document.querySelector(".pause-menu [data-controller-key]"), null);
        await act(async () => preferences.getState().update({ inputDevice: "touch" }));
        assert.equal(document.querySelector(".pause-menu kbd"), null);
        assert.ok(pauseAction("resume").querySelector(".menu-icon"));
        await click(document.querySelector(".pause-menu-heading [data-header-back]"));
        assert.equal(ui.getState().overlay, null);
      } finally {
        await act(async () => preferences.getState().update({ inputDevice: previousDevice }));
      }
    });
    await t.test(
      "controller in a nonzero slot navigates rows, tabs, values and Back",
      async () => {
        await reset();
        const settingsIndex = MAIN_MENU_ITEMS.findIndex(
          (item) => item.id === "settings",
        );
        for (let index = 0; index < settingsIndex; index++) await button(13);
        assert.equal(ui.getState().getActiveMenuIndex(), settingsIndex);
        await button(0);
        assert.equal(ui.getState().screen, "settings");
        assert.equal(tab("Display").getAttribute("aria-selected"), "true");
        await button(15);
        assert.equal(rendering.getState().dpr, 1.5);
        await button(5);
        assert.equal(tab("HUD").getAttribute("aria-selected"), "true");
        await button(5);
        assert.equal(tab("Drivetrain").getAttribute("aria-selected"), "true");
        await button(4);
        assert.equal(tab("HUD").getAttribute("aria-selected"), "true");
        await button(1);
        assert.equal(ui.getState().screen, "main");
      },
    );
    await t.test(
      "all settings categories open, key remapping is saved and driving remains blocked in menus",
      async () => {
        await reset("settings");
        for (const name of [
          "Display",
          "HUD",
          "Drivetrain",
          "Audio",
          "Keyboard",
          "Controller",
          "Social",
          "Other",
          "Accessibility",
          "Garage",
        ]) {
          await click(tab(name));
          assert.equal(tab(name).getAttribute("aria-selected"), "true");
        }
        await click(tab("Keyboard"));
        await click(row("forward"));
        await key("KeyK", "k");
        assert.equal(preferences.getState().bindings.forward, "KeyK");
        assert.equal(
          JSON.parse(localStorage.getItem("avenlab-preferences-v1")).state
            .bindings.forward,
          "KeyK",
        );
        await key("KeyK", "k");
        assert.equal(inputs.getState().input.throttle, 0);
        await click(tab("Controller"));
        await click(row("deadzone"));
        assert.equal(preferences.getState().controllerDeadzone, 0.2);
        await click(tab("Accessibility"));
        await click(row("contrast"));
        assert.equal(preferences.getState().highContrast, true);
        const savedDpr = rendering.getState().dpr;
        await act(async () => rendering.getState().startSandbox());
        assert.equal(rendering.getState().dpr, savedDpr);
      },
    );
    await t.test(
      "garage effects support mouse, keyboard and controller, persist partial edits and leave driving graphics alone",
      async () => {
        const { DEFAULT_GARAGE_EFFECTS } = await load(
          "store/preferences/garageEffects.ts",
        );
        const { sanitizePreferences } = await load(
          "store/preferences/preferencesStore.ts",
        );
        assert.deepEqual(
          sanitizePreferences({}).garageEffects,
          DEFAULT_GARAGE_EFFECTS,
        );
        await act(async () =>
          preferences.getState().update({
            highContrast: false,
            garageEffects: { ...DEFAULT_GARAGE_EFFECTS },
          }),
        );
        const drivingGraphics = rendering.getState(),
          theme = preferences.getState().theme;
        await reset("settings");
        await click(tab("Garage"));
        await act(async () => row("garage-bloomStrength").focus());
        await key("ArrowRight");
        assert.equal(preferences.getState().garageEffects.bloomStrength, 0.75);
        await button(15);
        assert.equal(preferences.getState().garageEffects.bloomStrength, 1);
        await button(14);
        assert.equal(preferences.getState().garageEffects.bloomStrength, 0.75);
        await click(row("garage-accentBrightness"));
        assert.equal(
          preferences.getState().garageEffects.accentBrightness,
          1.5,
        );
        assert.equal(
          preferences.getState().garageEffects.bloomStrength,
          0.75,
          "editing one field preserves the rest",
        );
        const saved = JSON.parse(localStorage.getItem("avenlab-preferences-v1"))
          .state.garageEffects;
        assert.equal(saved.accentBrightness, 1.5);
        assert.equal(saved.bloomStrength, 0.75);
        await act(async () => preferences.persist.rehydrate());
        assert.deepEqual(preferences.getState().garageEffects, saved);
        await click(row("garage-bloom"));
        assert.equal(preferences.getState().garageEffects.bloom, false);
        assert.equal(row("garage-bloomStrength").disabled, true);
        await click(row("garage-reset"));
        assert.deepEqual(
          preferences.getState().garageEffects,
          DEFAULT_GARAGE_EFFECTS,
        );
        await act(async () =>
          preferences.getState().update({ highContrast: true }),
        );
        assert.equal(row("garage-bloom").disabled, true);
        await act(async () =>
          preferences.getState().update({ highContrast: false }),
        );
        assert.equal(preferences.getState().theme, theme);
        assert.deepEqual(rendering.getState(), drivingGraphics);
      },
    );
    await t.test(
      "view distance and interpolation share saved mouse, keyboard and controller controls with Debugger",
      async () => {
        const { useDebugViewStore: debug } = await load(
          "store/presentation/debugViewStore.ts",
        );
        await act(async () =>
          rendering
            .getState()
            .update({ cityQuality: "fast", cityViewDistance: "auto" }),
        );
        await reset("settings");
        await click(tab("Display"));
        await act(async () => row("city-view-distance").focus());
        await click(row("city-view-distance"));
        assert.equal(rendering.getState().cityViewDistance, 250);
        await key("ArrowRight");
        assert.equal(rendering.getState().cityViewDistance, 500);
        await button(15);
        assert.equal(rendering.getState().cityViewDistance, 750);
        await button(0);
        assert.equal(rendering.getState().cityViewDistance, 1000);
        assert.equal(
          JSON.parse(localStorage.getItem("avenlab-display-v1")).state
            .cityViewDistance,
          1000,
        );
        await key("ArrowRight");
        assert.equal(rendering.getState().cityViewDistance, "auto");
        await key("ArrowLeft");
        assert.equal(rendering.getState().cityViewDistance, 1000);
        assert.match(row("interpolation").textContent, /On.*50 ms/);
        await click(row("interpolation"));
        assert.equal(debug.getState().interpolationEnabled, false);
        await reset("sandbox", "debug_menu");
        await click(tab("Rendering"));
        assert.match(row("interpolation").textContent, /Off/);
        assert.match(row("city-view-distance").textContent, /1000 m/);
        await click(row("interpolation"));
        assert.equal(debug.getState().interpolationEnabled, true);
        await click(row("city-view-distance"));
        assert.equal(rendering.getState().cityViewDistance, "auto");
        await act(async () =>
          rendering.getState().update({ cityQuality: "original" }),
        );
        assert.equal(row("city-view-distance").disabled, true);
        assert.match(row("city-view-distance").textContent, /All loaded/);
        await act(async () =>
          rendering.getState().update({ cityQuality: "fast" }),
        );
      },
    );
    await t.test(
      "remapped throttle and tuned steering reach driving input and menus release both",
      async () => {
        await reset("sandbox");
        await act(
          async () => new Promise((resolve) => setTimeout(resolve, 40)),
        );
        await key("KeyW", "w");
        assert.equal(inputs.getState().input.throttle, 0);
        await key("KeyK", "k");
        assert.equal(inputs.getState().input.throttle, 1);
        await act(async () =>
          document.activeElement.dispatchEvent(
            new dom.window.KeyboardEvent("keyup", {
              code: "KeyK",
              key: "k",
              bubbles: true,
            }),
          ),
        );
        assert.equal(inputs.getState().input.throttle, 0);
        await act(async () => {
          preferences
            .getState()
            .update({ steeringSensitivity: 1.25, invertSteering: true });
          pad.axes[0] = 0.1;
          await new Promise((resolve) => setTimeout(resolve, 40));
        });
        assert.equal(Math.abs(inputs.getState().input.steer), 0);
        await act(async () => {
          pad.axes[0] = 0.6;
          await new Promise((resolve) => setTimeout(resolve, 40));
        });
        assert.equal(inputs.getState().input.steer, -0.75);
        await key("Escape", "Escape");
        assert.equal(ui.getState().overlay, "pause");
        assert.equal(inputs.getState().input.steer, 0);
        pad.axes[0] = 0;
      },
    );
    await t.test(
      "career favorites persist while unconnected career pages stay empty",
      async () => {
        await reset("career");
        await click(tab("Favorites"));
        await click(row("brz"));
        assert.deepEqual(preferences.getState().favoriteVehicles, ["brz"]);
        assert.deepEqual(
          JSON.parse(localStorage.getItem("avenlab-preferences-v1")).state
            .favoriteVehicles,
          ["brz"],
        );
        for (const name of [
          "Statistics",
          "History",
          "Leaderboard",
          "Customize",
          "Achievements",
        ]) {
          await click(tab(name));
          assert.equal(tab(name).getAttribute("aria-selected"), "true");
        }
      },
    );
    await t.test(
      "debug controls remain functional in their new tabs and do not leak into the background menu",
      async () => {
        await reset("sandbox", "debug_menu");
        await click(row("debug-1"));
        const { useWorldStore } = await load("store/world/worldStore.ts");
        assert.equal(useWorldStore.getState().debugMask & 1, 1);
        await click(tab("Vehicles & GLBs"));
        assert.ok(row("vehicle-default"));
        assert.equal(row("debug-1"), null);
        await click(tab("Environment"));
        assert.ok(row("environment-default"));
        await click(tab("Rendering"));
        await click(row("overlay"));
        assert.equal(rendering.getState().overlay, true);
        await click(tab("Captures"));
        assert.ok(row("csv"));
        assert.ok(row("json"));
        await button(1);
        assert.equal(ui.getState().overlay, "pause");
      },
    );
    await t.test(
      "opening Debugger with a held stick cannot change diagnostics, and streams require explicit activation",
      async () => {
        const { useWorldStore: world } = await load(
          "store/world/worldStore.ts",
        );
        await reset("sandbox");
        await act(async () => world.getState().setDebugMask(5));
        pad.axes[0] = -0.9;
        await key("F2");
        await act(async () =>
          row("all-streams").dispatchEvent(
            new dom.window.MouseEvent("pointerover", { bubbles: true }),
          ),
        );
        await act(
          async () => new Promise((resolve) => setTimeout(resolve, 300)),
        );
        assert.equal(
          world.getState().debugMask,
          5,
          "a steering stick held before entry cannot alter the focused stream row",
        );
        pad.axes[0] = 0;
        await act(
          async () => new Promise((resolve) => setTimeout(resolve, 40)),
        );
        await button(14);
        assert.equal(
          world.getState().debugMask,
          5,
          "horizontal navigation is not confirmation",
        );
        await button(0);
        assert.equal(
          world.getState().debugMask,
          127,
          "a fresh A press explicitly enables all streams",
        );
        await act(async () =>
          row("all-streams").dispatchEvent(
            new dom.window.MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              detail: 1,
            }),
          ),
        );
        assert.equal(
          world.getState().debugMask,
          127,
          "a pointer release/click without a press on this panel is ignored",
        );
        await act(async () => {
          row("all-streams").dispatchEvent(
            new dom.window.MouseEvent("pointerdown", {
              bubbles: true,
              button: 0,
            }),
          );
          row("all-streams").dispatchEvent(
            new dom.window.MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              detail: 1,
            }),
          );
        });
        assert.equal(
          world.getState().debugMask,
          0,
          "an intentional pointer press and click toggles once",
        );
      },
    );
    await t.test(
      "F2 and F3 toggle the debugger and readout, and the readout has a working close button",
      async () => {
        await reset("sandbox");
        await act(async () => rendering.getState().update({ overlay: false }));
        await key("F3");
        assert.equal(rendering.getState().overlay, true);
        await key("F3", "F3", { repeat: true });
        assert.equal(rendering.getState().overlay, true);
        await key("F3");
        assert.equal(rendering.getState().overlay, false);
        await key("F3");
        await click(
          document.querySelector('[aria-label="Close performance overlay"]'),
        );
        assert.equal(rendering.getState().overlay, false);
        await key("F2");
        assert.equal(ui.getState().overlay, "debug_menu");
        await key("F2");
        assert.equal(ui.getState().overlay, null);
        await key("F2");
        await key("Escape");
        assert.equal(ui.getState().overlay, null);
        await reset("sandbox", "pause");
        await key("F2");
        assert.equal(ui.getState().overlay, "debug_menu");
        await key("F2");
        assert.equal(ui.getState().overlay, "pause");
        await reset("sandbox");
        const field = document.createElement("input");
        document.body.append(field);
        field.focus();
        await key("F2");
        await key("F3");
        assert.equal(ui.getState().overlay, null);
        assert.equal(rendering.getState().overlay, false);
        field.remove();
        await act(async () => ui.setState({ isModeLoading: true }));
        await key("F2");
        await key("F3");
        assert.equal(ui.getState().overlay, null);
        assert.equal(rendering.getState().overlay, false);
      },
    );
    await t.test(
      "directional input cannot confirm leave or launch an available mission",
      async () => {
        await reset("sandbox", "leave_game");
        const dialog = document.activeElement;
        assert.equal(dialog.getAttribute("role"), "alertdialog");
        await button(13);
        await button(14);
        assert.equal(document.activeElement, dialog);
        assert.equal(document.querySelector("[data-selected]"), null);
        assert.equal(ui.getState().overlay, "leave_game");
        await button(1);
        assert.equal(ui.getState().overlay, "pause");
        await reset("missions");
        await button(15);
        assert.equal(ui.getState().screen, "missions");
        await button(1);
        assert.equal(ui.getState().screen, "main");
      },
    );
    await t.test(
      "H and the pause action open an in-game picker; confirmed swaps keep the same connection and reject errors",
      async () => {
        const original = globalThis.WebSocket;
        class FakeSocket extends dom.window.EventTarget {
          static OPEN = 1;
          static CONNECTING = 0;
          readyState = 0;
          bufferedAmount = 0;
          closed = false;
          sent = [];
          close() {
            this.closed = true;
            this.readyState = 3;
            this.onclose?.();
            this.dispatchEvent(new dom.window.Event("close"));
          }
          send(data) {
            this.sent.push(JSON.parse(data));
          }
          receive(message) {
            const event = new dom.window.MessageEvent("message", {
              data: JSON.stringify(message),
            });
            this.onmessage?.(event);
            this.dispatchEvent(event);
          }
        }
        globalThis.WebSocket = FakeSocket;
        const transport = await load("net/rustSocket.ts");
        try {
          const connection = transport.connectRustServer();
          connection.readyState = FakeSocket.OPEN;
          const snapshot = {
            tick: 40,
            entities: [
              {
                id: "live-player",
                vehicle_id: "ae86",
                position: [12, 1, 34],
                rotation: [0, 0, 0, 1],
              },
            ],
          };
          await act(async () =>
            network.setState({
              connected: true,
              playerId: "live-player",
              snapshot,
            }),
          );
          await reset("sandbox");
          const masks = await load("store/input/protocol/inputMasks.ts");
          const before = inputs.getState().input.vehicleMask;
          await key("KeyH", "H", { shiftKey: true });
          assert.equal(ui.getState().overlay, null);
          assert.equal(
            inputs.getState().input.vehicleMask,
            before ^ masks.VehicleFlags.HAZARDS,
          );
          await key(preferences.getState().bindings.forward);
          assert.equal(inputs.getState().input.throttle, 1);
          await key("KeyH", "h");
          assert.equal(ui.getState().overlay, "vehicle_select");
          assert.equal(inputs.getState().input.throttle, 0);
          assert.equal(document.querySelector('[role="tablist"]'), null);
          assert.ok(row("vehicle-brz"));
          await key("Escape", "Escape");
          assert.equal(
            ui.getState().overlay,
            null,
            "H picker returns directly to driving",
          );
          await reset("sandbox", "pause");
          await pointerPress(pauseAction("vehicle_select"));
          assert.equal(ui.getState().overlay, "vehicle_select");
          assert.equal(connection.closed, false);
          await button(1);
          assert.equal(ui.getState().overlay, "pause");
          await key("KeyH", "h");
          await click(row("vehicle-brz"));
          const request = connection.sent.at(-1);
          assert.equal(request.type, "change_vehicle_request");
          assert.equal(request.vehicle, "brz");
          assert.equal(
            ui.getState().overlay,
            "vehicle_select",
            "wait for authoritative confirmation",
          );
          await act(async () =>
            connection.receive({
              type: "vehicle_changed",
              request_id: "stale",
              vehicle: "brz",
            }),
          );
          assert.equal(ui.getState().overlay, "vehicle_select");
          await act(async () =>
            connection.receive({
              type: "vehicle_changed",
              request_id: request.request_id,
              vehicle: "brz",
            }),
          );
          assert.equal(ui.getState().overlay, null);
          assert.equal(ui.getState().screen, "sandbox");
          assert.equal(transport.socket, connection);
          assert.equal(connection.closed, false);
          assert.equal(network.getState().playerId, "live-player");
          assert.equal(
            network.getState().snapshot,
            snapshot,
            "the client does not rewrite authoritative poses/models",
          );
          assert.equal(selection.getState().getSelectedVehicle().id, "brz");
          await key("KeyH", "h");
          await click(row("vehicle-tank"));
          const rejected = connection.sent.at(-1);
          await act(async () =>
            connection.receive({
              type: "vehicle_change_error",
              request_id: rejected.request_id,
              message: "Not enough room for this vehicle.",
            }),
          );
          assert.match(
            document.querySelector('[role="alert"]').textContent,
            /Not enough room/,
          );
          assert.equal(ui.getState().overlay, "vehicle_select");
          assert.equal(network.getState().snapshot, snapshot);
          await button(1);
          assert.equal(ui.getState().overlay, null);
          const input = document.createElement("input");
          document.body.append(input);
          input.focus();
          await key("KeyH", "h");
          assert.equal(
            ui.getState().overlay,
            null,
            "typing H does not open the picker",
          );
          input.remove();
        } finally {
          await act(async () => transport.disconnectRustServer());
          globalThis.WebSocket = original;
        }
      },
    );
    await t.test(
      "Leave shows keys or Xbox glyphs and preserves every cancel shortcut",
      async () => {
        await reset("sandbox", "leave_game");
        assert.ok(document.querySelector('[role="alertdialog"]'));
        assert.equal(document.querySelector('[role="tablist"]'), null);
        assert.equal(document.querySelector("h1").textContent, "LEAVE GAME?");
        assert.match(
          document.querySelector(".menu-confirm-body").textContent,
          /Are you sure you want to leave game\?/,
        );
        assert.equal(document.activeElement.getAttribute("role"), "alertdialog");
        await act(async () => preferences.getState().update({inputDevice:"keyboard"}));
        assert(row("confirm").querySelector('[data-keyboard-key="Enter"]'));
        assert(row("cancel").querySelector('[data-keyboard-key="Esc"]'));
        assert.equal(document.querySelector(".menu-confirm-actions [data-controller-key]"),null);
        await act(async () => preferences.getState().update({inputDevice:"controller"}));
        assert(row("confirm").querySelector('[data-controller-key="A"]'));
        assert(row("cancel").querySelector('[data-controller-key="B"]'));
        assert.equal(document.querySelector(".menu-confirm-actions [data-keyboard-key]"),null);
        const dialog = document.activeElement;
        await key("Tab", "Tab");
        assert.equal(document.activeElement, dialog);
        await key("Enter", "Enter", { repeat: true });
        assert.equal(ui.getState().overlay, "leave_game", "a held opening key cannot confirm");
        await act(async () => row("confirm").focus());
        await button(1);
        assert.equal(ui.getState().overlay, "pause");
        await reset("sandbox", "leave_game");
        await act(async () => row("confirm").focus());
        await key("Escape", "Escape");
        assert.equal(ui.getState().overlay, "pause");
        await reset("sandbox", "leave_game");
        await click(row("cancel"));
        assert.equal(ui.getState().overlay, "pause");
        await reset("sandbox", "leave_game");
        await act(async () => document.querySelector("[data-header-back]").focus());
        await key("Enter", "Enter");
        assert.equal(ui.getState().overlay, "pause", "Enter activates the focused header Back");
        await act(async () => preferences.getState().update({inputDevice:"browser"}));
      },
    );
    await t.test(
      "A, Enter, numpad Enter, Space and pointer Confirm leave once, independent of Cancel focus",
      async () => {
        const original = globalThis.WebSocket;
        class FakeSocket {
          static OPEN = 1;
          static CONNECTING = 0;
          readyState = 0;
          bufferedAmount = 0;
          closed = false;
          close() {
            this.closed = true;
            this.readyState = 3;
            this.onclose?.();
          }
          send() {}
        }
        globalThis.WebSocket = FakeSocket;
        const transport = await load("net/rustSocket.ts");
        try {
          for (const activate of [
            () => key("Enter", "Enter"),
            () => key("NumpadEnter", "Enter"),
            () => key("Space", " "),
            () => button(0),
            () => click(row("confirm")),
          ]) {
            const old = transport.connectRustServer();
            await reset("sandbox", "leave_game");
            await act(async () => row("cancel").focus());
            await activate();
            assert.equal(old.closed, true);
            assert.equal(ui.getState().screen, "main");
            assert.equal(ui.getState().overlay, null);
            assert.notEqual(transport.socket, old);
          }
        } finally {
          transport.disconnectRustServer();
          globalThis.WebSocket = original;
        }
      },
    );
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
