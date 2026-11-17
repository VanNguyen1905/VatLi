import * as THREE from 'three';
const v=a=>new THREE.Vector3(...a),clamp=THREE.MathUtils.clamp;

/** Runtime transforms of original Blender meshes. Connector grips extend the
 * existing flexible cables; the exported source has no detachable plug mesh. */
export class TutorDevices {
 constructor(e){
  this.e=e;this.listeners=[];this.drag=null;this.connectors=new Map();this.locked=false;
  const body=e.objects.get(e.manifest.dmm.body);if(!body)throw Error('Không tìm thấy DMM gốc');
  this.group=new THREE.Group();this.group.name='MOVABLE_ORIGINAL_DMM';this.group.position.copy(new THREE.Box3().setFromObject(body).getCenter(new THREE.Vector3()));e.scene.add(this.group);
  this.home=this.group.position.clone();
  for(const [name,obj] of e.objects){
   if(/^(A001_DMM_|DMM_Knob_|DMM_Jack_|DMM_Btn_[1-5]$)/.test(name)&&obj.getWorldPosition(new THREE.Vector3()).distanceTo(this.home)<.25)this.group.attach(obj);
  }
  const knob=e.objects.get(e.manifest.dmm.knob.name);
  for(const name of ['DMM_Knob_Bar','DMM_Knob_Arrow']){const obj=e.objects.get(name);if(obj&&obj.parent===this.group)knob.attach(obj);}
  this.group.attach(e.lcd.plane);
  for(const [id,mesh]of e.hotspots)if(id.startsWith('JACK_')||id==='DMM_DIAL')this.group.attach(mesh);
  this.jackLocals=Object.fromEntries(Object.entries(e.manifest.dmm.jacks).map(([key,data])=>[key,this.group.worldToLocal(v(data.position))]));
  for(const color of ['BLACK','RED']){
   const grip=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,.023,12),new THREE.MeshStandardMaterial({color:color==='RED'?0xdb404a:0x1b2530,roughness:.6}));
   grip.rotation.x=Math.PI/2;grip.name='CABLE_CONNECTOR_'+color;e.scene.add(grip);this.connectors.set(color,grip);this.syncJack(color);
  }
  this.bind();
 }
 jackPosition(port){const local=this.jackLocals[port];return local?this.group.localToWorld(local.clone()):null;}
 dialAngle(mode){const up=this.e.manifest.dmm.knob.basis.up;const initial=Math.atan2(up[1],up[0])*180/Math.PI;return initial-({OFF:200,OHM:90,CONT:65,CAP:24,DCV:160}[mode]??200);}
 connectorPosition(color){return this.connectors.get(color).position.clone();}
 syncJack(color){
  const port=this.e.state[color.toLowerCase()+'Jack'],point=this.jackPosition(port==='AMP'?'A':port);
  this.connectors.get(color)?.position.copy(point||v([color==='RED'?.18:-.11,.822,-1.72]));
 }
 refresh(){this.group.updateMatrixWorld(true);for(const color of ['BLACK','RED']){if(this.drag?.color!==color)this.syncJack(color);this.e.updateCable(color);}this.e.renderer.shadowMap.needsUpdate=true;}
 reset(){this.group.position.copy(this.home);this.group.rotation.set(0,0,0);this.refresh();}
 pose(){return {position:this.group.position.toArray(),rotation:this.group.rotation.toArray().slice(0,3)};}
 restore(pose){this.group.position.fromArray(pose.position);this.group.rotation.set(...pose.rotation);this.refresh();}
 project(point){const p=point.clone().project(this.e.camera),r=this.e.canvas.getBoundingClientRect();return{x:r.left+(p.x*.5+.5)*r.width,y:r.top+(-p.y*.5+.5)*r.height,visible:Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1};}
 target(id){
  const e=this.e;if(e.hotspots.has(id))return e.hotspots.get(id).getWorldPosition(new THREE.Vector3());
  if(id==='DMM_LCD')return e.lcd.plane.getWorldPosition(new THREE.Vector3());
  if(id.startsWith('PROBE_')){const p=e.probes.get(id.slice(6));if(p){p.group.updateMatrixWorld(true);return p.tail.clone().applyMatrix4(p.group.matrixWorld);}}
  const name={BREADBOARD:e.manifest.boardTopology.sourceNode,SCOPE:e.manifest.devices.scope.body,PSU:e.manifest.devices.supply.body,GENERATOR:e.manifest.devices.generator.body}[id];
  const obj=name&&e.objects.get(name);return obj?new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()):null;
 }
 focus(id){
  if(!this.target(id))throw Error('Không có điểm neo thật: '+id);
  this.e.setView(id==='SCOPE'?'scope':id==='PSU'?'supply':id==='GENERATOR'?'generator':/PIN|PROBE|BREADBOARD/.test(id)?'board-close':'dmm');
  this.highlight={id,remaining:7500};
 }
 animateProbe(color,pin,t,from){
  const e=this.e,p=e.probes.get(color),point=e.pinPosition(pin);if(!p||!point)throw Error('Thiếu điểm neo que đo');
  const q=new THREE.Quaternion().setFromUnitVectors(p.direction,new THREE.Vector3(0,1,0));
  const to=point.clone().sub(p.tip.clone().applyQuaternion(q)),smooth=t*t*(3-2*t);
  p.group.quaternion.slerpQuaternions(from.quaternion,q,smooth);p.group.position.lerpVectors(from.position,to,smooth);p.group.position.y+=Math.sin(Math.PI*t)*.08;p.active=true;e.updateCable(color);
  if(t===1){p.group.updateMatrixWorld(true);if(p.tip.clone().applyMatrix4(p.group.matrixWorld).distanceTo(point)>.0008)throw Error('Kim chưa đến đúng chân');e.connectProbe(color,pin);}
 }
 probePose(color){const p=this.e.probes.get(color);return {position:p.group.position.clone(),quaternion:p.group.quaternion.clone()};}
 animateJack(color,port,t,from){const target=this.jackPosition(port);if(!target)throw Error('Thiếu cổng jack');const grip=this.connectors.get(color);grip.position.lerpVectors(from,target,t*t*(3-2*t));grip.position.y+=Math.sin(Math.PI*t)*.06;this.e.updateCable(color);if(t===1){if(grip.position.distanceTo(target)>.0008)throw Error('Jack chưa tới cổng');this.e.connectJack(color,port);}}
 tick(dt){if(!this.highlight)return;this.highlight.remaining-=dt;const point=this.target(this.highlight.id);window.dispatchEvent(new CustomEvent('biscot:point',{detail:point&&this.highlight.remaining>0?{...this.project(point),label:this.highlight.id}:null}));if(this.highlight.remaining<=0)this.highlight=null;}
 bind(){
  const e=this.e,ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(),hitPoint=new THREE.Vector3();
  const cast=event=>{const r=e.canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);ray.setFromCamera(pointer,e.camera);};
  const on=(target,event,fn,opts)=>{target.addEventListener(event,fn,opts);this.listeners.push(()=>target.removeEventListener(event,fn,opts));};
  on(e.canvas,'pointerdown',event=>{
   if(this.locked){event.stopImmediatePropagation();return;}if(event.button!==0||!e.state.ready||e.cinematic())return;cast(event);
   const jack=ray.intersectObjects([...this.connectors.values()])[0];
   const hit=ray.intersectObject(this.group,true)[0];
   // Ports and dial retain their original pointer handlers.
   if(!jack&&(!hit||ray.intersectObjects([...e.hotspots.values()],false).length))return;
   this.drag={id:event.pointerId,x:event.clientX,y:event.clientY,position:this.group.position.clone(),yaw:this.group.rotation.y,rotate:event.shiftKey,color:jack?.object.name.replace('CABLE_CONNECTOR_','')};
   if(this.drag.color){e.state[this.drag.color.toLowerCase()+'Jack']='NONE';e.updateLCD();plane.setFromNormalAndCoplanarPoint(e.camera.getWorldDirection(new THREE.Vector3()),jack.object.position);}
   else plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,1,0),hit.point);
   ray.ray.intersectPlane(plane,hitPoint);this.drag.start=hitPoint.clone();e.controls.enabled=false;e.canvas.setPointerCapture(event.pointerId);event.stopImmediatePropagation();event.preventDefault();
  },true);
  on(e.canvas,'pointermove',event=>{
   if(!this.drag||event.pointerId!==this.drag.id)return;event.stopImmediatePropagation();cast(event);if(!ray.ray.intersectPlane(plane,hitPoint))return;
   if(this.drag.color){this.connectors.get(this.drag.color).position.copy(hitPoint);e.updateCable(this.drag.color);}
   else if(this.drag.rotate){this.group.rotation.y=clamp(this.drag.yaw+(event.clientX-this.drag.x)*.006,-.75,.75);this.refresh();}
   else {this.group.position.copy(this.drag.position).add(hitPoint.clone().sub(this.drag.start));this.group.position.x=clamp(this.group.position.x,-.1,.24);this.group.position.z=clamp(this.group.position.z,-1.96,-1.75);this.refresh();}
   e.renderer.shadowMap.needsUpdate=true;
  },true);
  const release=event=>{if(!this.drag)return;const drag=this.drag;this.drag=null;
   if(drag.color){if(event.type==='pointerup')cast(event);const hit=event.type==='pointerup'?ray.intersectObjects([...e.hotspots.values()],false).find(h=>h.object.userData.role==='jack'):null;
    if(hit)e.connectJack(drag.color,['A','MA'].includes(hit.object.userData.id.slice(5))?'AMP':hit.object.userData.id.slice(5));else{this.syncJack(drag.color);e.updateCable(drag.color);e.updateLCD();}}
   e.controls.enabled=!this.locked;event.stopImmediatePropagation();try{e.canvas.releasePointerCapture(event.pointerId);}catch{}
  };
  on(e.canvas,'pointerup',release,true);on(e.canvas,'pointercancel',release,true);on(e.canvas,'lostpointercapture',release,true);on(window,'blur',release);
 }
 dispose(){this.listeners.forEach(fn=>fn());this.drag=null;this.highlight=null;}
}
