import assert from "node:assert/strict";
import { on } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { createServer } from "vite";

// Keep the real social request/ack, catalog, garage admission and deployment code.
// Substitute only the network connection used by both the social and game protocols.
const transportModule = "virtual:garage-drive-connection";
const transportPlugin = {
  name: "garage-drive-connection",
  enforce: "pre",
  resolveId(id) {
    if (id.endsWith("/modes/WorldContents") || id.endsWith("/modes/preloadWorldApproach") || id === "virtual:garage-runtime") return "\0virtual:garage-runtime";
    if (id === transportModule || id.endsWith("/net/rustSocket")) return `\0${transportModule}`;
  },
  load(id) {
    if (id === "\0virtual:garage-runtime") return "export const warmed = []; export function preloadWorldApproach(map) { warmed.push(map.map_id); }";
    if (id === `\0${transportModule}`) return "export let socket; export const connect = value => { socket = value; };";
  },
};

class GameSocket extends EventTarget {
  readyState = WebSocket.OPEN;
  sent = [];
  send(raw) {
    const packet = JSON.parse(raw);
    this.sent.push(packet);
    this.dispatchEvent(new CustomEvent("request", { detail: packet }));
  }
  receive(packet) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(packet) }));
  }
}

test("driving out of the garage uses the admitted Harbor and the parked car", async t => {
  const vite = await createServer({ appType: "custom", logLevel: "error", plugins: [transportPlugin],
    server: { middlewareMode: true, hmr: false, ws: false } });
  t.after(() => vite.close());
  const load = path => vite.ssrLoadModule(`/src/${path}.ts`);
  const { connect } = await vite.ssrLoadModule(transportModule);
  const { driveIntoOpenWorld } = await load("game/alpha/driveIntoOpenWorld");
  const { garageParkingVehicle } = await load("game/preview/garageParkingVehicle");
  const { receiveSocialResult, setSocialConnection } = await load("net/socialClient");
  const { useSocialStore: social } = await load("store/social/socialStore");
  const { useNetworkStore: network } = await load("store/session/networkStore");
  const { useSelectionStore: selection } = await load("store/selection/selectionStore");
  const { useAlphaStore: alpha } = await load("store/alpha/alphaStore");
  const { useHeroLoadouts: loadouts } = await load("vehicles/cosmetics/heroLoadouts");
  const { useUIStore: ui } = await load("store/menus/uiStore");
  const { useGarageParking: parking } = await load("game/preview/garageParkingStore");
  const { useWorldStore: worldState } = await load("store/world/worldStore");
  const { warmed } = await vite.ssrLoadModule("virtual:garage-runtime");
  const catalog = await readFile(new URL("../public/world-builder/catalog.json", import.meta.url), "utf8");
  t.mock.method(globalThis, "fetch", async url => {
    assert.match(String(url), /^\/world-builder\/catalog\.json\?/);
    return new Response(catalog);
  });

  const hub = { id: 7, map: "harbor_canal_blue", listed: true, locked: false, mode: null };
  const admission = { world_id: hub.id, map: hub.map };
  const playerId = "local-driver";
  const staleMap = "road_precision";
  const validSpawn = vehicle => ({ type: "spawn_ready", player_id: playerId, map: hub.map, vehicle });
  function start(t, { favorite = "sierra", alreadyInHub = false } = {}) {
    const socket = new GameSocket();
    connect(socket);
    setSocialConnection(socket);
    social.setState({ view: {
      profile: { id: "account", active_character_id: "driver" }, main_world_id: hub.id, worlds: [hub],
      current_world_id: alreadyInHub ? hub.id : 900, alpha: { active: { world_id: 900, mode: "ctf", hero: "tank" } },
    } });
    network.setState({ connected: true, playerId, worldMap: staleMap });
    loadouts.getState().adopt("account", favorite);
    alpha.getState().chooseMode("ctf");
    ui.getState().setScreen("main");
    const transitions = [];
    const unsubscribe = ui.subscribe((now, prev) => {
      if (now.screen !== prev.screen) transitions.push(now.screen);
    });
    const abort = new AbortController();
    const requests = on(socket, "request", { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(4000)]) });
    t.after(() => {
      unsubscribe();
      abort.abort();
      socket.dispatchEvent(new Event("close"));
      setSocialConnection(null);
    });
    const nextRequest = async () => (await requests.next()).value[0].detail;
    const drive = (current = () => true) => driveIntoOpenWorld(garageParkingVehicle(loadouts.getState().defaultHero).heroId, current);
    return { socket, drive, nextRequest, transitions };
  }

  await t.test("a verified spawn switches from garage to game in one transition and preserves the loaner's owner preference", async t => {
    const { drive, nextRequest, socket, transitions } = start(t, { favorite: "louisiana" });
    const finished = drive();
    const join = await nextRequest();
    assert.equal(join.action, "world_join");
    assert.equal(join.world_id, hub.id);
    assert.equal(socket.sent.length, 1);
    assert.equal(ui.getState().screen, "main");
    receiveSocialResult({ request_id: join.request_id, ok: true, data: admission });
    assert.deepEqual(await nextRequest(), { type: "spawn_request", map: hub.map, vehicle: "brz", mode: "sandbox" });
    assert.equal(selection.getState().getSelectedMap().id, hub.map);
    assert.equal(alpha.getState().hero, "brz");
    const ready = validSpawn("brz");
    for (const mismatch of [{ map: staleMap }, { player_id: "other-driver" }, { vehicle: "sierra" }, { map: undefined }, { player_id: undefined }]) {
      socket.receive({ ...ready, ...mismatch });
      await nextTurn();
      assert.equal(ui.getState().screen, "main", `unexpected spawn acknowledgement ${JSON.stringify(mismatch)}`);
    }
    socket.receive(ready);
    await finished;
    assert.deepEqual(transitions, ["sandbox"]);
    assert.equal(loadouts.getState().defaultHero, "louisiana");
  });

  await t.test("Enter World warms only the admitted room during boarding, waits for the rear bumper and retains the shot until gameplay paints", async t => {
    const { nextRequest, socket, transitions } = start(t);
    ui.getState().setActiveMenuIndex(0);
    ui.getState().activateActiveMenuSelection();
    const join = await nextRequest();
    assert.equal(parking.getState().departurePhase, "boarding");
    ui.getState().activateActiveMenuSelection();
    receiveSocialResult({ request_id:join.request_id, ok:true, data:{...admission, garage_departure:join.garage_departure} });
    network.setState({ room_id:hub.id+1 });
    worldState.getState().setMap({map_id:hub.map});
    await nextTurn();
    assert.deepEqual(warmed, []);
    network.setState({ room_id:hub.id });
    worldState.getState().setMap({map_id:staleMap});
    await nextTurn();
    assert.deepEqual(warmed, []);
    worldState.getState().setMap({map_id:hub.map});
    await nextTurn();
    assert.deepEqual(warmed, [hub.map]);
    assert.equal(socket.sent.length, 1);
    parking.getState().finishBoarding();
    assert.equal(parking.getState().departurePhase, "rolling");
    parking.getState().reachApron();
    const spawn = await nextRequest();
    assert.equal(spawn.vehicle, "sierra");
    assert.equal(spawn.garage_departure, join.garage_departure);
    parking.getState().cancelDeparture();
    assert.equal(parking.getState().departurePhase, "outside", "pending spawn owns this final shot");
    socket.receive(validSpawn(spawn.vehicle));
    await nextTurn();
    assert.deepEqual(transitions, ["sandbox"]);
    assert.equal(parking.getState().committingDeparture,true);
    parking.getState().completeDeparture(); // first frame of the matching gameplay world
    assert.equal(parking.getState().departurePhase,null);
    const committed = await nextRequest();
    assert.deepEqual([committed.action,committed.garage_departure,committed.entered], ["garage_departure_finish",join.garage_departure,true]);
    receiveSocialResult({request_id:committed.request_id,ok:true});
    assert.equal(socket.sent.length, 3);
  });

  await t.test("a room replacement while boarding cannot spawn the car in the new room", async t => {
    const { socket, transitions, nextRequest } = start(t, {alreadyInHub:true});
    network.setState({room_id:hub.id});
    worldState.getState().setMap({map_id:hub.map});
    const restored = new Promise(resolve => {
      const stop = ui.subscribe(s => {
        if (s.mainWorldError) { stop(); resolve(s.mainWorldError); }
      });
    });
    const previous = warmed.length;
    ui.getState().setActiveMenuIndex(0);
    ui.getState().activateActiveMenuSelection();
    const join = await nextRequest();
    receiveSocialResult({request_id:join.request_id,ok:true,data:{...admission,garage_departure:null}});
    for (let i = 0; i < 1000 && warmed.length === previous; i++) await nextTurn();
    assert.equal(warmed.length, previous + 1);
    network.setState({room_id:900});
    parking.getState().finishBoarding();
    parking.getState().reachApron();
    assert.match(await restored,/Harbor session changed/);
    assert.deepEqual(socket.sent.map(p => p.action), ["world_join"]);
    assert.deepEqual(transitions,[]);
  });

  await t.test("cancelling boarding returns immediately and discards a late admission", async t => {
    const { nextRequest, socket, transitions } = start(t);
    ui.getState().setActiveMenuIndex(0);
    ui.getState().activateActiveMenuSelection();
    const join = await nextRequest();
    parking.getState().cancelDeparture();
    await nextTurn();
    assert.equal(ui.getState().mainWorldJoining,false);
    assert.equal(parking.getState().departurePhase,null);
    const cancel = await nextRequest();
    assert.deepEqual([cancel.action,cancel.garage_departure,cancel.entered], ["garage_departure_finish",join.garage_departure,false]);
    ui.getState().activateActiveMenuSelection();
    const retry = await nextRequest();
    assert.notEqual(retry.garage_departure, join.garage_departure);
    receiveSocialResult({ request_id:join.request_id, ok:true, data:{...admission,garage_departure:join.garage_departure} });
    receiveSocialResult({ request_id:cancel.request_id, ok:true, data:{released:true} });
    receiveSocialResult({ request_id:retry.request_id, ok:false, message:"The Harbor is full." });
    await nextTurn();
    assert.equal(socket.sent.length,3);
    assert.deepEqual(transitions,[]);
  });

  await t.test("a rejected cinematic spawn releases the provisionally admitted seat", async t => {
    const { nextRequest, socket, transitions } = start(t);
    network.setState({room_id:hub.id});
    worldState.getState().setMap({map_id:hub.map});
    ui.getState().activateActiveMenuSelection();
    const join = await nextRequest();
    receiveSocialResult({request_id:join.request_id,ok:true,data:{...admission,garage_departure:join.garage_departure}});
    parking.getState().finishBoarding();
    parking.getState().reachApron();
    const spawn = await nextRequest();
    assert.equal(spawn.garage_departure,join.garage_departure);
    socket.receive({type:"spawn_error",map:hub.map,message:"The spawn lane is busy."});
    const cancel = await nextRequest();
    assert.deepEqual([cancel.action,cancel.entered,cancel.garage_departure],["garage_departure_finish",false,join.garage_departure]);
    receiveSocialResult({request_id:cancel.request_id,ok:true,data:{released:true}});
    await nextTurn();
    assert.match(ui.getState().mainWorldError,/spawn lane/);
    assert.deepEqual(transitions,[]);
  });

  await t.test("wrong-world and rejected admissions cannot send a spawn request", async t => {
    const { drive, nextRequest, socket, transitions } = start(t);
    for (const reply of [{ ok: true, data: { ...admission, world_id: 8 } },
      { ok: true, data: { ...admission, map: staleMap } }, { ok: false, message: "The Harbor is full." }]) {
      const rejected = assert.rejects(drive(), reply.ok ? /different world/i : /Harbor is full/i);
      const join = await nextRequest();
      assert.equal(join.action, "world_join");
      receiveSocialResult({ request_id: join.request_id, ...reply });
      await rejected;
    }
    assert.equal(socket.sent.length, 3);
    assert.deepEqual(transitions, []);
  });

  await t.test("cancelling during admission or after sending the spawn request keeps the garage visible", async t => {
    const { drive, nextRequest, socket, transitions } = start(t);
    let current = true;
    const first = drive(() => current);
    let join = await nextRequest();
    current = false;
    receiveSocialResult({ request_id: join.request_id, ok: true, data: admission });
    await first;
    assert.equal(socket.sent.length, 1);
    current = true;
    const second = drive(() => current);
    join = await nextRequest();
    receiveSocialResult({ request_id: join.request_id, ok: true, data: admission });
    const spawn = await nextRequest();
    assert.equal(spawn.type, "spawn_request");
    assert.equal(spawn.vehicle, "sierra");
    current = false;
    socket.receive(validSpawn(spawn.vehicle));
    await second;
    assert.deepEqual(transitions, []);
    assert.equal(loadouts.getState().defaultHero, "sierra");
  });

  await t.test("a driver already admitted can retry a rejected spawn with their own vehicle", async t => {
    const { drive, nextRequest, socket, transitions } = start(t, { alreadyInHub: true });
    const rejected = assert.rejects(drive(), /outside the playable map/);
    const first = await nextRequest();
    assert.deepEqual(first, { type: "spawn_request", map: hub.map, vehicle: "sierra", mode: "sandbox" });
    socket.receive({ type: "spawn_error", map: hub.map, message: "outside the playable map" });
    await rejected;
    assert.deepEqual(transitions, []);
    const retry = drive();
    assert.deepEqual(await nextRequest(), first);
    socket.receive(validSpawn("sierra"));
    await retry;
    assert.deepEqual(transitions, ["sandbox"]);
  });
});
