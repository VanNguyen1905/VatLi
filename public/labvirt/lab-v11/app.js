import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {COMPONENTS,evaluateMeasurement,createMeasurementRecord,validateSavedEntries,upsertMeasurementRecord,toMeasurementCsv} from './measurement-core.js';
import {InstrumentLab} from './instruments.js';
import {configureLighting} from './scene-support.js';
import {LabMentor} from './ai-mentor.js';
import {boardSlot,isOnBoard,placementClear} from './breadboard-placement.js';
import {buildMeasurementWorkbook} from './lab-xlsx-export.js';
import {SemiconductorRoom,extendSemiconductorManifest} from './semiconductor-room.js';
import {installSemiconductorInstrumentAdapter} from './semiconductor-instruments.js';
import {TransistorRoom} from './transistor-room.js';
import {installTransistorInstrumentAdapter} from './transistor-instruments.js';
import {isTransistorLesson} from './transistor-lessons.js';
import {breadboardCloseView} from './board-close-view.js';
import {TutorDevices} from './biscot-device-interaction.js';
import {BiscotTutor} from './biscot-tutor.js';

// All equipment, components and probe bodies are the actual Blender source meshes.
// Additions are limited to contact hotspots, live display textures and flexible cables.
const $=id=>document.getElementById(id),vec=a=>new THREE.Vector3(...a),MODES=['OFF','OHM','CONT','CAP','DCV'];
const params=new URLSearchParams(location.search);
const semiconductorPart=/^B1_P[234]$/.test(params.get('lessonId')||'')?Number(params.get('lessonId').slice(-1)):null;
const transistorLesson=isTransistorLesson(params.get('lessonId'))?params.get('lessonId'):null;
if(semiconductorPart)MODES.push('DIODE');
if(transistorLesson)MODES.push('DIODE','HFE','DCA');
let advanced=null;
const requested=params.get('sessionId')||(parent===window?sessionStorage.getItem('labvirt-standalone-session-v2'):null);
const sessionId=/^[a-zA-Z0-9_-]{1,100}$/.test(requested||'')?requested:crypto.randomUUID();
if(parent===window)sessionStorage.setItem('labvirt-standalone-session-v2',sessionId);
const storageKey=`labvirt-passive-v6:${sessionId}`;
const state={component:'R1',defect:'NORMAL',mode:'OFF',red:null,black:null,redJack:'NONE',blackJack:'NONE',tool:null,leadTool:null,entries:[],dirty:false,ready:false,view:'bench'};
let studentIdentity={},practiceActivity={};
try{state.entries=validateSavedEntries(JSON.parse(localStorage.getItem(storageKey)||'[]'));}catch{}
let scene,model,camera,controls,renderer,manifest,metadata,views,lcd,transition=null,fatalError=null;
let frameVerified=false,frames=0,meshCount=0,dragging=null,lastDraw=0;
let probeDrag=null;
let instruments,lightingSupport,resizeObserver,animationId,disposed=false,cinematic=null,bindingProof=null,assetParity=null;
const startedAt=performance.now(),frameTimes=[];let readyAt=null;
const cameraPrevious=new THREE.Vector3(),tagWorld=new THREE.Vector3(),dragPoint=new THREE.Vector3(),dragPlane=new THREE.Plane();
let lastTagUpdate=0,lastWireDraw=0,claimedPointer=null;
const parity=params.get('parity')==='1';
if(parity||params.get('clean')==='1')document.body.classList.add('qa-clean');
let mentor=null;
let tutor=null,tutorDevices=null;
let measurement=evaluateMeasurement({...state,ready:false});
const objects=new Map(),parts=new Map(),probes=new Map(),hotspots=new Map(),obstacles=[];
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),interaction=new THREE.Group(),canvas=$('scene');
function message(type,extra={}){if(parent!==window)parent.postMessage({type,attempt:Number(params.get('attempt')||0),...extra},location.origin);}
function progress(text){$('sceneStatus').textContent=text;message('labvirt:runtime-progress',{message:text});}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
function dirty(value=true){if(tutor?.active||tutor?.restoring)return;state.dirty=value;if(renderer)renderer.shadowMap.needsUpdate=true;message('labvirt:session-state',{dirty:value});}
function exit(){if(parent!==window)message('labvirt:exit');else if(!state.dirty||confirm('Có thao tác chưa ghi. Bạn vẫn muốn về lộ trình?'))location.href='../index.html';}
function failure(error){
  if(disposed)return;
  fatalError=error?.message||String(error);if(advanced){state.ready=false;state.redPhysical=false;state.blackPhysical=false;updateLCD();}console.error('LABVIRT:',error);progress('Lỗi 3D: '+fatalError);message('labvirt:scene-error',{message:fatalError});
  let alert=$('localSceneError');if(!alert){alert=document.createElement('div');alert.id='localSceneError';alert.className='local-scene-error';alert.setAttribute('role','alert');
    const p=document.createElement('p'),retry=document.createElement('button'),back=document.createElement('button');retry.textContent='Thử nạp lại';retry.onclick=()=>location.reload();back.textContent='← Quay lại lộ trình';back.onclick=exit;alert.append(p,retry,back);document.body.append(alert);}
  alert.querySelector('p').textContent='Không tải được phòng Blender: '+fatalError;
}
// Lỗi không thuộc WebGL (vd. Biscot/Firebase) không được làm dừng hẳn khung 3D.
// Lỗi tải cảnh, GLB, render và context loss đều có bắt riêng tại nơi phát sinh.
window.addEventListener('error',e=>{if(e.error)console.warn('[LABVIRT UI]',e.error);});
window.addEventListener('unhandledrejection',e=>console.warn('[LABVIRT ASYNC]',e.reason));
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();failure(Error('WebGL mất ngữ cảnh. Hãy thử nạp lại phòng.'));});
// Chỉ đánh dấu cắm breadboard khi cả hai chân có lỗ hợp lệ,
// không nối điện chỉ vì trung điểm mesh tình cờ nằm trên bảng.
function verifiedMount(key){
  const part=parts.get(key),placement=part?.slot;
  if(!part||!manifest||!placement?.holeIds||!placement.pinNodes)return null;
  const holes=manifest.boardTopology.holes;
  for(const pin of ['PIN_A','PIN_B']){
    const hole=holes.find(item=>item.id===placement.holeIds[pin]);
    const position=pinPosition(pin,key);
    if(!hole||hole.node!==placement.pinNodes[pin]||!position||
      !isOnBoard(manifest.breadboard.bounds,position.toArray())||
      position.distanceTo(vec(placement.pins[pin]))>.0008)return null;
  }
  if(placement.pinNodes.PIN_A===placement.pinNodes.PIN_B)return null;
  return placement;
}
function componentOnBoard(key=state.component){return advanced?advanced.mounted(key):verifiedMount(key)!==null;}
const snapshot=()=>({...state,ready:state.ready,boardMounted:componentOnBoard(),powered:instruments?.isPowered()||false,redComponent:state.component,blackComponent:state.component});
function updateLCD(){
  measurement=advanced?advanced.measure():state.mode==='DCV'?(instruments?.dcMeasurement()||{display:'—',status:'ĐANG NẠP MẠCH',valid:false}):evaluateMeasurement(snapshot());$('lcdValue').textContent=measurement.display;$('lcdState').textContent=measurement.status;
  $('modeName').textContent={OFF:'OFF',OHM:'Ω',CONT:'THÔNG MẠCH',CAP:'CAP',DCV:'V DC',DIODE:'DIODE',HFE:'hFE',DCA:'mA DC'}[state.mode];$('saveBtn').disabled=advanced?!advanced.readyToRecord():!measurement.valid||state.mode==='DCV';$('saveBtn').title=advanced?'Cần đủ bằng chứng đo trong phần hiện tại':state.mode==='DCV'?'Bảng 1.1 chỉ ghi đo linh kiện R/C/L':measurement.status; mentor?.stateChanged();
  if(!lcd)return measurement;
  const signature=[state.mode,measurement.display,measurement.status].join('|');if(lcd.signature===signature)return measurement;lcd.signature=signature;
  const ctx=lcd.context,w=1024,h=620;ctx.fillStyle=state.mode==='OFF'?'#aeb9a0':'#c7d4ac';ctx.fillRect(0,0,w,h);ctx.fillStyle='#253722';ctx.textBaseline='middle';ctx.textAlign='left';
  ctx.font='bold 44px monospace';ctx.fillText(state.mode,40,76);ctx.font=`bold ${measurement.display.length>11?102:145}px monospace`;ctx.fillText(measurement.display,36,h*.48,w-72);
  ctx.font='29px sans-serif';ctx.fillText(measurement.valid?'MÔ PHỎNG · ĐỦ ĐIỀU KIỆN':'MÔ PHỎNG · CHƯA ĐỦ ĐIỀU KIỆN',36,h-58,w-72);lcd.texture.needsUpdate=true;return measurement;
}
function updateControls(){
  for(const [color,id]of[['RED','redProbe'],['BLACK','blackProbe']]){$(id).classList.toggle('selected',state.tool===color);$(id).querySelector('span').textContent=state[color.toLowerCase()]||'Chưa chạm';}
  for(const [color,id]of[['RED','jackRed'],['BLACK','jackBlack']]){const jack=state[color.toLowerCase()+'Jack'];$(id).classList.toggle('selected',state.leadTool===color);$(color==='RED'?'jackRedStatus':'jackBlackStatus').textContent=jack==='NONE'?'Chưa cắm':jack==='VOHM'?'VΩ':jack==='COM'?'COM':'CỔNG DÒNG (SAI)';}
  const angle={OFF:0,OHM:90,CONT:180,CAP:270,DCV:315,DIODE:225}[state.mode];
  document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===state.mode));$('dial').style.setProperty('--knob-rotate',`${angle}deg`);
  const knob=manifest&&objects.get(manifest.dmm.knob.name);if(knob){knob.quaternion.copy(knob.userData.initialQuaternion);knob.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-(advanced?advanced.dmmAngle(state.mode):(tutorDevices?.dialAngle(state.mode)??angle))*Math.PI/180));}
}
function setMode(value){if(MODES.includes(value)){state.mode=value;dirty();updateControls();updateLCD();}}
function select(value=state.component){
  if(advanced){advanced.select(value);return;}
  if(!Object.hasOwn(COMPONENTS,value))return;state.component=value;state.red=null;state.black=null;state.tool=null;
  const c=COMPONENTS[value];$('component').value=value;$('componentName').textContent=c.name;$('componentNominal').textContent=`${c.nominal} · ±${c.tolerance}%`;$('componentDesc').textContent=c.description;
  $('defectBadge').textContent={NORMAL:'SỐNG · Mẫu bình thường',SHORT:'CHẠM · Mẫu ngắn mạch',OPEN:'ĐỨT · Mẫu hở mạch'}[state.defect];$('defectBadge').className=`status ${state.defect==='NORMAL'?'ok':state.defect.toLowerCase()}`;
  dirty();updateControls();updatePins();instruments?.refresh();updateLCD();
}
function report(){
  if((semiconductorPart||transistorLesson)&&!advanced)return;
  if(advanced){advanced.report();return;}
  const body=$('reportRows');body.replaceChildren();for(const entry of state.entries){const tr=document.createElement('tr');for(const column of entry.columns){const td=document.createElement('td');td.textContent=column;tr.append(td);}body.append(tr);}
  if(!state.entries.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='empty';td.textContent='Chưa có phép đo hợp lệ. Dữ liệu được lưu riêng theo phiên trên máy này.';tr.append(td);body.append(tr);}
  $('progressBar').style.width=`${state.entries.length/18*100}%`;$('progressText').textContent=`${state.entries.length}/18 trường hợp đã ghi`;message('labvirt:report',{entries:state.entries,completed:state.entries.length,total:18,sessionId});
}
function record(){
  if(tutor?.active){toast('Đang xem mẫu: kết quả demo được tách khỏi bài của bạn.');return;}
  if(advanced){const count=advanced.rows.length;advanced.record();if(advanced.rows.length>count)dirty(false);return;}
  const result=updateLCD();if(!result.valid||state.mode==='DCV'){toast(state.mode==='DCV'?'Bảng 1.1 không lưu phép đo V DC.':result.status);return;}
  state.entries=upsertMeasurementRecord(state.entries,createMeasurementRecord(snapshot(),result));
  try{localStorage.setItem(storageKey,JSON.stringify(state.entries));dirty(false);toast('Đã ghi '+COMPONENTS[state.component].name+' vào Bảng 1.1.');}catch{toast('Chưa lưu được trên thiết bị; hãy xuất CSV trước khi rời trang.');}
  report();mentor?.stateChanged();
}
function csv(){if(advanced){advanced.export('csv');return;}const url=URL.createObjectURL(new Blob([toMeasurementCsv(state.entries)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`LABVIRT-Bang-1.1-${sessionId.slice(0,8)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function excel(){
  if(advanced){advanced.export('xlsx');return;}
  const verified=validateSavedEntries(state.entries);
  if(!verified.length){toast('Chưa có phép đo hợp lệ để xuất Excel.');return;}
  const workbook=buildMeasurementWorkbook(verified,{sessionId,...studentIdentity,...practiceActivity});
  const url=URL.createObjectURL(workbook),a=document.createElement('a');
  a.href=url;a.download=`LABVIRT-Bai1-Bang1.1-${sessionId.slice(0,8)}.xlsx`;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}

// Session/UI integration only: never changes the scene, solver, contacts or instruments.
window.labvirtSession={
  records:()=>validateSavedEntries(state.entries),
  restore:records=>{state.entries=validateSavedEntries(structuredClone(records));localStorage.setItem(storageKey,JSON.stringify(state.entries));report();},
  identify:identity=>{studentIdentity={fullName:String(identity?.fullName||'').slice(0,100),studentCode:String(identity?.studentCode||'').slice(0,40),className:String(identity?.className||'').slice(0,80)};},
  activity:activity=>{practiceActivity={activeMs:activity?.activeMs||0,helpCount:activity?.helpCount||0};},
};


function groupSource(){
  model.updateMatrixWorld(true);model.traverse(object=>{objects.set(object.userData.blenderName||object.name,object);if(object.isMesh){meshCount++;if(/(?:^ROOM_|Wall|Floor|Partition|Bench_Top|Desk_Top|Table_Top)/i.test(object.name))obstacles.push(object);}});
  for(const [key,item]of Object.entries(manifest.parts)){
    const group=new THREE.Group();group.name='INTERACTIVE_SOURCE_'+key;scene.add(group);const roots=item.rootName?[objects.get(item.rootName)]:(item.objectNames||[]).map(name=>objects.get(name));
    if(!roots.length||roots.some(root=>!root))throw Error('Thiếu linh kiện Blender '+item.name);for(const root of roots)group.attach(root);group.traverse(o=>o.userData.component=key);parts.set(key,{group,initial:vec(item.position),pins:item.pins});
  }
  for(const [color,info]of Object.entries(manifest.dmm.probes)){
    const group=new THREE.Group();group.name='INTERACTIVE_SOURCE_PROBE_'+color;scene.add(group);
    for(const object of [...objects.values()].filter(o=>(o.name===info.name||o.name.startsWith(info.name+'_'))&&o.name!==info.wire))group.attach(object);
    const needle=objects.get(info.needle);if(!needle)throw Error('Thiếu kim que '+color);
    const box=new THREE.Box3().setFromObject(needle),size=box.getSize(new THREE.Vector3()),axis=size.x>size.y?(size.x>size.z?'x':'z'):(size.y>size.z?'y':'z');
    const tip=box.getCenter(new THREE.Vector3());tip[axis]=box.min[axis];const body=objects.get(info.name),tail=body?new THREE.Box3().setFromObject(body).getCenter(new THREE.Vector3()):vec(info.position);
    const cable=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:color==='RED'?0xb72c32:0x18212b,roughness:.75}));cable.visible=false;scene.add(cable);
    probes.set(color,{group,tip,tail,direction:tail.clone().sub(tip).normalize(),sourceWire:objects.get(info.wire),cable,active:false});
  }
  const knob=objects.get(manifest.dmm.knob.name);if(knob)knob.userData.initialQuaternion=knob.quaternion.clone();
}
// Đặt sáu mẫu Blender gốc trên các lỗ breadboard được khai báo trong manifest.
// Chỉ thay đổi transform runtime của group đã được attach; tuyệt đối không sửa GLB.
function stageAllComponents(){
  for(const [key,part] of parts){
    const placement=boardSlot(manifest,key);
    part.slot=placement;part.homeSlot=placement;
    part.group.position.copy(vec(placement.offset));
    part.group.updateMatrixWorld(true);
  }
  if(parts.size!==6)throw Error('Bài 1 chưa có đủ sáu mẫu để đặt lên breadboard.');
  for(const [key,part] of parts){
    if(!placementClear(part.slot,[...parts].filter(([other])=>other!==key).map(([,value])=>value.slot)))
      throw Error('Đặt chồng hoặc nối tắt chân linh kiện trên breadboard: '+key);
    if(!verifiedMount(key))throw Error('Không tìm thấy hai tiếp xúc breadboard thật: '+key);
  }
}

function hotspot(id,position,radius,color,role){const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,12,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.72,depthTest:false}));mesh.position.copy(vec(position));mesh.userData={id,role};mesh.renderOrder=20;interaction.add(mesh);hotspots.set(id,mesh);return mesh;}
function addHotspots(){
  for(const [jack,data]of Object.entries(manifest.dmm.jacks))hotspot('JACK_'+jack,data.position,.013,jack==='COM'?0x9eb5cb:jack==='VOHM'?0x41dace:0xefb858,'jack').material.opacity=.015;
  hotspot('DMM_DIAL',manifest.dmm.knob.position,.025,0x41dace,'dial').material.opacity=.04;
  for(const [pin,color]of[['PIN_A',0xefb858],['PIN_B',0x41dace]])hotspot(pin,manifest.parts.R1.pins[pin],.010,color,'pin').material.opacity=.015;scene.add(interaction);updatePins();
}
function pinPosition(pin,key=state.component){if(advanced)return advanced.pinPosition(pin,key);const part=parts.get(key);if(!part||!part.pins[pin])return null;part.group.updateMatrixWorld(true);return vec(part.pins[pin]).applyMatrix4(part.group.matrixWorld);}
function updatePins(){if(!manifest||!parts.size)return;const pins=advanced?.pinIds?.()||['PIN_A','PIN_B'];for(const pin of transistorLesson?['PIN_A','PIN_B','PIN_C','PIN_D']:['PIN_A','PIN_B']){const dot=hotspots.get(pin),position=pins.includes(pin)?pinPosition(pin):null;if(dot){dot.visible=!!position;if(position){dot.position.copy(position);dot.position.y+=.002;}}}for(const color of['RED','BLACK'])moveProbe(color,state[color.toLowerCase()]);}
function moveProbe(color,pin){
  const p=probes.get(color);if(!p)return;
  if(!pin){p.group.position.set(0,0,0);p.group.quaternion.identity();p.active=false;updateCable(color);return;}
  const target=pinPosition(pin),q=new THREE.Quaternion().setFromUnitVectors(p.direction,new THREE.Vector3(0,1,0));p.group.quaternion.copy(q);p.group.position.copy(target.clone().sub(p.tip.clone().applyQuaternion(q)));p.active=true;updateCable(color);
}
function updateCable(color){
  const p=probes.get(color);if(!p||!manifest)return;const socket=state[color.toLowerCase()+'Jack'];const enabled=!!tutorDevices||socket!=='NONE'&&p.active;p.cable.visible=enabled;if(p.sourceWire)p.sourceWire.visible=!enabled;if(!enabled)return;
  const jack=manifest.dmm.jacks[socket==='AMP'?(transistorLesson&&state[color.toLowerCase()+'JackPort']==='MA'?'MA':'A'):socket];if(!jack&&!tutorDevices)return;p.group.updateMatrixWorld(true);const a=tutorDevices?tutorDevices.connectorPosition(color):vec(jack.position).add(new THREE.Vector3(0,0,.009)),b=p.tail.clone().applyMatrix4(p.group.matrixWorld),mid=a.clone().lerp(b,.5);mid.y=Math.max(.812,Math.min(a.y,b.y)-.13);
  const curve=new THREE.CatmullRomCurve3([a,a.clone().add(new THREE.Vector3(.025,.025,.04)),mid,b.clone().add(new THREE.Vector3(0,.035,0)),b]);p.cable.geometry.dispose();p.cable.geometry=new THREE.TubeGeometry(curve,32,.0014,6,false);
}
function addLCD(){
  const data=manifest.dmm.screen,image=document.createElement('canvas');image.width=1024;image.height=620;const texture=new THREE.CanvasTexture(image);texture.colorSpace=THREE.SRGBColorSpace;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(data.screenWidth*.94,data.screenHeight*.9),new THREE.MeshBasicMaterial({map:texture,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2}));
  plane.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(vec(data.basis.right),vec(data.basis.up),vec(data.basis.forward)));plane.position.copy(vec(data.surfacePosition)).addScaledVector(vec(data.basis.forward),.0006);plane.name='LIVE_TEXTURE_ON_ORIGINAL_DMM_LCD';scene.add(plane);lcd={canvas:image,context:image.getContext('2d'),texture,plane,signature:null};updateLCD();
}
function setView(name,{instant=false}={}){
  if(!views||!camera)return;if(name==='board-close')views[name]=breadboardCloseView(manifest.breadboard.bounds,camera.aspect);let view=views[name];if(name==='dmm'&&tutorDevices){const delta=tutorDevices.group.position.clone().sub(tutorDevices.home);view={...view,position:vec(view.position).add(delta).toArray(),target:vec(view.target).add(delta).toArray()};}if(!view)throw Error('Camera reference không tồn tại: '+name);
  camera.near=view.near||.005;camera.far=view.far||30;camera.up.set(...(name==='top'?[0,0,-1]:[0,1,0]));
  transition=instant?null:{from:camera.position.clone(),to:vec(view.position),fromTarget:controls.target.clone(),target:vec(view.target),start:performance.now(),duration:1200,fromFov:camera.fov,fov:view.fov};
  if(instant){controls.reset();camera.position.copy(vec(view.position));controls.target.copy(vec(view.target));camera.fov=view.fov;camera.updateProjectionMatrix();controls.update();}
  state.view=name;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
}
function cameraTick(now){if(!transition)return;const t=Math.min(1,(now-transition.start)/transition.duration),e=t*t*(3-2*t);camera.position.lerpVectors(transition.from,transition.to,e);controls.target.lerpVectors(transition.fromTarget,transition.target,e);camera.fov=THREE.MathUtils.lerp(transition.fromFov,transition.fov,e);camera.updateProjectionMatrix();if(t===1)transition=null;}
function placeComponent(){
  if(advanced){advanced.placeAt();setView('board');return;}
  if(!state.ready)return;
  const part=parts.get(state.component);
  part.slot=part.homeSlot;
  part.group.position.copy(vec(part.slot.offset));
  part.group.updateMatrixWorld(true);
  state.red=null;state.black=null;updatePins();instruments?.refresh();updateControls();updateLCD();dirty();setView('board');
  toast('Đã đưa '+state.component+' vào lỗ '+part.slot.anchorId+' trên breadboard. Chạm hai chân để đo.');
}
function resetComponent(){if(!parts.size)return;placeComponent();toast('Đã đặt lại '+state.component+' vào đúng vị trí trên breadboard.');}
function pointerRay(event){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);raycaster.setFromCamera(pointer,camera);}
function activate(hit,event){
  const info=hit.object.userData;
  if(advanced?.activate?.(info,event))return;
  if(advanced&&info.role==='pin'&&instruments?.picking){instruments.pick(advanced.measureEndpoint(info.id));return;}
  if(advanced&&info.role==='pin'&&state.tool){connectProbe(state.tool,info.id);return;}
  if(instruments?.hit(info))return;
  if(info.role==='jack'){if(!state.leadTool){toast('Chọn cầm jack đỏ/đen, rồi chạm cổng thật trên DMM.');return;}const jack=info.id.slice(5),color=state.leadTool;state[color.toLowerCase()+'Jack']=jack==='A'||jack==='MA'?'AMP':jack;if(transistorLesson)state[color.toLowerCase()+'JackPort']=jack;state.leadTool=null;tutorDevices?.syncJack(color);updateCable(color);}
  else if(info.role==='dial'){setMode(MODES[(MODES.indexOf(state.mode)+1)%MODES.length]);return;}
  else if(info.role==='pin'){if(!state.tool){toast('Chọn que đỏ hoặc đen trước khi chạm chân linh kiện.');return;}if(!componentOnBoard()){toast('Linh kiện cần được đặt đúng lên breadboard.');return;}const color=state.tool;state[color.toLowerCase()]=info.id;state.tool=null;moveProbe(color,info.id);}
  updateControls();updateLCD();dirty();
}
function bindPointer(){
  // Ưu tiên kiểm tra đối tượng trước OrbitControls (capture=true).
  function claim(event){
    event.stopImmediatePropagation();controls.enabled=false;claimedPointer=event.pointerId;
    try{canvas.setPointerCapture(event.pointerId);}catch{}
  }
  canvas.addEventListener('pointerdown',event=>{
    if(!state.ready||event.button!==0||cinematic||advanced&&!event.isTrusted)return;pointerRay(event);
    const hits=raycaster.intersectObjects([...hotspots.values()].filter(o=>o.visible),false);const matched=hits.find(h=>state.leadTool?h.object.userData.role==='jack':state.tool?h.object.userData.role==='pin':true);if(matched){claim(event);activate(matched,event);return;}
    const boardMesh=objects.get(manifest.boardTopology.sourceNode);
    const boardHits=boardMesh?raycaster.intersectObject(boardMesh,true):[];
    if(boardHits.length&&state.tool){
      if(advanced){claim(event);const pin=advanced.boardContact(boardHits[0].point);if(pin)connectProbe(state.tool,pin);else toast('Lỗ này chưa nối đúng nút đo; không tạo tiếp xúc giả.');return;}
      const contact=['PIN_A','PIN_B'].map(pin=>({pin,d:pinPosition(pin).distanceTo(boardHits[0].point)})).sort((a,b)=>a.d-b.d)[0];
      if(contact&&contact.d<.022){claim(event);connectProbe(state.tool,contact.pin);return;}
      claim(event);toast('Hãy chạm lỗ gần chân A hoặc B của '+state.component+' trên breadboard.');return;
    }
    if(boardHits.length&&instruments?.pickBoard(boardHits[0].point)){claim(event);return;}
    const probeHits=raycaster.intersectObjects([...probes.values()].map(p=>p.group),true);
    // Hai que có thể cùng chạm một chân: nút chọn màu giúp lấy đúng que bị che.
    const selectedProbe=probes.get(state.tool)?.group;
    const probeHit=probeHits.find(hit=>{let object=hit.object;while(object&&object!==selectedProbe)object=object.parent;return !!selectedProbe&&object===selectedProbe;})||probeHits[0];
    if(probeHit){for(const [color,p]of probes){let obj=probeHit.object;while(obj&&obj!==p.group)obj=obj.parent;if(obj===p.group){claim(event);state.tool=color;state.leadTool=null;state[color.toLowerCase()]=null;probeDrag={color,x:event.clientX,y:event.clientY,moved:false};updateControls();updateLCD();dirty();toast('Đã cầm que '+(color==='RED'?'đỏ':'đen')+'. Kéo tới chân linh kiện hoặc bấm chọn chân.');return;}}}
    const hit=raycaster.intersectObjects([...parts.values()].map(p=>p.group),true).find(h=>h.object.userData.component);
    if(hit&&!state.tool&&!state.leadTool){claim(event);const key=hit.object.userData.component;if(advanced&&!advanced.canEdit())return;if(key!==state.component)select(key);dragging=key;}
  });
  canvas.addEventListener('pointermove',event=>{
    if(advanced?.pointerMove?.(event))return;
    if(probeDrag&&event.pointerId===claimedPointer){
      if(Math.hypot(event.clientX-probeDrag.x,event.clientY-probeDrag.y)<3&&!probeDrag.moved)return;
      probeDrag.moved=true;pointerRay(event);
      dragPlane.set(new THREE.Vector3(0,1,0),-(manifest.breadboard.bounds.max[1]+.012));
      if(!raycaster.ray.intersectPlane(dragPlane,dragPoint))return;
      const p=probes.get(probeDrag.color),q=new THREE.Quaternion().setFromUnitVectors(p.direction,new THREE.Vector3(0,1,0));
      p.group.quaternion.copy(q);p.group.position.copy(dragPoint.clone().sub(p.tip.clone().applyQuaternion(q)));p.active=true;
      if(performance.now()-lastWireDraw>60){lastWireDraw=performance.now();updateCable(probeDrag.color);}
      if(renderer)renderer.shadowMap.needsUpdate=true;
      return;
    }
    if(!dragging||event.pointerId!==claimedPointer)return;
    pointerRay(event);
    dragPlane.set(new THREE.Vector3(0,1,0),-(manifest.breadboard.bounds.max[1]+.0007));
    if(!raycaster.ray.intersectPlane(dragPlane,dragPoint))return;
    // Chỉ cho chọn vị trí F/J thực tế và không đặt đè mẫu đã có.
    if(advanced){advanced.placeAt(dragPoint);return;}
    const holes=manifest.boardTopology.holes;
    let nearest=null,dist=Infinity;
    const desiredRow=parts.get(dragging).homeSlot.anchorId.charAt(0);
    for(const hole of holes){
      if(!hole.id.startsWith(desiredRow))continue;
      const dx=dragPoint.x-hole.position[0],dz=dragPoint.z-hole.position[2],d=dx*dx+dz*dz;
      if(d<dist){dist=d;nearest=hole;}
    }
    if(!nearest)return;
    const part=parts.get(dragging);
    let placement;
    try{placement=boardSlot(manifest,dragging,nearest.id);}catch{return;}
    if(!placementClear(placement,[...parts].filter(([key])=>key!==dragging).map(([,value])=>value.slot)))return;
    if(part.slot?.anchorId===placement.anchorId)return;
    part.slot=placement;
    part.group.position.copy(vec(placement.offset));part.group.updateMatrixWorld(true);
    state.red=null;state.black=null;updatePins();
    if(performance.now()-lastWireDraw>90){lastWireDraw=performance.now();instruments?.drawCables();}
    updateControls();updateLCD();dirty();
  });
  const release=event=>{
    if(event && claimedPointer!==null && event.pointerId!==claimedPointer)return;
    advanced?.pointerUp?.();
    const gesture=probeDrag;probeDrag=null;
    if(gesture){
      let pin=null;
      if(gesture.moved&&event?.type==='pointerup'){
        pointerRay(event);
        pin=raycaster.intersectObjects([...hotspots.values()].filter(o=>o.visible),false).find(hit=>hit.object.userData.role==='pin')?.object.userData.id||null;
        if(!pin){
          const board=objects.get(manifest.boardTopology.sourceNode),hit=board?raycaster.intersectObject(board,true)[0]:null;
          if(hit){if(advanced)pin=advanced.boardContact(hit.point);else{const nearest=['PIN_A','PIN_B'].map(id=>({id,d:pinPosition(id).distanceTo(hit.point)})).sort((a,b)=>a.d-b.d)[0];if(nearest.d<.022)pin=nearest.id;}}
        }
      }
      if(gesture.moved){
        state.tool=null;
        if(pin)connectProbe(gesture.color,pin);
        else{state[gesture.color.toLowerCase()]=null;moveProbe(gesture.color,null);updateLCD();dirty();toast('Que chưa chạm chân linh kiện; phép đo chưa hợp lệ.');}
      }else if(event?.type!=='pointerup'){state.tool=null;moveProbe(gesture.color,null);updateLCD();}
    }
    const hadDrag=!!dragging;dragging=null;claimedPointer=null;
    controls.enabled=!cinematic&&!tutor?.active;updateControls();
    if(hadDrag){instruments?.refresh();updateLCD();dirty();}
  };
  canvas.addEventListener('pointerup',release,{capture:true});
  canvas.addEventListener('pointercancel',release,{capture:true});
  canvas.addEventListener('lostpointercapture',()=>release());
  window.addEventListener('blur',()=>release(),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  controls.addEventListener('start',()=>{if(!cinematic)transition=null;});canvas.addEventListener('wheel',()=>{if(!cinematic)transition=null;},{passive:true});
}
function connectJack(color,jack){state[color.toLowerCase()+'Jack']=jack;state.leadTool=null;tutorDevices?.syncJack(color);updateCable(color);updateControls();updateLCD();dirty();toast('Đã cắm jack '+(color==='RED'?'đỏ vào VΩ':'đen vào COM')+'.');}
function connectProbe(color,pin,assisted=false){if(advanced?advanced.target==='COMPONENT'&&!advanced.mounted(state.component):!componentOnBoard()){toast('Đưa linh kiện lên breadboard trước khi chạm que.');return;}state[color.toLowerCase()]=pin;if(advanced)state[color.toLowerCase()+'Physical']=!assisted;state.tool=null;moveProbe(color,pin);updateControls();updateLCD();dirty();toast('Đã chạm que '+(color==='RED'?'đỏ':'đen')+' vào '+pin+'.');}
function bindUI(){
  $('component').onchange=()=>{select($('component').value);if(state.ready)setView('board');};$('defect').onchange=()=>{if(advanced&&!advanced.canEdit()){$('defect').value=state.defect;return;}state.defect=$('defect').value;select();};document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$('dial').onclick=()=>setMode(MODES[(MODES.indexOf(state.mode)+1)%MODES.length]);
  $('quickBlackJack').onclick=()=>connectJack('BLACK','COM');$('quickRedJack').onclick=()=>connectJack('RED','VOHM');
  $('probeRedA').onclick=()=>connectProbe('RED','PIN_A',true);$('probeRedB').onclick=()=>connectProbe('RED','PIN_B',true);$('probeBlackA').onclick=()=>connectProbe('BLACK','PIN_A',true);$('probeBlackB').onclick=()=>connectProbe('BLACK','PIN_B',true);
  $('disconnectProbes').onclick=()=>{state.red=null;state.black=null;state.tool=null;updatePins();updateControls();updateLCD();dirty();};
  for(const [color,id]of[['RED','redProbe'],['BLACK','blackProbe']])$(id).onclick=()=>{state.tool=state.tool===color?null:color;state.leadTool=null;updateControls();toast('Kéo thân que đã chọn hoặc chạm PIN_A/PIN_B trên linh kiện 3D.');};
  for(const [color,id]of[['RED','jackRed'],['BLACK','jackBlack']])$(id).onclick=()=>{state.leadTool=color;state.tool=null;state[color.toLowerCase()+'Jack']='NONE';tutorDevices?.syncJack(color);updateCable(color);updateControls();updateLCD();setView('dmm');toast('Chạm cổng '+(color==='RED'?'VΩ':'COM')+' trên DMM để cắm jack.');};
  $('saveBtn').onclick=record;$('clearBtn').onclick=()=>{if(!confirm('Khôi phục phiên sẽ xóa Bảng 1.1 của riêng phiên này. Bạn chắc chắn?'))return;state.entries=[];try{localStorage.removeItem(storageKey);dirty(false);}catch{toast('Không xóa được bộ nhớ trình duyệt.');}report();};
  $('exportCsv').onclick=csv;$('exportExcel').onclick=excel;$('resetObject').onclick=resetComponent;$('placeComponent').onclick=placeComponent;$('backToBench').onclick=()=>setView('bench');$('resetCamera').onclick=()=>setView('bench');document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('backLink').onclick=e=>{e.preventDefault();exit();};$('helpBtn').onclick=()=>$('guide').classList.remove('hidden');$('closeGuide').onclick=$('acceptGuide').onclick=()=>$('guide').classList.add('hidden');$('reportToggle').onclick=()=>{const hidden=$('reportBody').classList.toggle('hidden');$('reportToggle').textContent=hidden?'Mở bảng ▴':'Thu bảng ▾';};
  // Studio quản lý xác nhận rời phiên nhúng; runtime chỉ hỏi khi mở độc lập.
  window.addEventListener('beforeunload',e=>{if(parent===window&&state.dirty){e.preventDefault();e.returnValue='';}});
}
function framebuffer(){const gl=renderer.getContext(),pixel=new Uint8Array(4),colors=new Set();let content=0;if(gl.isContextLost())return{visible:false};for(let y=1;y<7;y++)for(let x=1;x<10;x++){gl.readPixels(Math.floor(canvas.width*x/10),Math.floor(canvas.height*y/7),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);colors.add(`${pixel[0]>>3},${pixel[1]>>3},${pixel[2]>>3}`);if(Math.max(pixel[0],pixel[1],pixel[2])>60)content++;}return{visible:colors.size>4&&content>5,colors:colors.size,content};}
function constrain(previous){
  camera.position.y=THREE.MathUtils.clamp(camera.position.y,.84,2.7);camera.position.x=THREE.MathUtils.clamp(camera.position.x,-2.8,2.8);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-2.25,2.65);
  if(transition||previous.distanceToSquared(camera.position)<1e-10)return;const d=camera.position.clone().sub(previous),length=d.length();if(length<.0001)return;const ray=new THREE.Raycaster(previous,d.normalize(),.001,length+.06);if(ray.intersectObjects(obstacles,false).some(hit=>hit.distance<length+.045))camera.position.copy(previous);
}
function beginCinematic(){
  if(!state.ready||cinematic||fatalError)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){setView('bench',{instant:true});document.body.classList.remove('cinematic-mode');message('labvirt:cinematic-finished');return;}
  document.body.classList.add('cinematic-mode');controls.enabled=false;setView('entrance',{instant:true});cinematic={step:0,at:performance.now()};
}
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='labvirt:start-cinematic')beginCinematic();});
function render(now){
  if(fatalError||disposed)return;
  try{
    if(lastDraw&&now-lastDraw<1000&&now-lastDraw>0)frameTimes.push(now-lastDraw);if(frameTimes.length>300)frameTimes.shift();
    cameraPrevious.copy(camera.position);
    if(cinematic){const elapsed=now-cinematic.at;if(cinematic.step===0&&elapsed>300){setView('overview');cinematic={step:1,at:now};}else if(cinematic.step===1&&elapsed>1500){setView('bench');cinematic={step:2,at:now};}else if(cinematic.step===2&&elapsed>1500){cinematic=null;controls.enabled=true;document.body.classList.remove('cinematic-mode');message('labvirt:cinematic-finished');}}
    tutor?.tick(now);cameraTick(now);mentor?.tick(now,Boolean(cinematic));controls.update();if(!parity)constrain(cameraPrevious);advanced?.tick?.(now);instruments?.drawScreens(false,now);renderer.render(scene,camera);renderer.shadowMap.autoUpdate=false;frames++;lastDraw=now;
    if(!frameVerified&&frames>=3){const proof=framebuffer();if(proof.visible){frameVerified=true;state.ready=true;readyAt=performance.now();updateLCD();message('labvirt:scene-ready',{message:'Đã hiển thị hình học Blender trong framebuffer.',proof});progress(`Blender gốc · ${meshCount} mesh · Thiết bị sẵn sàng`);if(params.get('cinematic')==='1'&&params.get('deferCinematic')!=='1')beginCinematic();}else if(now-startedAt>20000)throw Error('GLB đã tải nhưng camera không hiển thị hình học trong 20 giây.');}
    if(now-lastTagUpdate>90){lastTagUpdate=now;const pin=pinPosition('PIN_A'),rect=canvas.getBoundingClientRect(),tag=$('objectTag');if(pin){tagWorld.copy(pin).project(camera);tag.style.left=`${(tagWorld.x*.5+.5)*rect.width}px`;tag.style.top=`${(-tagWorld.y*.5+.5)*rect.height}px`;tag.textContent=advanced?advanced.targetLabel():`${state.component} · ${COMPONENTS[state.component].nominal}`;tag.hidden=['overview','entrance'].includes(state.view)||Math.abs(tagWorld.x)>1||Math.abs(tagWorld.y)>1||tagWorld.z>1;}}
    animationId=requestAnimationFrame(render);
  }catch(error){failure(error);}
}
async function start(){
  bindUI();report();updateLCD();updateControls();progress('Đang đọc cảnh và điểm neo từ Blender gốc…');
  let lighting;
  [manifest,metadata,views,lighting]=await Promise.all(['interaction-manifest.json','anchors-new.json','camera-views.json','lighting-manifest.json'].map(async file=>{const response=await fetch('./assets/'+file,{cache:'no-store'});if(!response.ok)throw Error(`Không tải được ${file} (HTTP ${response.status})`);return response.json();}));
  if(metadata.pipelineVersion!==7)throw Error('Manifest không đồng bộ: cần chạy exporter V7.');
  if(semiconductorPart)manifest=extendSemiconductorManifest(manifest,metadata);
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  scene=new THREE.Scene();scene.background=new THREE.Color('#0b1520');camera=new THREE.PerspectiveCamera(48,1,.005,40);scene.add(camera);controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.12;controls.minDistance=.14;controls.maxDistance=6;controls.maxPolarAngle=Math.PI*.49;
  const manager=new THREE.LoadingManager();manager.onError=url=>failure(Error('Tải tài nguyên thất bại: '+url));
  const gltf=await new GLTFLoader(manager).loadAsync('./assets/scene-moi.glb',e=>{if(e.total)progress(`Đang tải cảnh Blender: ${Math.round(e.loaded/e.total*100)}%`);});
  if(disposed)return;model=gltf.scene;scene.add(model);model.updateMatrixWorld(true);
  const sourceNodes=new Map();model.traverse(o=>{const nodeIndex=gltf.parser.associations.get(o)?.nodes;const sourceName=nodeIndex!==undefined?gltf.parser.json.nodes[nodeIndex]?.name:o.name;o.userData.blenderName=sourceName;sourceNodes.set(sourceName,o);});
  const missing=metadata.objects.filter(o=>!sourceNodes.has(o.name)).map(o=>o.name);let maxPositionError=0;
  for(const o of metadata.objects){const obj=sourceNodes.get(o.name);if(obj)maxPositionError=Math.max(maxPositionError,obj.getWorldPosition(new THREE.Vector3()).distanceTo(vec(o.origin)));}
  assetParity={checked:metadata.objects.length,missing,maxPositionError};if(missing.length||maxPositionError>.00003)throw Error('Sai khác hình học nguồn: '+JSON.stringify(assetParity));
  lightingSupport=configureLighting(scene,model,renderer,lighting);
  groupSource();if(!parity)stageAllComponents();addHotspots();if(!parity)addLCD();
  instruments=new InstrumentLab({scene,objects,manifest,hotspot,pinPosition,getBoardContacts:()=>Object.fromEntries([...parts].map(([key])=>[key,verifiedMount(key)])),getState:()=>state,onChange:()=>{dirty();updateLCD();},toast,parity});bindingProof=instruments.binding;
  if(semiconductorPart&&!parity)installSemiconductorInstrumentAdapter(instruments);
  if(semiconductorPart&&!parity)advanced=new SemiconductorRoom({part:semiconductorPart,scene,objects,parts,manifest,metadata,state,instruments,hotspot,pinPosition,update:()=>{dirty();updateControls();updateLCD();},updatePins,setView,toast,message,sessionId,identity:()=>studentIdentity});
  if(transistorLesson&&!parity){installTransistorInstrumentAdapter(instruments);advanced=new TransistorRoom({lessonId:transistorLesson,scene,objects,parts,manifest,metadata,state,instruments,hotspot,pinPosition,update:()=>{dirty();updateControls();updateLCD();},refreshMeter:()=>{updateControls();updateLCD();},updatePins,setView,toast,message,sessionId,identity:()=>studentIdentity});}
  if(advanced)for(const pin of ['PIN_A','PIN_B']){const point=hotspots.get(pin);point.geometry.dispose();point.geometry=new THREE.SphereGeometry(.0018,12,8);}
  if(advanced){const api={records:()=>structuredClone(advanced.rows),restore:rows=>{advanced.rows=[...new Map([...advanced.rows,...advanced.validateRows(rows)].map(row=>[row.key,row])).values()];advanced.report();},cloudState:status=>{$('semiCloud').textContent=String(status||'').slice(0,300);},context:()=>advanced.diagnostics()};if(transistorLesson)window.labvirtTransistorSession=api;else window.labvirtSemiconductorSession=api;}
  if(parity)interaction.visible=false;
  select();dirty(false);bindPointer();
  if(!advanced&&!parity){
    const engine={scene,objects,manifest,lcd,hotspots,probes,camera,canvas,controls,renderer,state,sessionId,axisZ:new THREE.Vector3(0,0,1),
      updateCable,updateLCD,updateControls,updatePins,setView,select,setMode,connectJack,connectProbe,placeComponent,pinPosition,snapshot,dirty,
      captureDemoScene:()=>{const p=parts.get('R1');return {position:p.group.position.toArray(),quaternion:p.group.quaternion.toArray(),slot:p.slot};},restoreDemoScene:s=>{const p=parts.get('R1');p.group.position.fromArray(s.position);p.group.quaternion.fromArray(s.quaternion);p.slot=s.slot;},
      measurement:()=>measurement,cinematic:()=>!!cinematic,freezeCamera:dt=>{if(transition)transition.start+=dt;},
      makeDemoRecord:()=>{const result=updateLCD();if(!result.valid||state.component!=='R1'||state.defect!=='NORMAL')throw Error('Demo chưa có phép đo hợp lệ');return {...createMeasurementRecord(snapshot(),result),source:'DEMO_BISCOT',verifiedByTeacher:false};}};
    tutorDevices=new TutorDevices(engine);engine.devices=tutorDevices;tutor=new BiscotTutor(engine);tutorDevices.refresh();updateControls();
  }
  if(!parity&&params.get('legacyMentor')==='1'){mentor=new LabMentor({scene,camera,hotspots,views,setView,readContext:()=>({lessonId:'B1_P1',stepId:mentor?.currentStepId||'JACK_BLACK',...snapshot(),measurement:{...measurement},instruments:instruments?.diagnostics()||{},finishedRecords:state.entries.length}),guideAction:(action)=>{if(action==='CONNECT_BLACK')connectJack('BLACK','COM');if(action==='CONNECT_RED')connectJack('RED','VOHM');}});mentor.stateChanged();}
  const resize=()=>{const r=canvas.getBoundingClientRect(),width=Math.max(1,r.width),height=Math.max(1,r.height);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(state.view==='board-close')setView('board-close',{instant:true});};resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resize();
  setView(params.get('view')||(params.get('cinematic')==='1'?'entrance':'bench'),{instant:true});
  if(params.get('cinematic')==='1')document.body.classList.add('cinematic-mode');
  animationId=requestAnimationFrame(render);
}
function dispose(){
  if(disposed)return;disposed=true;cancelAnimationFrame(animationId);resizeObserver?.disconnect();tutor?.dispose();tutorDevices?.dispose();controls?.dispose();mentor?.dispose();advanced?.dispose();instruments?.dispose();lightingSupport?.dispose();
  const geometries=new Set(),materials=new Set(),textures=new Set();scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
  geometries.forEach(x=>x.dispose());materials.forEach(x=>x.dispose());textures.forEach(x=>x.dispose());renderer?.dispose();
}
window.addEventListener('pagehide',dispose);canvas.addEventListener('webglcontextrestored',()=>location.reload());
window.addEventListener('pageshow',event=>{if(event.persisted&&disposed)location.reload();});

// Read-only projections for inspection and pointer QA; never sets a contact or measurement.
function interactionDiagnostics(){
  const project=point=>{if(!camera)return null;const p=point.clone().project(camera),r=canvas.getBoundingClientRect();return {x:r.left+(p.x*.5+.5)*r.width,y:r.top+(-p.y*.5+.5)*r.height,visible:Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1};};
  return {interaction:{draggingComponent:dragging,draggingProbe:probeDrag?.color||null,claimedPointer,controlsEnabled:controls?.enabled??false},probeHandles:Object.fromEntries([...probes].map(([color,p])=>{p.group.updateMatrixWorld(true);return [color,project(p.tail.clone().applyMatrix4(p.group.matrixWorld))];}))};
}

window.labvirtDiagnostics=()=>({...interactionDiagnostics(),learningMode:tutor?.active?'DEMO':'SELF_PRACTICE',nominalValue:COMPONENTS[state.component]?.nominalValue,tolerancePercent:COMPONENTS[state.component]?.tolerance,connectorHandles:tutorDevices?Object.fromEntries(['BLACK','RED'].map(c=>[c,tutorDevices.project(tutorDevices.connectorPosition(c))])):{},dmmHandle:tutorDevices?tutorDevices.project(tutorDevices.group.localToWorld(new THREE.Vector3(-.06,.075,.045))):null,dmmPose:tutorDevices?.pose(),demoStep:tutor?.timeline.step??null,tutor:tutor?window.labvirtTutor?.diagnostics():null,build:'LABVIRT-V14-B1',loadMs:readyAt?readyAt-startedAt:null,fps:frameTimes.length?1000/(frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length):null,heapBytes:performance.memory?.usedJSHeapSize,gpu:renderer?.getContext().getParameter(renderer.getContext().RENDERER),assetParity,bindings:bindingProof,instruments:instruments?.diagnostics(),lighting:lightingSupport?.policy,cameraMoving:!!transition,cameraKind:views?.[state.view]?.kind,near:camera?.near,far:camera?.far,sourceCamera:views?.[state.view]?.sourceCamera,cinematic:cinematic?.step??null,memory:renderer?.info.memory,sessionId,modelsLoaded:state.ready,frameVerified,frames,lastDraw,sourceSha256:metadata?.sourceSha256,sourceFile:metadata?.fileName,sourceObjectCount:metadata?.objectCount,meshCount,render:renderer?.info.render,view:state.view,camera:camera?.position.toArray(),target:controls?.target.toArray(),mode:state.mode,component:state.component,defect:state.defect,boardMounted:componentOnBoard(),placements:Object.fromEntries([...parts].map(([key,part])=>[key,{slot:part.slot?.anchorId||null,holes:part.slot?.holeIds||null,contactError:part.slot?.contactError??null,onBoard:componentOnBoard(key)}])),powered:instruments?.isPowered()||false,measurementStatus:measurement.status,measurementQuantity:measurement.quantity,measurementValue:measurement.value,measurementConclusion:measurement.conclusion,savedCases:state.entries.map(record=>({component:record.component,defect:record.defect})),mentor:mentor?.diagnostics(),redPin:state.red,blackPin:state.black,redJack:state.redJack,blackJack:state.blackJack,lcd:measurement.display,modelLcd:lcd?.signature,validMeasure:measurement.valid,reason:measurement.reason,completed:state.entries.length,dirty:state.dirty,error:fatalError,lcdPosition:lcd?.plane.position.toArray(),lcdNormal:manifest?.dmm.screen.basis.forward,contacts:Object.fromEntries([...hotspots].map(([name,mesh])=>{if(!camera)return[name,null];const p=mesh.getWorldPosition(new THREE.Vector3()).project(camera),r=canvas.getBoundingClientRect();return[name,{x:r.left+(p.x*.5+.5)*r.width,y:r.top+(-p.y*.5+.5)*r.height,visible:Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1}];}))});
start().catch(failure);
if(semiconductorPart||transistorLesson){
 const passiveDiagnostics=window.labvirtDiagnostics;
 window.labvirtDiagnostics=()=>{
  const project=point=>{if(!camera)return null;const p=point.clone().project(camera),r=canvas.getBoundingClientRect();return{x:r.left+(p.x*.5+.5)*r.width,y:r.top+(-p.y*.5+.5)*r.height,visible:Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1};};
  return {...passiveDiagnostics(),lessonId:transistorLesson||'B1_P'+semiconductorPart,total:transistorLesson?advanced?.lesson.keys.length:semiconductorPart===2?9:semiconductorPart===3?4:11,completed:advanced?.rows.length||0,semiconductor:semiconductorPart?advanced?.diagnostics():undefined,transistor:transistorLesson?advanced?.diagnostics():undefined,componentHandles:Object.fromEntries([...parts].map(([id,p])=>[id,project(new THREE.Box3().setFromObject(p.group).getCenter(new THREE.Vector3()))])),socketTargets:transistorLesson?Object.fromEntries((advanced?.sockets||[]).map(s=>[s.type,project(s.contacts[1].position)])):undefined,boardTargets:Object.fromEntries((manifest?.boardTopology.holes||[]).filter(h=>['F','J','A'].includes(h.id[0])).map(h=>[h.id,project(vec(h.position))]))};
 };
}
