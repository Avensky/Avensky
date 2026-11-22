import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createServer } from "vite";

test("welcome registers a profile, saves one roster driver and waits for confirmation", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url:"http://localhost/", pretendToBeVisual:true });
  const previous = new Map();
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLButtonElement", "FormData", "Event", "CustomEvent", "localStorage", "sessionStorage"]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{ configurable:true, value:key === "window" ? dom.window : dom.window[key] });
  }
  previous.set("IS_REACT_ACT_ENVIRONMENT",Object.getOwnPropertyDescriptor(globalThis,"IS_REACT_ACT_ENVIRONMENT"));
  Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{ configurable:true, value:true });
  const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:"custom",logLevel:"error"});
  const { createRoot }=await import("react-dom/client");
  const root=createRoot(document.getElementById("root"));
  try {
    const { WelcomeScreen } = await vite.ssrLoadModule("/src/game/welcome/WelcomeScreen.tsx");
    const { useUIStore: ui } = await vite.ssrLoadModule("/src/store/menus/uiStore.ts");
    const { vehicleCatalog } = await vite.ssrLoadModule("/src/store/selection/vehicleCatalog.ts");
    const { useSelectionStore: vehicles } = await vite.ssrLoadModule("/src/store/selection/selectionStore.ts");
    const { useSocialStore: social, selectEquippedCharacter } = await vite.ssrLoadModule("/src/store/social/socialStore.ts");
    const { driversForVehicle } = await vite.ssrLoadModule("/src/game/characters/driverRoster.ts");
    const { starterDriverChoice, isEquippableOutfit, characterLook } = await vite.ssrLoadModule("/src/game/characters/characterCatalog.ts");
    const client=await vite.ssrLoadModule("/src/net/socialClient.ts");
    const sent=[];
    const token="a".repeat(64);
    const socket={ url:"wss://api-staging.avensky.test/ws/", readyState:WebSocket.OPEN, send:body=>sent.push(JSON.parse(body)) };
    const view={profile:{id:"registered-player",name:"Lightfoot",progression:{character:null,cosmetics_revision:0}},
      limits:{max_active_worlds:2},players:[],teammates:[],requests:[],groups:[],worlds:[],world_invites:[],maps:[],current_world_id:null};
    const reply=(request,data,ok=true,message)=>client.receiveSocialResult({request_id:request.request_id,ok,data,message});
    const button=label=>[...document.querySelectorAll("button")].find(button=>button.textContent.trim() === label);

    const pairs=vehicleCatalog.map(vehicle=>driversForVehicle(vehicle.id));
    assert.ok(pairs.every(pair=>pair.length===2));
    const drivers=pairs.flat();
    assert.equal(new Set(drivers.map(driver=>driver.name)).size,drivers.length);
    assert.equal(new Set(drivers.map(driver=>driver.color)).size,drivers.length);
    for (const driver of drivers) {
      const choice=starterDriverChoice(driver);
      assert.ok(isEquippableOutfit(choice),driver.name);
      assert.equal(characterLook(choice).character.name,driver.name);
    }
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
    form.elements.name.value="Lightfoot";
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
    assert.equal(button("Enter main menu").disabled,true);
    const vehicle=document.querySelector("select");
    await act(async()=>{
      vehicle.value="brz";
      vehicle.dispatchEvent(new Event("change",{bubbles:true}));
    });
    const driver=[...document.querySelectorAll(".welcome-character")].find(card=>card.textContent.includes("Miles Chen"));
    await act(async()=>driver.click());
    await act(async()=>button("Enter main menu").click());
    const equip=sent.at(-1);
    assert.equal(equip.action,"character_equip");
    assert.equal(equip.character.driver_id,"brz-male");
    assert.equal(ui.getState().screen,"welcome");
    await act(async()=>reply(equip,{},false,"Could not commit the player database."));
    assert.match(document.querySelector('[role="alert"]').textContent,/Could not commit/);
    assert.equal(ui.getState().screen,"welcome");
    await act(async()=>button("Enter main menu").click());
    await act(async()=>reply(sent.at(-1),{character:equip.character,cosmetics_revision:1}));
    assert.equal(ui.getState().screen,"main");
    assert.equal(vehicles.getState().getSelectedVehicle().id,"brz");
    assert.equal(selectEquippedCharacter(social.getState()).driver_id,"brz-male");
    assert.equal(JSON.parse(localStorage.getItem("avenlab-social-profile-v1:onboarding-test")).token,token);
    assert.doesNotMatch(JSON.stringify(localStorage),/passphrase/);

    await act(async()=>{
      ui.setState({screen:"welcome"});
      root.render(createElement(WelcomeScreen,{key:"returning"}));
    });
    await act(async()=>button("Continue as Lightfoot").click());
    assert.equal(document.querySelector("select").value,"brz");
    assert.match(document.querySelector('.welcome-character[aria-pressed="true"]').textContent,/Miles Chen/);
    const before=sent.length;
    await act(async()=>button("Enter main menu").click());
    assert.equal(ui.getState().screen,"main");
    assert.equal(sent.length,before,"returning players keep their saved outfit without rewriting it");
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
  const [html, svg, png, ico, flare]=await Promise.all([
    read("index.html"),read("public/images/logo.svg"),read("public/images/logo.png"),
    read("public/favicon.ico"),read("public/images/purple-sunflare.webp"),
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
});
