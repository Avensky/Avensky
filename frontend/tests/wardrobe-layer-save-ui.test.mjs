import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {JSDOM} from "jsdom";
import {createServer} from "vite";

const data=JSON.parse(readFileSync(new URL("./fixtures/wardrobe-layer-save-v1.json",import.meta.url),"utf8"));

test("existing device storage reads, writes and restores old/v1 layered characters without mutation",async()=>{
 const dom=new JSDOM("<div id='root'></div>",{url:"http://localhost/"});
 const previous=new Map();
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage})){
   previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
   Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 }
 let vite;
 try{
   vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:"custom",logLevel:"error"});
   const storage=await vite.ssrLoadModule("/src/game/characters/localOutfits.ts");
   const historical=JSON.stringify({Vintage:data.legacy,Modern:data.layered});
   window.localStorage.setItem(storage.LOCAL_OUTFITS_KEY,historical);
   const first=storage.readLocalOutfits();
   assert.deepEqual(first.Vintage,data.legacy);
   assert.deepEqual(first.Modern,data.layered);
   assert.equal(window.localStorage.getItem(storage.LOCAL_OUTFITS_KEY),historical,
     "reading must not silently rewrite or migrate existing saved outfits");
   const changed=storage.writeLocalOutfit("Modern",data.layered);
   assert.deepEqual(changed.Modern,data.layered);
   assert.deepEqual(JSON.parse(window.localStorage.getItem(storage.LOCAL_OUTFITS_KEY)).Vintage,data.legacy);
   assert.equal(JSON.parse(window.localStorage.getItem(storage.LOCAL_OUTFITS_KEY)).Modern.wardrobeLayers.schemaVersion,1);
   storage.writeLocalCharacter(data.layered);
   assert.deepEqual(storage.readLocalCharacter(),data.layered);
   assert.deepEqual(storage.writeLocalOutfit("New Legacy",data.legacy)["New Legacy"],data.legacy);
   assert.equal(JSON.parse(window.localStorage.getItem(storage.LOCAL_OUTFITS_KEY))["New Legacy"].wardrobeLayers,undefined);
 }finally{
   await vite?.close();dom.window.close();
   for(const [key,descriptor] of previous){
     if(descriptor)Object.defineProperty(globalThis,key,descriptor);
     else delete globalThis[key];
   }
 }
});
