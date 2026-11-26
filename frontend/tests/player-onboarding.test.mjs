import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createServer } from "vite";

test("the creator preserves an eight-step appearance through registration, name retry and roster selection", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url:"http://localhost/", pretendToBeVisual:true, runScripts:"outside-only" });
  const previous = new Map();
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "FormData", "Event", "CustomEvent", "localStorage", "sessionStorage"]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{ configurable:true, value:key === "window" ? dom.window : dom.window[key] });
  }
  previous.set("IS_REACT_ACT_ENVIRONMENT",Object.getOwnPropertyDescriptor(globalThis,"IS_REACT_ACT_ENVIRONMENT"));
  Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{ configurable:true, value:true });
  const vite=await createServer({mode:process.env.VITE_DEPLOY_ENV || "development",
    define:{__FITTED_HAIR_IDS__: JSON.stringify(["hair-01"])},
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
    const pressKey = (key, code) => act(async () => document.activeElement.dispatchEvent(
      new window.KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true })
    ));
    const submit=()=>document.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    const typeName=name=>{
      const input=document.querySelector('[name="characterName"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(input,name);
      input.dispatchEvent(new Event("input",{bubbles:true}));
    };

    for (const style of CHARACTER_STYLES)
      for (const body of ["female","male"]) assert.ok(isEquippableOutfit(styleLook(style,body)),style.name);
    const beforeVehicle=vehicles.getState().getSelectedVehicle().id;
    const previews = [];
    const onGarageCharacter = selection => previews.push(selection);
    await act(async()=>{
      client.setSocialConnection(socket);
      client.beginSocialSession("onboarding-test",undefined,true);
      ui.setState({screen:"welcome"});
      root.render(createElement(WelcomeScreen, { onGarageCharacter }));
    });
    const header=document.querySelector(".garage-entry-header");
    assert.ok(header);
    const signInBrand = header.querySelector(".garage-entry-brand").innerHTML;
    assert.equal(header.querySelector(".garage-entry-brand img").getAttribute("src"),"/images/logo.svg");
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
    const steps = () => [...document.querySelectorAll('[aria-label="Character creation steps"] [role="tab"]')];
    const stepName = tab => (tab.getAttribute("aria-label") ?? tab.textContent).trim();
    const activeStep = () => stepName(steps().find(tab => tab.getAttribute("aria-selected") === "true"));
    const jumpTo = async name => {
      const tab = steps().find(item => stepName(item) === name);
      assert.ok(tab, name);
      await act(async () => tab.click());
      assert.equal(activeStep(), name);
    };
    const next = () => document.querySelector("[data-creator-continue]");
    const secondaryTabs = () => [...document.querySelectorAll(".creator-color-channels [role=tab]")];
    const activeChannel = () => secondaryTabs().find(tab => tab.getAttribute("aria-selected") === "true")?.textContent;
    const assertPreviewCaption = label => {
      const group = document.querySelector(".creator-panel .creator-options");
      for (const tile of group.querySelectorAll("[data-creator-option]")) {
        assert.ok(tile.getAttribute("aria-label"), "each image retains its accessible name");
        assert.ok(!tile.textContent.includes(tile.getAttribute("aria-label")), "no label inside the tile");
        assert.equal(tile.title, "", "hovering an unpreviewed tile cannot show its name");
      }
      assert.equal(group.nextElementSibling?.textContent, label, "the preview name is under the options");
    };
    const select = async name => {
      const item = ["Continue", "Create character"].includes(name) ? next() : button(name) ?? secondaryTabs().find(tab => tab.textContent === name);
      assert.ok(item, name);
      await act(async () => {
        const tap = new window.MouseEvent("pointerup", { bubbles: true, cancelable: true, button: 0 });
        Object.defineProperty(tap, "pointerType", { value: "touch" });
        item.dispatchEvent(tap);
      });
    };
    assert.deepEqual(steps().map(stepName), ["Gender", "Looks", "Skin tone", "Hairstyle", "Hair color", "Eyes", "Makeup", "Personality"]);
    assert.equal(activeStep(), "Gender");
    assert.equal(previews.at(-1).choice.appearance.hair, "natural");
    assert.equal(previews.at(-1).creatorFrame, "body");
    assert.equal(previews.at(-1).creatorEmotes, "basic");
    await jumpTo("Hairstyle");
    assertPreviewCaption("Natural");
    assert.equal(button("Close crop"), undefined, "the retired cap is never offered as a new cut");
    await select("Side-swept short");
    assertPreviewCaption("Side-swept short");
    assert.equal(previews.at(-1).choice.appearance.hair, "hair-01");
    await jumpTo("Hair color");
    assert.equal(activeChannel(), "Base");
    await jumpTo("Hairstyle");
    assert.equal(button("Side-swept short").getAttribute("aria-pressed"), "true");
    await select("Natural");
    await jumpTo("Gender");
    const focusedGender = document.activeElement;
    for (const direction of ["up", "down"]) {
      await act(async () => panelAction(direction));
      assert.ok(document.activeElement.matches("[data-creator-option]"));
      assert.equal(activeStep(), "Gender");
    }
    assert.equal(document.activeElement, focusedGender);
    await act(async () => panelAction("right"));
    assert.equal(button("Male").getAttribute("aria-pressed"), "true", "left/right changes just the rig");
    await act(async () => panelAction("left"));
    assert.equal(button("Female").getAttribute("aria-pressed"), "true");
    await select("Male");
    await act(async () => panelAction("left"));
    assert.equal(button("Female").getAttribute("aria-pressed"), "true", "keyboard navigation continues from the touched tile");
    await act(async () => panelAction("right"));
    assert.equal(activeStep(), "Gender");
    await select("Continue");
    assert.equal(activeStep(), "Looks");
    assert.equal(previews.at(-1).creatorFrame, "looks");
    assert.ok(button("Look 1"));
    assert.doesNotMatch(document.querySelector('[role="tabpanel"]').textContent, /Mara Vega|Rook Okafor/);
    await jumpTo("Skin tone");
    await select("Deep");
    assert.ok(button("Ebony"));
    await select("Continue");
    assert.equal(activeStep(), "Hairstyle");
    assert.ok(button("Natural"));
    assert.equal(secondaryTabs().length, 0);
    assert.ok(document.querySelector('[aria-label="Hairstyles"] [data-creator-option]'));
    await select("Continue");
    assert.equal(activeStep(), "Hair color");
    const appearanceBeforeChannels = previews.at(-1).choice.appearance;
    await act(async () => panelAction("next_option"));
    assert.equal(activeChannel(), "Roots");
    assert.deepEqual(previews.at(-1).choice.appearance, appearanceBeforeChannels, "opening a color channel keeps the draft");
    assert.equal(activeStep(), "Hair color");
    await act(async () => panelAction("previous_option"));
    assert.equal(activeChannel(), "Base");
    await select("Copper");
    const appearanceBeforePresets = previews.at(-1).choice.appearance;
    await act(async () => panelAction("previous_option"));
    assert.equal(activeChannel(), "Presets");
    assert.deepEqual(previews.at(-1).choice.appearance, appearanceBeforePresets);
    await select("Highlights");
    await select("Icy Blue");
    const hair = previews.at(-1).choice.appearance;
    assert.equal(hair.hair, "natural");
    assert.equal(hair.hair_color, "copper");
    assert.ok(hair.hair_palette.highlights, "a separately selected highlight is part of the draft");
    assert.equal(previews.at(-1).creatorFrame, "face");
    assert.equal(previews.at(-1).creatorEmotes, "basic");
    await select("Continue");
    assert.equal(activeStep(), "Eyes");
    assert.equal(previews.at(-1).creatorFrame, "eyes");
    assert.equal(secondaryTabs().length, 0);
    await select("Hazel");
    assert.equal(previews.at(-1).choice.appearance.eye_color, "hazel");
    await select("Continue");
    assert.equal(activeStep(), "Makeup");
    assert.equal(previews.at(-1).creatorFrame, "makeup");
    await act(async () => panelAction("previous_option"));
    assert.equal(activeChannel(), "Eyeliner");
    await act(async () => panelAction("next_option"));
    assert.equal(activeChannel(), "Lipstick");
    assert.equal(button("No makeup").getAttribute("aria-pressed"), "true");
    await select("Red");
    await select("Black");
    await select("Eyeshadow");
    await select("Smoke");
    await select("Eyeliner");
    assertPreviewCaption("Bare");
    await act(async () => panelAction("right"));
    assertPreviewCaption("Classic");
    await select("Cat eye");
    assertPreviewCaption("Cat eye");
    await jumpTo("Personality");
    assert.equal(button("Neutral").getAttribute("aria-pressed"), "true");
    assert.equal(button("Rival"), undefined);
    assert.ok(button("Racer"));
    await select("Mechanic");
    assert.equal(previews.at(-1).choice.appearance.personality, "mechanic");
    await select("Stoic");
    assert.equal(previews.at(-1).creatorFrame, "outfit");
    assert.equal(previews.at(-1).creatorEmotes, "personality");
    assert.equal(previews.at(-1).choice.appearance.personality, "stoic");
    assert.doesNotMatch(document.querySelector('[role="tabpanel"]').textContent, /Starter hair|First wardrobe/);
    assert.equal(previews.at(-1).choice.appearance.hair, hair.hair);
    assert.deepEqual(previews.at(-1).choice.appearance.hair_palette, hair.hair_palette);
    await jumpTo("Skin tone");
    assert.equal(button("Deep").getAttribute("aria-pressed"), "true");
    assert.equal(previews.at(-1).creatorEmotes, "basic", "revisiting skin keeps the saved personality and previews basic gestures");
    assert.equal(previews.at(-1).choice.appearance.personality, "stoic");
    await jumpTo("Personality");
    assert.equal(disabled(next()),true,"the final action requires a character name");
    const nameField = () => document.querySelector('[name="characterName"]');
    const nameTarget = () => document.querySelector("[data-creator-name-nav]");
    await act(async () => nameTarget().focus());
    await act(async () => panelAction("activate"));
    assert.ok(keyboard.getState().session);
    await act(async () => panelAction("next_tab"));
    assert.equal(activeStep(), "Personality", "shoulders cannot take focus from the name editor");
    assert.ok(keyboard.getState().session);
    await act(async () => { keyboard.getState().edit("Track"); keyboard.getState().close(true); });
    assert.equal(nameField().value, "Track", "controller B keeps the typed name");
    assert.equal(document.activeElement, nameTarget(), "exiting returns navigation to the name row");
    await act(async () => panelAction("activate"));
    assert.ok(keyboard.getState().session, "controller can re-enter the name");
    await act(async () => { keyboard.getState().edit("Track Fox"); keyboard.getState().close(); });
    await act(async () => { nameField().focus(); typeName("Track Fox II"); });
    await pressKey("q", "KeyQ");
    await pressKey("e", "KeyE");
    assert.equal(document.activeElement, nameField(), "Q/E remain typing keys inside the native name field");
    await act(async () => nameField().dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    assert.equal(nameField().value, "Track Fox II", "Escape exits typing without undoing edits");
    assert.equal(document.activeElement, nameTarget());
    await act(async () => { nameField().focus(); typeName("Track Fox"); });
    await select("Exit name editing");
    assert.equal(nameField().value, "Track Fox", "the touch Exit action keeps typed text");
    assert.equal(document.activeElement, nameTarget());
    assert.equal(disabled(next()),false);
    await select("Continue");
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
    assert.equal(create.action,"character_create_styled");
    const fox=create.character;
    assert.equal(fox.appearance.skin,"deep");
    assert.equal(fox.appearance.eye_color,"hazel");
    assert.equal(fox.appearance.hair_color,"copper");
    assert.deepEqual(fox.appearance.hair_palette, hair.hair_palette, "the chosen palette survives registration and creation");
    assert.equal(fox.appearance.personality,"stoic");
    assert.equal(fox.appearance.makeup, "black");
    assert.equal(fox.appearance.eyeshadow, "smoke");
    assert.equal(fox.appearance.eyeliner, "cat-eye");
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
    await select("Create character");
    assert.deepEqual(sent.at(-1).character, fox, "retry preserves the whole draft");
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
    const requestsBeforeBack = sent.length;
    const controllerAction = action => act(async () => panelAction(action));
    for (const [previousTab, nextTab, confirm] of [
      [() => pressKey("q", "KeyQ"), () => pressKey("e", "KeyE"), () => pressKey("Enter", "Enter")],
      [() => controllerAction("previous_tab"), () => controllerAction("next_tab"), () => controllerAction("activate")],
    ]) {
      await act(async () => button("Create character").click());
      assert.equal(activeStep(), "Gender");
      const backTab = button("Back to character selection");
      await previousTab();
      assert.equal(document.activeElement, backTab);
      assert.equal(activeStep(), "Gender", "highlighting Avensky keeps the current editor open");
      await nextTab();
      assert.equal(activeStep(), "Gender");
      const selectedGender = document.querySelector('[data-creator-option][aria-pressed="true"]');
      assert.equal(document.activeElement, selectedGender, "returning to Gender restores the selected option");
      await previousTab();
      await controllerAction("down");
      assert.equal(document.activeElement, selectedGender, "D-pad leaves the brand without changing the preview");
      await previousTab();
      await jumpTo("Gender");
      assert.equal(document.activeElement, selectedGender, "tapping the current step returns focus to the panel");
      await previousTab();
      await previousTab();
      assert.equal(activeStep(), "Personality", "the header order wraps through Avensky in both directions");
      await nextTab();
      assert.equal(document.activeElement, backTab);
      assert.equal(activeStep(), "Personality");
      await confirm();
      assert.ok(document.querySelector(".character-roster"), "confirming Avensky returns to the roster");
      assert.equal(sent.length, requestsBeforeBack, "header navigation and Back keep the account and its characters intact");
    }
    const stopInput=listenForMenuInput();
    try {
      await act(async()=>reportMenuDevice("controller"));
      assert.equal(button("Enter world"), undefined);
      assert.ok(document.querySelector('[data-character-id][aria-pressed=true] [data-controller-key="A"]'));
      assert.ok(document.querySelector('.roster-rotate [data-controller-key="RS"]'));
      const touch=new Event("pointerdown",{bubbles:true});
      Object.defineProperty(touch,"pointerType",{value:"touch"});
      await act(async()=>document.body.dispatchEvent(touch));
      assert.equal(document.querySelector('.roster-tile [data-controller-key="A"]'),null);
      assert.equal(document.querySelector(".character-roster").dataset.inputDevice,"touch");
      assert.equal(document.querySelector(".roster-preview-tools"), null);
      await act(async()=>window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowRight"})));
      assert.equal(document.querySelector(".character-roster").dataset.inputDevice,"keyboard");
      assert.equal(document.querySelector(".roster-preview-tools"), null);
    } finally { stopInput(); }
    const previewRequests=sent.length;
    const tap = (target, pointerType) => {
      for (const type of ["pointerdown", "pointerup", "click"]) {
        const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, detail: 1 });
        Object.defineProperties(event, { pointerType: { value: pointerType }, isPrimary: { value: true } });
        target.dispatchEvent(event);
      }
    };
    await act(async()=>tap(button("Nova"), "touch"));
    assert.equal(button("Nova").getAttribute("aria-pressed"),"true");
    assert.equal(document.activeElement,button("Nova"));
    assert.equal(sent.length,previewRequests,"touching another slot previews it locally");
    await act(async()=>tap(button("Nova"), "touch"));
    const touched = sent.at(-1);
    assert.equal(touched.action, "character_select");
    assert.equal(touched.character_id, button("Nova").dataset.characterId);
    await act(async()=>tap(button("Nova"), "touch"));
    assert.equal(sent.length,previewRequests+1,"a repeated activation while saving sends only one request");
    await act(async()=>reply(touched,{},false,"Character select temporarily unavailable."));
    assert.equal(ui.getState().screen,"welcome");
    assert.match(document.querySelector('[role="alert"]').textContent,/temporarily unavailable/);
    await act(async()=>tap(button("Track Fox II"), "mouse"));
    assert.equal(button("Track Fox II").getAttribute("aria-pressed"),"true");
    assert.equal(sent.length,previewRequests+1,"clicking another slot previews it locally");
    await act(async()=>tap(button("Track Fox II"), "mouse"));
    const clicked = sent.at(-1);
    assert.equal(clicked.action, "character_select");
    assert.equal(clicked.character_id, button("Track Fox II").dataset.characterId);
    await act(async()=>reply(clicked,{},false,"Try again."));
    await act(async()=>button("Nova").focus());
    await act(async()=>panelAction("down"));
    assert.equal(document.activeElement,button("Track Fox II"),"D-pad follows the landscape roster rows");
    assert.equal(button("Track Fox II").getAttribute("aria-pressed"),"true");
    assert.equal(sent.length,previewRequests+2,"controller focus previews without changing the saved character");
    const pressEnter = repeat => document.activeElement.dispatchEvent(
      new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "Enter", key: "Enter", repeat }));
    await act(async()=>pressEnter(true));
    assert.equal(sent.length,previewRequests+2,"held keys do not confirm");
    await act(async()=>pressEnter(false));
    const keyed = sent.at(-1);
    assert.equal(keyed.character_id, button("Track Fox II").dataset.characterId);
    await act(async()=>reply(keyed,{},false,"Try again."));
    assert.equal(document.querySelector(".roster-preview-tools [role=button]"),null,"the rotation hint does not add a controller stop");
    await act(async()=>panelAction("activate"));
    const rosterSelect=sent.at(-1);
    assert.equal(rosterSelect.action,"character_select");
    assert.equal(rosterSelect.character_id,"registered-player");
    assert.equal(ui.getState().screen,"welcome");
    await act(async()=>reply(rosterSelect,{profile:saved}));
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
    assert.equal(button("World Editor"), undefined, "a full roster offers character selection only");
    await act(async () => client.receiveSocialState({ ...view, profile: { ...view.profile, id: "new-staging-player" } }));
    assert.equal(document.querySelector('[name="characterName"]'),null);
    assert.equal(button("Enter world"),undefined);
    assert.equal(document.querySelector("[data-character-id]"),null);
    assert.ok(button("Create character"));
    assert.equal(button("World Editor"), undefined, "the empty roster keeps world editing in the main menu");
    await act(async()=>button("Create character").click());
    assert.equal(activeStep(),"Gender");
    assert.equal(document.querySelector('[name="characterName"]'),null);
    await act(async()=>button("Back to character selection").click());
    assert.ok(button("Log out"));
    const headerActions=document.querySelector(".garage-entry-header nav[data-controller-row]");
    assert.equal(headerActions.previousElementSibling?.innerHTML,signInBrand,"the roster uses the same logo and wordmark as sign-in");
    assert.equal(headerActions.previousElementSibling.querySelector("button, [role=button], [tabindex], a"), null);
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
      const profileBack = document.querySelector(".garage-entry-header [data-profile-back]");
      assert.ok(profileBack, "the Profile screen puts Back in the left header");
      assert.equal(profileBack.getAttribute("aria-label"), "Back");
      assert.ok(profileBack.querySelector("svg"), "the branded tab visibly indicates Back");
      assert.ok(profileBack.querySelector('img[src="/images/logo.svg"]'));
      assert.match(profileBack.textContent, /avensky/i);
      assert.equal(document.querySelectorAll("[data-profile-back]").length, 1);
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

    const roster = document.querySelector(".character-roster");
    const logoutFrames = [];
    window.avenskyPortalNavigation = { captureLogout() {
      assert.equal(document.querySelector(".character-roster"), roster);
      logoutFrames.push("capture");
      return () => {
        assert.ok(document.querySelector("form.garage-credentials"));
        assert.equal(roster.isConnected, false);
        logoutFrames.push("reveal");
      };
    } };
    await act(async () => button("Log out").click());
    assert.equal(sent.at(-1).action, "account_logout");
    await act(async () => reply(sent.at(-1), {}, false, "Could not log out."));
    assert.deepEqual(logoutFrames, ["capture"]);
    assert.ok(roster.isConnected, "a failed logout keeps the roster usable");
    await act(async () => button("Log out").click());
    await act(async () => social.setState({ registeredProfile: false, view: null }));
    assert.ok(roster.isConnected, "the roster stays visible while the logout response is in flight");
    assert.equal(document.querySelector("form.garage-credentials"), null, "the sign-in form never flashes before its fade");
    await act(async () => reply(sent.at(-1), {}));
    assert.deepEqual(logoutFrames, ["capture", "capture", "reveal"]);
    assert.ok(button("Sign in"));

    // The creator restores focus to the first available replacement for an old saved cut.
    const { CreatorHairstyles } = await vite.ssrLoadModule("/src/game/welcome/CreatorHairstyles.tsx");
    const savedCrop = { ...fox, appearance: { ...fox.appearance, hair: "cropped" } };
    const replacements = [];
    await act(async () => root.render(createElement(CreatorHairstyles, {
      choice: { ...savedCrop, id: "mara-vega", outfit: "dockwear" }, onChoice: item => replacements.push(item),
      onContinue() {}, busy: false,
    })));
    assert.equal(button("Close crop"), undefined);
    await act(async () => button("Natural").focus());
    assert.equal(document.querySelector(".creator-preview-caption").textContent, "Close crop");
    assert.equal(replacements.length, 0, "default focus preserves the legacy style");
    await select("Natural");
    assert.equal(replacements.at(-1).appearance.hair, "natural");


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
