import { useMotionView } from "../store/session/networkViews";
import {useSightCue} from './sightCue';
import {ScopeAimControls} from './ScopeAimControls';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {PerspectiveCamera} from '@react-three/drei';
import {BufferAttribute,BufferGeometry,Line,LineBasicMaterial,Quaternion,Vector3} from 'three';
import {useCombatStore} from './combatStore';
import {useNetworkStore} from '../store/session/networkStore';
import {useUIStore} from '../store/menus/uiStore';
import {useVehiclePhysicsInterpolator} from '../hooks/usePhysicsInterpolator';
import {usePreferencesStore} from '../store/preferences/preferencesStore';
import {CANNON_SPEED,GRAVITY,planeFlight} from './ballistics';
import {worldAim} from './turretPresentation';
import {toggleTankScope} from './turretControls';
import './tankScope.css';

export function TankScopeHUD(){
 const scope=useCombatStore(s=>s.scope);
 const visible=useUIStore(s=>s.screen==='sandbox'&&s.overlay===null&&!s.isModeLoading);
 const vehicle=useMotionView(s=>scope && visible && s.connected && s.getMe()?.combat?.enabled?s.getMe()?.vehicle_id:null);
 return vehicle?<ScopeInstruments key={vehicle} tank={vehicle==='tank'}/>:null;
}
function readScope(tank:boolean){
 const me=useNetworkStore.getState().getMe(),c=me?.combat;
 if(!me||!c)return {pitch:0,height:0,reload:0};
 const pitch=Math.round(c.pitch*180/Math.PI*10)/10;
 const [qx,qy,qz,qw]=me.rotation;
 const y=c.y+2*((qx*qy+qz*qw)*c.x-(qx*qx+qz*qz)*c.y+(qy*qz-qx*qw)*c.z);
 return {pitch,height:tank?Math.max(.1,Math.round((me.position[1]+y+Math.sin(c.pitch)*4.1)*10)/10):0,
  reload:Math.ceil((tank?c.cannon_reload??c.reload??0:c.reload??0)*10)/10};
}
function ScopeInstruments({tank}:{tank:boolean}){
 const cue=useSightCue(s=>s.tone);
 const zoom=useCombatStore(s=>s.scopeZoom);
 const [sample,setSample]=useState(()=>readScope(tank));
 useEffect(()=>{
  const timer=window.setInterval(()=>{
   const next=readScope(tank);
   setSample(old=>old.pitch===next.pitch && old.height===next.height && old.reload===next.reload?old:next);
  },125);
  return ()=>window.clearInterval(timer);
 },[tank]);
 const pitch=sample.pitch*Math.PI/180,flight=tank?planeFlight(pitch,sample.height):null;
 return <section className="tank-scope-overlay" aria-label={tank?'Tank scope view':'Turret scope view'}>
  <div className="tank-scope-vignette"/>
  <svg data-cue={cue??undefined} className="tank-scope-reticle" viewBox="0 0 600 600" aria-hidden="true"><circle cx="300" cy="300" r="225"/><path d="M180 300h100m40 0h100M300 245v35m0 40v105M250 310v-20m-30 20v-20m130 20v-20m30 20v-20M290 340h20m-25 35h30m-35 35h40"/><circle cx="300" cy="300" r="3"/></svg>
  <div className="scope-top-controls"><button onClick={()=>useCombatStore.getState().setScopeZoom(useCombatStore.getState().scopeZoom===2?4:2)} aria-label="Scope magnification">{zoom}×</button><button onClick={toggleTankScope}>EXIT SCOPE</button></div>
  <output className="scope-range-readout">ELEV {sample.pitch.toFixed(1)}° · {sample.reload>0?`LOAD ${sample.reload.toFixed(1)}s`:'READY'}{flight&&<><br/>DATUM y=0 · RANGE {Math.round(flight.range)}m{flight.capped?' +':''} · {flight.time.toFixed(2)}s</>}</output>
 </section>;
}
/** This rig is the sole camera owner while scoped; the chase rig unmounts. */
export function TankScopeRig({playerId}:{playerId:string}){
 const zoom=useCombatStore(s=>s.scopeZoom),base=usePreferencesStore(s=>s.fov);
 const fov=2*Math.atan(Math.tan(base*Math.PI/360)/zoom)*180/Math.PI;
 return <><PerspectiveCamera makeDefault fov={fov} near={.1}/><ScopeAimControls/><ScopeCamera playerId={playerId}/></>;
}
function ScopeCamera({playerId}:{playerId:string}){
 const {camera}=useThree(),{getInterpolated}=useVehiclePhysicsInterpolator(playerId);
 const buffers=useMemo(()=>{const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(65*3),3));return {geometry,p:new Vector3(),q:new Quaternion(),direction:new Vector3(),origin:new Vector3(),look:new Vector3()};},[]);
 const path=useMemo(()=>new Line(buffers.geometry,new LineBasicMaterial({color:0x7cebe0,transparent:true,opacity:.65,depthTest:true})),[buffers]);
 const lastShot=useRef(-1),kick=useRef(0),nextArc=useRef(0);
 const reduce=usePreferencesStore(s=>s.reducedMotion);
 useEffect(()=>()=>{buffers.geometry.dispose();(path.material as LineBasicMaterial).dispose();},[buffers,path]);
 useFrame((_,dt)=>{
  const pose=getInterpolated(playerId),c=pose?.combat;if(!pose||!c)return;
  const {p,q,direction,origin,look}=buffers;p.fromArray(pose.position);q.fromArray(pose.rotation);worldAim(direction,c.yaw,c.pitch);
  if(c.hull_locked&&c.lock_yaw!==undefined){const yaw=c.lock_yaw,pitch=c.lock_pitch??0;direction.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).applyQuaternion(q);}
  const cannon=pose.vehicle_id==='tank';
  path.visible=cannon;
  origin.set(c.x,c.y,c.z).applyQuaternion(q).add(p).addScaledVector(direction,cannon?4.1:1.2);
  if(lastShot.current>=0&&c.cannon_shot!==lastShot.current)kick.current=1;lastShot.current=c.cannon_shot??0;kick.current=Math.max(0,kick.current-dt*4);
  camera.position.copy(origin).addScaledVector(direction,cannon?-.5:0);camera.position.y+=.12;
  look.copy(camera.position).add(direction);look.y+=reduce?0:kick.current*.028;camera.lookAt(look);
  const now=performance.now();
  if(!cannon || now<nextArc.current)return;
  nextArc.current=now+100;
  const time=planeFlight(c.pitch,Math.max(.1,origin.y)).time,positions=buffers.geometry.attributes.position;
  for(let i=0;i<=64;i++){const t=time*i/64;const travel=CANNON_SPEED*t;positions.setXYZ(i,origin.x+direction.x*travel,origin.y+direction.y*travel-.5*GRAVITY*t*t,origin.z+direction.z*travel);}
  uploadTrajectory(buffers.geometry);
 },-1);
 return <primitive object={path} dispose={null}/>;
}

/** Imperative GPU upload; this buffer is not React render state. */
function uploadTrajectory(geometry:BufferGeometry){geometry.attributes.position.needsUpdate=true;geometry.computeBoundingSphere();}
