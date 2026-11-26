import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createServer } from "vite";

test("welcome picks a personality and gender before registration and lets returning players pick a saved character", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url:"http://localhost/", pretendToBeVisual:true, runScripts:"outside-only" });
  const previous = new Map();
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "FormData", "Event", "CustomEvent", "localStorage", "sessionStorage"]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{ configurable:true, value:key === "window" ? dom.window : dom.window[key] });
  }
  previous.set("IS_REACT_ACT_ENVIRONMENT",Object.getOwnPropertyDescriptor(globalThis,"IS_REACT_ACT_ENVIRONMENT"));
  Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{ configurable:true, value:true });
  const vite=await createServer({mode:process.env.VITE_DEPLOY_ENV || "development",
    server:{middlewareMode:true,hmr:false,ws:false},appType:"custom",logLevel:"error"});
  const { createRoot }=await import("react-dom/client");
  const root=createRoot(document.getElementById("root"));
  try {
    const { WelcomeScreen } = await vite.ssrLoadModule("/src/game/welcome/WelcomeScreen.tsx");
    const { useUIStore: ui } = await vite.ssrLoadModule("/src/store/menus/uiStore.ts");
    const { useSelectionStore: vehicles } = await vite.ssrLoadModule("/src/store/selection/selectionStore.ts");
    const { useSocialStore: social, selectEquippedCharacter } = await vite.ssrLoadModule("/src/store/social/socialStore.ts");
    const { CHARACTER_STYLES, styleLook } = await vite.ssrLoadModule("/src/game/characters/characterStyles.ts");
    const { isEquippableOutfit } = await vite.ssrLoadModule("/src/game/characters/characterCatalog.ts");
    const { listenForMenuInput, reportMenuDevice }=await vite.ssrLoadModule("/src/controls/activeMenuDevice.ts");
    const { useTextKeyboardStore: keyboard }=await vite.ssrLoadModule("/src/store/text/keyboardStore.ts");
    const client=await vite.ssrLoadModule("/src/net/socialClient.ts");
    const sent=[];
    const token="a".repeat(64);
    const socket={ url:"wss://api-staging.avensky.test/ws/", readyState:WebSocket.OPEN, send:body=>sent.push(JSON.parse(body)) };
    const view={profile:{id:"registered-player",name:"Lightfoot",active_character_id:null,characters:[],
      progression:{character:null,cosmetics_revision:0}},
      limits:{max_active_worlds:2},players:[],teammates:[],requests:[],groups:[],worlds:[],world_invites:[],maps:[],current_world_id:null};
    const reply=(request,data,ok=true,message)=>client.receiveSocialResult({request_id:request.request_id,ok,data,message});
    const button=label=>[...document.querySelectorAll("button,[role=button]")].find(button=>(button.getAttribute("aria-label") ?? button.textContent.trim()) === label);
    const disabled=control=>control.matches(":disabled,[aria-disabled=true]");
    const panelAction=detail=>window.dispatchEvent(new CustomEvent("avenlab:panel-action",{detail}));
    const submit=()=>document.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    const typeName=name=>{
      const input=document.querySelector('[name="characterName"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(input,name);
      input.dispatchEvent(new Event("input",{bubbles:true}));
    };

    for (const style of CHARACTER_STYLES)
      for (const body of ["female","male"]) assert.ok(isEquippableOutfit(styleLook(style,body)),style.name);
    const beforeVehicle=vehicles.getState().getSelectedVehicle().id;
    const fox=styleLook(CHARACTER_STYLES.find(style=>style.id==="night-shift"),"male");
    await act(async()=>{
      client.setSocialConnection(socket);
      client.beginSocialSession("onboarding-test",undefined,true);
      ui.setState({screen:"welcome"});
      root.render(createElement(WelcomeScreen));
    });
    const header=document.querySelector(".garage-entry-header");
    assert.ok(header);
    assert.equal(document.querySelector(".garage-entry-brand img").getAttribute("src"),"/images/logo.svg");
    assert.equal(document.querySelector("video,canvas"),null);
    assert.ok(button("Sign in"));
    assert.equal(button("Play as guest"),undefined);
    assert.equal(button("Profile"), undefined);
    assert.equal(document.querySelector(".garage-entry-header nav"),null);
    assert.equal(button("Log out"),undefined);
    await act(async () => social.setState({ profileStatus: "restoring" }));
    assert.equal(button("Sign in"), undefined);
    assert.equal(button("Sign up"), undefined);
    assert.match(document.querySelector('.garage-notices [role="status"]').textContent, /Loading your characters/);
    assert.equal(document.querySelector(".garage-entry-card"), null, "pending character data needs no empty menu panel");
    assert.equal(document.querySelector(".garage-entry-brand"), null, "a profile handoff does not show a second login badge");
    assert.equal(button("Reconnect"), undefined, "a normal handoff has no recovery action");
    await act(async () => social.setState({ entryIssue: { kind: "other-tab" } }));
    assert.match(document.querySelector(".garage-notices").textContent, /another tab/);
    assert.equal(document.activeElement, button("Reconnect"), "controller can retry without leaving the garage");
    await act(async () => social.setState({ entryIssue: null }));
    await act(async () => social.setState({ profileStatus: "idle" }));
    assert.ok(document.querySelector(".garage-entry-brand img"), "returning to sign-in restores the login badge");
    await act(async()=>button("Sign up").click());
    assert.equal(document.querySelector("select"),null);
    assert.equal(disabled(button("Continue")),true);
    await act(async()=>button("Male").click());
    const style=[...document.querySelectorAll(".welcome-character")].find(card=>card.textContent.includes("Night Shift"));
    await act(async()=>style.click());
    await act(async()=>document.querySelector('[name="characterName"]').focus());
    assert.ok(document.activeElement.closest("[data-controller-form]"), "the gamepad can navigate while a field is focused");
    await act(async()=>panelAction("activate"));
    assert.ok(keyboard.getState().session);
    await act(async()=>{keyboard.getState().edit("Track Fox"); keyboard.getState().close();});
    assert.equal(document.querySelector('[name="characterName"]').value,"Track Fox");
    assert.equal(disabled(button("Continue")),false);
    await act(async()=>submit());
    assert.equal(sent.length,0,"draft stays local until the player registers");
    assert.equal(button("Play as guest"),undefined);
    assert.ok(document.querySelector(".garage-entry-brand img"), "registration is part of account entry");
    const form=document.querySelector("form");
    form.elements.login.value="lightfoot@example.net";
    form.elements.password.value="a staging passphrase for test";
    await act(async()=>submit());
    const register=sent.at(-1);
    assert.equal(register.action,"account_register");
    assert.equal(register.login,"lightfoot@example.net");
    assert.equal(ui.getState().screen,"welcome");
    await act(async()=>{
      reply(register,{profile_id:"registered-player",name:"Lightfoot",token,account:true});
      client.receiveSocialState(view);
    });
    const create=sent.at(-1);
    assert.equal(create.action,"character_create");
    assert.equal(create.name,"Track Fox");
    assert.equal(create.style,"night-shift");
    assert.equal(create.body,"male");
    assert.equal(create.vehicle,undefined);
    assert.equal(ui.getState().screen,"welcome");
    await act(async()=>reply(create,{},false,"That character name is already in use on this server."));
    assert.match(document.querySelector('[role="alert"]').textContent,/already in use/);
    assert.equal(ui.getState().screen,"welcome");
    assert.equal(document.querySelector('[name="characterName"]').value,"Track Fox");
    await act(async()=>typeName("Track Fox II"));
    await act(async()=>submit());
    assert.equal(sent.at(-1).name,"Track Fox II");
    assert.equal(sent.filter(request=>request.action==="account_register").length,1);
    const saved={...view.profile,name:"Track Fox II",active_character_id:"registered-player",
      characters:[{id:"registered-player",name:"Track Fox II",style:"night-shift",level:1,appearance:fox}],
      progression:{character:fox,cosmetics_revision:1}};
    await act(async()=>reply(sent.at(-1),{profile:saved}));
    assert.equal(ui.getState().screen,"welcome","creating a character returns to the roster for explicit entry");
    assert.equal(document.querySelector("[data-character-id][aria-pressed=true]").dataset.characterId,"registered-player");
    assert.equal(sent.filter(request=>request.action==="character_select").length,0);
    assert.equal(vehicles.getState().getSelectedVehicle().id,beforeVehicle);
    assert.deepEqual(selectEquippedCharacter(social.getState()),fox);
    assert.equal(JSON.parse(localStorage.getItem("avenlab-social-profile-v1:onboarding-test")).token,token);
    assert.doesNotMatch(JSON.stringify(localStorage),/passphrase/);

    await act(async()=>{
      ui.setState({screen:"welcome"});
      social.setState({view:null,profileStatus:"idle"});
      root.render(createElement(WelcomeScreen,{key:"returning"}));
    });
    // The local browser uses this same standalone helper from /images.
    dom.window.eval(await readFile(new URL("../public/images/sign-in-navigation.js", import.meta.url), "utf8"));
    const destinations = [];
    window.addEventListener("avensky:entry-view", event => destinations.push(event.detail));
    const loginForm=document.querySelector("form");
    loginForm.elements.login.value="lightfoot@example.net";
    loginForm.elements.password.value="a staging passphrase for test";
    await act(async()=>submit());
    const rejected = sent.at(-1);
    assert.equal(rejected.action, "account_login");
    assert.equal(loginForm.isConnected, true, "the real form stays mounted during authentication");
    await act(async () => reply(rejected, {}, false, "That email or password is incorrect."));
    assert.match(document.querySelector('[role="alert"]').textContent, /incorrect/);
    assert.equal(loginForm.elements.login.value, "lightfoot@example.net");
    assert.equal(loginForm.elements.password.value, "a staging passphrase for test");
    assert.equal(document.querySelector("#garage-entry-handoff"), null);
    assert.deepEqual(destinations, [], "a rejected login never announces a destination");

    await act(async()=>submit());
    const login=sent.at(-1);
    assert.equal(login.action,"account_login");
    await act(async()=>reply(login,{profile_id:"registered-player",name:"Track Fox II",token,account:true}));
    assert.equal(loginForm.isConnected, true, "confirmation alone has no destination to show");
    assert.equal(document.querySelector("#garage-entry-handoff"), null);
    await act(async()=>{
      const hub = {
        id:7, name:"Shared world", map:"road_precision", owner_id:null, listed:true, locked:false,
        walkable:true, active:true, players:0, max_players:6, invite_code:null, members:[],
      };
      client.receiveSocialState({...view, main_world_id:hub.id, worlds:[hub], profile:{...saved,characters:[
        {...saved.characters[0],id:"second",name:"Nova"},
        saved.characters[0],
      ]}});
    });
    const outgoing = document.getElementById("garage-entry-handoff");
    assert(outgoing?.inert && outgoing.getAttribute("aria-hidden") === "true");
    assert.equal(outgoing.querySelector("input,button,form,[name]"), null, "the outgoing face contains no credential controls");
    assert.doesNotMatch(outgoing.innerHTML, /lightfoot@example|staging passphrase/);
    assert.equal(loginForm.isConnected, false);
    assert.equal(destinations.length, 1, "one ready event transfers ownership to the local roster");
    assert(["ready", "roster"].includes(destinations[0]));
    window.dispatchEvent(new Event("avensky:roster-framing"));
    await act(async () => {
      await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    });
    outgoing.dispatchEvent(new Event("animationend"));
    assert.equal(document.querySelector("#garage-entry-handoff"), null);
    const { currentOpenWorld } = await vite.ssrLoadModule("/src/game/social/openWorld.ts");
    assert.equal(currentOpenWorld(social.getState().view)?.id, 7);
    assert.equal(document.querySelector('[name="characterName"]'),null);
    assert.match(document.querySelector('[data-character-id][aria-pressed=true]').textContent,/Track Fox/);
    assert.equal(document.querySelector("h1"), null, "saved character selection has no redundant heading");
    assert.ok(document.querySelector(".welcome-character-details"), "profile details accompany a larger portrait");
    assert.ok(button("Log out"));
    assert.ok(button("Create character"));
    const stopInput=listenForMenuInput();
    try {
      await act(async()=>reportMenuDevice("controller"));
      assert.ok(document.querySelector('.roster-enter [data-controller-key="A"]'));
      assert.ok(document.querySelector('.roster-rotate [data-controller-key="RS"]'));
      const touch=new Event("pointerdown",{bubbles:true});
      Object.defineProperty(touch,"pointerType",{value:"touch"});
      await act(async()=>document.body.dispatchEvent(touch));
      assert.equal(document.querySelector('.roster-enter [data-controller-key="A"]'),null);
      assert.equal(document.querySelector(".character-roster").dataset.inputDevice,"touch");
      await act(async()=>window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowRight"})));
      assert.equal(document.querySelector(".character-roster").dataset.inputDevice,"keyboard");
    } finally { stopInput(); }
    const previewRequests=sent.length;
    await act(async()=>button("Nova").click());
    assert.equal(button("Nova").getAttribute("aria-pressed"),"true");
    assert.equal(sent.length,previewRequests,"touch preview sends no character or gameplay action");
    await act(async()=>button("Nova").focus());
    await act(async()=>panelAction("down"));
    assert.equal(document.activeElement,button("Track Fox II"),"D-pad follows the landscape roster rows");
    assert.equal(button("Track Fox II").getAttribute("aria-pressed"),"true");
    assert.equal(sent.length,previewRequests,"controller focus previews without changing the saved character");
    assert.equal(document.querySelector(".roster-preview-tools [role=button]"),null,"the rotation hint does not add a controller stop");
    await act(async()=>panelAction("activate"));
    const select=sent.at(-1);
    assert.equal(select.action,"character_select");
    assert.equal(select.character_id,"registered-player");
    assert.equal(ui.getState().screen,"welcome");
    await act(async()=>reply(select,{profile:saved}));
    assert.equal(ui.getState().screen,"main","confirming a character opens the menu even with a shared world available");
    assert.equal(sent.some(request=>request.action==="world_join"),false);
    assert.deepEqual(selectEquippedCharacter(social.getState()),fox);
    const previouslySent = sent.length;
    await act(async () => {
      localStorage.setItem("avenlab-social-profile-v1:unified-test", JSON.stringify({ id: "older-device", token, name: "Older guest" }));
      client.setSocialConnection(socket);
      client.beginSocialSession("unified-test", undefined, true, true, true);
      ui.setState({ screen: "welcome" });
      root.render(createElement(WelcomeScreen, { key: "shared-sign-in" }));
      client.receiveSocialState({ ...view, profile: saved });
    });
    assert.equal(sent.length, previouslySent, "a staged session skips old device credentials and a second login");
    assert.equal(button("Sign in"), undefined);
    assert.match(document.querySelector(".welcome-character").textContent, /Track Fox/);
    assert.deepEqual(selectEquippedCharacter(social.getState()), fox);
    await act(async () => client.receiveSocialState({...view, profile:{...saved,
      characters:Array.from({length:4},(_,i)=>({...saved.characters[0], id:i===0?saved.active_character_id:"slot"+i}))}}));
    assert.equal(button("Create character"),undefined,"a full registered account has four real slots");
    await act(async () => client.receiveSocialState({ ...view, profile: { ...view.profile, id: "new-staging-player" } }));
    assert.equal(document.querySelector('[name="characterName"]'),null);
    assert.equal(disabled(button("Enter world")),true);
    assert.ok(button("Create character"));
    await act(async()=>button("Create character").click());
    assert.ok(document.querySelector('[name="characterName"]'));
    await act(async()=>button("Back").click());
    assert.ok(button("Log out"));
    const headerActions=document.querySelector(".garage-entry-header nav[data-controller-row]");
    assert.equal(document.querySelector(".garage-entry-brand"),null,"the signed-in roster uses the account tabs only");
    assert.deepEqual([...headerActions.querySelectorAll("[role=button]")].map(tab=>tab.getAttribute("aria-label")),["Log out","Profile"]);
    assert.equal(headerActions.querySelector("button"),null);
    assert.equal(button("Profile").getAttribute("aria-pressed"),"false");
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ email: "tester@example.net", admin: false, hasMfa: true });
    try {
      await act(async () => button("Create character").focus());
      await act(async () => panelAction("up"));
      assert.equal(document.activeElement,button("Log out"));
      await act(async () => panelAction("right"));
      assert.equal(document.activeElement,button("Profile"));
      await act(async () => {
        panelAction("activate");
        await vite.ssrLoadModule("/src/game/characters/GarageProfilePanel.tsx");
      });
      assert.equal(document.querySelector(".garage-entry-header nav"),headerActions);
      assert.equal(document.querySelector(".garage-entry-brand"),null,"opening the profile preserves the unbranded header");
      assert.equal(button("Profile").getAttribute("aria-pressed"),"true");
      assert.equal(document.querySelectorAll('[aria-label="Log out"]').length,1);
      const settings = document.querySelector('[aria-label="Account settings"]');
      assert.ok(settings);
      assert.match(settings.textContent, /Profile/);
      assert.ok(![...settings.querySelectorAll("button")].some(row=>row.textContent==="Log out"));
      assert.equal(settings.querySelector('input[type="password"]'), null);
      const row = label => [...settings.querySelectorAll("[data-profile-setting]")].find(item => item.textContent.startsWith(label));
      await act(async () => row("Email").click());
      settings.querySelector('input[type="password"]').value = "unsent";
      await act(async () => row("Delete account").click());
      assert.equal(settings.querySelector('input[name="newEmail"]'), null);
      assert.equal(settings.querySelector('input[type="password"]').value, "");
      await act(async () => panelAction("back"));
      assert.equal(settings.querySelector('[aria-expanded="true"]'), null);
      assert.equal(document.activeElement, row("Delete account"));
      await act(async () => panelAction("back"));
      assert.ok(button("Create character"));
      await act(async () => ui.getState().setScreen("welcome", "account"));
      assert.ok(document.querySelector('[aria-label="Account settings"]'));
      await act(async () => document.querySelector('[data-profile-back]').click());
      assert.equal(ui.getState().screen, "main");
      await act(async () => ui.getState().setScreen("welcome"));
    } finally { globalThis.fetch = previousFetch; }
    assert.equal(document.querySelector('button[aria-label="Back"]'), null);
    await act(async () => window.dispatchEvent(new CustomEvent("avenlab:panel-action", { detail: "back" })));
    assert.ok(button("Create character"));
    assert.equal(button("Sign in"), undefined);
    await act(async () => social.setState({ stagingSignIn: false, registeredProfile: true }));
    assert.ok(button("Log out"), "a restored registered profile with no characters can log out");
    assert.equal(button("Sign in"), undefined);
    // The optional module has not arrived. The confirmed empty roster must
    // open immediately with neither an avatar load nor a presentation dependency.
    delete window.avenskyPortalNavigation;
    await act(async () => {
      client.setSocialConnection(socket);
      client.beginSocialSession("local-no-navigation-helper", undefined, true);
      root.render(createElement(WelcomeScreen, { key: "local-no-helper" }));
    });
    const emptyForm = document.querySelector("form.garage-credentials");
    emptyForm.elements.login.value = "lightfoot@example.net";
    emptyForm.elements.password.value = "a staging passphrase for test";
    await act(async () => submit());
    assert(document.head.querySelector('script[src="/images/sign-in-navigation.js"]'), "local helper request is still pending");
    const noHelperLogin = sent.at(-1);
    assert.equal(noHelperLogin.action, "account_login");
    await act(async () => {
      reply(noHelperLogin, { profile_id: view.profile.id, token, account: true });
      client.receiveSocialState(view);
    });
    assert.ok(document.querySelector(".character-roster.garage-entry-incoming"));
    assert.ok(button("Create character"));
    assert.equal(document.querySelector("#garage-entry-handoff"), null);

  } finally {
    await act(async()=>root.unmount());
    await vite.close();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  }
});

