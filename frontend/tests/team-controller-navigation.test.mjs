import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {createServer} from 'vite';import {act,createElement as h} from 'react';

test('team filters and Heroes respect controller ownership',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map(),frames=new Map();let serial=0,vite,root;
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:cb=>{frames.set(++serial,cb);return serial;},cancelAnimationFrame:id=>frames.delete(id)})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 const pad={connected:true,index:0,id:'team-filter-controller',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[pad];
 const poll=()=>act(async()=>{const[id,fn]=frames.entries().next().value;frames.delete(id);fn(performance.now());});
 const press=async(index,held)=>{pad.buttons[index]={pressed:held,value:Number(held)};await poll();};
 try{
  const {createRoot}=await import('react-dom/client');
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});const load=p=>vite.ssrLoadModule('/src/'+p);
  const {GameController}=await load('controls/GameController.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useNetworkStore:network}=await load('store/session/networkStore.ts'),{useInputStore:input}=await load('store/input/inputStore.ts'),{useScoreboardStore:board}=await load('store/hud/scoreboardStore.ts'),{useCombatStore:combat}=await load('combat/combatStore.ts');
  const {Keyboard}=await load('controls/Keyboard.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),client=await load('net/socialClient.ts'),{VehicleFlags}=await load('store/input/protocol/inputMasks.ts');
  ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});network.setState({connected:true,playerId:'tank',snapshot:{tick:1,entities:[{id:'tank',vehicle_id:'tank',team:'red',room_id:1,rotation:[0,0,0,1],combat:{enabled:true,cannon_reload:0,coax_reload:0,basket_reload:0}}]}});combat.getState().setEnabled(true);root=createRoot(document.getElementById('root'));await act(async()=>root.render(h(GameController)));await poll();
  await t.test('composition LT/RT change only team filter and held trigger cannot turn into reverse',async()=>{
   await act(async()=>board.setState({pinned:true,view:'composition',teamFilter:'all'}));await press(6,true);assert.equal(board.getState().teamFilter,'blue');assert.equal(input.getState().input.throttle,0);await poll();assert.equal(board.getState().teamFilter,'blue');assert.equal(input.getState().input.throttle,0);
   await press(6,false);await press(7,true);assert.equal(board.getState().teamFilter,'all');assert.equal(input.getState().input.throttle,0);await press(7,false);
  });
  await t.test('B closes composition even with a trigger held and cannot engage the e-brake',async()=>{
   await press(6,true);await press(1,true);assert.equal(board.getState().pinned,false);assert.equal(input.getState().input.handbrake,0);assert.equal(input.getState().input.throttle,0);await press(1,false);await press(6,false);await poll();
  });
  await t.test('a disconnected controller sleeps and resumes when connected', async () => {
    pad.connected = false;
    await poll();
    assert.equal(frames.size, 0);
    pad.connected = true;
    window.dispatchEvent(new window.Event('gamepadconnected'));
    await poll();
    assert.equal(frames.size, 1);
  });
  await t.test('Stats preserves the driving triggers because it has no team filter',async()=>{
   await act(async()=>board.setState({pinned:true,view:'table'}));await poll();await press(7,true);assert.equal(input.getState().input.throttle,1);await press(7,false);await act(async()=>board.getState().close());
  });
  await t.test('Y in Heroes leaves the current page and secondary weapon alone',async()=>{
   let calls=0;const handle=()=>calls++;window.addEventListener('avenlab:hero-abilities',handle);
   try{
    await act(async()=>ui.setState({screen:'heroes',overlay:null}));await poll();
    const weapon=combat.getState().secondaryWeapon;
    await press(3,true);await poll();await press(3,false);
    assert.equal(calls,0);assert.equal(ui.getState().overlay,null);
    assert.equal(combat.getState().secondaryWeapon,weapon);
   }finally{window.removeEventListener('avenlab:hero-abilities',handle);}
  });
  await t.test('result overlay routes LT/RT secondary tabs without drive input',async()=>{
   await act(async()=>ui.setState({screen:'sandbox',overlay:'match_results'}));await poll();const actions=[];const handle=e=>actions.push(e.detail);window.addEventListener('avenlab:panel-action',handle);
   try{await press(7,true);assert.deepEqual(actions,['next_option']);await poll();assert.equal(actions.length,1);assert.equal(input.getState().input.throttle,0);await press(7,false);await press(6,true);assert.deepEqual(actions,['next_option','previous_option']);await press(6,false);}finally{window.removeEventListener('avenlab:panel-action',handle);}
  });
  await t.test('creator assigns the left stick to options, right stick to the character, and triggers to visible submenus', async () => {
    const { bindWelcomeMenuPanel } = await load("controls/inputRouting.ts");
    const { bindRosterSticks } = await load("game/preview/rosterStickControls.ts");
    const panel = document.createElement("section");
    const stickSamples = [], actions = [];
    const unbindPanel = bindWelcomeMenuPanel(panel);
    const unbindSticks = bindRosterSticks((x, y, turn) => stickSamples.push([x, y, turn]));
    const handle = event => actions.push(event.detail);
    window.addEventListener("avenlab:panel-action", handle);
    try {
      await act(async () => ui.setState({ screen: "welcome", overlay: null }));
      await poll();
      pad.axes = [0, 1, .8, 0];
      await poll();
      assert.deepEqual(actions.splice(0), ["down"]);
      assert.deepEqual(stickSamples.at(-1).slice(0, 2), [0, 0]);
      assert.ok(stickSamples.at(-1)[2] > 0);
      pad.axes = [0, 0, .8, 0];
      await poll();
      assert.deepEqual(actions, [], "rotating the character does not select a tile");
      pad.axes.fill(0);
      await press(7, true); await press(7, false);
      assert.deepEqual(actions, []);
      panel.innerHTML = '<div role="tab" data-creator-channel="roots"></div>';
      await press(7, true); await poll(); await press(7, false);
      await press(6, true); await press(6, false);
      await press(5, true); await poll(); await press(5, false);
      await press(4, true); await poll(); await press(4, false);
      assert.deepEqual(actions.splice(0), ["next_option", "previous_option", "next_tab", "previous_tab"]);
      unbindPanel();
      pad.axes = [0, 1, .8, 0];
      await poll();
      assert.ok(stickSamples.at(-1)[1] > 0, "the roster regains camera orbit on exit");
      assert.deepEqual(actions, []);
    } finally {
      pad.axes.fill(0);
      unbindPanel(); unbindSticks();
      window.removeEventListener("avenlab:panel-action", handle);
    }
  });
  await t.test("Profile separates the header from settings and goes back one level per press", async () => {
    const { MainMenuProfile } = await load("game/menus/MainMenuProfile.tsx");
    const { WelcomeScreen } = await load("game/welcome/WelcomeScreen.tsx");
    const { bindRosterSticks } = await load("game/preview/rosterStickControls.ts");
    await load("game/characters/GarageProfilePanel.tsx");
    const previousFetch = globalThis.fetch;
    const priorSocial = social.getState();
    const requests = [], orbit = [];
    const unbindSticks = bindRosterSticks((x, y) => orbit.push([x, y]));
    globalThis.fetch = async url => {
      requests.push(url);
      return Response.json({ email: "owner@example.test", hasMfa: true, admin: false });
    };
    const row = name => document.querySelector(`[data-profile-setting="${name}"]`);
    const tab = name => document.querySelector(`.garage-entry-header [aria-label="${name}"]`);
    const sameFocus = (control, message) => {
      assert.ok(control, message);
      const label = node => node.getAttribute("aria-label") ?? node.getAttribute("name") ?? node.tagName;
      assert.ok(document.activeElement === control, `${message ?? "Focus"}: expected ${label(control)}, got ${label(document.activeElement)}`);
    };
    const key = (key, code = key) => act(async () => {
      const event = new window.KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true });
      document.activeElement.dispatchEvent(event);
      return event.defaultPrevented;
    });
    const tap = async index => { await press(index, true); await press(index, false); };
    function Menu() {
      return ui(state => state.screen) === "main"
        ? h(MainMenuProfile, { focusMenu: () => {} })
        : h(WelcomeScreen);
    }
    try {
      await act(async () => {
        social.setState({ stagingSignIn: true, registeredProfile: true, available: true, accountsAvailable: true,
          profileStatus: "ready", view: { profile: { id: "profile", name: "Driver", account_display_name: "Account owner", characters: [] } } });
        ui.getState().setScreen("main");
        root.render(h("div", null, h(GameController), h(Keyboard), h(Menu)));
      });
      await poll();
      await act(async () => document.querySelector("[data-main-profile-toggle]").click());
      const account = [...document.querySelectorAll(".main-menu-profile-panel button")].find(item => item.textContent === "Account");
      await act(async () => account.click());
      assert.equal(ui.getState().welcomeSection, "account");
      sameFocus(row("name"), "profile opens with its first setting selected");
      await key("ArrowUp");
      sameFocus(row("name"), "Up at the first setting cannot reach Back");
      await key("s", "KeyS");
      sameFocus(row("email"), "S moves down within settings");
      await key("w", "KeyW");
      sameFocus(row("name"), "W moves up within settings");
      for (const [letter, label] of [["q", "Log out"], ["q", "Back"], ["q", "Profile"], ["e", "Back"]]) {
        await key(letter, "Key" + letter.toUpperCase());
        sameFocus(tab(label), "Q/E cycles the header without activating it");
      }
      for (const [bumper, label] of [[5, "Log out"], [5, "Profile"], [5, "Back"], [4, "Profile"]]) {
        await tap(bumper);
        sameFocus(tab(label), "the bumpers use the same header order");
      }
      await key("ArrowDown");
      sameFocus(row("name"));
      await key("w", "KeyW");
      sameFocus(row("name"), "moving up at the first setting cannot enter the header");
      await key("s", "KeyS");
      sameFocus(row("email"));
      pad.axes[1] = 1;
      await poll();
      sameFocus(row("security"), "the left stick moves through the settings while the garage is present");
      assert.ok(orbit.every(([x, y]) => !x && !y), "settings navigation does not move the camera");
      pad.axes[1] = 0;
      await poll();
      await tap(13);
      sameFocus(row("delete"), "navigation skips an invite row without admin permission");
      await tap(13);
      sameFocus(row("delete"), "moving down from the final setting cannot enter the header");
      await tap(12);
      sameFocus(row("security"));
      await key("q", "KeyQ");
      sameFocus(tab("Log out"));
      await tap(13);
      sameFocus(row("security"), "leaving the header restores the last settings row");
      await tap(12);
      sameFocus(row("email"));
      await tap(0);
      assert.equal(row("email").getAttribute("aria-expanded"), "true");
      await tap(13);
      const email = document.querySelector('[name="newEmail"]');
      sameFocus(email);
      email.value = "query@example.test";
      for (const [letter, code] of [["q", "KeyQ"], ["e", "KeyE"], ["s", "KeyS"], ["w", "KeyW"],
        ["ArrowLeft", "ArrowLeft"], ["ArrowDown", "ArrowDown"]]) {
        assert.equal(await key(letter, code), false, "text-entry keys stay available to the browser");
        sameFocus(email);
      }
      await press(1, true);
      await poll();
      assert.equal(row("email").getAttribute("aria-expanded"), "false", "one held B only closes the editor");
      sameFocus(row("email"));
      await press(1, false);
      await key("Enter");
      assert.equal(row("email").getAttribute("aria-expanded"), "true");
      await key("Escape");
      assert.equal(row("email").getAttribute("aria-expanded"), "false", "one Escape only closes the editor");
      await key("e", "KeyE");
      sameFocus(tab("Back"));
      await tap(0);
      assert.equal(ui.getState().screen, "main", "the branded Back returns to the originating main menu");
      assert.deepEqual(requests, ["/__alpha/session"], "navigating cannot mutate the account or log out");
    } finally {
      pad.axes.fill(0);
      unbindSticks();
      globalThis.fetch = previousFetch;
      await act(async () => {
        root.render(h(GameController));
        social.setState(priorSocial);
      });
    }
  });
  await t.test('Mechanic U and LB issue the same recovery action without accidentally boosting',async()=>{
   const sent=[];client.setSocialConnection({readyState:WebSocket.OPEN,send:body=>sent.push(JSON.parse(body))});
   const actor={id:'mechanic',vehicle_id:'fortuner',team:'red',room_id:1,position:[0,1,0],rotation:[0,0,0,1],speed:0,health:{hp:500,max_hp:500,defeated:false,revive_cooldown_s:0}},target={...actor,id:'ally',position:[6,1,0],health:{hp:0,max_hp:500,defeated:true,recovery_window_s:12,respawn_remaining_s:10,disabled_reason:'combat'}};
   await act(async()=>{social.setState({view:{profile:{id:'profile',name:'Mechanic'},worlds:[],alpha:{active:{world_id:1,team:'red',hero:'mechanic',mode:'quickplay'}}}});network.setState({connected:true,playerId:'mechanic',room_id:1,snapshot:{tick:10,entities:[actor,target]}});ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});combat.getState().setEnabled(false);root.render(h('div',null,h(GameController),h(Keyboard)));});await poll();
   const key=async(type,code)=>act(async()=>window.dispatchEvent(new window.KeyboardEvent(type,{code,bubbles:true,cancelable:true})));
   const reply=async()=>act(async()=>client.receiveSocialResult({request_id:sent.at(-1).request_id,ok:true,data:{revived:true,target:'ally',cooldown_s:20}}));
   await key('keydown','KeyU');assert.equal(sent.at(-1).action,'vehicle_revive');assert.equal(sent.at(-1).target,'ally');await reply();await key('keyup','KeyU');
   await press(4,true);assert.equal(sent.length,2);assert.equal(sent.at(-1).action,'vehicle_revive');assert.equal(input.getState().input.vehicleMask&VehicleFlags.BOOST,0);await reply();await press(4,false);
   await act(async()=>network.setState({snapshot:{tick:11,entities:[{...actor,health:{...actor.health,revive_cooldown_s:20}},target]}}));await press(4,true);assert.equal(sent.length,2,'cooldown blocks a new request');assert.equal(input.getState().input.vehicleMask&VehicleFlags.BOOST,0);await press(4,false);client.setSocialConnection(null);
  });
 }finally{if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();for(const[key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
