import { ScreenNotice } from "../../components/menus/ScreenNotice";
import { WardrobeImmersion } from "../characters/WardrobeImmersion";
import { observeWorkshopViewport } from "../preview/workshopViewport";
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode} from "react";
import type { WardrobeNavigation } from "../characters/DressingRoom";
import {useMenuPressOwner} from "../../components/menus/useMenuPressOwner";
import {GameButton} from "../../components/GameButton";
import {VehicleMods} from "./VehicleMods";
import {CollapsibleMenuPanel} from "../../components/menus/CollapsibleMenuPanel";
import {ColorSwatchButton} from "../../components/menus/ColorSwatch";
import {MenuIcon} from "../../components/menus/MenuIcon";
import {SceneTabHeader} from "../../components/menus/SceneTabHeader";
import {HEROES,useAlphaStore,type HeroFilter} from "../../store/alpha/alphaStore";
import {useUIStore} from "../../store/menus/uiStore";
import {selectCharacterSlot,useSocialStore} from "../../store/social/socialStore";
import {requestSocial} from "../../net/socialClient";
import {FACTORY_APPEARANCE,useHeroLoadouts,type HeroAppearance} from "../../vehicles/cosmetics/heroLoadouts";
import {useSelectionNavigation} from "../alpha/useSelectionNavigation";
import {navigateFormRows} from "../social/formRows";
import {UI_THEMES} from "../../theme/catalog";
import {usePreferencesStore} from "../../store/preferences/preferencesStore";
import {HeroRoster} from "../alpha/HeroRoster";
import {heroRoleHeaderTabs,HERO_CONCEPT_TAB} from "../alpha/heroRoleFilters";
import {HoldMainButton} from "./HoldMainButton";
import {SelectionFooter,SelectionHeader} from "../alpha/SelectionChrome";
import {CHARACTER_TABS,CharacterPage,type CharacterTab} from "../characters/CharacterPage";
import {PreviewZoom} from "../preview/PreviewZoom";
import {PreviewVisibilityToggle} from "../preview/PreviewVisibilityToggle";
import {GaragePreviewControls} from "../preview/GaragePreviewControls";
import {GarageVehicleDiagnostics} from "../preview/GarageVehicleDiagnostics";
import {useGarageDrive} from "../preview/garageDriveStore";
import type {CharacterChoice} from "../characters/characterCatalog";
import {ControllerAction} from "../../components/controller";
import {useMenuInputDevice} from "../../components/controller/useMenuInputDevice";
import {HeroSaveQueue,type HeroSaveStatus} from "./HeroSaveQueue";
import {VehicleStudio,VEHICLE_APPEARANCE_TABS,VEHICLE_STUDIO_TABS,vehicleStudioSection,VehicleStudioTabIcon,STOCK_VEHICLE_SUMMARY,type VehiclePerformanceSummary,type VehicleStudioTab} from "./VehicleStudio";
import {HULL_PAINT_PRESETS,VEHICLE_PAINT_PRESETS} from "./vehiclePaintPresets";
import {PAINT_FINISHES} from "../../vehicles/cosmetics/paintFinishes";
import {vehicleSystems} from "../../vehicles/vehicleSystems";
import {DEFAULT_WINDOW_TONE,WINDOW_TONES,type WindowTone} from "../preview/windowTones";
import {getVehicleStockPerformance} from "./vehiclePerformance";
import {useBrzCabinStudio,useVehicleStudioStore,type VehicleStudioPart} from "./vehicleStudioStore";
import {BRZ_GARAGE_ENABLED} from "../preview/brzCabin";
import {BrzCabinColorControls} from "./BrzCabinColors";
import {HeroPortrait} from "../alpha/HeroPortrait";
import {HeroAbilityDetails} from "./HeroAbilities";
import {HeroConceptGallery} from "./HeroConceptGallery";
import "../alpha/heroSelection.css";
import "./heroAbilities.css";
import "./heroWorkshop.css";
import "../../theme/vehicleStudio.css";

const NO_OWNED_SKINS:string[]=[];
const NO_VEHICLE_PARTS:VehicleStudioPart[]=[];
const NO_VEHICLE_MOD_STAGES:Record<string,number>={};
type WorkshopFilter=HeroFilter|"concepts";
type WorkshopPage="heroes"|"garage"|"character";
const WORKSHOP_TABS=[...heroRoleHeaderTabs(true),HERO_CONCEPT_TAB];
const MARINE_LAMPS = [
 {id:"navigation", label:"Running lights"},
 {id:"searchlights", label:"Searchlights"},
] as const;

// The classic layout puts the primary tablist directly below its header.
const PRIMARY_TABLIST = ":scope > .menu-frame-header [role=tablist][data-controller-tab-only], :scope > [role=tablist][data-controller-tab-only]";