test("the Avensky icons, authored garage entry and game loading media ship with the frontend", async () => {
  const read=path=>readFile(new URL("../"+path,import.meta.url));
  const { garageBackdrop, GARAGE_MODEL_PATH }=await import("../src/theme/garageEntry.ts");
  const [html, svg, png, ico, garage, flare, loop]=await Promise.all([
    read("index.html"),read("public/images/logo.svg"),read("public/images/logo.png"),
    read("public/favicon.ico"),read("public" + GARAGE_MODEL_PATH),read("public/images/purple-sunflare.webp"),read("public/images/purple-sunflare-loop.mp4"),
  ]);
  assert.match(html.toString(),/<title>Avensky<\/title>/);
  assert.match(html.toString(),/name="description" content="Avensky is a browser-based game engine/);
  assert.match(svg.toString(),/<svg[\s\S]+viewBox="0 0 256 256"/);
  assert.doesNotMatch(svg.toString(),/<(?:rect|image)\b/);
  assert.equal(png.readUInt32BE(16),512);
  assert.equal(png.readUInt32BE(20),512);
  assert.equal(ico.readUInt16LE(2),1);
  assert.deepEqual([0,1,2,3].map(index=>ico[6+16*index]),[16,32,48,64]);
  assert.match(garageBackdrop(), /data-live-garage/);
  assert.doesNotMatch(garageBackdrop(), /picture|img|video|webp/);
  assert.ok(garage.toString("ascii",0,4) === "glTF" || garage.toString("utf8",0,42).startsWith("version https://git-lfs"));
  assert.equal(flare.toString("ascii",8,12),"WEBP");
  assert.ok(flare.length < 15_000);
  assert.equal(loop.toString("ascii",4,8),"ftyp");
  assert.ok(loop.length < 800_000);
  assert.ok(loop.indexOf("moov") < loop.indexOf("mdat"), "the video can start while it downloads");
});
