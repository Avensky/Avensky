import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createServer } from "vite";

test("welcome creates and selects named characters without choosing a vehicle", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url:"http://localhost/", pretendToBeVisual:true });
  const previous = new Map();
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLButtonElement", "FormData", "Event", "CustomEvent", "localStorage", "sessionStorage"]) {
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
    const client=await vite.ssrLoadModule("/src/net/socialClient.ts");
    const sent=[];
    const token="a".repeat(64);
    const socket={ url:"wss://api-staging.avensky.test/ws/", readyState:WebSocket.OPEN, send:body=>sent.push(JSON.parse(body)) };
    const view={profile:{id:"registered-player",name:"Lightfoot",active_character_id:null,characters:[],
      progression:{character:null,cosmetics_revision:0}},
      limits:{max_active_worlds:2},players:[],teammates:[],requests:[],groups:[],worlds:[],world_invites:[],maps:[],current_world_id:null};
    const reply=(request,data,ok=true,message)=>client.receiveSocialResult({request_id:request.request_id,ok,data,message});
    const button=label=>[...document.querySelectorAll("button")].find(button=>button.textContent.trim() === label);

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
    assert.equal(document.querySelector("video"),null);
    assert.ok(document.querySelector(".menu-flare-background"));
    assert.equal(document.querySelector('[src="/images/avensky-welcome.webp"]').alt,"");
    await act(async()=>button("Register").click());
    const form=document.querySelector("form");
    form.elements.login.value="lightfoot";
    form.elements.password.value="a staging passphrase for test";
    await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
    const register=sent.at(-1);
    assert.equal(register.action,"account_register");
    assert.equal(register.login,"lightfoot");
    assert.equal(ui.getState().screen,"welcome");
    await act(async()=>{
      reply(register,{profile_id:"registered-player",name:"Lightfoot",token,account:true});
      client.receiveSocialState(view);
    });
    assert.equal(document.querySelector("select"),null);
    assert.equal(button("Create character").disabled,true);
    await act(async()=>button("Male").click());
    const style=[...document.querySelectorAll(".welcome-character")].find(card=>card.textContent.includes("Night Shift"));
    await act(async()=>style.click());
    const creation = document.querySelector("form");
    creation.elements.characterName.value="Track Fox";
    const submit=()=>creation.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    await act(async()=>submit());
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
    await act(async()=>submit());
    const saved={...view.profile,name:"Track Fox",active_character_id:"registered-player",
      characters:[{id:"registered-player",name:"Track Fox",style:"night-shift",level:1,appearance:fox}],
      progression:{character:fox,cosmetics_revision:1}};
    await act(async()=>reply(sent.at(-1),{profile:saved}));
    assert.equal(ui.getState().screen,"main");
    assert.equal(vehicles.getState().getSelectedVehicle().id,beforeVehicle);
    assert.deepEqual(selectEquippedCharacter(social.getState()),fox);
    assert.equal(JSON.parse(localStorage.getItem("avenlab-social-profile-v1:onboarding-test")).token,token);
    assert.doesNotMatch(JSON.stringify(localStorage),/passphrase/);

    await act(async()=>{
      ui.setState({screen:"welcome"});
      root.render(createElement(WelcomeScreen,{key:"returning"}));
    });
    await act(async()=>button("Continue as Track Fox").click());
    assert.match(document.querySelector('.welcome-character[aria-pressed="true"]').textContent,/Track Fox/);
    assert.ok(button("New character"));
    await act(async()=>button("Enter main menu").click());
    const select=sent.at(-1);
    assert.equal(select.action,"character_select");
    assert.equal(select.character_id,"registered-player");
    assert.equal(ui.getState().screen,"welcome");
    await act(async()=>reply(select,{profile:saved}));
    assert.equal(ui.getState().screen,"main");
    assert.deepEqual(selectEquippedCharacter(social.getState()),fox);
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

test("the Avensky icon formats and lightweight sunflare ship with the frontend", async () => {
  const read=path=>readFile(new URL("../"+path,import.meta.url));
  const [html, svg, png, ico, flare, loop]=await Promise.all([
    read("index.html"),read("public/images/logo.svg"),read("public/images/logo.png"),
    read("public/favicon.ico"),read("public/images/purple-sunflare.webp"),read("public/images/purple-sunflare-loop.mp4"),
  ]);
  assert.match(html.toString(),/<title>Avensky<\/title>/);
  assert.match(html.toString(),/name="description" content="Avensky is a browser-based game engine/);
  assert.match(svg.toString(),/<svg[\s\S]+viewBox="0 0 256 256"/);
  assert.equal(png.readUInt32BE(16),512);
  assert.equal(png.readUInt32BE(20),512);
  assert.equal(ico.readUInt16LE(2),1);
  assert.deepEqual([0,1,2,3].map(index=>ico[6+16*index]),[16,32,48,64]);
  assert.equal(flare.toString("ascii",8,12),"WEBP");
  assert.ok(flare.length < 15_000);
  assert.equal(loop.toString("ascii",4,8),"ftyp");
  assert.ok(loop.length < 120_000);
});