function cycleStationHeader(root: HTMLElement, direction: number) {
  const header = root.querySelector(".menu-frame-header");
  if (!header) return;
  const tabs = root.querySelector(PRIMARY_TABLIST);
  const controls = [
    ...header.querySelectorAll<HTMLElement>("[data-header-back]"),
    ...(tabs?.querySelectorAll<HTMLElement>("[role=tab]") ?? []),
    ...header.querySelectorAll<HTMLElement>("[data-selection-action]"),
  ].filter(control => !control.matches(":disabled,[aria-disabled=true]") &&
    !control.closest("[hidden],[inert]") && control.checkVisibility?.() !== false);
  if (!controls.length) return;
  const focused = controls.indexOf(document.activeElement as HTMLElement);
  const current = focused >= 0 ? focused : controls.findIndex(control => control.matches("[aria-selected=true]"));
  const start = current < 0 && direction < 0 ? 0 : current;
  const next = controls[(start + direction + controls.length) % controls.length];
  next.focus({preventScroll:true});
  if (next.matches("[role=tab]")) {
    next.scrollIntoView?.({block:"nearest", inline:"nearest"});
    if (next.getAttribute("aria-selected") !== "true") next.click();
  }
}

/** Vehicle styling and the stock-relative performance page share one studio
 * chrome. Appearance edits save to the authenticated player's vehicle loadout. */
export { HeroLoadoutSync } from "./HeroLoadoutSync";

