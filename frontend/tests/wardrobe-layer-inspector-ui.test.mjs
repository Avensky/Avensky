import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {JSDOM} from "jsdom";
import {createServer} from "vite";

const fixture=JSON.parse(readFileSync(
  new URL("./fixtures/wardrobe-layer-save-v1.json",import.meta.url),"utf8"));

test("W-06 fitting-room stack inspection preserves camera, live selections and old saves",async()=>{
  const catalog=JSON.parse(readFileSync(
    new URL("../../packages/wardrobe-catalog/character-garments.json",import.meta.url),"utf8"));
  const installed=catalog.filter(x=>!x.retired&&!x.outfit);
  const dom=new JSDOM("<div id='root'></div>",{url:"http://localhost/",pretendToBeVisual:true});
  const original=new Map();
  for(const [key,value] of Object.entries({
    window:dom.window,document:dom.window.document,navigator:dom.window.navigator,
    HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,
    localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true
  })){
    original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  let root,vite,act,garmentRegistry;
  try{
    const {createElement,act:reactAct}=await import("react");
    const {createRoot}=await import("react-dom/client");
    act=reactAct;
    vite=await createServer({define:{
      __VILLAGER_MODEL_URL__:JSON.stringify("/models/characters/villagers/villager-female/villager-female.garage.glb"),
      __DRESSING_ROOM_IMPORTED_IDS__:JSON.stringify(installed.map(x=>x.id)),
      __DRESSING_ROOM_MOBILE_IDS__:JSON.stringify(installed.filter(x=>x.mobileUrl).map(x=>x.id)),
      __DRESSING_ROOM_REVISION_IDS__:JSON.stringify([]),
      __STANDALONE_CORSET_LODS__:JSON.stringify({"gothic-04":{garage:true,mobile:true},"gothic-05":{garage:true,mobile:true}}),
      __WARDROBE_SET_IDS__:JSON.stringify(["gothic-01","gothic-03","gothic-04","gothic-05"])
    },server:{middlewareMode:true,hmr:false,ws:false},appType:"custom",logLevel:"error",
    optimizeDeps:{noDiscovery:true,include:[]}});
    const {DressingRoom}=await vite.ssrLoadModule("/src/game/characters/DressingRoom.tsx");
    garmentRegistry=(await vite.ssrLoadModule("/src/game/characters/wardrobeGarments.ts")).importedWardrobeItems;
    // Simulate future discovered outerwear without promoting an unreviewed model.
    garmentRegistry.push({id:"w06-unreviewed-coat",label:"Unreviewed Test Coat",
      category:"outerwear",section:"Coats",slot:"coat",piece:"coat",
      url:"/models/test/w06-unreviewed-coat.garage.glb"});
    const {useCharacterPreviewStore:preview}=await vite.ssrLoadModule("/src/game/characters/characterPreviewStore.ts");
    const callback={changed:0,tried:0};
    const originalSaved=JSON.stringify(fixture.layered);
    const renderer=(choice)=>createElement(DressingRoom,{
      choice,onChange:()=>callback.changed++,onTryOn:()=>callback.tried++
    });
    root=createRoot(document.querySelector("#root"));
    await act(async()=>root.render(renderer(fixture.layered)));
    const click=async(selector)=>act(async()=>{
      const node=document.querySelector(selector);
      assert(node,"Missing "+selector);node.click();
    });
    assert.equal(document.querySelector("[data-layer-preview]"),null);
    await click('[data-category="layers"]');
    const cameraBefore=preview.getState().camera;
    const revisionBefore=preview.getState().focusRevision;
    await click("[data-layer-preview-toggle]");
    const panel=document.querySelector("[data-layer-preview]");
    assert(panel);
    assert.equal(panel.dataset.reviewStatus,"needs-fitting");
    assert.match(panel.textContent,/read-only preview/i);
    assert.equal(panel.querySelectorAll("[data-layer-item]").length,7);
    assert.equal(panel.querySelector('[data-layer-item="gothic-04"]').dataset.layerState,"candidate");
    assert.equal(panel.querySelector('[data-layer-item="gothic-05"]').dataset.layerState,"suspended");
    assert.match(panel.textContent,/body-fit: over-top/);
    assert(panel.querySelector('[data-layer-regions] [data-region="torsoFront"]'));
    assert.equal(preview.getState().camera,cameraBefore);
    assert.equal(preview.getState().focusRevision,revisionBefore);
    assert.equal(callback.changed+callback.tried,0);
    assert.equal(JSON.stringify(fixture.layered),originalSaved);
    assert.equal(window.localStorage.length,0);

    await act(async()=>root.render(renderer(fixture.legacy)));
    const oldPanel=document.querySelector("[data-layer-preview]");
    assert.equal(oldPanel.querySelector('[data-layer-item="gothic-04"]').dataset.layerState,"suspended");
    assert.match(oldPanel.textContent,/legacy removals/i);
    assert.equal(callback.changed+callback.tried,0);

    const invalid=structuredClone(fixture.layered);
    invalid.wardrobeLayers.schemaVersion=2;
    await act(async()=>root.render(renderer(invalid)));
    const error=document.querySelector('[data-layer-preview] [role="alert"]');
    assert(error);
    assert.match(error.textContent,/invalid layer metadata/i);
    assert.equal(document.querySelectorAll("[data-layer-item]").length,7);
    assert.equal(callback.changed+callback.tried,0);

    await click("[data-layer-preview-toggle]");
    assert.equal(document.querySelector("[data-layer-preview]"),null);
    assert.equal(preview.getState().focusRevision,revisionBefore);
    await act(async()=>preview.setState({camera:"Face",zoom:1.15}));
    const outerwearFocus=preview.getState().focusRevision;
    await click("[data-wardrobe-back]");
    await click('[data-category="outerwear"]');
    assert.match(document.querySelector("[data-outerwear-readonly]").textContent,/inspection-only/i);
    assert.equal(document.querySelector('[data-wardrobe-item="coat-01"]'),null,
      "Retired coat cannot be selected or tried on");
    assert.equal(preview.getState().camera,"Face","Opening Outerwear preserves the current camera");
    assert.equal(preview.getState().zoom,1.15,"Opening Outerwear preserves mobile zoom");
    assert.equal(preview.getState().focusRevision,outerwearFocus);
    assert(document.querySelector('[data-wardrobe-item="w06-unreviewed-coat"]'),
      "New coats can be inspected even before asset clearance");
    await click('[data-wardrobe-item="w06-unreviewed-coat"]');
    assert.equal(preview.getState().camera,"Face",
      "Clicking an unreviewed coat must not reset the camera");
    assert.equal(preview.getState().zoom,1.15);
    assert.equal(preview.getState().focusRevision,outerwearFocus);
    assert.equal(callback.changed+callback.tried,0);
    assert.equal(window.localStorage.length,0);
  }finally{
    if(garmentRegistry){
      const index=garmentRegistry.findIndex(x=>x.id==="w06-unreviewed-coat");
      if(index>=0)garmentRegistry.splice(index,1);
    }
    if(root)await act(async()=>root.unmount());
    await vite?.close();dom.window.close();
    for(const [key,descriptor] of original){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  }
});
