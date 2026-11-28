import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { AnimationMixer, LoopOnce, Object3D, Vector3 } from 'three';

function characterTestDom() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const original = new Map();
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, HTMLSelectElement: dom.window.HTMLSelectElement,
    Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, localStorage: dom.window.localStorage,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  document.hasFocus = () => true;
  HTMLElement.prototype.scrollIntoView = () => {};
  return {
    dom,
    close() {
      dom.window.close();
      for (const [key, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

function bodyEditor(click) {
  const open = async section => {
    const target = '[data-body-section="' + section + '"]';
    if (!document.querySelector(target)) await click('[data-body-back]');
    await click(target);
  };
  const active = async section => {
    await open(section);
    const value = document.querySelector('[data-creator-option][aria-pressed=true]').dataset.creatorOption;
    await click('[data-body-back]');
    return value;
  };
  const pick = async (section, id, keepOpen = false) => {
    await open(section);
    await click('[data-creator-option="' + id + '"]');
    if (!keepOpen) await click('[data-body-back]');
  };
  return { open, active, pick };
}

test('Heroes opens the character picker, saves one profile choice, and opens Garage from a vehicle', async t => {
  const { close } = characterTestDom();
  let vite, root;
  try {
    vite = await createServer({ define: { __FITTED_HAIR_IDS__: JSON.stringify(['hair-01', 'Mia_01']), __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify(['gothic-skirt-04', 'top-01', 'medieval-05']) },
      server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
      plugins: [{
        name: 'count-fit-review-keys',
        enforce: 'pre',
        transform(source, id) {
          if (!id.endsWith('/fitReviewStore.ts')) return;
          return source.replace('export function fitReviewKey(', 'function buildFitReviewKey(') + `
            export let fitReviewKeyCalls = 0;
            export function fitReviewKey(...args: Parameters<typeof buildFitReviewKey>) {
              fitReviewKeyCalls++;
              return buildFitReviewKey(...args);
            }
          `;
        },
      }],
    });
    const load = path => vite.ssrLoadModule(`/src/${path}`);
    const { HeroWorkshop } = await load('game/heroes/HeroWorkshop.tsx');
    const { readLocalCharacter } = await load('game/characters/localOutfits.ts');
    const { useUIStore: ui } = await load('store/menus/uiStore.ts');
    const { useSocialStore: social } = await load('store/social/socialStore.ts');
    const { useHeroLoadouts: loadouts, FACTORY_APPEARANCE } = await load('vehicles/cosmetics/heroLoadouts.ts');
    const { useAlphaStore: alpha } = await load('store/alpha/alphaStore.ts');
    const { usePreviewZoom: zoom } = await load('game/preview/previewZoomStore.ts');
    const { useCharacterPreviewStore: preview } = await load('game/characters/characterPreviewStore.ts');
    const fitKeys = await load('game/characters/fitReviewStore.ts');
    const { routeMenuAction: route } = await load('controls/inputRouting.ts');
    const client = await load('net/socialClient.ts');
    const requests = [];
    client.setSocialConnection({ readyState: WebSocket.OPEN, send: value => requests.push(JSON.parse(value)) });
    const view = {
      profile: { id: 'driver', name: 'Driver', progression: { default_hero: 'brz', hero_loadouts: {}, character: null, character_presets: {}, cosmetics_revision: 0 } },
      players: [], teammates: [], requests: [], groups: [], worlds: [], world_invites: [], maps: [],
      current_world_id: null, limits: { max_active_worlds: 3 },
    };
    social.getState().receive(view);
    loadouts.getState().adopt('driver', 'brz', { brz: { ...FACTORY_APPEARANCE, body: '#ef2244' } });
    ui.setState({ screen: 'heroes', overlay: null, isModeLoading: false });
    const { createRoot } = await import('react-dom/client');
    root = createRoot(document.getElementById('root'));
    const characterViews = [], drafts = [];
    await act(async () => root.render(h(HeroWorkshop, {
      onCharacterViewChange: open => characterViews.push(open),
      onCharacterPreviewChange: choice => drafts.push(choice),
    })));
    const find = selector => document.querySelector(selector);
    const click = selector => act(async () => find(selector).click());
    const openEmotes = () => find('.character-emote-toggle[aria-expanded="false"]') ? click('.character-emote-toggle') : Promise.resolve();
    const body = bodyEditor(click);
    const chooseEmoteGroup = group => click(`[data-emote-group="${group}"]`);
    const openCollections = () => act(async () => [...document.querySelectorAll(".character-emote-browser button")].find(button => button.textContent === "Collections").click());
    const playEmote = async selector => {
      await click(selector);
      assert(find('[aria-label="Emote details"]'));
      await click('.character-emote-back');
    };
    const browseWardrobe = async category => {
      if (!find('.dressing-details').hidden) await click('.dressing-details .menu-back-button');
      if (!find('.dressing-catalog').hidden) await click('[data-wardrobe-back]');
      if (!find(`[data-category=${category}]`)) {
        for (const group of document.querySelectorAll('[data-wardrobe-group]')) {
          await act(async () => group.click());
          if (find(`[data-category=${category}]`)) break;
        }
      }
      await click(`[data-category=${category}]`);
    };
    const select = (label, value) => act(async () => {
      const input = find(`select[aria-label="${label}"]`);
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const slide = (selector, value) => act(async () => {
      const input = find(selector);
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setValue.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const poseTools = '[aria-label="Pose tools"]';
    const posePanel = () => document.getElementById(find(poseTools).getAttribute('aria-controls'));
    const cameraView = label => [...document.querySelectorAll('[data-camera-choice]')]
      .find(button => button.getAttribute('aria-label') === label);
    const chooseCameraView = async label => {
      const button = cameraView(label);
      assert(button && !button.closest('[hidden]'), `${label} is an available camera view`);
      await act(async () => button.click());
    };
    const move = action => act(async () => route(action));
    const title = () => find('.menu-frame-header h1').textContent;

    assert.equal(title(), 'HEROES');
    const headerPortrait = () => find('[data-customize-vehicle] .hero-portrait-art');
    assert.equal(headerPortrait().dataset.style, 'deferred', 'the roster header waits to bake a custom vehicle portrait');
    assert.equal(find('[data-hero=brz] .hero-portrait-art').dataset.style, 'deferred');
    await click('[aria-label="Zoom vehicle in"]');
    assert.equal(zoom.getState().level, 1);
    await click('[aria-label="Reset vehicle zoom"]');
    assert.equal(zoom.getState().level, 0);
    await click('[data-open-character]');
    assert.equal(find('.menu-frame-header h1'), null);
    assert.ok(find('.menu-frame-header [data-header-back]'));
    assert.equal(headerPortrait().dataset.style, 'deferred', 'wardrobe entry keeps the cold vehicle bake deferred');
    assert.equal(find('.hero-roster'), null);
    assert.equal(find('[role=tab]'), null);
    assert.equal(find('[data-character-preview]').dataset.characterPreview, 'mara-vega');
    assert.equal(find('[data-character-option="mara-vega"] .character-portrait'), null,
      'the character option uses its text label when a render is unavailable');
    assert.equal(find('.character-emote-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(find('.character-emotes'), null);
    await openEmotes();
    await chooseEmoteGroup('Pose pack');
    const poseButton = label => act(async () => {
      [...document.querySelectorAll('[aria-label="Emote results"] button')].find(button => button.textContent === label).click();
    });
    await select('Start pose', 'pose-attentive');
    await poseButton('Hold start pose');
    assert.equal(preview.getState().emote.id, 'pose-attentive');
    await select('Animation', 'walk-casual');
    const { CHARACTER_POSE_GROUPS } = await load('game/characters/posePack.ts');
    const availablePoses = CHARACTER_POSE_GROUPS.flatMap(group => group.poses.map(pose => pose.id));
    for (const label of ['Start pose', 'End pose']) {
      assert.deepEqual([...find(`select[aria-label="${label}"]`).options].map(option => option.value), availablePoses);
    }
    const importedPose = 'pose-mh-poses03-anrico_standing10';
    await select('End pose', importedPose);
    await poseButton('Play sequence');
    assert.deepEqual(preview.getState().emote, {
      id: 'pose-sequence', sequence: { from: 'pose-attentive', motion: 'walk-casual', to: importedPose },
    });
    await poseButton('Return to idle');
    assert.equal(preview.getState().emote, null);
    await chooseEmoteGroup('Garage');
    assert(![...document.querySelectorAll('.character-emotes [data-emote-id]')].some(button => button.querySelector('.emote-name')?.textContent === 'Side step and glance'));
    for (const id of ['stance-pockets', 'stance-hand-on-hip', 'stance-crossed-ankles']) {
      const selector = `.character-emotes [data-emote-id="${id}"]`;
      assert.equal(document.querySelectorAll(selector).length, 1);
      await click(selector);
      assert.equal(preview.getState().emote.id, id, 'selecting a gallery row starts its animation');
      await click('.character-emote-back');
    }
    await playEmote('.character-emotes .character-emote-row:first-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '005');
    await chooseEmoteGroup('Best');
    assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, 8);
    await playEmote('.character-emotes .character-emote-row:first-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '035');
    await openCollections();
    await chooseEmoteGroup('Playful');
    assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, 11);
    await playEmote('.character-emotes .character-emote-row:first-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '021');
    await playEmote('.character-emotes .character-emote-row:last-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, 'robot-dance');
    await chooseEmoteGroup('Shy');
    assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, 11);
    await playEmote('.character-emotes .character-emote-row:first-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '035');
    await playEmote('.character-emotes .character-emote-row:last-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, 'oh-no');
    await chooseEmoteGroup('Tsundere');
    assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, 10);
    await playEmote('.character-emotes .character-emote-row:last-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '050');
    await chooseEmoteGroup('Expressions');
    assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, 10);
    await playEmote('.character-emotes .character-emote-row:first-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '051');
    await chooseEmoteGroup('Roadside');
    assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, 7);
    assert.equal(find('.character-emotes .character-emote-row:last-child [data-emote-id] .emote-name').textContent, 'Wave them through');
    await chooseEmoteGroup('Rivalry');
    assert.equal(find('[data-emote-group="Rivalry"]').textContent, 'Rivalry');
    assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, 8);
    await playEmote('.character-emotes .character-emote-row:first-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '071');
    await playEmote('.character-emotes .character-emote-row:last-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '080');
    await chooseEmoteGroup('Pit Crew');
    assert.equal(find('[data-emote-group="Pit Crew"]').textContent, 'Pit Crew');
    assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, 9);
    await playEmote('.character-emotes .character-emote-row:last-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '090');
    await chooseEmoteGroup('After Hours');
    assert.equal(find('[data-emote-group="After Hours"]').textContent, 'After Hours');
    assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, 10);
    await playEmote('.character-emotes .character-emote-row:first-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '091');
    await playEmote('.character-emotes .character-emote-row:nth-child(5) [data-emote-id]');
    assert.equal(preview.getState().emote.id, '095');
    await playEmote('.character-emotes .character-emote-row:last-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '100');
    await chooseEmoteGroup('Showroom');
    assert.equal(find('[data-emote-group="Showroom"]').textContent, 'Showroom');
    assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, 10);
    await playEmote('.character-emotes .character-emote-row:first-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '103');
    await playEmote('.character-emotes .character-emote-row:last-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '112');
    for (const [name, first, last] of [
      ['Elegant', 113, 120], ['Stoic', 131, 140], ['Explorer', 141, 150],
      ['Tech', 151, 160], ['Workshop', 161, 170], ['Starter', 171, 180],
      ['Starter Comedy', 181, 190], ['Race Reactions', 191, 198],
    ]) {
      await chooseEmoteGroup(name);
      assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, last - first + 1);
      await playEmote('.character-emotes .character-emote-row:first-child [data-emote-id]');
      assert.equal(preview.getState().emote.id, String(first));
      await playEmote('.character-emotes .character-emote-row:last-child [data-emote-id]');
      assert.equal(preview.getState().emote.id, String(last));
    }
    await chooseEmoteGroup('Performer');
    assert.equal(document.querySelectorAll('.character-emotes [data-emote-id]').length, 11);
    assert.equal(find('.character-emotes .character-emote-row:last-child [data-emote-id] .emote-name').textContent, 'Hands up');
    await playEmote('.character-emotes .character-emote-row:last-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, 'hands-up-crowd');
    await chooseEmoteGroup('Garage');
    await click('[data-character-option="jules-okafor"]');
    assert.equal(find('[data-character-preview]').dataset.characterPreview, 'jules-okafor');
    assert.equal(requests.length, 0);
    await click('.character-equip button');
    assert.equal(requests[0].action, 'character_equip');
    const choice = { id: 'jules-okafor', outfit: 'night-run' };
    assert.deepEqual(requests[0].character, choice);
    let serverProgression = view.profile.progression;
    const selectServerCharacter = character => {
      const previous = serverProgression.character;
      const presets = { ...serverProgression.character_presets };
      if (previous && previous.id !== character.id) presets[previous.id] = previous;
      delete presets[character.id];
      serverProgression = { ...serverProgression, character, character_presets: presets, cosmetics_revision: serverProgression.cosmetics_revision + 1 };
    };
    const receiveCareer = () => social.getState().receive({ ...view, profile: { ...view.profile, progression: serverProgression } });
    const switchCareer = async character => {
      selectServerCharacter(character);
      await act(async () => receiveCareer());
    };
    const acknowledge = async (request, character, publish = true) => {
      selectServerCharacter(character);
      await act(async () => {
        if (publish) receiveCareer();
        client.receiveSocialResult({ request_id: request.request_id, ok: true, data: serverProgression });
      });
    };
    await acknowledge(requests[0], choice);
    const { characterAppearance } = await load('game/characters/characterCatalog.ts');
    await switchCareer({ ...choice, identity: 'nonbinary', appearance: { ...characterAppearance(choice), personality: 'mechanic' } });
    const characterTabs = '[role=tablist][aria-label="Character sections"]';
    const identityTab = `${characterTabs} #character-editor-tab-body`;
    const identityControl = find(identityTab);
    assert.deepEqual([...document.querySelectorAll(`${characterTabs} [role=tab]`)].map(node => node.textContent),
      ['Details', 'Body', 'Appearance', 'Emotes']);
    assert.equal(find(`${characterTabs} [aria-selected="true"]`).id, 'character-editor-tab-appearance');
    await move('previous_tab');
    assert.equal(characterViews.at(-1), 'body');
    assert.equal(document.activeElement, identityControl);
    assert.equal(identityControl.getAttribute('aria-selected'), 'true');
    assert.equal(identityControl.tabIndex, 0);
    const panel = document.getElementById(identityControl.getAttribute('aria-controls'));
    assert.equal(panel.getAttribute('role'), 'tabpanel');
    assert.equal(panel.getAttribute('aria-labelledby'), identityControl.id);
    await move('down');
    assert(document.activeElement.closest('[aria-label="Body customization"]'));
    await move('next_tab');
    assert.equal(characterViews.at(-1), 'appearance');
    assert.equal(identityControl.getAttribute('aria-selected'), 'false');
    assert.equal(identityControl.tabIndex, -1);
    await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, identityControl);
    await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyE', bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, find('#character-editor-tab-appearance'));
    await click('#character-editor-tab-details');
    const detailTraits = () => [...document.querySelectorAll('.character-details dd')].map(node => node.textContent);
    assert.deepEqual(detailTraits(), ['Nonbinary', 'Mechanic', 'Service bay']);
    assert.equal(find('.character-details select, .character-details [data-character-option], [aria-label="Character identity"]'), null);
    const { findGaragePreviewEmote } = await load('game/characters/garageEmotes.ts');
    const signatureButtons = [...document.querySelectorAll('[aria-label="Signature emotes"] [role="button"]')];
    assert.deepEqual(signatureButtons.map(node => node.textContent), ['165', '164', '163', '161'].map(id => findGaragePreviewEmote(id, false).name));
    await act(async () => signatureButtons[0].click());
    assert.equal(preview.getState().emote.id, '165');
    assert.equal(requests.length, 1, 'previewing a signature emote leaves the character untouched');
    await click('#character-editor-tab-emotes');
    assert.equal(find(identityTab), identityControl);
    assert(find('[aria-label="Emote results"]').classList.contains('character-controls--right'));
    assert(find('[aria-label="Emote collection"]').closest('.character-controls--left'));
    assert.equal(find('[data-character-option]'), null, 'Emotes uses the active character model');
    assert(cameraView('Full body') && !cameraView('Full body').closest('[hidden]'), 'Emotes exposes the character camera rail');
    assert(find('.dressing-preview-zoom [aria-label="Hide interface"]'));
    assert.equal(find('select[aria-label="Preview camera"]'), null);
    await openEmotes();
    const searchMotions = value => act(async () => {
      const input = find('[aria-label="Emote results"] input[type="search"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await searchMotions('shy hello');
    assert(find('[data-emote-id="033"]'), 'finds Half hidden greeting from the default Gestures page');
    assert.equal(find('[data-emote-id="010"]'), null, 'all search terms must match');
    await click('[data-emote-id="033"]');
    assert.equal(preview.getState().emote.id, '033');
    await click('.character-emote-back');
    assert.equal(find('input[type="search"]').value, 'shy hello');
    const browseButton = (region, label) => [...document.querySelectorAll(`[aria-label="${region}"] button`)]
      .find(button => button.textContent === label);
    await act(async () => browseButton('Browse motions', 'Objects').click());
    await act(async () => browseButton('Objects', 'Phone').click());
    assert(find('[data-emote-id="156"]'), 'finds Quick message by its phone prop');
    await act(async () => browseButton('Objects', 'Phone').click());
    assert.equal(find('input[type="search"]').value, '');
    await chooseEmoteGroup('All');
    assert.equal(find('[aria-label="Emote logic review"]'), null, 'fit review opens with the chosen emote');
    const emoteCount = document.querySelectorAll('.character-emotes [data-emote-id]').length;
    assert(emoteCount > 180);
    const firstEmote = find('.character-emotes [data-emote-id]');
    await act(async () => firstEmote.focus());
    const fitKeyCalls = fitKeys.fitReviewKeyCalls;
    assert(fitKeyCalls >= emoteCount, 'the open list computes a fit key for each emote');
    await act(async () => preview.setState({ camera: 'Face', zoom: 1.1 }));
    assert.equal(find('input[aria-label="Preview zoom"]').value, '1.1');
    assert.equal(fitKeys.fitReviewKeyCalls, fitKeyCalls, 'camera and zoom updates leave emote review rows alone');
    assert.equal(document.activeElement, firstEmote);
    await searchMotions('applause');
    assert(document.querySelectorAll('.character-emotes [data-emote-id]').length > 0);
    assert([...document.querySelectorAll('.character-emotes .emote-name')].every(n => n.textContent.toLowerCase().includes('applause')));
    const emoteName = find('.character-emotes [data-emote-id] .emote-name').textContent;
    await click('[aria-label="Emote results"] .character-emotes .character-emote-row:first-child [data-emote-id]');
    const fitReview = find('[aria-label="Emote details"] [aria-label="Emote logic review"]');
    assert(fitReview.textContent.includes(emoteName), 'the review identifies the selected emote');
    assert(fitReview.querySelector("textarea"));
    await click('[aria-label="Emote logic review"] input[type="checkbox"]');
    assert(fitReview.querySelector('input[type="checkbox"]').checked, 'the selected emote review can be edited beside the results');
    await click('.character-emote-back');
    const reviewedEmote = find('.character-emotes .character-emote-row:first-child [data-emote-id]');
    assert(reviewedEmote.querySelector('[aria-label="Fit partial"]'), 'the updated review appears in the results');
    assert.equal(document.activeElement, reviewedEmote, 'back restores focus to the reviewed emote');
    const { useFittingTurnStore: turns } = await vite.ssrLoadModule('/src/game/characters/fittingControlsStore.ts');
    await act(async () => {
      turns.setState({ characterYaw: Math.PI });
      preview.setState({ camera: 'Face', zoom: 1.2 });
    });
    await chooseEmoteGroup('Garage');
    assert.equal(turns.getState().characterYaw, 0);
    assert.equal(preview.getState().camera, 'Full body');
    assert.equal(preview.getState().zoom, 1);
    const cockpitToggle = '[data-cockpit-toggle]';
    await act(async () => preview.setState({ cockpitVehicle: 'brz' }));
    assert.equal(find(cockpitToggle).disabled, false, 'the selected vehicle has its own cockpit');
    assert.equal(find('[aria-label="Driving emotes"]'), null);
    await click(cockpitToggle);
    assert.equal(preview.getState().insideCar, true);
    assert.equal(find('[aria-label="Emote collection"]'), null);
    assert.equal(find('[aria-label="Driving emotes"] button:first-child').disabled, true);
    await act(async () => preview.setState({ cockpitAvailable: true }));
    assert.equal(find('[aria-label="Driving emotes"] .character-emote-row:last-child [data-emote-id] .emote-name').textContent, 'Steering test · Right');
    assert.equal(find('[aria-label="Driving emotes"] button:first-child').disabled, false);
    const cameraAngles = 'button[aria-label="Camera angles"]';
    assert.equal(cameraView('Driver').getAttribute('aria-pressed'), 'true');
    await chooseCameraView('Whole vehicle');
    await click('[aria-label="Driving emotes"] .character-emote-row:last-child [data-emote-id]');
    assert.equal(preview.getState().emote.id, '200');
    assert.equal(preview.getState().camera, 'Whole car');
    assert(!cameraView('Whole vehicle').closest('[hidden]'), 'cockpit views stay available during an emote');
    assert.equal(cameraView('Whole vehicle').getAttribute('aria-pressed'), 'true');
    await chooseCameraView('Driver');
    assert.equal(preview.getState().camera, 'Full body');
    await click(cockpitToggle);
    assert.equal(preview.getState().insideCar, false);
    assert.equal(preview.getState().emote, null);
    await click(cockpitToggle);
    await click('#character-editor-tab-appearance');
    assert.equal(find('[data-character-option]'), null, 'the Dressing Room uses the active character model');
    await browseWardrobe('outfits');
    assert.equal(cameraView('Coat').getAttribute('aria-pressed'), 'true');
    for (const category of ['hair', 'face', 'skin']) assert.equal(find(`[data-category=${category}]`), null);
    assert(find('.dressing-preview-zoom [aria-label="Hide interface"]'), 'Dressing Room keeps the eye on the zoom rail');
    assert.equal(preview.getState().insideCar, false);
    assert.equal(preview.getState().emote, null);
    await click('#character-editor-tab-body');
    assert.equal(await body.active('eyes'), 'original');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    await body.pick('eyes', 'obsidian');
    await body.pick('brows', 'copper');
    await body.pick('skin', 'deep');
    await body.pick('hair', 'espresso', true);
    assert.equal(preview.getState().camera, 'Hair');
    await click('#character-editor-tab-appearance');
    await browseWardrobe('accessories');
    await click('[data-wardrobe-item="glasses:aviator"]');
    assert.equal(drafts.at(-1).appearance.eye_color, 'obsidian');
    assert.equal(drafts.at(-1).appearance.brow_color, 'copper');
    assert.equal(drafts.at(-1).appearance.glasses, 'aviator');
    assert.equal(preview.getState().camera, 'Selected item');
    assert.equal(cameraView('Glasses').getAttribute('aria-pressed'), 'true');
    assert.equal(find('[aria-label="Clothing piece"]'), null, 'the camera selector also inspects clothing');
    assert(find('.dressing-camera-shortcuts [aria-label="Preview camera"]'), "camera shortcuts stay on the wardrobe rail");
    assert(posePanel().hidden, 'additional pose actions start collapsed');
    const fittingZoom = '.dressing-preview-zoom input[aria-label="Preview zoom"][aria-orientation="vertical"]';
    assert(find(fittingZoom));
    await slide(fittingZoom, 1.2);
    assert.equal(preview.getState().zoom, 1.2);
    const inspectionRevision = preview.getState().focusRevision;
    await click('.dressing-preview-zoom [aria-label="Reset view"]');
    assert.equal(preview.getState().zoom, 1);
    assert.ok(preview.getState().focusRevision > inspectionRevision, 'reset requests a fresh framing of the shot');
    assert.equal(preview.getState().camera, 'Selected item');
    assert.equal(preview.getState().selectedPiece, 'glasses', 'reset returns to the current inspection target');
    await click(poseTools);
    assert.equal(posePanel().hidden, false);
    assert(posePanel().contains(document.activeElement), 'keyboard activation focuses a pose action');
    assert.equal(posePanel().textContent.trim(), '', 'the pose tools use labeled icons');
    await click('[aria-label="Look away"]');
    assert.equal(preview.getState().emote?.id, 'look-away', 'wardrobe can play the glance on its own stage');
    await act(async () => preview.setState({ emote: null }));
    for (const [label, id] of [['Check makeup', 'makeup-check'], ['Redo lipstick', 'redo-lipstick'], ['Apply eyeliner', 'apply-eyeliner']]) {
      await click(`[aria-label="${label}"]`);
      assert.equal(preview.getState().emote?.id, id);
      assert.equal(preview.getState().camera, 'Face');
    }
    await act(async () => preview.setState({ emote: null, camera: 'Full body' }));
    assert(cameraView('Glasses').querySelector('svg'), 'the clothing close-up has a labeled icon');
    await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
    })));
    assert(posePanel().hidden);
    assert.equal(document.activeElement, find(poseTools));
    assert.equal(cameraView('Whole car'), undefined);
    assert.deepEqual([...document.querySelectorAll('[aria-label="Rotate character and garage"] [data-rotation]')].map(button => button.getAttribute('aria-label')),
      ['Rotate garage left', 'Rotate character left', 'Rotate character right', 'Rotate garage right']);
    await chooseCameraView('Full body');
    assert.equal(preview.getState().camera, 'Full body');
    await chooseCameraView('Glasses');
    assert.equal(preview.getState().selectedPiece, 'glasses');
    assert.equal(preview.getState().camera, 'Selected item');
    assert.equal(find('.dressing-color-panel').hidden, true);
    const paletteToggle = find('[aria-label="Open clothing colors"]');
    const palette = document.getElementById(paletteToggle.getAttribute('aria-controls'));
    assert.equal(palette.childElementCount, 0, 'the closed palette keeps its panel ID without mounting swatches');
    assert.equal(paletteToggle.textContent, '', 'the toolbar uses a swatch icon');
    await click(poseTools);
    await click('[aria-label="Open clothing colors"]');
    assert.equal(find('.dressing-color-panel').hidden, false);
    assert(posePanel().hidden, 'opening colors closes the pose tools');
    const initialMain = find('input[aria-label="Custom main color"]').value;
    await click('button[aria-label="Accent color: Crimson"]');
    assert.equal(find('input[aria-label="Custom main color"]').value, initialMain);
    await click('button[aria-label="Main color: Deep navy"]');
    assert.equal(find('input[aria-label="Custom main color"]').value, '#293953');
    assert.equal(find('input[aria-label="Custom accent color"]').value, '#ad444d');
    assert.equal(preview.getState().camera, 'Selected item', 'applying color keeps the current close-up');
    await browseWardrobe('outfits');
    assert.equal(find('.dressing-color-panel').hidden, true, 'browsing dismisses the color palette');
    await click('[data-wardrobe-item=race-crew]');
    assert(find('[data-equip-outfit]'));
    assert.equal(requests.length, 1, 'browsing an approved outfit does not write to the profile');
    await click('[data-discard-outfit-preview]');
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'night-run');
    await click('[data-wardrobe-item=race-crew]');
    assert.equal(cameraView('Coat').getAttribute('aria-pressed'), 'true');
    await click('[aria-label="Open clothing colors"]');
    const themes = find('[aria-label="Color combinations"]');
    for (const name of ['Pink', 'Pastels', 'Vibrant', 'White', 'Yellow', 'Blue', 'Red', 'Red + Black', 'Black + Red']) {
      assert(themes.querySelector(`button[aria-label="${name}"]`), `${name} has a theme shortcut`);
    }
    const mainColor = () => find('input[aria-label="Custom main color"]').value;
    const accentColor = () => find('input[aria-label="Custom accent color"]').value;
    await click('button[aria-label="Red + Black"]');
    assert.deepEqual([mainColor(), accentColor()], ['#b62235', '#101015']);
    await click('button[aria-label="Black + Red"]');
    assert.deepEqual([mainColor(), accentColor()], ['#101015', '#b62235']);
    assert.equal(find('button[aria-label="Red + Black"]').getAttribute('aria-pressed'), 'false');
    assert.equal(find('button[aria-label="Black + Red"]').getAttribute('aria-pressed'), 'true');
    await click('button[aria-label="Gothic Pink"]');
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'race-crew');
    assert.equal(drafts.at(-1).appearance.item_colors['aviator:glasses'].color, '#293953');
    assert.equal(drafts.at(-1).appearance.item_colors['aviator:glasses'].accent, '#ad444d');
    assert.equal(drafts.at(-1).appearance.item_colors['race-crew:coat'].color, '#101015');
    assert.equal(drafts.at(-1).appearance.color, 'original', 'piece dye leaves the overall outfit palette unchanged');
    assert.equal(find('input[aria-label="Custom accent color"]').value, '#ff2d95');
    await click('[aria-label="Close clothing colors"]');
    assert.equal(find('.dressing-color-panel').hidden, true);
    assert.equal(find('.dressing-color-panel').childElementCount, 0);
    await click('[aria-label="Open clothing colors"]');
    assert.deepEqual([mainColor(), accentColor()], ['#101015', '#ff2d95']);
    assert.equal(document.activeElement, find('.dressing-color-preset'), 'keyboard activation focuses the first swatch');
    await act(async () => {
      const preset = find('.dressing-color-preset');
      preset.focus();
      preset.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    });
    assert.equal(find('.dressing-color-panel').hidden, true, 'Escape closes the palette before it can leave the fitting room');
    assert.equal(find('.dressing-color-panel').childElementCount, 0);
    assert.equal(document.activeElement, find('[aria-label="Open clothing colors"]'));
    await click('#character-editor-tab-body');
    assert(find('[data-body-section=eyes]'));
    assert(find('[data-body-section=skin]'));
    await click('#character-editor-tab-details');
    assert.deepEqual(detailTraits(), ['Nonbinary', 'Mechanic', 'Service bay']);
    await click('#character-editor-tab-emotes');
    await openEmotes();
    await select('Animation clothing fit', 'fitted');
    await click('#character-editor-tab-appearance');
    assert.equal(requests.length, 1);
    assert.ok(find('[data-equip-outfit]'), `Equip action for ${JSON.stringify(drafts.at(-1))}`);
    await click('[data-equip-outfit]');
    assert.equal(requests.length, 2, 'equip submits the approved result immediately');
    assert.equal(requests[1].character.outfit, 'race-crew');
    await act(async () => t.mock.timers.tick(350));
    assert.equal(requests.length, 2, 'equip also sends pending changes in a single write');
    assert.equal(requests[1].character.appearance.eye_color, 'obsidian');
    assert.equal(requests[1].character.appearance.brow_color, 'copper');
    assert.equal(requests[1].character.appearance.skin, 'deep');
    assert.equal(requests[1].character.appearance.hair_color, 'espresso');
    assert.equal(requests[1].character.appearance.glasses, 'aviator');
    assert.equal(requests[1].character.appearance.personality, 'mechanic');
    assert.equal(requests[1].character.identity, 'nonbinary');
    assert.equal(requests[1].character.appearance.animation_fit, 'fitted');
    await browseWardrobe('props');
    await click('[data-wardrobe-item=shop-bag]');
    assert.equal(drafts.at(-1).prop, 'shop-bag');
    await click('#character-editor-tab-emotes');
    await openEmotes();
    await chooseEmoteGroup('Garage');
    assert.equal(find(cockpitToggle).disabled, false, 'a prop never prevents driving previews');
    assert([...document.querySelectorAll('.character-emotes [data-emote-id]')].some(button => button.querySelector('.emote-name')?.textContent === 'Lift the bag'));
    assert([...document.querySelectorAll('.character-emotes [data-emote-id]')].some(button => button.querySelector('.emote-name')?.textContent === 'Hands behind back'));
    assert.equal(find('input[aria-label="Preview zoom"]').max, '1.25');
    await click(cockpitToggle);
    assert.equal(preview.getState().insideCar, true);
    assert.match(document.body.textContent, /Handheld props are stowed while driving/);
    assert.equal(drafts.at(-1).prop, 'shop-bag', 'preview stowing keeps the equipped prop');
    assert([...document.querySelectorAll('[aria-label="Driving emotes"] button')].some(button => button.querySelector('.emote-name')?.textContent === 'Honk'));
    await click(cockpitToggle);
    await openCollections();
    await chooseEmoteGroup('Victory');
    assert([...document.querySelectorAll('.character-emotes [data-emote-id]')].some(button => button.querySelector('.emote-name')?.textContent === 'Happy applause'),
      'two-handed gestures remain available with a bag equipped');
    await chooseEmoteGroup('Tech');
    assert(document.querySelectorAll('.character-emotes [data-emote-id]').length > 0, 'gesture-owned props remain available');
    await click('#character-editor-tab-appearance');
    assert.equal(drafts.at(-1).id, 'jules-okafor', 'switching editor tabs keeps the selected model');
    await acknowledge(requests[1], requests[1].character);
    assert.equal(requests.length, 3, 'queued prop waits for the previous save');
    assert.equal(requests[2].character.prop, 'shop-bag');
    const staleProgression = serverProgression;
    await acknowledge(requests[2], requests[2].character, false);
    assert.equal(social.getState().view.profile.progression.character.prop, 'shop-bag', 'the acknowledgement bridges a delayed profile snapshot');
    await act(async () => social.getState().receive({ ...view, profile: { ...view.profile, progression: { ...staleProgression, level: 7 } } }));
    assert.equal(social.getState().view.profile.progression.character.prop, 'shop-bag', 'a delayed snapshot cannot revert the acknowledged outfit');
    assert.equal(social.getState().view.profile.progression.level, 7, 'unrelated progression still updates');
    await move('back');
    assert.equal(title(), 'HEROES');
    assert.equal(characterViews.at(-1), null);
    assert.equal(drafts.at(-1), null);
    assert.match(find('[data-open-character]').textContent, /Your character/);
    await click('[data-hero=camaro]');
    assert.equal(title(), 'GARAGE');
    assert.equal(headerPortrait().dataset.cacheOnly, 'false', 'the full garage can prepare a custom vehicle portrait');
    assert.equal(alpha.getState().previewHero, 'camaro');
    assert.equal(loadouts.getState().defaultHero, 'brz');
    const garageCamera = () => find('[aria-label="Garage camera and drive preview"] [data-camera-choice][aria-pressed="true"]').getAttribute('aria-label');
    assert.equal(garageCamera(), 'Showroom');
    assert.equal(find(cameraAngles).getAttribute('aria-expanded'), 'false');
    const garageZoom = '.vehicle-studio .hero-preview-zoom--vertical input[aria-label="Zoom vehicle"][aria-orientation="vertical"]';
    assert(find(garageZoom));
    await slide(garageZoom, 2);
    assert.equal(zoom.getState().level, 2);
    assert.equal(find(garageZoom).getAttribute('aria-valuetext'), '135%');
    await click('.hero-preview-zoom--vertical [aria-label="Reset vehicle zoom"]');
    assert.equal(zoom.getState().level, 0);
    assert(find('[aria-label="Garage camera and drive preview"] button[aria-label="Hide interface"]'), 'eye toggle lives in the bottom camera toolbar');
    await click('button[aria-label="Hide interface"]');
    assert(find('.hero-workshop').classList.contains('hero-workshop--hidden'));
    await click('button[aria-label="Show interface"]');
    assert(!find('.hero-workshop').classList.contains('hero-workshop--hidden'));
    await click(cameraAngles);
    await chooseCameraView('High Angle');
    assert.equal(garageCamera(), 'High Angle');
    await chooseCameraView('Driver Door');
    assert.equal(garageCamera(), 'Driver Door');
    await chooseCameraView('Cockpit');
    assert.equal(garageCamera(), 'Cockpit', 'the Camaro has its own fitted cockpit');
    const driveControls = 'button[aria-label="Drive preview controls"]';
    await click(driveControls);
    const { useGarageDrive } = await vite.ssrLoadModule('/src/game/preview/garageDriveStore.ts');
    const stationButton = () => [...document.querySelectorAll('button')].find(node => node.textContent === 'Enter cockpit');
    assert(stationButton().disabled);
    await act(async () => useGarageDrive.setState({ ready: true }));
    await act(async () => stationButton().click());
    assert.equal(useGarageDrive.getState().stage, 'station');
    assert.equal(garageCamera(), 'Cockpit');
    assert(find('button[aria-label="Steer left"]'));
    await act(async () => [...document.querySelectorAll('button')].find(node => node.textContent === 'Reset').click());
    assert.equal(useGarageDrive.getState().stage, 'idle');
    await act(async () => useGarageDrive.setState({ ready: true, hasDoor: true }));
    await act(async () => stationButton().click());
    assert.equal(useGarageDrive.getState().stage, 'opening', 'a rigged door plays entry before sitting');
    assert.equal(useGarageDrive.getState().sequence, 'entry', 'entry stops before driving out');
    await act(async () => useGarageDrive.getState().reset());
    await act(async () => useGarageDrive.setState({ ready: false, hasDoor: false }));
    await move('back');
    await click('[data-hero=ae86]');
    assert.equal(garageCamera(), 'Showroom', 'new garage preview starts from the showroom camera');
    await click(driveControls);
    const driveButton = () => [...document.querySelectorAll('button')].find(node => node.textContent === 'Drive Out');
    assert(driveButton().disabled);
    await act(async () => useGarageDrive.setState({ ready: true }));
    await act(async () => driveButton().click());
    assert.equal(useGarageDrive.getState().stage, 'opening');
    assert.equal(garageCamera(), 'Driver Door');
    await act(async () => [...document.querySelectorAll('button')].find(node => node.textContent === 'Reset').click());
    assert.equal(useGarageDrive.getState().stage, 'idle');
    assert.equal(garageCamera(), 'Showroom');
    await act(async () => useGarageDrive.setState({ ready: false }));
    await move('back');
    await click('[data-open-character]');
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'race-crew');
    assert.equal(find('[data-character-option]'), null);
    await click('#character-editor-tab-body');
    assert.equal(await body.active('eyes'), 'obsidian');
    assert.equal(await body.active('skin'), 'deep');
    await click('#character-editor-tab-details');
    assert.deepEqual(detailTraits(), ['Nonbinary', 'Mechanic', 'Service bay']);
    await click('#character-editor-tab-body');
    await body.pick('hair', 'red');
    await act(async () => t.mock.timers.tick(350));
    assert.equal(requests[3].character.identity, 'nonbinary');
    await acknowledge(requests[3], requests[3].character, false);
    await move('back');
    await click('[data-open-character]');
    await click('#character-editor-tab-details');
    assert.deepEqual(detailTraits(), ['Nonbinary', 'Mechanic', 'Service bay']);

    // A roster selection replaces the active character while wardrobe remains read-only.
    await switchCareer({ id: 'mara-vega', outfit: 'dockwear' });
    assert.deepEqual(detailTraits(), ['Female', 'Friendly', 'Workshop']);
    assert.equal(drafts.at(-1).id, 'mara-vega');
    await click('#character-editor-tab-appearance');
    await browseWardrobe('underwear');
    await click('[data-wardrobe-item=underwear-briefs]');
    await click('[aria-label="Briefs style"] button:last-child');
    assert.equal(drafts.at(-1).appearance.briefs_style, 'boxer-briefs');
    assert.equal(drafts.at(-1).removedClothing, undefined, 'choosing underwear preserves the outer layers');
    await click('[data-wardrobe-remove=bottom]');
    assert.deepEqual(drafts.at(-1).removedClothing, ['skirt']);
    await click('.dressing-details [aria-label="Open clothing colors"]');
    await click('.dressing-details button[aria-label="Gothic Pink"]');
    assert.equal(drafts.at(-1).appearance.item_colors['underwear:briefs'].accent, '#ff2d95');
    await click('[aria-label="Clear Underwear"]');
    assert.equal(drafts.at(-1).removedClothing, undefined);
    assert.equal(drafts.at(-1).appearance.item_colors['underwear:briefs'].accent, '#ff2d95', 'clearing the preview leaves its separate color available to save');
    assert.equal(drafts.at(-1).appearance.briefs_style, 'boxer-briefs', 'restoring the skirt keeps the chosen cut');
    await browseWardrobe('bottoms');
    await click('[data-wardrobe-item=gothic-skirt-04]');
    await browseWardrobe('tops');
    await click('[data-wardrobe-item=top-01]');
    assert.deepEqual(drafts.at(-1).garments, { skirt: 'gothic-skirt-04', top: 'top-01' });
    assert.ok(find('[data-equip-outfit]'), 'a preview of individual garments can be equipped');
    await click('[aria-label="Open clothing colors"]');
    await click('button[aria-label="Gothic Pink"]');
    assert.equal(drafts.at(-1).appearance.item_colors['top-01:shirt'].accent, '#ff2d95');
    await click('#character-editor-tab-body');
    await body.open('hairstyle');
    assert.equal(find('[data-creator-option=cropped]'), null);
    await click('[data-body-back]');
    await body.pick('hairstyle', 'Mia_01');
    await body.open('hair');
    await click('[data-body-groom]');
    await click('[aria-label="Increase crown volume"]');
    await click('[data-hair-piece="left-braid"]');
    await move('next_option');
    assert.equal(find('[data-creator-channel=roots]').getAttribute('aria-selected'), 'true');
    await click('[data-creator-option=copper]');
    assert.equal(drafts.at(-1).appearance.hair_groom.pieces['left-braid'].roots, '#ae5837');
    assert.equal(drafts.at(-1).appearance.hair_groom.volume, .05);
    await move('back');
    assert.equal(document.activeElement.dataset.hairPiece, 'left-braid');
    await move('back');
    assert(document.activeElement.hasAttribute('data-body-groom'));
    await move('back');
    assert.equal(document.activeElement.dataset.bodySection, 'hair');
    await body.open('makeup');
    const beforeBrowsing = drafts.at(-1);
    await move('previous_option');
    assert.equal(find('[data-creator-channel=eyeliner]').getAttribute('aria-selected'), 'true');
    assert.equal(drafts.at(-1), beforeBrowsing, 'changing channels or focusing a swatch does not save it');
    await click('[data-creator-option=cat-eye]');
    assert.equal(drafts.at(-1).appearance.eyeliner, 'cat-eye');
    assert.equal(preview.getState().camera, 'Makeup');
    await move('back');
    await body.pick('hairstyle', 'hair-01');
    assert.equal(drafts.at(-1).appearance.hair, 'hair-01');
    assert.equal(drafts.at(-1).appearance.hair_groom, undefined, 'another hairstyle cannot carry a Mia groom to the server');
    assert.equal(drafts.at(-1).appearance.item_colors['top-01:shirt'].accent, '#ff2d95', 'identity edits preserve trial garment colors');
    await click('#character-editor-tab-emotes');
    assert.deepEqual(drafts.at(-1).garments, { skirt: 'gothic-skirt-04', top: 'top-01' });
    await openEmotes();
    await select('Animation clothing fit', 'fitted');
    assert.equal(drafts.at(-1).appearance.animation_fit, 'fitted');
    await click('#character-editor-tab-appearance');
    await browseWardrobe('outfits');
    assert.equal(find('[data-wardrobe-item="shop-crew"]'), null);
    await click('[data-wardrobe-item="medieval-05"]');
    assert.equal(drafts.at(-1).garments, undefined);
    assert.deepEqual(drafts.at(-1).appearance?.item_colors, { 'underwear:briefs': { color: '#101015', accent: '#ff2d95' } },
      'underwear dye persists across outfits while the trial top dye stays in its preview');
    await click('[data-wearable-quick-select=dress]');
    await click('[aria-label="Open clothing colors"]');
    await click('[aria-label="Gown fabric color: Ink"]');
    await click('[aria-label="Inset panels color: Crimson"]');
    await click('[aria-label="Hood and cuffs color: Navy"]');
    await click('[aria-label="Bodice laces color: White"]');
    await click('[data-equip-outfit]');
    assert.equal(requests[4].character.outfit, 'medieval-05');
    assert.deepEqual(requests[4].character.appearance.item_colors, {
      'underwear:briefs': { color: '#101015', accent: '#ff2d95' },
      'medieval-05:dress': { color: '#262630', accent: '#ffffff' },
      'medieval-05:skirt': { color: '#ad444d' },
      'medieval-05:hat': { color: '#4b79a4' },
    });
    assert.equal(requests[4].character.garments, undefined, 'equipping another complete outfit discards the previous trial');
    assert.equal(requests[4].character.appearance.hair, 'hair-01');
    await acknowledge(requests[4], requests[4].character);
    await click('#character-editor-tab-details');
    await switchCareer(serverProgression.character_presets['jules-okafor']);
    assert.equal(drafts.at(-1).outfit, 'race-crew');
    assert.equal(drafts.at(-1).appearance.eye_color, 'obsidian');
    await act(async () => social.getState().reset());
    await click('#character-editor-tab-body');
    await body.pick('hair', 'copper');
    await act(async () => t.mock.timers.tick(350));
    assert.equal(requests.length, 5);
    assert.equal(readLocalCharacter(), undefined, 'a known profile continues queuing edits while disconnected');
    assert.equal(drafts.at(-1).id, 'jules-okafor', 'a disconnect keeps the latest draft');
    await act(async () => social.getState().receive({ ...view, profile: { ...view.profile, progression: serverProgression } }));
    assert.equal(requests[5].character.outfit, 'race-crew');
    assert.equal(requests[5].character.appearance.hair_color, 'copper');
    await acknowledge(requests[5], requests[5].character);
    assert.equal(social.getState().view.profile.progression.character_presets['mara-vega'].outfit, 'medieval-05');

    const customization = find('[aria-label="Customization"]');
    assert(customization.querySelector('[data-open-character][aria-current="page"]'));
    assert(customization.querySelector('[data-customize-vehicle] .hero-portrait-art'));
    await click('[data-customize-vehicle]');
    assert(find('.vehicle-studio'));
    assert(find('[data-customize-vehicle][aria-current="page"]'));

    await click('[data-open-character]');
    await click('#character-editor-tab-body');
    await body.pick('eyes', 'original');
    assert.equal(drafts.at(-1).appearance.eye_color, 'original');
    const requestCount = requests.length;
    const draftCount = drafts.length;
    await body.open('eyes');
    const staleEyes = find('[data-creator-option=obsidian]');
    await act(async () => {
      ui.getState().setScreen('mode_select');
      staleEyes.click();
      t.mock.timers.tick(350);
    });
    assert.equal(requests.length, requestCount, 'a queued equip cannot dispatch after leaving Heroes');
    assert(!drafts.slice(draftCount).some(choice => choice?.appearance?.eye_color === 'obsidian'),
      'a stale control cannot change the character preview outside Heroes');
    assert.equal(social.getState().view.profile.progression.character.appearance.eye_color, 'obsidian');

    await act(async () => root.render(null));
    await act(async () => {
      ui.getState().setScreen('heroes');
      root.render(h(HeroWorkshop));
    });
    await click('[data-open-character]');
    await click('#character-editor-tab-body');
    await body.pick('eyes', 'original');
    await act(async () => t.mock.timers.tick(350));
    const inFlight = requests.at(-1);
    assert.equal(requests.length, requestCount + 1);
    assert.equal(inFlight.character.appearance.eye_color, 'original');
    await body.pick('skin', 'original');
    await act(async () => ui.getState().setOverlay('settings'));
    await acknowledge(inFlight, inFlight.character, false);
    assert.equal(requests.length, requestCount + 1, 'an in-flight save cannot dispatch later queued edits under an overlay');
    assert.equal(social.getState().view.profile.progression.character.appearance.eye_color, 'original',
      'the profile still acknowledges a request dispatched while Heroes was active');
    assert.equal(social.getState().view.profile.progression.character.appearance.skin, 'deep');
    await act(async () => ui.getState().closeOverlay());
    assert.equal(requests.length, requestCount + 2, 'queued edits resume when Heroes becomes active again');
    const resumed = requests.at(-1);
    assert.equal(resumed.character.appearance.skin, 'original');
    await acknowledge(resumed, resumed.character, false);

    assert.equal(find('[data-body-section=tattoo]').getAttribute('aria-disabled'), 'true', 'legacy servers lack the tattoo capability');
    await act(async () => social.setState({ bodyTattoosAvailable: true }));
    await body.pick('tattoo', 'twin-band');
    await act(async () => t.mock.timers.tick(350));
    const tattoo = requests.at(-1);
    assert.equal(tattoo.character.appearance.tattoo, 'twin-band');
    await acknowledge(tattoo, tattoo.character, false);

    await click('#character-editor-tab-emotes');
    assert.equal(find('[data-emote-group="Gestures"]').getAttribute('aria-expanded'), 'true');
    const namedButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label);
    await chooseEmoteGroup('Interactions');
    assert.equal(namedButton('Open driver door').disabled, true);
    await act(async () => {
      useGarageDrive.setState({ hasDoor: true });
      preview.setState({ cockpitAvailable: true });
    });
    await act(async () => namedButton('Open driver door').click());
    assert.equal(preview.getState().emote.id, 'interact-driver-door');
    assert.equal(preview.getState().insideCar, false);
    await act(async () => namedButton('Sit down').click());
    assert.equal(preview.getState().emote.id, 'interact-chair');
    await act(async () => namedButton('Reset interaction').click());
    assert.equal(preview.getState().emote, null);

    const priorPreview = preview.getState();
    for (const passenger of [false, true]) {
      await act(async () => preview.setState({ cockpitVehicle: 'brz', cockpitAvailable: true, insideCar: true,
        brzPassenger: passenger, brzExitSupported: true, brzExitReady: false, brzExiting: false }));
      const exit = () => find(`button[aria-label="Get out of ${passenger ? 'passenger' : 'driver'} seat"]`);
      assert.equal(exit().disabled, true, 'wait until the seated pose is ready');
      await act(async () => preview.setState({ brzExitReady: true }));
      await act(async () => exit().click());
      assert.equal(preview.getState().brzExiting, true);
      assert.equal(preview.getState().insideCar, true, 'the cockpit animation owns the actor until she clears the sill');
      assert.equal(preview.getState().camera, 'Whole car');
      assert.equal(exit().disabled, true, 'prevent a duplicate exit during playback');
    }
    await act(async () => preview.setState(priorPreview));

    await chooseEmoteGroup('Creator');
    await slide('.emote-creator input[name="name"]', 'Pit crew wave');
    await act(async () => namedButton('Add pose').click());
    assert.ok(find('[aria-label^="Body keyframe 3"]'));
    await act(async () => namedButton('Preview').click());
    assert.equal(preview.getState().emote.created.frames.length, 3);
    await act(async () => find('.emote-creator').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    const { readCreatedEmotes } = await load('game/characters/emoteAuthoring.ts');
    assert.equal(readCreatedEmotes('driver')[0].name, 'Pit crew wave');
  } finally {
    t.mock.timers.reset();
    if (root) await act(async () => root.unmount());
    await vite?.close();
    close();
  }
});

test('spatial garage stations open the wardrobe and vehicle chooser, inspect their options and return', async t => {
  const {close} = characterTestDom();
  let vite, root;
  try {
    vite = await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
    const load = path => vite.ssrLoadModule('/src/' + path);
    const {HeroWorkshop} = await load('game/heroes/HeroWorkshop.tsx');
    const {DEFAULT_CHARACTER} = await load('game/characters/characterCatalog.ts');
    const {useUIStore: ui} = await load('store/menus/uiStore.ts');
    const {useSocialStore: social} = await load('store/social/socialStore.ts');
    const {useHeroLoadouts: loadouts} = await load('vehicles/cosmetics/heroLoadouts.ts');
    const {usePreferencesStore: prefs} = await load('store/preferences/preferencesStore.ts');
    const {useCharacterPreviewStore: preview} = await load('game/characters/characterPreviewStore.ts');
    const {routeMenuAction} = await load('controls/inputRouting.ts');
    social.setState({view:{profile:{id:'driver',active_character_id:'ava',name:'ava',progression:{character:DEFAULT_CHARACTER,default_hero:'brz'}}}});
    loadouts.getState().adopt('driver','brz');
    const {createRoot} = await import('react-dom/client');
    root = createRoot(document.getElementById('root'));
    const key = code => act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', {code, bubbles:true, cancelable:true})));
    const controller = action => act(async () => routeMenuAction(action));
    const {SCREEN_NOTICE_MS} = await load('components/menus/ScreenNotice.tsx');
    for (const [entry, selector] of [['wardrobe', '.dressing-camera-shortcuts'], ['vehicle', '.hero-workshop-picker[data-vehicle-picker]']]) {
      prefs.setState({menuHeaderStyle:entry === 'wardrobe' ? 'angled' : 'classic'});
      if (entry === 'wardrobe') t.mock.timers.enable({apis:['setTimeout']});
      ui.getState().setScreen('heroes',entry);
      await act(async () => root.render(h(HeroWorkshop, {key:entry})));
      assert.ok(document.querySelector(selector), entry + ' opened its editor');
      if (entry === 'wardrobe') {
        const arrival = document.querySelector('.screen-notice small')?.parentElement;
        assert.equal(arrival?.textContent, 'Fitting room Ava');
        await act(async () => t.mock.timers.tick(SCREEN_NOTICE_MS));
        assert.equal(arrival.isConnected, false);
        t.mock.timers.reset();
      }
      const tabs = [...document.querySelectorAll('.menu-frame-header [data-controller-tab-only] [role=tab], .hero-workshop > [data-controller-tab-only] [role=tab]')];
      const originalTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
      const backButton = document.querySelector('.menu-frame-header [data-header-back]');
      const rightActions = document.querySelectorAll('.menu-frame-header [data-selection-action]:not(:disabled)');
      assert.equal(document.activeElement, originalTab);
      await act(async () => tabs[0].click());
      await key('KeyQ');
      assert.equal(document.activeElement, backButton, 'Q focuses Back without leaving');
      await controller('previous_tab');
      assert.equal(document.activeElement, rightActions[rightActions.length - 1], 'LB wraps to the outermost right action');
      assert.equal(tabs[0].getAttribute('aria-selected'), 'true', 'focusing a header action preserves the current section');
      await key('KeyE');
      assert.equal(document.activeElement, backButton);
      await controller('next_tab');
      await controller('next_tab');
      assert.equal(document.activeElement, tabs[1]);
      assert.equal(tabs[1].getAttribute('aria-selected'), 'true', 'section activates on bumper navigation');
      await key('KeyS');
      const contentStart = document.activeElement;
      assert.ok(contentStart.closest('.hero-workshop-body, .hero-workshop-actions'), 'WASD enters the options');
      await key('KeyW');
      assert.equal(document.activeElement, contentStart, 'up at the first content row stays in the body');
      await act(async () => originalTab.click());
      if (entry === 'wardrobe') {
        assert.equal(document.querySelector('.screen-notice small'), null, 'switching wardrobe tabs leaves the entry notice dismissed');
        const slider = document.querySelector('.preview-zoom-slider[aria-label="Preview zoom"]');
        const initialZoom = preview.getState().zoom;
        slider.focus();
        await controller('right');
        assert.equal(preview.getState().zoom, initialZoom + .05, 'controller Right increases the current shot zoom');
        assert.equal(document.activeElement, slider);
        await key('ArrowLeft');
        assert.equal(preview.getState().zoom, initialZoom, 'keyboard Left takes one zoom step back');
        assert.equal(document.activeElement, slider);
        const group = () => document.querySelector('[data-wardrobe-group][aria-selected=true]').textContent;
        const eye = document.querySelector('.garage-hide-toggle');
        const immersed = () => document.documentElement.hasAttribute('data-wardrobe-immersive');
        const hide = () => act(async () => { eye.focus(); eye.click(); });
        await hide();
        assert.ok(immersed() && document.querySelector('.hero-workshop').hasAttribute('inert'));
        await key('Escape');
        assert.equal(document.activeElement, eye, 'keyboard wake restores the same tool');
        assert.ok(!immersed() && ui.getState().screen === 'heroes', 'Back wakes without leaving');
        assert.equal(eye.dispatchEvent(new window.KeyboardEvent('keydown', {code:'Escape', repeat:true, bubbles:true, cancelable:true})), false);
        eye.dispatchEvent(new window.KeyboardEvent('keyup', {code:'Escape', bubbles:true, cancelable:true}));
        await hide();
        await act(async () => document.querySelector('.wardrobe-wake-surface').click());
        assert.equal(document.activeElement, eye);
        const {consumePreviewWakeInput} = await load('controls/previewWakeInput.ts');
        const pad = {buttons:[{pressed:true}], axes:[0,0,0,0]};
        assert.equal(consumePreviewWakeInput(pad), false);
        await hide();
        assert.equal(consumePreviewWakeInput(pad), true);
        assert.ok(immersed(), 'the held button that hid the editor cannot wake it');
        pad.buttons[0].pressed = false;
        assert.equal(consumePreviewWakeInput(pad), true);
        pad.axes[2] = .7;
        await act(async () => assert.equal(consumePreviewWakeInput(pad), true));
        assert.ok(!immersed());
        assert.equal(consumePreviewWakeInput(pad), true, 'held wake stick cannot immediately navigate');
        pad.axes[2] = 0;
        assert.equal(consumePreviewWakeInput(pad), true);
        assert.equal(consumePreviewWakeInput(pad), false, 'navigation resumes after release');
        assert.equal(document.activeElement, eye);
        assert.equal(group(), 'Outfits');
        await act(async () => routeMenuAction('next_option'));
        assert.equal(group(), 'Clothing');
        await act(async () => routeMenuAction('previous_option'));
        await act(async () => document.querySelector('[data-category=outfits]').click());
        const outfit = document.querySelector('[data-wardrobe-item=dockwear]');
        for (const detail of [1, 0]) {
          const touch = (element, type) => element.dispatchEvent(new window.PointerEvent(type, {
            bubbles: true, cancelable: true, pointerType: 'touch', button: 0, detail,
          }));
          await act(async () => { touch(outfit, 'pointerdown'); touch(outfit, 'pointerup'); });
          assert.equal(document.querySelector('.dressing-wardrobe').hidden, true, 'item details replace the catalog');
          const shoes = document.querySelector('.dressing-details [data-dressing-piece=shoes]');
          assert.ok(shoes, 'the inspector now has a different action under the tapping finger');
          await act(async () => assert.equal(touch(shoes, 'click'), false, 'the release belongs to the original outfit tile'));
          await act(async () => routeMenuAction('back'));
          assert.equal(document.activeElement, outfit, 'Back restores the outfit in the original category');
        }
        await act(async () => routeMenuAction('back'));
        assert.equal(document.activeElement.dataset.category, 'outfits');
      } else {
        const chosen = () => document.querySelector('[data-hero][aria-pressed=true]')?.dataset.hero;
        assert.equal(chosen(), 'brz');
        await act(async () => document.querySelector('[data-hero="camaro"]').click());
        assert.equal(chosen(), 'camaro');
        assert.equal(loadouts.getState().defaultHero, 'brz', 'previewing a portrait preserves the equipped main');
        assert.equal(document.querySelector('.vehicle-studio'), null);
        await act(async () => [...document.querySelectorAll('.hero-workshop-actions [type=button]')].find(item => item.textContent.includes('Customize')).click());
        assert.equal(document.getElementById('vehicle-appearance-tab-paint').getAttribute('aria-selected'), 'true');
        document.querySelector('input[aria-label="Metallic reflection strength"]').focus();
        await key('KeyE');
        assert.equal(document.activeElement.id, 'vehicle-studio-tab-performance', 'Q/E leaves an option field for primary sections');
        await key('KeyQ');
        assert.equal(document.activeElement.id, 'vehicle-studio-tab-paint');
        await act(async () => routeMenuAction('next_option'));
        assert.equal(document.getElementById('vehicle-appearance-tab-body').getAttribute('aria-selected'), 'true');
        await act(async () => routeMenuAction('previous_option'));
        assert.equal(document.getElementById('vehicle-appearance-tab-paint').getAttribute('aria-selected'), 'true');
        await act(async () => routeMenuAction('back'));
        assert.equal(chosen(), 'camaro', 'Back restores the previewed vehicle');
        assert.equal(loadouts.getState().defaultHero, 'brz');
      }
      const firstSection = document.querySelector('.menu-frame-header [data-controller-tab-only] [role=tab], .hero-workshop > [data-controller-tab-only] [role=tab]');
      await act(async () => {firstSection.click(); firstSection.focus();});
      await controller('previous_tab');
      assert.ok(document.activeElement.hasAttribute('data-header-back'));
      await controller('activate');
      assert.equal(ui.getState().screen,'main');
      await act(async () => root.render(null));
    }
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close();
    close();
  }
});

test('device character edits stay local when the connected profile has no character support', async t => {
  const { dom, close } = characterTestDom();
  let vite, root, client;
  try {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const load = path => vite.ssrLoadModule(`/src/${path}`);
    const { CharacterPage } = await load('game/characters/CharacterPage.tsx');
    const { readLocalCharacter, writeLocalOutfit } = await load('game/characters/localOutfits.ts');
    const { useSocialStore } = await load('store/social/socialStore.ts');
    const { useUIStore } = await load('store/menus/uiStore.ts');
    client = await load('net/socialClient.ts');
    const requests = [];
    client.setSocialConnection({ readyState: WebSocket.OPEN, send: value => requests.push(JSON.parse(value)) });
    useSocialStore.getState().receive({
      profile: { id: 'legacy', name: 'Driver', progression: {} },
      players: [], teammates: [], requests: [], groups: [], worlds: [], world_invites: [], maps: [],
      current_world_id: null, limits: { max_active_worlds: 3 },
    });
    useUIStore.getState().setScreen('heroes');
    const { createRoot } = await import('react-dom/client');
    root = createRoot(document.getElementById('root'));
    const props = { onReady: () => {}, beforeClose: { current: null } };
    const show = tab => act(async () => root.render(h(CharacterPage, { ...props, tab })));
    const click = selector => act(async () => document.querySelector(selector).click());
    const button = label => [...document.querySelectorAll('button')].find(node => node.textContent === label);
    const body = bodyEditor(click);

    await show('details');
    await click('[data-character-option="jules-okafor"]');
    await act(async () => button('Use locally').click());
    assert.equal(readLocalCharacter().id, 'jules-okafor');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    assert.deepEqual([...document.querySelectorAll('.character-details dd')].map(node => node.textContent),
      ['Male', 'Friendly', 'Workshop'], 'legacy local choices use their model gender and the existing personality fallback');
    assert.equal(document.querySelector('.character-details select, .character-details [data-character-option]'), null);
    const localBeforePreview = readLocalCharacter();
    await click('[aria-label="Signature emotes"] [role="button"]');
    await act(async () => t.mock.timers.tick(350));
    assert.equal(requests.length, 0);
    assert.deepEqual(readLocalCharacter(), localBeforePreview);

    await show('body');
    const failedWrite = t.mock.method(dom.window.Storage.prototype, 'setItem', () => { throw new Error('Storage unavailable'); });
    await body.pick('skin', 'deep');
    assert.deepEqual(readLocalCharacter(), localBeforePreview);
    assert(button('Retry'));
    assert.equal(await props.beforeClose.current(), false, 'a failed device write keeps Wardrobe open for retry or revert');
    failedWrite.mock.restore();
    await act(async () => button('Retry').click());
    assert.equal(readLocalCharacter().appearance.skin, 'deep');

    const saved = readLocalCharacter();
    const { characterAppearance } = await load('game/characters/characterCatalog.ts');
    const { HAIR_COLOR_THEMES } = await load('game/characters/fittedWardrobe/hairColors.ts');
    writeLocalOutfit('Race fit', { ...saved, outfit: 'race-crew',
      appearance: { ...characterAppearance(saved), hair_palette: HAIR_COLOR_THEMES['Icy Blue'] } });
    await show('appearance');
    await click('[data-category=saved]');
    await click('[aria-label="Try on Race fit"]');
    assert(!document.querySelector('[aria-label="Clear saved outfit preview"]').disabled);
    await show('body');
    await body.open('hair');
    assert.equal(document.querySelector('[aria-label="Base custom color"]').value, HAIR_COLOR_THEMES['Icy Blue'].base);
    await click('[data-creator-option=original]');
    for (const id of ['red', 'dirty-blonde']) {
      await click('[data-creator-option="' + id + '"]');
      assert.equal(document.querySelector('[data-creator-option][aria-pressed=true]').dataset.creatorOption, id);
      await act(async () => t.mock.timers.tick(350));
      assert.equal(readLocalCharacter().appearance.hair_color, id);
      assert.equal(readLocalCharacter().appearance.hair_palette, undefined);
    }
    t.mock.method(dom.window.Storage.prototype, 'setItem', () => { throw new Error('Storage unavailable'); });
    await body.pick('eyes', 'obsidian');
    await act(async () => button('Revert unsaved').click());
    await show('appearance');
    await click('[data-category=saved]');
    assert(document.querySelector('[aria-label="Clear saved outfit preview"]').disabled);
  } finally {
    t.mock.timers.reset();
    if (root) await act(async () => root.unmount());
    client?.setSocialConnection(null);
    await vite?.close();
    close();
  }
});

test('all emote batches return to rest and keep planted and lifted feet distinct', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { buildGarageEmotes, buildEmoteClips, driverHand, findGaragePreviewEmote, AUTOMATIC_GARAGE_EMOTE_IDS } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { createEmoteProp } = await vite.ssrLoadModule('/src/game/characters/emoteProps.ts');
    const { bindFlagPoleGrip } = await vite.ssrLoadModule('/src/game/characters/flagPoleGrip.ts');
    const { FLAG_DROP_PHASE } = await vite.ssrLoadModule('/src/game/characters/starterEmotes.ts');
    const { garageLeanPose } = await vite.ssrLoadModule('/src/game/characters/garageLean.ts');
    const { COCKPIT_TAKES } = await vite.ssrLoadModule('/src/game/characters/cockpitEmotes.ts');
    const { sampleCockpitMotion } = await vite.ssrLoadModule('/src/game/preview/garageCockpit.ts');
    const { sampleDriveOut, DRIVE_OUT_DURATION } = await vite.ssrLoadModule('/src/game/preview/garageDriveMotion.ts');
    const { characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { createEmoteTestActor } = await vite.ssrLoadModule('/tests/fixtures/emoteTestActor.ts');
    const model = createEmoteTestActor(characterLook({ id: 'jules-okafor', outfit: 'night-run' }));
    const turntable = new Object3D();
    turntable.rotation.y = 1;
    turntable.add(model.root);
    const capture = () => {
      const values = [];
      model.root.traverse(node => { if (node.isGroup) values.push(...node.position, ...node.quaternion); });
      return values;
    };
    const rest = capture();
    const clips = buildGarageEmotes(model.root, false, true);
    const mixer = new AnimationMixer(model.root);
    const ids = clips.map(clip => clip.name.split(' ')[0]);
    const numbered = [...ids.filter(id => /^\d+$/.test(id)), ...COCKPIT_TAKES.filter(take => /^\d+$/.test(take.id)).map(take => take.id)].sort();
    assert.deepEqual(numbered, Array.from({length: 200}, (_, i) => String(i + 1).padStart(3, '0')));
    const stanceIds = ['stance-pockets', 'stance-hand-on-hip', 'stance-crossed-ankles'];
    assert.deepEqual(AUTOMATIC_GARAGE_EMOTE_IDS, ['035', '002', '005', '009', '010', ...stanceIds]);
    assert(COCKPIT_TAKES.every(({ id }) => !ids.includes(id)));
    assert.equal(findGaragePreviewEmote('151', true).id, '151');
    const { keepHeldProp } = await vite.ssrLoadModule('/src/game/characters/emotePropNotes.ts');
    assert.equal(keepHeldProp('010'), true, 'friendly wave keeps the prop');
    assert.equal(keepHeldProp('013'), false, 'applause stows the prop');
    assert.equal(keepHeldProp('bag-lift', true), false, 'driving always stows handheld props');
    assert.deepEqual(ids.filter(id => id.startsWith('walk-')), ['walk-casual']);
    assert.deepEqual(buildGarageEmotes(model.root).map(clip => clip.name.split(' ')[0]), ['001', '002', '005', '009', '010', '035', ...stanceIds]);
    const carrying = buildGarageEmotes(model.root, true).map(clip => clip.name.split(' ')[0]);
    assert(stanceIds.every(id => !carrying.includes(id) && !keepHeldProp(id)), 'two-hand stances stow the bag on request and skip automatic carrying rotations');
    assert(buildGarageEmotes(model.root, true).some(clip => clip.name.startsWith('035 ')), 'bag idle rotation includes both-handed gestures with temporary stowing');
    const leanFit = { offset: .15, distance: .06 };
    const [lean] = buildEmoteClips(model.root, [garageLeanPose(leanFit)]);
    assert(lean.name.startsWith('pose-lean '));
    assert(!buildGarageEmotes(model.root, true).some(clip => clip.name.startsWith('pose-lean ')));
    assert.equal(sampleCockpitMotion('068', .4).travel, 0);
    assert(sampleCockpitMotion('068', .4).steering > .2);
    assert(sampleCockpitMotion('069', .49).travel > .85);
    assert(sampleCockpitMotion('070', .49).travel < -.72);
    for (const take of ['068', '069', '070']) {
      assert(sampleCockpitMotion(take, .12).lookYaw < -.4);
      const nod = sampleCockpitMotion(take, .22);
      assert(nod.lookPitch > .16 && nod.closeShot);
      assert(sampleCockpitMotion(take, .35).focus > .95);
    }
    for (const take of ['069', '070']) {
      assert.equal(Math.abs(sampleCockpitMotion(take, 1).along), 0);
      assert.equal(Math.abs(sampleCockpitMotion(take, 1).steering), 0);
    }
    for (const take of ['101', '102']) {
      assert.equal(sampleCockpitMotion(take, .2).gesture, 0);
      const wave = sampleCockpitMotion(take, .52);
      assert(wave.travel > .85 && wave.gesture === 1 && wave.closeShot);
      assert.equal(sampleCockpitMotion(take, .9).gesture, 0);
    }
    assert.equal(sampleCockpitMotion(null, 0).travel, 0);
    const stages = [0, 1.6, 3.3, 4.6, DRIVE_OUT_DURATION].map(sampleDriveOut);
    assert.deepEqual(stages.map(pose => pose.stage), ['opening', 'entering', 'closing', 'driving', 'finished']);
    assert.equal(stages[1].door, 1);
    assert.equal(stages[2].enter, 1);
    assert.equal(stages[2].travel, 0);
    assert.equal(stages[3].door, 0);
    assert(stages[4].travel > stages[3].travel);
    assert.deepEqual(sampleDriveOut(DRIVE_OUT_DURATION + 2), stages[4], 'the car stays parked at the rollout endpoint');
    for (const [id, direction] of [['199', 1], ['200', -1]]) {
      assert(sampleCockpitMotion(id, .5).steering * direction > .3);
      assert.equal(sampleCockpitMotion(id, .5).travel, 0);
      assert.equal(Math.abs(sampleCockpitMotion(id, 1).steering), 0);
    }
    for (const clip of clips) {
      const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
      action.reset().play();
      mixer.update(clip.duration * .36);
      assert(capture().some((value, i) => Math.abs(value - rest[i]) > .005), clip.name);
      mixer.update(clip.duration);
      action.stop();
      assert(capture().every((value, i) => Math.abs(value - rest[i]) < 1e-6), clip.name);
    }
    const map = createEmoteProp('map');
    model.root.add(map.root);
    const [unfold] = buildEmoteClips(model.root, [findGaragePreviewEmote('141', false)], new Map([['map', map]]));
    const unfolding = mixer.clipAction(unfold).setLoop(LoopOnce, 1).play();
    mixer.update(unfold.duration * .27);
    assert(map.root.visible && map.root.scale.x > .99);
    assert(Math.abs(map.panels[0].rotation.y) < .01);
    assert(map.panels[1].rotation.y > 1);
    mixer.update(unfold.duration * .28);
    assert(Math.abs(map.panels[1].rotation.y) < .01);
    unfolding.stop();
    assert.equal(map.root.visible, false, 'interrupting an emote hides its prop');
    assert.equal(map.root.scale.x, 0);
    mixer.uncacheClip(unfold);
    map.dispose();
    assert.equal(model.root.getObjectByName('emote-prop-map'), undefined);
    const flag = createEmoteProp('flag');
    model.root.add(flag.root);
    // Give the lightweight test actor a hand rig without depending on Git LFS.
    const wrist = model.root.getObjectByName('hand_r');
    for (const [finger, across] of [['index', .026], ['middle', 0], ['ring', -.019], ['pinky', -.036], ['thumb', .039]]) {
      let parent = wrist;
      for (const segment of [1, 2, 3]) {
        const joint = new Object3D();
        joint.name = `${finger}_0${segment}_r`;
        joint.position.set(segment === 1 ? across : 0, 0, segment === 1 ? .06 : .025);
        parent.add(joint);
        parent = joint;
      }
    }
    const hand = driverHand(model.root, 'r');
    const fitFlag = bindFlagPoleGrip(model.root, flag);
    for (const id of ['183', '189']) {
      const [clip] = buildEmoteClips(model.root, [findGaragePreviewEmote(id, false)], new Map([['flag', flag]]));
      const holding = mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
      for (const phase of [.35, .48, .62, .78]) {
        holding.time = clip.duration * phase;
        mixer.update(0);
        fitFlag();
        const grip = flag.flagHeld.getWorldPosition(new Vector3());
        assert(grip.distanceTo(hand.middle.getWorldPosition(new Vector3())) < .025);
        const pole = flag.flagHeld.localToWorld(new Vector3(0, 1, 0)).sub(grip).normalize();
        const fingers = hand.middle.getWorldPosition(new Vector3()).sub(hand.hand.getWorldPosition(new Vector3())).normalize();
        assert(Math.abs(pole.dot(fingers)) < .06, 'pole follows the curled hand across the knuckles');
      }
      holding.stop();
      mixer.uncacheClip(clip);
    }
    const drop = findGaragePreviewEmote('178', false);
    const [flagDrop] = buildEmoteClips(model.root, [drop], new Map([['flag', flag]]));
    const flagAction = mixer.clipAction(flagDrop).setLoop(LoopOnce, 1).play();
    mixer.update(flagDrop.duration * .37);
    const raised = flag.root.position.y;
    assert(flag.root.visible && flag.root.scale.x > .99);
    mixer.update(flagDrop.duration * (FLAG_DROP_PHASE - .37));
    assert(flag.root.position.y < raised - .35);
    assert(flag.flagCloth.morphTargetInfluences[0] > .8);
    flagAction.stop();
    assert.equal(flag.root.visible, false);
    mixer.uncacheClip(flagDrop);
    const [slip] = buildEmoteClips(model.root, [findGaragePreviewEmote('181', false)], new Map([['flag', flag]]));
    const slipAction = mixer.clipAction(slip).setLoop(LoopOnce, 1).play();
    mixer.update(slip.duration * .36);
    fitFlag();
    assert(flag.flagHeld.position.length() < 1e-6, 'a slipped flag follows its free path');
    slipAction.stop();
    mixer.uncacheClip(slip);
    flag.dispose();
    const foot = side => turntable.worldToLocal(model.root.getObjectByName('foot_' + side).getWorldPosition(new Vector3()));
    const leftRest = foot('l'), rightRest = foot('r');
    const shift = mixer.clipAction(clips[1]).reset().play();
    mixer.update(clips[1].duration * .23);
    assert(foot('l').y - leftRest.y > .03);
    assert(foot('r').distanceTo(rightRest) < .002);
    shift.stop();
    const hop = mixer.clipAction(clips[ids.indexOf('014')]).reset().play();
    mixer.update(hop.getClip().duration * .39);
    assert(foot('l').y - leftRest.y > .12 && foot('r').y - rightRest.y > .12);
    hop.stop();
    const march = mixer.clipAction(clips[ids.indexOf('026')]).reset().play();
    mixer.update(march.getClip().duration * .23);
    assert(foot('l').y - leftRest.y > .04 && foot('l').y - leftRest.y < .065 && foot('r').distanceTo(rightRest) < .002);
    mixer.update(march.getClip().duration * .2);
    assert(foot('r').y - rightRest.y > .04 && foot('r').y - rightRest.y < .065 && Math.abs(foot('l').y - leftRest.y) < .002);
    march.stop();
    const bump = mixer.clipAction(clips[ids.indexOf('090')]).reset().play();
    mixer.update(bump.getClip().duration * .31);
    assert(foot('r').y - rightRest.y > .02 && foot('l').distanceTo(leftRest) < .002);
    mixer.update(bump.getClip().duration * .16);
    assert(model.root.position.z > .04 && foot('r').z - rightRest.z > .055);
    assert(Math.abs(foot('r').y - rightRest.y) < .002 && foot('l').distanceTo(leftRest) < .002);
    bump.stop();
    const shuffle = mixer.clipAction(clips[ids.indexOf('095')]).reset().play();
    const shuffleDuration = shuffle.getClip().duration;
    mixer.update(shuffleDuration * .23);
    const leftPlant = foot('l');
    assert(leftPlant.x - leftRest.x > .12 && foot('r').distanceTo(rightRest) < .002);
    mixer.update(shuffleDuration * .10);
    assert(foot('l').distanceTo(leftPlant) < .002 && foot('r').y - rightRest.y > .025);
    mixer.update(shuffleDuration * .10);
    assert(model.root.position.x > .12 && foot('r').x - rightRest.x > .09);
    shuffle.stop();
    for (const id of ['walk-casual', '042']) {
      const clip = clips[ids.indexOf(id)];
      const walk = mixer.clipAction(clip).reset().play();
      mixer.update(clip.duration / 9);
      const planted = foot('l');
      mixer.update(clip.duration / 18);
      assert(foot('l').distanceTo(planted) < .006, id);
      const lift = foot('r').y - rightRest.y;
      if (id === 'walk-casual') assert(lift > .025 && lift < .037, id);
      else assert(lift > .04, id);
      assert(model.root.position.z > .1, id);
      assert(foot('l').distanceTo(foot('r')) > .12, id);
      walk.stop();
    }
    const robot = mixer.clipAction(clips[ids.indexOf('robot-dance')]).reset().play();
    mixer.update(robot.getClip().duration * .28);
    const robotLock = capture();
    mixer.update(robot.getClip().duration * .07);
    assert(capture().every((value, i) => Math.abs(value - robotLock[i]) < 1e-6));
    robot.stop();
    const retreat = mixer.clipAction(clips[ids.indexOf('044')]).reset().play();
    mixer.update(retreat.getClip().duration * .27);
    assert(foot('l').y - leftRest.y > .035 && foot('r').distanceTo(rightRest) < .002);
    mixer.update(retreat.getClip().duration * .12);
    assert(model.root.position.z < -.06 && foot('l').z - leftRest.z < -.06);
    retreat.stop();
    const leanAction = mixer.clipAction(lean).reset().play();
    mixer.update(lean.duration * .32);
    assert(model.root.position.z < -.205 && Math.abs(foot('r').z - rightRest.z + .15) < .02);
    const parked = foot('r');
    mixer.update(lean.duration * .2);
    assert(foot('r').distanceTo(parked) < .002);
    leanAction.stop();
    mixer.uncacheRoot(model.root);
    model.dispose();
  } finally {
    await vite.close();
  }
});

test('equipping a device outfit on the active roster character survives returning to the garage', async () => {
  const { close } = characterTestDom();
  let root, vite, client;
  try {
    vite = await createServer({ define: { __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify(['top-01']) },
      server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const load = path => vite.ssrLoadModule('/src/' + path);
    const { CharacterPage } = await load('game/characters/CharacterPage.tsx');
    const { writeLocalCharacter, writeLocalOutfit } = await load('game/characters/localOutfits.ts');
    const { useSocialStore: social, selectMainGarageCharacter } = await load('store/social/socialStore.ts');
    const { useUIStore: ui } = await load('store/menus/uiStore.ts');
    client = await load('net/socialClient.ts');
    const requests = [];
    client.setSocialConnection({ readyState: WebSocket.OPEN, send: value => requests.push(JSON.parse(value)) });
    const active = { id: 'mara-vega', outfit: 'dockwear', identity: 'female', appearance: {
      hair: 'Mia_01', hair_color: 'dirty-blonde', skin: 'warm', headwear: 'hat', color: 'original', personality: 'mechanic',
    }};
    const other = { id: 'mara-vega', outfit: 'shop-crew' };
    const palette = { base: '#765432', highlights: '#aa8754', tips: '#aa8855', roots: '#473623', tipBlend: 0.6, highlightStrength: 0.3 };
    const groom = { volume: 0.3, thickness: -0.2, pieces: { ponytail: palette } };
    writeLocalCharacter(other);
    writeLocalOutfit('Custom shirt', { ...active, garments: { top: 'top-01' }, localHair: { id: 'Mia_01', palette, original: false, groom } });
    const progression = { character: null, character_presets: {}, cosmetics_revision: 1 };
    const profile = { id: 'account', name: 'Driver', active_character_id: 'A', characters: [
      { id: 'B', name: 'Other', appearance: other }, { id: 'A', name: 'Selected', appearance: active },
    ], progression };
    const view = { profile, players: [], teammates: [], requests: [], groups: [], worlds: [], world_invites: [], maps: [], limits: {max_active_worlds: 4} };
    social.getState().receive(view);
    ui.setState({ screen: 'heroes', overlay: null, isModeLoading: false });
    const { createRoot } = await import('react-dom/client');
    root = createRoot(document.querySelector('#root'));
    const previews = [], beforeClose = { current: null };
    const props = { beforeClose, tab: 'appearance', onReady() {}, onPreview(choice) { previews.push(choice); } };
    const open = () => act(async () => root.render(h(CharacterPage, props)));
    const click = selector => act(async () => document.querySelector(selector).click());
    await open();
    assert.deepEqual(previews.at(-1), active, 'Wardrobe uses the same active slot fallback as the main garage');
    await click('[data-category=saved]');
    await click('[aria-label="Try on Custom shirt"]');
    assert.equal(selectMainGarageCharacter(social.getState()), active, 'trying on leaves the equipped appearance alone');
    await click('[data-equip-outfit]');
    const [request] = requests;
    assert.equal(request.action, 'character_equip');
    assert.equal(request.character_slot_id, 'A');
    assert.equal(request.character.localHair, undefined);
    assert.deepEqual(request.character.garments, { top: 'top-01' });
    assert.deepEqual(request.character.appearance.hair_groom, groom);
    assert.deepEqual(request.character.appearance.hair_palette, palette);
    const confirmed = { ...progression, cosmetics_revision: 2, character: request.character };
    await act(async () => client.receiveSocialResult({ request_id: request.request_id, ok: true, data: confirmed }));
    assert.equal(await beforeClose.current(), true);
    await act(async () => root.render(null));
    social.getState().receive(view); // an older snapshot can arrive just after closing
    assert.deepEqual(selectMainGarageCharacter(social.getState()), request.character);
    await open();
    assert.deepEqual(previews.at(-1), request.character);
    assert.equal(social.getState().view.profile.characters[0].appearance, other);
  } finally {
    if (root) await act(async () => root.unmount());
    client?.setSocialConnection(null);
    await vite?.close();
    close();
  }
});