export function HeroWorkshop({onCharacterViewChange,onCharacterPreviewChange}:{
 onCharacterViewChange?:(tab:CharacterTab|null)=>void;
 onCharacterPreviewChange?:(choice:CharacterChoice|null)=>void;
}={}){
 const inputDevice=useMenuInputDevice();
 const pressOwner=useMenuPressOwner();
 const overlay=useUIStore(s=>s.overlay);
 const entry=useUIStore(s=>s.workshopEntry);
 const characterSlot=useSocialStore(selectCharacterSlot);
 const owner=useSocialStore(s=>s.view?.profile.id??s.profileOwner);
 const connected=useSocialStore(s=>Boolean(s.view));
 const stagingSignedIn=useSocialStore(s=>s.stagingSignIn && s.profileStatus==="ready" && Boolean(s.view?.profile));
 const visibleCharacterTabs=stagingSignedIn?CHARACTER_TABS:CHARACTER_TABS.filter(item=>item.id!=="profile"&&item.id!=="account");
 const main=useHeroLoadouts(s=>s.ownerId===owner?s.defaultHero:null);
 const mainDefinition=HEROES.find(item=>item.id===main);
 const skins=useSocialStore(s=>s.view?.alpha?.skins);
 const owned=useSocialStore(s=>s.view?.profile.progression?.owned??NO_OWNED_SKINS);
 const [chosen,setHero]=useState<string|null>(null);
 const stationEntry=entry==="vehicle";
 const hero=chosen??mainDefinition?.id??(stationEntry?HEROES[0]?.id:null)??null;
 const [page,setPage]=useState<WorkshopPage>(()=>entry==="wardrobe"?"character":"heroes");
 const [selectedCharacterTab,setCharacterTab]=useState<CharacterTab>("appearance");
 const characterTab=!stagingSignedIn&&(selectedCharacterTab==="profile"||selectedCharacterTab==="account")?"appearance":selectedCharacterTab;
 const [characterReady,setCharacterReady]=useState(false);
 const wardrobeNavigation=useRef<WardrobeNavigation>(null);
 const beforeCharacterClose=useRef<()=>Promise<boolean>>(null);
 const previousCharacterPage=useRef<WorkshopPage|"main">(entry==="wardrobe"?"main":"heroes");
 const openCharacter=()=>{
  if(page==="character")return;
  previousCharacterPage.current=page;
  setPage("character");
 };
 const editing=page==="garage";
 const characterOpen=page==="character";
 const [role,setRole]=useState<WorkshopFilter>("all");
 const [focusRoster,setFocusRoster]=useState(false);
 const definition=HEROES.find(item=>item.id===hero)??null;
 const vehicle=definition?.vehicle;
 const systems=vehicleSystems(vehicle??"");
 const marine=systems==="marine";
 const paintable=systems!=="tracked";
 const shipLightPreview=vehicle==="louisiana";
 const saved=useHeroLoadouts(s=>definition?s.loadouts[definition.vehicle]:undefined);
 const [editedAppearance,setAppearance]=useState<HeroAppearance>({...FACTORY_APPEARANCE});
 const appearance=chosen?editedAppearance:saved??FACTORY_APPEARANCE;
 const [status,setStatus]=useState<HeroSaveStatus>("idle"),[message,setMessage]=useState("");
 const root=useRef<HTMLElement>(null);
 const remembered=useRef(new WeakMap<HTMLElement,number>()),leaving=useRef(false);
 const drafts=useRef<Record<string,HeroAppearance>>({});
 const theme=usePreferencesStore(s=>s.theme);
 const speedUnit=usePreferencesStore(s=>s.speedUnit);
 const [studioTab,setStudioTab]=useState<VehicleStudioTab>("performance");
 const studioSection=vehicleStudioSection(studioTab);
 const viewingConcepts=page==="heroes"&&role==="concepts";
 const viewingReference=viewingConcepts||(editing&&studioTab==="abilities");
 const [studioSummary,setStudioSummary]=useState<VehiclePerformanceSummary>(STOCK_VEHICLE_SUMMARY);
 const [studioFooter,setStudioFooter]=useState<ReactNode|null>(null);
 const [vehicleModStages,setVehicleModStages]=useState<Record<string,Record<string,number>>>({});
 const availableParts=useVehicleStudioStore(s=>s.availableVehicle===definition?.vehicle?s.availableParts:NO_VEHICLE_PARTS);
 const openedParts=useVehicleStudioStore(s=>s.parts);
 const wipersReady=useBrzCabinStudio(s=>s.wipersReady);
 const panelsHidden=useGarageDrive(s=>s.panelsHidden);
 const drivingOut=useGarageDrive(s=>s.stage!=="idle");
 const glassStyle=useVehicleStudioStore(s=>s.glassStyle);
 const setGlassStyle=useVehicleStudioStore(s=>s.setGlassStyle);
 const marineLights=useVehicleStudioStore(s=>s.marineLights);
 const toggleMarineLamp=useVehicleStudioStore(s=>s.toggleMarineLamp);
 const setStudioFooterContent=useCallback((content:ReactNode|null)=>setStudioFooter(content),[]);
 const setPerformanceSummary=useCallback((summary:VehiclePerformanceSummary)=>setStudioSummary(summary),[]);
 const updateVehicleModStages=useCallback((stages:Record<string,number>)=>{if(vehicle)setVehicleModStages(previous=>({...previous,[vehicle]:stages}));},[vehicle]);
 const queue=useMemo(()=>new HeroSaveQueue(async job=>{
  if(!owner||useSocialStore.getState().view?.profile.id!==owner)throw Error("Connect with your player profile to save.");
  return requestSocial("hero_loadout_save",{hero:job.hero,appearance:job.appearance,make_default:job.makeDefault});
 },(job,result)=>{
  if(!owner||useHeroLoadouts.getState().ownerId!==owner)return;
  useSocialStore.getState().acknowledgeProgression(owner,progression=>({
   ...progression,
   default_hero:job.makeDefault?job.hero:progression.default_hero,
   hero_loadouts:{...progression.hero_loadouts,[job.vehicle]:job.appearance},
  }),result);
  const progression=useSocialStore.getState().view?.profile.progression;
  if(progression)useHeroLoadouts.getState().adopt(owner,progression.default_hero,progression.hero_loadouts);
 },(next,error)=>{setStatus(next);setMessage(error??"");}),[owner]);
 useEffect(()=>()=>queue.dispose(),[queue]);
 useEffect(()=>{if(connected)queue.resume();},[connected,queue]);
 useEffect(()=>{root.current?.focus();},[]);
 const garageSession=editing||(characterOpen&&previousCharacterPage.current==="garage");
 const headerVehicle=definition;
 useEffect(()=>{if(!garageSession)useVehicleStudioStore.getState().closeParts();},[garageSession]);
 useLayoutEffect(()=>{useVehicleStudioStore.getState().setActiveTab(garageSession?studioTab:null);},[garageSession,studioTab]);
 useLayoutEffect(()=>()=>useVehicleStudioStore.getState().setActiveTab(null),[]);
 useLayoutEffect(()=>{onCharacterViewChange?.(characterOpen?characterTab:null);},[characterOpen,characterTab,onCharacterViewChange]);
 useLayoutEffect(()=>()=>onCharacterViewChange?.(null),[onCharacterViewChange]);
 useEffect(()=>{
  const stationTab=entry&&root.current?.querySelector(PRIMARY_TABLIST)?.querySelector<HTMLElement>('[role=tab][aria-selected=true]');
  if(stationTab){stationTab.focus({preventScroll:true});return;}
  const target=characterOpen?root.current?.querySelector<HTMLElement>(characterReady?'[role=tab][aria-selected="true"]':'[data-character-option][aria-pressed="true"]')
   : viewingConcepts?root.current?.querySelector<HTMLElement>(".hero-guide-scroll")
   : editing?root.current?.querySelector<HTMLElement>("[role=tab][aria-selected=true]"):root.current;
  target?.focus({preventScroll:true});
 },[entry,characterOpen,characterReady,characterTab,editing,role,studioSection,viewingConcepts]);
 useEffect(()=>{
  if(!focusRoster||page!=="heroes")return;
  const tile=root.current?.querySelector<HTMLElement>('[data-hero][aria-pressed="true"]')??root.current?.querySelector<HTMLElement>("[data-hero]:not(:disabled)");
  tile?.focus({preventScroll:true});
  setFocusRoster(false);
 },[focusRoster,page,role]);
 useLayoutEffect(()=>{if(hero)useAlphaStore.getState().preview(hero);else useAlphaStore.setState({previewHero:null});},[hero]);
 useEffect(()=>{setStudioSummary(vehicle?getVehicleStockPerformance(vehicle):STOCK_VEHICLE_SUMMARY);setStudioFooter(null);},[vehicle]);
 useLayoutEffect(()=>{useHeroLoadouts.setState({draft:vehicle?{vehicle,appearance}:null});},[vehicle,appearance]);
 useLayoutEffect(()=>()=>{useHeroLoadouts.setState({draft:null});},[]);
 const preview=(id:string)=>{
  const item=HEROES.find(value=>value.id===id)!;setHero(id);
  setAppearance(drafts.current[item.vehicle]??useHeroLoadouts.getState().loadouts[item.vehicle]??{...FACTORY_APPEARANCE});
 };
 const openHero=(id=hero)=>{
  if(!id){root.current?.querySelector<HTMLElement>("[data-hero]:not(:disabled)")?.focus({preventScroll:true});return;}
  preview(id);setStudioTab(stationEntry?"paint":"performance");setPage("garage");
 };
 const mainChoice=(id=hero)=>{
  if(viewingReference||characterOpen||!id)return;
  const item=HEROES.find(value=>value.id===id)!;
  const style=id===hero?appearance:drafts.current[item.vehicle]??useHeroLoadouts.getState().loadouts[item.vehicle]??{...FACTORY_APPEARANCE};
  queue.enqueue({hero:id,vehicle:item.vehicle,appearance:style,makeDefault:true});
 };
 const edit=(patch:Partial<HeroAppearance>)=>{
  if(!hero||!definition)return;
  const next={...appearance,...patch};drafts.current[definition.vehicle]=next;setHero(hero);setAppearance(next);
  queue.enqueue({hero,vehicle:definition.vehicle,appearance:next,makeDefault:false});
 };
 const leaveCharacter=async(next:()=>void|Promise<void>)=>{
  if(leaving.current)return;
  leaving.current=true;
  try{if(await beforeCharacterClose.current?.()!==false)await next();}
  finally{leaving.current=false;}
 };
 const leaveWorkshop=async()=>{
  if(await queue.flush())useUIStore.getState().setScreen("main");
 };
 const back=async()=>{
  if(useGarageDrive.getState().panelsHidden){useGarageDrive.setState({panelsHidden:false});return;}
  if(page==="character"){
   if(wardrobeNavigation.current?.back())return;
   const parent=previousCharacterPage.current;
   await leaveCharacter(parent==="main"?leaveWorkshop:()=>setPage(parent));
   return;
  }
  if(page==="garage"){setPage("heroes");setFocusRoster(true);return;}
  if(leaving.current)return;leaving.current=true;
  try{await leaveWorkshop();}finally{leaving.current=false;}
 };
 const cycleVehicleAppearance=(direction:number)=>{
  if(studioSection!=="paint")return;
  const index=VEHICLE_APPEARANCE_TABS.findIndex(tab=>tab.id===studioTab);
  setStudioTab(VEHICLE_APPEARANCE_TABS[(index+direction+VEHICLE_APPEARANCE_TABS.length)%VEHICLE_APPEARANCE_TABS.length].id);
 };
 useSelectionNavigation(root,{navigateOptionFields:Boolean(entry),confirm:()=>{
  if(useGarageDrive.getState().panelsHidden){useGarageDrive.setState({panelsHidden:false});return;}
  const active=document.activeElement as HTMLElement;
  if(active===root.current&&page==="heroes"&&!viewingReference)openHero();else if(root.current?.contains(active))active.click();
 },back:()=>void back(),direction:action=>{
  if(useGarageDrive.getState().panelsHidden)return;
  const active=document.activeElement;
  if(viewingConcepts&&(action==="up"||action==="down")){
   const guide=root.current?.querySelector<HTMLElement>(".hero-guide-scroll");
   if(entry)guide?.focus({preventScroll:true});
   guide?.scrollBy?.({top:action==="up"?-180:180,behavior:"smooth"});
   return;
  }
  if(editing&&studioTab==="abilities"&&root.current){
   navigateFormRows(root.current,active as HTMLElement,action,remembered.current,{includeHeaderActions:!entry});
   (document.activeElement as HTMLElement|null)?.scrollIntoView?.({block:"nearest"});
   return;
  }
  if(characterOpen&&(action==="left"||action==="right")&&active instanceof window.HTMLInputElement&&active.matches(".preview-zoom-slider")){
   if(action==="left")active.stepDown();else active.stepUp();
   active.dispatchEvent(new Event("input",{bubbles:true}));
  }else if(editing&&studioTab==="paint"&&(action==="left"||action==="right")&&active instanceof window.HTMLInputElement&&active.type==="range"){
   if(action==="left")active.stepDown();else active.stepUp();
   edit({metallic:active.valueAsNumber});
  }else if(active instanceof HTMLSelectElement&&(action==="left"||action==="right")){
   active.selectedIndex=(active.selectedIndex+(action==="left"?-1:1)+active.options.length)%active.options.length;
   active.dispatchEvent(new Event("change",{bubbles:true}));
  }else if(root.current){
   const enterBody=action==="down"&&active?.closest("[data-controller-header-action]");
   navigateFormRows(root.current,enterBody?null:active as HTMLElement,action,remembered.current,{includeHeaderActions:!entry});
  }
 },option:direction=>{
  if(useGarageDrive.getState().panelsHidden)return;
  if(characterOpen)wardrobeNavigation.current?.cycleGroup(direction);
  else if(editing)cycleVehicleAppearance(direction);
 },tab:direction=>{
  if(useGarageDrive.getState().panelsHidden)return;
  if(entry&&root.current){cycleStationHeader(root.current,direction);return;}
  if(characterOpen){
   if(characterReady){
    const index=visibleCharacterTabs.findIndex(item=>item.id===characterTab);
    setCharacterTab(visibleCharacterTabs[(index+direction+visibleCharacterTabs.length)%visibleCharacterTabs.length].id);
   }
   return;
  }
  if(editing){
   const index=VEHICLE_STUDIO_TABS.findIndex(item=>item.id===studioSection);
   setStudioTab(VEHICLE_STUDIO_TABS[(index+direction+VEHICLE_STUDIO_TABS.length)%VEHICLE_STUDIO_TABS.length].id);
   return;
  }
  const index=WORKSHOP_TABS.findIndex(item=>item.id===role);
  setRole(WORKSHOP_TABS[(index+direction+WORKSHOP_TABS.length)%WORKSHOP_TABS.length].id as WorkshopFilter);
 }});
 const unlocked=(skins??[]).filter(skin=>owned.includes(skin.id));
 const paintPresets=marine?HULL_PAINT_PRESETS:[...VEHICLE_PAINT_PRESETS,{label:`${UI_THEMES[theme].label} accent`,color:UI_THEMES[theme]["scene-tint"]}];
 const partLabels:Record<VehicleStudioPart,string>={"door-left":"LEFT DOOR","door-right":"RIGHT DOOR",hood:"HOOD",trunk:"TRUNK",headlights:"POP-UP HEADLIGHTS"};
 const partOptions:VehicleStudioPart[]=["door-left","door-right","hood","trunk","headlights"];
 const renderPartButton=(part:VehicleStudioPart)=>{
  const supported=availableParts.includes(part),open=openedParts[part];
  return <button key={part} type="button" className="vehicle-studio-feature" data-supported={supported} disabled={!supported||drivingOut} aria-pressed={supported?open:undefined} title={supported?`${open?"Close":"Open"} ${partLabels[part].toLowerCase()}`:`No separate movable ${partLabels[part].toLowerCase()} mesh in this vehicle model`} onClick={()=>useVehicleStudioStore.getState().setPart(part,!open)}>{partLabels[part]} · {supported?(open?"OPEN":"CLOSED"):"NOT RIGGED"}</button>;
 };
 const bodyFooter=marine?null:<>{partOptions.map(renderPartButton)}</>;
 const lightingFooter=shipLightPreview
  ? MARINE_LAMPS.map(lamp=><button key={lamp.id} type="button" aria-pressed={marineLights[lamp.id]} onClick={()=>toggleMarineLamp(lamp.id)}>{lamp.label}</button>)
  : null;
 const currentFooter=studioTab==="performance"?studioFooter:studioTab==="body"?bodyFooter:studioTab==="lighting"?lightingFooter:null;
 const isMainVehicle=Boolean(headerVehicle&&headerVehicle.id===mainDefinition?.id);
 const vehicleLabel=headerVehicle?`Open garage for ${isMainVehicle?"main vehicle ":""}${headerVehicle.name}`:"Browse vehicles";
 const openVehicleCustomization=()=>{
  if(editing)return;
  const open=()=>{
   if(garageSession&&definition)setPage("garage");
   else if(headerVehicle)openHero(headerVehicle.id);
   else{
    setPage("heroes");
    setRole("all");
    setFocusRoster(true);
   }
  };
  if(characterOpen)void leaveCharacter(open);
  else open();
 };
 const vehicleAction=<button type="button" className="hero-workshop-main" data-customize-vehicle
  data-main-vehicle={isMainVehicle?headerVehicle?.id:undefined} data-selection-action
  disabled={Boolean(headerVehicle&&!owner)} aria-label={vehicleLabel} title={vehicleLabel}
  aria-current={editing?"page":undefined} onClick={openVehicleCustomization}>
  {headerVehicle?<HeroPortrait hero={headerVehicle.id} appearance={appearance} cacheOnly={!garageSession} showStyleStatus={false}/>:<MenuIcon name="vehicles"/>}
  <span className="hero-workshop-main-name">{headerVehicle?.name??"Vehicles"}</span>
 </button>;
 const customizationHeader={onOpen:openCharacter,leadingAction:vehicleAction,active:characterOpen};
 return <><section {...pressOwner} ref={root} className={`game-ui menu-surface alpha-selection hero-selection hero-workshop${panelsHidden?" hero-workshop--hidden":""}${viewingConcepts?" hero-ability-guide":""}`} data-character-page={characterOpen||undefined} inert={overlay!==null||(characterOpen&&panelsHidden)} tabIndex={-1} aria-label={characterOpen?"Character":"Heroes garage"} data-controller-form data-controller-rows>
  <ScreenNotice message={status==="error" ? message : status==="saved" ? "Vehicle style saved to your profile." :
    status==="pending" || status==="saving" ? "Saving vehicle style…" : ""}/>
  {characterOpen?characterReady?<SceneTabHeader station={Boolean(entry)} title="" tablistLabel="Character sections" compact tabs={visibleCharacterTabs} activeTab={characterTab}
    character={customizationHeader} backAction={{onClick:back}}
    onTabChange={id=>setCharacterTab(id as CharacterTab)} idPrefix="character-editor" panelId="character-editor-panel"/>
    :entry?<SceneTabHeader station compact title="" tabs={[]} activeTab="" onTabChange={()=>{}} idPrefix="character-setup" panelId="character-editor-panel" character={customizationHeader} backAction={{onClick:back}}/>
    :<SelectionHeader title="" compact character={customizationHeader} backAction={{onClick:back}}/>:editing&&definition
    ? <SceneTabHeader station={Boolean(entry)}
        title={stationEntry?"Vehicle":"GARAGE"}
        compact
        backAction={{onClick:back}}
        character={customizationHeader}
        activeTab={studioSection}
        onTabChange={next=>setStudioTab(next as VehicleStudioTab)}
        tablistClassName="garage-studio-tabs"
        idPrefix="vehicle-studio"
        panelId="vehicle-studio-tab-panel"
        tabs={VEHICLE_STUDIO_TABS.map(item=>({...item,icon:<VehicleStudioTabIcon tab={item.id}/>}))}
      />
    : <SceneTabHeader station={Boolean(entry)} title={stationEntry?"Vehicles":"HEROES"} compact character={customizationHeader} backAction={{onClick:back}} tabs={WORKSHOP_TABS} activeTab={role}
        tablistClassName="hero-pick-tabs" onTabChange={next=>setRole(next as WorkshopFilter)}
        idPrefix="hero-workshop-role" panelId="hero-workshop-role-panel"/>}
  <div className="hero-selection-stage hero-workshop-body">
   {characterOpen&&<CharacterPage key={JSON.stringify([owner,characterSlot])} onPreview={onCharacterPreviewChange} onReady={setCharacterReady} tab={characterTab}
    beforeClose={beforeCharacterClose} wardrobeNavigation={wardrobeNavigation}/>}
   {viewingConcepts&&<div className="hero-guide-scroll" id="hero-workshop-role-panel" role="tabpanel" aria-labelledby="hero-workshop-role-tab-concepts" tabIndex={0}><HeroConceptGallery/></div>}
   {page==="heroes"&&role!=="concepts"&&<div className="hero-picker-stage hero-workshop-picker" data-vehicle-picker={stationEntry||undefined} data-hero-filter={role} id="hero-workshop-role-panel" role="tabpanel" aria-labelledby={"hero-workshop-role-tab-"+role}>
    <div className="hero-picker-scene hero-picker-preview" ref={observeWorkshopViewport} data-workshop-viewport>
      {!stationEntry&&<section className="hero-workshop-intro" aria-label="Selected vehicle">
        <h2 className="hero-workshop-vehicle-name">{definition?.name??"CHOOSE YOUR HERO"}</h2>
        <div className="hero-workshop-instructions">
         <p>Choose a vehicle portrait to open its garage.</p>
         <p>Hold {inputDevice==="touch"?"Set Main":"X"} to set your favorite.</p>
        </div>
      </section>}
        {status==="error"&&<button className="menu-control" onClick={()=>void queue.flush()}>RETRY SAVE</button>}
        {definition&&<PreviewZoom visibilityToggle/>}
    </div>
    <HeroRoster showFilters={false} allowBoats selected={hero} main={main} filter={role} busy={!owner} onConfirmPreview={stationEntry?openHero:undefined} onChoose={stationEntry?preview:openHero} onFilter={setRole}/>
   </div>}
   {editing&&definition&&<VehicleStudio name={definition.name} role={definition.role} note={definition.note} vehicleId={definition.vehicle} speedUnit={speedUnit} stages={vehicleModStages[definition.vehicle]??NO_VEHICLE_MOD_STAGES} summary={studioSummary} tab={studioTab} changeTab={setStudioTab} footer={currentFooter}>
    {studioTab==="abilities"&&<HeroAbilityDetails heroId={definition.id}/>}
    {studioTab==="performance"&&<VehicleMods key={`${owner}:${definition.vehicle}`} vehicle={definition.vehicle} stages={vehicleModStages[definition.vehicle]??NO_VEHICLE_MOD_STAGES} onStagesChange={updateVehicleModStages} onSummaryChange={setPerformanceSummary} onFooterChange={setStudioFooterContent}/>}
    {studioTab==="paint"&&(paintable?<>
     <CollapsibleMenuPanel className="vehicle-studio-card vehicle-paint-group" title={marine?"Hull paint":"Body paint"}>
      <div className="vehicle-studio-swatches" role="group" aria-label="Paint presets" data-controller-row data-controller-columns="4">
       {paintPresets.map(preset=><ColorSwatchButton key={preset.label} className="vehicle-studio-swatch"
        color={preset.color==="factory"?"#aeb7c0":preset.color}
        label={`Paint: ${preset.label}`} title={preset.label} pressed={appearance.body===preset.color}
        disabled={!owner} onClick={()=>edit({body:preset.color})}/>)}
      </div>
      <label data-controller-row>Custom paint<input type="color" aria-label="Custom hero body color" disabled={!owner}
       value={appearance.body==="factory"?"#f1f3f4":appearance.body==="theme"?UI_THEMES[theme]["scene-tint"]:appearance.body} onChange={event=>edit({body:event.target.value})}/></label>
      <button type="button" className="menu-control" data-controller-row disabled={!owner} onClick={()=>edit({body:"factory",skin:"factory"})}>Reset paint color</button>
     </CollapsibleMenuPanel>
     <CollapsibleMenuPanel className="vehicle-studio-card vehicle-paint-group" title="Finish">
      <div className="vehicle-finish-grid" role="group" aria-label="Paint finish" data-controller-row data-controller-columns="3">
       {Object.entries(PAINT_FINISHES).map(([id,label])=><GameButton variant="custom" key={id} className="vehicle-finish-tile"
        data-finish={id} aria-pressed={appearance.finish===id} disabled={!owner} pressFeedback
        onPress={()=>edit({finish:id as HeroAppearance["finish"]})}>
        <span aria-hidden="true" className="vehicle-finish-sample"
         style={{"--finish-color":appearance.body==="factory"?"#4e5660":appearance.body==="theme"?"var(--app-accent)":appearance.body} as CSSProperties} />
        <span>{label}</span>
       </GameButton>)}
      </div>
      <label data-controller-row>METALLIC / REFLECTION <output>{Math.round(appearance.metallic*100)}%</output>
       <input type="range" min="0" max="1" step="0.01" aria-label="Metallic reflection strength" disabled={!owner}
        value={appearance.metallic} onChange={event=>edit({metallic:Number(event.target.value)})}/>
      </label>
      <button type="button" className="menu-control" data-controller-row disabled={!owner} onClick={()=>edit({finish:FACTORY_APPEARANCE.finish,metallic:FACTORY_APPEARANCE.metallic})}>Reset finish</button>
      <button type="button" className="menu-control" data-controller-row disabled={!owner} onClick={()=>{edit(FACTORY_APPEARANCE);setGlassStyle(DEFAULT_WINDOW_TONE);}}>Restore factory appearance</button>
     </CollapsibleMenuPanel>
     {!marine&&<>
      <CollapsibleMenuPanel className="vehicle-studio-card vehicle-paint-group" title="Window tint" summary="Garage preview" defaultCollapsed>
       <div className="vehicle-studio-glass-options" data-controller-row data-controller-columns="3">
        {Object.entries(WINDOW_TONES).map(([id,tone])=><button key={id} type="button" data-glass={id}
         aria-pressed={glassStyle===id} onClick={()=>setGlassStyle(id as WindowTone)}>
         <i className="vehicle-studio-glass-preview" style={{"--glass-tint":tone.color} as CSSProperties}/><span>{tone.label}</span>
        </button>)}
       </div>
      </CollapsibleMenuPanel>
      <CollapsibleMenuPanel className="vehicle-studio-card vehicle-paint-group" title="Interior & collection" defaultCollapsed>
       <label data-controller-row>UNLOCKED SKIN<select aria-label="Unlocked hero skin" disabled={!owner} value={appearance.skin}
        onChange={event=>{const skin=unlocked.find(item=>item.id===event.target.value);edit({skin:event.target.value,body:skin&&skin.id!=="factory"?skin.color:"factory"});}}>
        <option value="factory">Factory</option>
        {unlocked.filter(item=>item.id!=="factory").map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
       </select></label>
       {BRZ_GARAGE_ENABLED&&definition.vehicle==="brz"?<BrzCabinColorControls/>:<label data-controller-row>SEAT COLOR<select aria-label="Hero seat color request" disabled={!owner||definition.vehicle!=="brz"}
        value={appearance.seats} onChange={event=>edit({seats:event.target.value as HeroAppearance["seats"]})}>
        <option value="factory">Factory</option><option value="black">Black · mapping pending</option><option value="red">Red · mapping pending</option>
       </select></label>}
      </CollapsibleMenuPanel>
     </>}
    </>:<section className="vehicle-studio-card"><h3>Factory armor finish</h3><p>This model uses the authored armor materials.</p></section>)}
    {studioTab==="body"&&(marine
     ? <section className="vehicle-studio-card"><header><small>MARINE BODY</small><h3>Hull and deck</h3></header>
        <p>Rotate the model to inspect the hull and deck fittings.</p>
       </section>
     : <section className="vehicle-studio-card"><header><small>MODEL-SUPPORTED PANELS</small><h3>Open and inspect</h3></header>
        <p>Controls move the separate panels available on this model.</p>
        <div className="vehicle-studio-feature-list">{partOptions.map(part=><div key={part} data-supported={availableParts.includes(part)}><span>{partLabels[part]}</span><strong>{availableParts.includes(part)?(openedParts[part]?"OPEN":"CLOSED"):"NO MOVING MESH"}</strong></div>)}</div>
        {BRZ_GARAGE_ENABLED&&definition.vehicle==="brz"&&<button type="button" className="menu-control" data-controller-row
          disabled={!wipersReady||openedParts.hood||drivingOut} onClick={()=>useBrzCabinStudio.getState().requestSweep()}>Sweep windshield wipers</button>}
       </section>)}
    {studioTab==="lighting"&&(marine
     ? <section className="vehicle-studio-card"><header><small>LOCAL GARAGE TEST</small><h3>Marine lighting</h3></header>
        {shipLightPreview
         ? <div className="vehicle-studio-feature-list">{MARINE_LAMPS.map(lamp=><div key={lamp.id}><span>{lamp.label}</span><strong>{marineLights[lamp.id]?"ON":"OFF"}</strong></div>)}</div>
         : <p role="status">Deck and navigation lights use the ship's authored materials.</p>}
       </section>
     : <GarageVehicleDiagnostics vehicle={definition.vehicle}/>)}
    {studioTab==="studio"&&<section className="vehicle-studio-card">
     <header><small>PORTRAIT PREVIEW</small><h3>{definition.name}</h3></header>
     <HeroPortrait hero={definition.id} appearance={appearance} className="vehicle-studio-portrait" windowTone={marine?DEFAULT_WINDOW_TONE:glassStyle}/>
     <p>The portrait refreshes with your current appearance.</p>
    </section>}
    {!owner&&<p className="vehicle-studio-save-status">Connect your player profile to save vehicle changes.</p>}
    {status==="error"&&<button className="menu-control" onClick={()=>void queue.flush()}>RETRY SAVE</button>}
   </VehicleStudio>}
   {editing&&definition&&<GaragePreviewControls vehicle={definition.vehicle}/>}
   {((characterOpen&&!characterReady)||viewingConcepts||(!characterOpen&&!definition))&&<div className="hero-garage-controls" data-controller-row><PreviewVisibilityToggle/></div>}
  </div>
  <SelectionFooter tabs={!characterOpen||characterReady} selectLabel={editing&&studioTab==="abilities"?"Toggle":undefined} hasPrimaryAction={!characterOpen&&(!editing||studioTab!=="abilities")}>{!characterOpen&&<div className="hero-workshop-actions" data-controller-row={stationEntry||undefined}>
   {!viewingReference&&<ControllerAction button="A" type="button" className="menu-control" disabled={!owner} tabIndex={stationEntry?0:-1} onClick={()=>editing?void back():openHero()}>{stationEntry?(editing?"Done":"Customize"):(editing?"APPLY":"OPEN GARAGE")}</ControllerAction>}
   <HoldMainButton key={`${owner}:${hero}:${editing}:${viewingReference}:${main===hero}:${status==="error"}`} disabled={overlay!==null||viewingReference||!owner||!hero||main===hero||status==="error"} selected={hero!==null&&main===hero} onComplete={()=>mainChoice()}/>
  </div>}</SelectionFooter>
 </section>
 {characterOpen&&!overlay&&<WardrobeImmersion root={root} hiddenUI={panelsHidden}/>}
 </>;
}
