import {transistorCsvCell} from './transistor-csv.js';
import * as THREE from 'three';
import {DEVICE_MODELS,measureThreePin,measureHfe,solveLimitedTransistorCircuit,solveTransistorCircuit,ldrIlluminance,stepScr,referenceBjtQ,referenceJfetQ} from './transistor-core.js';
import {TRANSISTOR_LESSONS,transistorTable} from './transistor-lessons.js';
import {validateTransistorRecords,transistorConfigurationKey} from './transistor-records.js';
import {validateTransistorAssembly} from './transistor-assembly.js';
import {transistorSchematic} from './transistor-schematics.js';
import {buildTableWorkbook} from './lab-xlsx-export.js';
const $=id=>document.getElementById(id),v=a=>new THREE.Vector3(...a),PITCH=.0042672;
const pinName=i=>'PIN_'+String.fromCharCode(65+i);
export class TransistorRoom{
 constructor(args){
  const options={...args};delete options.pinPosition;Object.assign(this,options);this.lesson=TRANSISTOR_LESSONS[this.lessonId];this.target='COMPONENT';this.rows=[];this.pair={};this.captures={};this.defects={};this.values={};this.gateVoltage=0;this.gateAt=performance.now();this.socket=null;this.listeners=[];this.controls3D=[];this.ambient=10;this.flashlight=false;this.pot=.5;this.button=false;this.scr={latched:false,gateTime:0};this.scrPhase='INITIAL';this.result=null;this.issue=null;this.signature='';
  this.storageKey=`labvirt-transistor-v1:${this.sessionId}:${this.lessonId}`;
  try{this.rows=this.validateRows(JSON.parse(localStorage.getItem(this.storageKey)||'[]'));}catch{}
  const dial=this.objects.get(this.manifest.dmm.knob.name).getWorldPosition(new THREE.Vector3()),arrow=this.objects.get('DMM_Knob_Arrow').getWorldPosition(new THREE.Vector3());this.dmmBaseAngle=Math.atan2(arrow.y-dial.y,arrow.x-dial.x)*180/Math.PI;
  this.createParts();this.createUI();this.createSocket();this.createControls();
  this.state.component=this.lesson.parts[0][0];this.state.red=null;this.state.black=null;this.state.redPhysical=false;this.state.blackPhysical=false;
  this.instruments.state.voltage=['B2_P2','B3_P2'].includes(this.lessonId)?12:5;this.instruments.state.currentLimit=.03;this.instruments.state.supplyPower=false;this.instruments.state.generatorPower=false;
  this.instruments.setExtension(this);this.select(this.state.component);this.report();
  this.listen(window,'keydown',event=>{if(event.repeat||/INPUT|SELECT|TEXTAREA/.test(event.target?.tagName))return;if(event.code==='KeyC')this.capture();if(event.code==='KeyR')this.record();});
 }
 listen(target,event,handler){target.addEventListener(event,handler);this.listeners.push(()=>target.removeEventListener(event,handler));}
 componentIds(){return [...this.parts.keys()];}
 partPinIds(id){return Object.keys(this.parts.get(id)?.pins||{});}
 pinIds(){return this.target==='COMPONENT'?this.partPinIds(this.state.component):['PIN_A','PIN_B'];}
 cloneSource(name){const source=this.objects.get(name);if(!source)throw Error('MISSING_SOURCE_COMPONENT:'+name);source.updateWorldMatrix(true,true);const clone=source.clone(true);source.matrixWorld.decompose(clone.position,clone.quaternion,clone.scale);return clone;}
 createParts(){
  for(const p of this.parts.values())p.group.visible=false;this.parts.clear();
  const homes=[['F',40],['F',3],['A',3],['F',20],['A',20],['F',53]];
  this.lesson.parts.forEach(([id,source,ohms],index)=>{
   const group=new THREE.Group(),copy=this.cloneSource(source);group.name='B23_SOURCE_INSTANCE_'+id;group.add(copy);this.scene.add(group);group.updateMatrixWorld(true);
   group.traverse(o=>o.userData.component=id);
   const points=[];copy.traverse(o=>{if(/^CP_(Pin[123](_|$)|Lead_[AB]|Pin_[LR][BF])/.test(o.userData.blenderName||o.name))points.push(o);});
   let ordered;if(DEVICE_MODELS[id]||id==='POT')ordered=[1,2,3].map(i=>points.find(o=>new RegExp('^CP_Pin'+i+'(_|$)').test(o.userData.blenderName||o.name)));
   else if(id==='BUTTON')ordered=['LF','RF','LB','RB'].map(s=>points.find(o=>(o.userData.blenderName||o.name).startsWith('CP_Pin_'+s)));
   else ordered=['A','B'].map(s=>points.find(o=>(o.userData.blenderName||o.name).startsWith('CP_Lead_'+s)));
   const box=new THREE.Box3().setFromObject(copy),center=box.getCenter(new THREE.Vector3());
   // The original LED has body/anvil/dome but no exported CP empties. Its
   // runtime leads are explicit A/K contacts and do not change its geometry.
   if(id==='LED')ordered=[null,null];
   if(ordered.some(o=>!o)&&id!=='LED')throw Error('MISSING_SOURCE_PINS:'+id);
   const starts=ordered.map((o,i)=>o?o.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(center.x+(i?1:-1)*.0025,box.min.y,center.z));
   const minY=Math.min(...starts.map(p=>p.y))-.004,mid=starts.reduce((a,b)=>a.add(b),new THREE.Vector3()).multiplyScalar(1/starts.length),span=ohms?12:ordered.length===2?2:ordered.length-1;
   const pins={};starts.forEach((start,i)=>{const foot=new THREE.Vector3(mid.x+(i-(starts.length-1)/2)*span*PITCH/(starts.length-1),minY,mid.z);pins[pinName(i)]=foot.toArray();const curve=new THREE.CatmullRomCurve3([start,start.clone().lerp(foot,.5).add(new THREE.Vector3(0,.001,0)),foot]);const lead=new THREE.Mesh(new THREE.TubeGeometry(curve,8,.0003,5,false),new THREE.MeshStandardMaterial({color:0xbac5cd,roughness:.5}));lead.name='B23_CONTACT_'+id+'_'+pinName(i);lead.userData.component=id;group.add(lead);});
   const home=homes[index]||['A',45];this.parts.set(id,{group,source:copy,pins,kind:id,ohms,slot:null,home,span,flipped:false});
   group.position.set(.12+(index%3)*.065,this.manifest.mainBench.bounds.max[1]+.003,-1.47-Math.floor(index/3)*.045).sub(new THREE.Vector3(mid.x,minY,mid.z));
   if(id==='LED'){this.ledMaterials=[];copy.traverse(o=>{if(o.isMesh){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();this.ledMaterials.push(...(Array.isArray(o.material)?o.material:[o.material]));}});}
  });
  for(const pin of ['PIN_C','PIN_D']){const h=this.hotspot(pin,[0,-10,0],.0018,0xc790ff,'pin');h.visible=false;}
 }
 createUI(){
  document.body.classList.add('semiconductor-room','transistor-room');const link=document.createElement('link');link.rel='stylesheet';link.href='./transistor-room.css';document.head.append(link);this.style=link;
  document.querySelector('.top-brand small').textContent=`0${this.lesson.course}.${this.lesson.part} / ${this.lesson.title}`;
  document.querySelector('#taskDock .eyebrow').textContent=`BÀI ${this.lesson.course} / PHẦN ${this.lesson.part}`;
  const selector=$('component');selector.replaceChildren();for(const [id,p]of this.parts){const option=document.createElement('option');option.value=id;option.textContent=id+(p.ohms?' · '+p.ohms+' Ω':'');selector.append(option);}
  for(const [mode,label]of [['DIODE','Diode'],['HFE','hFE'],['DCA','mA DC']]){const button=document.createElement('button');button.dataset.mode=mode;button.textContent=label;button.onclick=()=>{this.state.mode=mode;this.update();};document.querySelector('.knob-labels').append(button);}
  $('saveBtn').textContent='Ghi Bảng '+this.lesson.table;$('clearBtn').hidden=true;
  const panel=document.createElement('section');panel.className='transistor-controls';const title=document.createElement('h3');title.textContent=this.lesson.title;const note=document.createElement('p');note.textContent=this.lesson.note;panel.append(title,note);
  const diagram=document.createElement('details'),summary=document.createElement('summary'),diagramBody=document.createElement('div');summary.textContent='Sơ đồ nguyên lý và chân đo';diagramBody.innerHTML=transistorSchematic(this.lessonId);diagram.append(summary,diagramBody);panel.append(diagram);
  const label=document.createElement('label');label.textContent='Vị trí đo ';const target=document.createElement('select');target.id='transistorTarget';for(const key of this.targetKeys()){const option=document.createElement('option');option.value=key;option.textContent=key;target.append(option);}label.append(target);panel.append(label);
  const actions=[['transistorCapture','Ghi nhận số đang đo (C)'],['transistorRemove','Rút linh kiện (tắt nguồn)'],['transistorRotate','Xoay linh kiện 180°']];for(const [id,text]of actions){const b=document.createElement('button');b.id=id;b.type='button';b.textContent=text;panel.append(b);}
  const resistanceLabel=document.createElement('label');resistanceLabel.textContent='Điện trở đang chọn (Ω) ';const resistance=document.createElement('input');resistance.id='transistorResistance';resistance.type='number';resistance.min='1';resistance.max='10000000';resistance.step='1';resistanceLabel.append(resistance);panel.append(resistanceLabel);this.listen(resistance,'change',()=>{const p=this.parts.get(this.state.component),value=Number(resistance.value);if(!p?.ohms||!this.canEdit()||!Number.isFinite(value)||value<1||value>1e7){resistance.value=String(this.values[this.state.component]??p?.ohms??'');return;}this.values[this.state.component]=value;this.refresh();this.update();});
  if(this.lessonId==='B3_P3'){const threshold=document.createElement('button');threshold.id='transistorThreshold';threshold.textContent='Ghi kết quả tìm ngưỡng POT';threshold.onclick=()=>{this.thresholdRequested=true;this.record();this.thresholdRequested=false;};panel.append(threshold);}
  if(this.lesson.part===1){const inference=document.createElement('fieldset');inference.id='transistorInference';const fields=this.lesson.course===2?['type','B','E','C']:['G','S','D','quality'];for(const field of fields){const l=document.createElement('label');l.textContent=field+' ';const select=document.createElement('select');select.id='infer_'+field;const values=field==='type'?['Chưa kết luận','NPN','PNP']:field==='quality'?['Chưa kết luận','Tốt','Hỏng']:['Chưa kết luận','1','2','3'];for(const value of values){const o=document.createElement('option');o.value=value;o.textContent=value;select.append(o);}l.append(select);inference.append(l);}panel.append(inference);}
  if(this.lessonId==='B3_P3'){const l=document.createElement('label');l.textContent='Độ rọi môi trường (lux) ';const input=document.createElement('input');input.id='transistorLux';input.type='number';input.min='.001';input.max='10000';input.step='.1';input.value='10';l.append(input);panel.append(l);this.listen(input,'change',()=>{const lux=Number(input.value);if(!Number.isFinite(lux)||lux<.001||lux>10000){input.value=String(this.ambient);return;}this.ambient=lux;this.refresh();this.update();});}
  const safety=document.createElement('p');safety.id='transistorSafety';safety.setAttribute('role','alert');const evidence=document.createElement('p');evidence.id='transistorEvidence';const cloud=document.createElement('p');cloud.id='semiCloud';cloud.setAttribute('role','status');cloud.textContent='Chưa có xác nhận lưu Firebase.';panel.append(safety,evidence,cloud);document.querySelector('#taskDock .panel').append(panel);this.panel=panel;
  target.onchange=()=>{this.target=target.value;this.clearProbes();this.updatePins();this.update();};$('transistorCapture').onclick=()=>this.capture();$('transistorRemove').onclick=()=>this.remove();$('transistorRotate').onclick=()=>this.rotate();
  this.listen(panel,'change',event=>{if(event.target.id?.startsWith('infer_'))this.update();});
  $('guideTitle').textContent=this.lesson.title;const list=document.querySelector('#guide ol');list.replaceChildren();for(const text of this.lesson.guide){const li=document.createElement('li');li.textContent=text;list.append(li);}document.querySelector('.report-head b').textContent='Bảng '+this.lesson.table;
  document.querySelector('#taskDock .progress-caption span').textContent=this.lesson.keys.length+' trường hợp chuẩn';
 }
 targetKeys(){return this.lesson.part===1?['COMPONENT']:this.lessonId==='B2_P2'?['COMPONENT','VB','VE','VC','VCE','VCC']:this.lessonId==='B2_P3'?['COMPONENT','VBE','VCE','IC']:this.lessonId==='B3_P2'?['COMPONENT','VS','VG','VGS','VD','VDS']:this.lessonId==='B3_P3'?['COMPONENT','RLDR','VGS']:['COMPONENT','VAK','VGK'];}
 labelSprite(text){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#071b2b';ctx.fillRect(0,0,512,100);ctx.fillStyle='#d4efff';ctx.font='bold 42px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,65);const texture=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(.052,.010,1);return sprite;}
 createSocket(){
  if(this.lessonId!=='B2_P1')return;this.sockets=[];
  const bounds=this.manifest.breadboard.bounds;
  for(const [i,type]of ['NPN','PNP'].entries()){
   const group=new THREE.Group();group.position.set(bounds.max[0]+.035,this.manifest.mainBench.bounds.max[1]+.007,bounds.min[2]+.035+i*.04);this.scene.add(group);
   const body=new THREE.Mesh(new THREE.BoxGeometry(.035,.012,.028),new THREE.MeshStandardMaterial({color:0x193a55,roughness:.7}));group.add(body);
   const label=this.labelSprite(type+' · E B C');label.position.set(0,.021,0);group.add(label);
   const contacts=['E','B','C'].map((name,index)=>{const position=group.position.clone().add(new THREE.Vector3((index-1)*PITCH,.006,0));const h=this.hotspot('HFE_'+type+'_'+name,position.toArray(),.0015,0xf8cc72,'transistor-control');h.userData.control='socket';h.userData.socket=type;return {name,position};});
   this.sockets.push({type,group,contacts});
  }
 }
 createControls(){
  if(this.lessonId==='B3_P1'){
   const group=new THREE.Group();group.position.set(this.manifest.breadboard.bounds.max[0]+.03,this.manifest.mainBench.bounds.max[1]+.012,-1.6);const body=this.cloneSource('RES_100K');group.add(body);const box=new THREE.Box3().setFromObject(body),center=box.getCenter(new THREE.Vector3());body.position.sub(center);this.scene.add(group);const h=this.hotspot('DISCHARGE_GATE',group.position.toArray(),.012,0x81eed4,'transistor-control');h.userData.control='discharge';const label=this.labelSprite('Xả Gate · 100 kΩ');label.position.set(0,.022,0);group.add(label);this.dischargeTool=group;
  }
  if(this.lessonId==='B3_P3'){
   const shade=new THREE.Mesh(new THREE.BoxGeometry(.02,.02,.001),new THREE.MeshStandardMaterial({color:0x071018}));shade.visible=false;this.scene.add(shade);this.shade=shade;
   const beam=new THREE.Mesh(new THREE.ConeGeometry(.012,.07,16,1,true),new THREE.MeshBasicMaterial({color:0xffe9a9,transparent:true,opacity:.16,depthWrite:false}));beam.visible=false;this.scene.add(beam);this.beam=beam;
   const lamp=this.cloneSource('LAMP_LDR_Light_Anim');this.scene.add(lamp);this.lamp=lamp;
   this.lampOrigin=new THREE.Box3().setFromObject(lamp).getCenter(new THREE.Vector3());
   this.lightAim=0;
  }
 }
 mounted(id){const p=this.parts.get(id);return !!p?.slot&&this.partPinIds(id).every(pin=>{const hole=this.manifest.boardTopology.holes.find(h=>h.id===p.slot.holeIds[pin]);return hole&&hole.node===p.slot.pinNodes[pin]&&this.physicalPin(pin,id).distanceTo(v(hole.position))<.0015;});}
 physicalPin(pin,id){const p=this.parts.get(id);if(!p?.pins[pin])return null;p.group.updateMatrixWorld(true);return v(p.pins[pin]).applyMatrix4(p.group.matrixWorld);}
 bodyBounds(){return Object.fromEntries([...this.parts].map(([id,p])=>{const box=new THREE.Box3().setFromObject(p.source);return[id,{min:box.min.toArray(),max:box.max.toArray(),contactError:p.slot?.contactError??null}];}));}
 measureEndpoint(pin){
  if(this.target==='COMPONENT')return this.state.component+':'+pin;
  const t=this.assembly?.terminals||{},pairs={VB:[t.B,'PSU_NEG'],VE:[t.E,'PSU_NEG'],VC:[t.C,'PSU_NEG'],VCC:['PSU_POS','PSU_NEG'],VCE:[t.C,t.E],VBE:[t.B,t.E],VS:[t.S,'PSU_NEG'],VG:[t.G,'PSU_NEG'],VGS:[t.G,t.S],VD:[t.D,'PSU_NEG'],VDS:[t.D,t.S],VAK:[t.A,t.K],VGK:[t.G,t.K],RLDR:['LDR:PIN_A','LDR:PIN_B'],IC:['LED:PIN_B','BC547:PIN_A']};
  return pairs[this.target]?.[pin==='PIN_A'?0:1]||'PSU_NEG';
 }
 pinPosition(pin,id=this.state.component){if(id===this.state.component&&this.target!=='COMPONENT'){const end=this.measureEndpoint(pin);if(end.startsWith('PSU_'))return this.instruments.portPositions.get(end)?.clone();const [key,name]=end.split(':');return this.physicalPin(name,key);}return this.physicalPin(pin,id);}
 targetLabel(){return this.target==='COMPONENT'?this.state.component+' · chân '+this.partPinIds(this.state.component).map((_,i)=>i+1).join('/'):this.target;}
 clearProbes(){for(const color of ['red','black']){this.state[color]=null;this.state[color+'Physical']=false;}}
 canEdit(){if(this.isPowered()){this.toast('Tắt nguồn trước khi thay dây hoặc linh kiện.');return false;}return true;}
 placeAt(point=null){
  if(!this.canEdit())return false;const p=this.parts.get(this.state.component);if(!p)return false;
  if(point&&this.sockets){const socket=this.sockets.find(s=>Math.abs(point.x-s.group.position.x)<.025&&Math.abs(point.z-s.group.position.z)<.018);if(socket){p.group.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),p.flipped?Math.PI:0);const mid=v(p.pins.PIN_B).applyQuaternion(p.group.quaternion);p.group.position.copy(socket.contacts[1].position.clone().sub(mid));p.group.updateMatrixWorld(true);p.slot=null;this.socket={type:socket.type,id:this.state.component};this.clearProbes();this.updatePins();this.refresh();this.update();return true;}}
  const bounds=this.manifest.breadboard.bounds;if(point&&(point.x<bounds.min[0]||point.x>bounds.max[0]||point.z<bounds.min[2]||point.z>bounds.max[2])){p.slot=null;p.group.position.add(point.clone().sub(this.physicalPin('PIN_A',this.state.component)));this.socket=null;this.clearProbes();this.refresh();this.updatePins();this.update();return false;}
  const holes=this.manifest.boardTopology.holes;
  const first=point?holes.filter(h=>['F','A','J'].includes(h.id[0])).sort((a,b)=>v(a.position).distanceToSquared(point)-v(b.position).distanceToSquared(point))[0]:holes.find(h=>h.id===p.home[0]+p.home[1]);
  const ids=this.partPinIds(this.state.component),chosen=ids.map((_,i)=>holes.find(h=>h.id===first?.id[0]+(Number(first?.id.slice(1))+Math.round(i*p.span/(ids.length-1)))));
  if(chosen.some(h=>!h)){this.toast('Không đủ lỗ cho tất cả chân.');return false;}
  if([...this.parts].some(([id,q])=>id!==this.state.component&&q.slot&&Object.values(q.slot.holeIds).some(h=>chosen.some(c=>c.id===h)))){this.toast('Lỗ đã có chân linh kiện.');return false;}
  const ordered=p.flipped?[...chosen].reverse():chosen,rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.flipped?Math.PI:0);
  p.group.quaternion.copy(rotation);p.group.position.copy(v(ordered[0].position).sub(v(p.pins[ids[0]]).applyQuaternion(rotation)));p.group.updateMatrixWorld(true);
  p.slot={anchorId:first.id,holeIds:Object.fromEntries(ids.map((pin,i)=>[pin,ordered[i].id])),pinNodes:Object.fromEntries(ids.map((pin,i)=>[pin,ordered[i].node])),contactError:Math.max(...ids.map((pin,i)=>this.physicalPin(pin,this.state.component).distanceTo(v(ordered[i].position))))};
  this.socket=null;this.clearProbes();this.updatePins();this.refresh();this.update();return this.mounted(this.state.component);
 }
 remove(){if(!this.canEdit())return;const p=this.parts.get(this.state.component);p.slot=null;p.group.position.y+=.04;this.socket=null;this.clearProbes();this.refresh();this.updatePins();this.update();}
 rotate(){if(!this.canEdit())return;const p=this.parts.get(this.state.component);p.flipped=!p.flipped;if(p.slot)this.placeAt(v(this.manifest.boardTopology.holes.find(h=>h.id===p.slot.anchorId).position));else{const center=new THREE.Box3().setFromObject(p.group).getCenter(new THREE.Vector3()),before=center.clone();p.group.rotateY(Math.PI);const after=new THREE.Box3().setFromObject(p.group).getCenter(new THREE.Vector3());p.group.position.add(before.sub(after));this.updatePins();this.update();}}
 select(id=this.state.component){if(!this.parts.has(id))return;if(id===this.state.component){if((this.defects[id]??'NORMAL')!==this.state.defect)delete this.pair[id];this.defects[id]=this.state.defect;}this.state.component=id;this.state.defect=this.defects[id]||'NORMAL';$('component').value=id;$('defect').value=this.state.defect;$('componentName').textContent=id;$('componentNominal').textContent=this.parts.get(id).ohms?this.parts.get(id).ohms+' Ω':DEVICE_MODELS[id]?.pins.map((n,i)=>(i+1)+'–'+n).join(' · ')||id;$('componentDesc').textContent=this.lesson.note;$('defectBadge').textContent=this.state.defect;$('transistorResistance').disabled=!this.parts.get(id).ohms;$('transistorResistance').value=String(this.values[id]??this.parts.get(id).ohms??'');this.clearProbes();this.updatePins();this.refresh();this.update();}
 mounts(){return Object.fromEntries([...this.parts].filter(([id])=>this.mounted(id)).map(([id,p])=>[id,Object.fromEntries(Object.entries(p.slot.pinNodes).map(([pin,node])=>[pin,'BB:'+node]))]));}
 setup(){const series=this.lessonId==='B2_P3'&&this.state.mode==='DCA'&&this.state.redJack==='AMP'&&this.state.redJackPort==='MA'&&this.state.blackJack==='COM'&&this.state.redPhysical&&this.state.blackPhysical&&this.target==='IC'&&this.state.red&&this.state.black&&this.state.red!==this.state.black;return {mounts:this.mounts(),wires:this.instruments.wires.map(pair=>pair.map(id=>this.instruments.canonical(id))),settings:{voltage:this.instruments.state.voltage,currentLimit:this.instruments.state.currentLimit,pot:this.pot,lux:this.illuminance(),button:this.button,scrOn:this.scr.latched},defects:{...this.defects,[this.state.component]:this.state.defect},values:{...this.values},...(series?{meter:{series:true,red:this.measureEndpoint(this.state.red),black:this.measureEndpoint(this.state.black)}}:{})};}
 configurationKey(setup=this.setup()){
  return transistorConfigurationKey(this.lessonId,setup);
 }
 network(){return this.assembly?.network||{wires:[],resistors:[],sources:[]};}
 isPowered(){return this.instruments.state.supplyPower||this.instruments.state.generatorPower;}
 beforeWire(){return this.canEdit();}
 beforeRemoveWire(){return this.canEdit();}
 beforeAction(name){
  if(name==='generatorPower'){this.toast('Bài này dùng nguồn DC cách ly; không dùng FG thay thế.');return false;}
  if(name==='supplyPower'){
   if(this.lesson.part===1){this.toast('Đo diode/Ω/hFE bằng nguồn thử của DMM; không cấp PSU ngoài.');return false;}
   if(!this.instruments.state.supplyPower){const a=validateTransistorAssembly(this.lessonId,this.setup());if(!a.valid){this.toast('Chặn cấp nguồn: '+a.issues.join(', '));return false;}}
   else if(this.lessonId==='B3_P4'){this.scr={latched:false,gateTime:0};this.scrPhase='INTERRUPT';this.button=false;}
   if(!this.instruments.state.supplyPower&&this.lessonId==='B3_P4'){this.scr={latched:false,gateTime:0};this.scrPhase='INITIAL';this.scrTime=performance.now();}
  }
  return true;
 }
 boardContact(point){const candidates=this.pinIds().map(pin=>({pin,p:this.pinPosition(pin)})).filter(o=>o.p).map(o=>({...o,d:o.p.distanceTo(point)})).sort((a,b)=>a.d-b.d);return candidates[0]?.d<.006?candidates[0].pin:null;}
 dmmAngle(mode){return this.dmmBaseAngle-({OFF:220,OHM:90,CONT:75,CAP:25,DCV:145,DIODE:55,HFE:5,DCA:180}[mode]??220);}
 illuminance(){return ldrIlluminance({ambient:this.ambient,flashlight:1000,hit:this.lightHit??false,shaded:this.shade?.visible??false});}
 refresh(){
  if(!this.parts.size||!$('transistorSafety'))return;this.defects[this.state.component]=this.state.defect;
  this.updateControlPositions();const setup=this.setup();this.assembly=validateTransistorAssembly(this.lessonId,setup);const s=this.instruments.state;
  this.issue=this.lesson.part===1||this.assembly.valid?null:this.assembly.issues.join(', ');this.result=null;
  if(this.lesson.part!==1&&s.supplyPower&&!this.assembly.valid){s.supplyPower=false;this.toast('Ngắt nguồn bảo vệ: '+this.issue);}
  if(this.lesson.part!==1&&this.assembly.valid&&(s.supplyPower||this.lessonId==='B3_P4'&&this.scrPhase==='INTERRUPT')){
   try{
    let network=structuredClone(this.assembly.network);if(!s.supplyPower)network.sources[0].volts=0;
    if(this.lessonId==='B3_P4'){
     const candidate=structuredClone(network);candidate.devices[0].on=true;const trial=solveLimitedTransistorCircuit(candidate,s.currentLimit),q=trial.devices.C106D;
     const now=performance.now(),dt=Math.max(0,Math.min(.1,(now-(this.scrTime??now))/1000));this.scrTime=now;
     this.scr=stepScr(this.scr,{enabled:s.supplyPower,ig:q.ig||0,ia:q.ia||0,dt});network.devices[0].on=this.scr.latched||this.button&&(q.ig||0)>=DEVICE_MODELS.C106D.igt;
     if(this.button&&network.devices[0].on)this.scrPhase='TRIGGER';else if(this.scr.latched)this.scrPhase='HOLD';
    }
    this.result=solveLimitedTransistorCircuit(network,s.currentLimit);this.checkLimits(network);
   }catch(error){this.issue=error.message;this.result=null;s.supplyPower=false;}
  }
  for(const [id,key]of [['supplyVoltage','voltage'],['supplyCurrent','currentLimit']])$(id).value=String(s[key]);
  for(const id of ['supplyPower','generatorPower','scopePower']){$(id).textContent=s[id]?'● ĐANG BẬT':'○ ĐANG TẮT';$(id).setAttribute('aria-pressed',String(s[id]));}
  $('circuitStatus').textContent=this.issue||(this.result?`${this.result.mode} · ${(this.result.currents.PSU*1000).toFixed(3)} mA`:'Nguồn tắt; chưa có điện áp thực nghiệm');$('transistorSafety').textContent=this.issue||'';
  $('wireList').replaceChildren();this.instruments.wires.forEach((w,i)=>{const li=document.createElement('li'),b=document.createElement('button');li.textContent=w.join(' ↔ ')+' ';b.textContent='Tháo';b.dataset.removeWire=String(i);li.append(b);$('wireList').append(li);});
  this.instruments.solution=this.result;this.instruments.error=this.issue;this.instruments.drawCables();this.drawScreens(true);this.updateLed();this.evidenceLabel();
 }
 checkLimits(network){
  for(const d of network.devices){const r=this.result.devices[d.id],m=DEVICE_MODELS[d.kind],currents=Object.values(r.currents),voltages=Object.values(d.pins).map(n=>this.result.potentials[n]??0),power=Object.entries(r.currents).reduce((sum,[terminal,current])=>sum+current*((this.result.potentials[d.pins[terminal]]??0)-(this.result.potentials[Object.values(d.pins).at(-1)]??0)),0);
   if(Math.max(...currents.map(Math.abs))>m.maxI||Math.max(...voltages)-Math.min(...voltages)>m.maxV||power>m.maxP)throw Error('DEVICE_OVER_LIMIT_'+d.id);
   if(d.kind==='2N7000'&&Math.abs(r.vgs)>20)throw Error('MOS_GATE_OVER_VOLTAGE');
   // Conservative continuous-use envelope, below the manufacturer's pulse ratings.
   if(d.kind==='C106D'&&(Math.abs(r.currents.G)>.02||Math.abs(r.currents.G*this.result.voltage(d.pins.G,d.pins.K))>.05))throw Error('SCR_GATE_OVER_LIMIT');
  }
  for(const r of network.resistors)if(this.result.voltage(r.a,r.b)**2/r.ohms>.25&&r.id!=='BUTTON_CONTACT')throw Error('RESISTOR_OVER_POWER_'+r.id);
  if((this.result.diodeCurrents[0]??0)>.02)throw Error('LED_OVER_CURRENT');
 }
 updateLed(){const current=Math.max(0,this.result?.diodeCurrents[0]??0);this.ledCurrent=current;for(const m of this.ledMaterials||[]){if(m.emissive){m.emissive.setHex(0xff2200);m.emissiveIntensity=Math.min(2,current/.01);}m.needsUpdate=true;}}
 updateControlPositions(){
  const button=this.parts.get('BUTTON');if(button){button.source.traverse(o=>{if((o.userData.blenderName||o.name)==='PB_Cap'){if(!this.buttonCapInitial)this.buttonCapInitial=o.position.clone();o.position.copy(this.buttonCapInitial);if(this.button)o.position.y-=.0015;}});}
  const p=this.parts.get('POT');if(p){let screw;p.source.traverse(o=>{if((o.userData.blenderName||o.name)==='Pot_Screw_Pivot')screw=o;});if(screw){if(!this.screwInitial)this.screwInitial=screw.quaternion.clone();screw.quaternion.copy(this.screwInitial);screw.rotateY(this.pot*Math.PI*4);}}
  for(const [id,control]of [['POT','pot'],['BUTTON','button'],['LDR','shade']]){const part=this.parts.get(id);if(!part)continue;const box=new THREE.Box3().setFromObject(part.source),center=box.getCenter(new THREE.Vector3());center.y=box.max.y+.002;let h=this.controlHotspots?.[control];if(!h){this.controlHotspots??={};h=this.hotspot('B23_CONTROL_'+control,center.toArray(),control==='pot'?.004:.008,0x57d9ee,'transistor-control');h.userData.control=control;this.controlHotspots[control]=h;}h.position.copy(center);h.visible=this.mounted(id);}
  if(this.parts.has('LDR')){
  const sensor=this.parts.get('LDR');let face;sensor.source.traverse(o=>{if((o.userData.blenderName||o.name)==='Face')face=o;});if(!face)throw Error('MISSING_LDR_PHOTOSENSITIVE_FACE');const center=new THREE.Box3().setFromObject(face).getCenter(new THREE.Vector3());
   if(!this.lampPlaced){const box=new THREE.Box3().setFromObject(this.lamp),c=box.getCenter(new THREE.Vector3());this.lamp.position.add(new THREE.Vector3(this.manifest.breadboard.bounds.max[0]+.09-c.x,this.manifest.mainBench.bounds.max[1]-box.min.y,center.z+.08-c.z));this.lampPlaced=true;}
   let head;this.lamp.traverse(o=>{if((o.userData.blenderName||o.name)==='Shade')head=o;});const origin=head?new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3()):center.clone().add(new THREE.Vector3(.025,.065,.025));
   const normal=face.geometry?.attributes.normal?new THREE.Vector3().fromBufferAttribute(face.geometry.attributes.normal,0).transformDirection(face.matrixWorld):new THREE.Vector3(0,0,1);if(normal.dot(origin.clone().sub(center))<0)normal.negate();this.shade.position.copy(center).addScaledVector(normal,.006);this.shade.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);this.shade.updateMatrixWorld(true);
   let h=this.controlHotspots?.lamp;if(!h){h=this.hotspot('B23_CONTROL_lamp',origin.toArray(),.01,0xffdb8a,'transistor-control');h.userData.control='lamp';this.controlHotspots.lamp=h;}h.position.copy(origin);h.visible=this.mounted('LDR');
   const aim=center.clone().add(new THREE.Vector3(this.lightAim===2?.08:0,0,0)),direction=aim.clone().sub(origin).normalize(),ray=new THREE.Raycaster(origin,direction,.001,origin.distanceTo(aim)+.02),hits=ray.intersectObjects([sensor.source,...(this.shade.visible?[this.shade]:[])],true);
   this.lightRay={enabled:this.flashlight,aim:this.lightAim,distance:origin.distanceTo(aim),firstHit:hits[0]?.object.userData.blenderName||hits[0]?.object.name||null};
   this.lightHit=this.flashlight&&hits.length>0&&hits[0].object!==this.shade;
   this.beam.visible=this.flashlight&&this.mounted('LDR');this.beam.scale.y=origin.distanceTo(aim)/.07;this.beam.position.copy(origin).add(aim).multiplyScalar(.5);this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),origin.clone().sub(aim).normalize());
  }
 }
 activate(info,event){
  if(info.role!=='transistor-control')return false;
  if(info.control==='socket'){this.toast('Kéo ba chân transistor vào socket '+info.socket+'; cần đúng thứ tự E–B–C.');return true;}
  if(info.control==='discharge'){this.dischargeGate();}
  if(info.control==='pot')this.potDrag={x:event.clientX,value:this.pot};
  if(info.control==='button'){this.button=true;this.scrTime=performance.now();this.holdingButton=true;this.scrTimer=setInterval(()=>{this.refresh();this.update();},25);}
  if(info.control==='shade')this.shade.visible=!this.shade.visible;
  if(info.control==='lamp'){this.lightAim=(this.lightAim+1)%3;this.flashlight=this.lightAim!==0;}
  this.refresh();this.update();return true;
 }
 dischargeGate(){
  if(this.isPowered()||!this.mounted('2N7000')){this.toast('Ngắt nguồn và cắm 2N7000 đúng ba chân trước khi xả Gate.');return;}
  if(this.state.component==='2N7000'&&['OHM','DIODE'].includes(this.state.mode)&&[this.state.red,this.state.black].includes('PIN_B')){this.toast('Rút que DMM khỏi Gate trước khi xả; nguồn thử của DMM vẫn có thể nạp lại Gate.');return;}
  clearTimeout(this.dischargeRetractTimer);
  for(const cable of this.dischargeCables||[]){this.scene.remove(cable);cable.geometry.dispose();cable.material.dispose();}this.dischargeCables=[];
  const box=new THREE.Box3().setFromObject(this.dischargeTool),center=box.getCenter(new THREE.Vector3());
  for(const [index,pin]of ['PIN_B','PIN_A'].entries()){const start=new THREE.Vector3(index?box.max.x:box.min.x,center.y,center.z),end=this.physicalPin(pin,'2N7000'),middle=start.clone().lerp(end,.5);middle.y+=.02;const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start,middle,end]),20,.0006,5,false),new THREE.MeshStandardMaterial({color:0xbdb981,roughness:.5}));mesh.name='GATE_DISCHARGE_100K_'+pin;this.scene.add(mesh);this.dischargeCables.push(mesh);}
  // The two real clips close R=100kΩ across G/S. At Ciss=22pF even 10ms is
  // many time constants; the completed contact therefore removes the charge.
  this.gateVoltage*=Math.exp(-.01/(100000*DEVICE_MODELS['2N7000'].gateCapacitance));this.gateAt=performance.now();this.toast('Điện trở 100 kΩ đã nối hai kẹp G–S; điện tích Gate đã xả.');
  this.dischargeRetractTimer=setTimeout(()=>{for(const cable of this.dischargeCables||[]){this.scene.remove(cable);cable.geometry.dispose();cable.material.dispose();}this.dischargeCables=[];},500);
 }
 pointerMove(event){if(!this.potDrag)return false;const before={pot:this.pot,current:this.ledCurrent??0,lux:this.illuminance()};this.pot=Math.max(0,Math.min(1,this.potDrag.value+(event.clientX-this.potDrag.x)/200));this.refresh();const after={pot:this.pot,current:this.ledCurrent??0,lux:this.illuminance()};if(this.result&&this.ambient>=.1&&this.ambient<=2&&this.lightCondition()==='ROOM'&&before.lux===after.lux&&(before.current-.0001)*(after.current-.0001)<=0&&Math.abs(before.pot-after.pot)<.05)this.thresholdBracket={before,after,at:new Date().toISOString()};this.update();return true;}
 pointerUp(){this.potDrag=null;if(this.holdingButton){this.refresh();this.holdingButton=false;this.button=false;clearInterval(this.scrTimer);this.refresh();this.update();}}
 tick(now){if(!this.state.ready||now-(this.lastMeterTick??0)<200)return;this.lastMeterTick=now;if(this.lessonId==='B3_P1'&&this.state.component==='2N7000'&&['OHM','DIODE'].includes(this.state.mode)&&this.state.red&&this.state.black)this.refreshMeter?.();}
 measure(){
  const fail=reason=>({valid:false,value:null,display:this.state.mode==='OFF'?'OFF':'—',status:reason,reason});
  if(!this.state.ready)return fail('SCENE_NOT_READY');
  if(this.state.mode==='HFE'){
   const slot=this.sockets?.find(s=>s.type===this.socket?.type);const contacts=slot?.contacts.map(c=>{const index=this.partPinIds(this.state.component).findIndex(pin=>this.physicalPin(pin,this.state.component).distanceTo(c.position)<.0015);return DEVICE_MODELS[this.state.component]?.pins[index];});
   const m=measureHfe({kind:this.state.component,socket:slot?.type,pins:contacts,defect:this.state.defect,complete:!!slot&&this.socket?.id===this.state.component&&this.partPinIds(this.state.component).every(pin=>slot.contacts.some(c=>this.physicalPin(pin,this.state.component).distanceTo(c.position)<.0015))});return {...m,display:m.valid?m.value.toFixed(0)+' hFE':'—',status:m.valid?'Gain từ dòng Base/Collector trong socket thật':'Cần đúng socket NPN/PNP và đủ chân E–B–C',reason:m.valid?null:m.reason||'HFE_INSERTION',quantity:'GAIN'};
  }
  if(!this.state.red||!this.state.black||this.state.red===this.state.black)return fail('PROBE_CONTACTS');
  if(this.lesson.part===1){
   if(this.instruments.wires.length)return fail('ISOLATE_DEVICE');
   const gateModel=DEVICE_MODELS['2N7000'],elapsed=(performance.now()-this.gateAt)/1000,gateVoltage=this.gateVoltage*Math.exp(-elapsed/(gateModel.gateCapacitance*gateModel.gateLeakage));
   const m=measureThreePin({kind:this.state.component,mode:this.state.mode,red:this.partPinIds(this.state.component).indexOf(this.state.red)+1,black:this.partPinIds(this.state.component).indexOf(this.state.black)+1,redJack:this.state.redJack,blackJack:this.state.blackJack,mounted:this.mounted(this.state.component),ready:this.state.ready,powered:this.isPowered(),gateVoltage,defect:this.state.defect});
   if(!m.valid)return fail(m.reason);
   if(this.state.component==='2N7000'&&m.gateVoltage!==gateVoltage){this.gateVoltage=m.gateVoltage;this.gateAt=performance.now();}
   return {...m,status:m.valid?'Phép đo bằng nguồn thử DMM; '+(m.value===null?'OL: không dẫn ở điều kiện thử':'chưa được giảng viên xác nhận'):m.reason,reason:m.valid?null:m.reason,quantity:this.state.mode==='OHM'?'RESISTANCE':'DIODE_VOLTAGE'};
  }
  const meterSignature=JSON.stringify([this.state.mode,this.state.redJack,this.state.redJackPort,this.state.blackJack,this.state.red,this.state.black,this.state.redPhysical,this.state.blackPhysical,this.target]);if(meterSignature!==this.lastMeterSignature){this.lastMeterSignature=meterSignature;this.refresh();}
  if(this.state.mode==='DCA'){
   if(this.state.redJack!=='AMP'||this.state.redJackPort!=='MA'||this.state.blackJack!=='COM')return fail('CURRENT_JACK_MA_COM');if(this.lessonId!=='B2_P3'||this.target!=='IC'){if(this.isPowered()){this.instruments.state.supplyPower=false;this.refresh();this.issue='AMMETER_PARALLEL_BLOCKED';$('transistorSafety').textContent='Đã ngắt nguồn: thang dòng chỉ được nối tiếp tại chỗ hở LED–Collector.';}return fail('AMMETER_SERIES_ONLY');}if(!this.setup().meter)return fail('PHYSICAL_SERIES_CONTACTS');if(!this.result||this.issue||!this.isPowered())return fail(this.issue||'SOURCE_OFF');
   const a=this.measureEndpoint(this.state.red),b=this.measureEndpoint(this.state.black),value=this.result.voltage(a,b);return{valid:true,value,display:(value*1000).toFixed(3)+' mA',unit:'A',role:'IC',quantity:'DC_CURRENT',status:'Dòng nối tiếp qua shunt DMM 1 Ω'};
  }
  if(this.state.redJack!=='VOHM'||this.state.blackJack!=='COM')return fail('DMM_JACKS');
  if(this.state.mode==='OHM'&&this.target==='RLDR'){
   if(this.isPowered())return fail('LIVE_RESISTANCE');if(!this.mounted('LDR'))return fail('UNMOUNTED_LDR');const a=this.measureEndpoint(this.state.red),b=this.measureEndpoint(this.state.black);if(!a.startsWith('LDR:')||!b.startsWith('LDR:'))return fail('LDR_CONTACTS');
   const network=structuredClone(this.assembly.network);network.sources=[{id:'DMM',a:'DMM_TEST',b,volts:1}];network.resistors.push({a:'DMM_TEST',b:a,ohms:10000});let result;try{result=solveTransistorCircuit(network);}catch{return fail('RESISTANCE_NO_CONVERGENCE');}const voltage=result.voltage(a,b),current=(1-voltage)/10000,resistance=current>1e-8?voltage/current:null;return {valid:true,value:resistance,display:resistance===null?'OL':resistance.toFixed(1)+' Ω',unit:'Ω',status:'Ω thực đo bằng nguồn thử DMM; PSU ngoài đã ngắt',role:'RLDR',quantity:'RESISTANCE'};
  }
  if(this.state.mode!=='DCV')return fail('SELECT_DCV');if(!this.result||this.issue)return fail(this.issue||'SOURCE_OFF');
  const a=this.measureEndpoint(this.state.red),b=this.measureEndpoint(this.state.black);if(!Object.hasOwn(this.result.potentials,a)||!Object.hasOwn(this.result.potentials,b))return fail('DISCONNECTED_CONTACT');
  const value=this.result.voltage(a,b);return {valid:true,value,display:value.toFixed(3)+' V',unit:'V',status:value<0?'Điện áp âm theo cực que đo':'Điện áp từ topology thực',role:this.target,quantity:'DC_VOLTAGE'};
 }
 capture(){
  const m=this.measure();if(!m.valid||this.state.mode!=='HFE'&&(!this.state.redPhysical||!this.state.blackPhysical)){this.toast('Cần số đo hợp lệ với hai que thật hoặc socket hFE cắm đúng.');return;}
  if(this.lesson.part!==1&&(this.state.red!=='PIN_A'||this.state.black!=='PIN_B')){this.toast('Đặt que đỏ ở nút đầu và que đen ở nút tham chiếu của đại lượng đang đo trước khi ghi.');return;}
  const evidence={...m,instrument:{mode:this.state.mode,redJack:this.state.redJack,blackJack:this.state.blackJack,red:this.state.red?this.measureEndpoint(this.state.red):null,black:this.state.black?this.measureEndpoint(this.state.black):null,physicalContacts:true,capturedAt:new Date().toISOString()},configuration:this.setup(),signature:this.configurationKey()};
  if(this.lesson.part===1){const key=this.state.mode==='HFE'?'HFE':this.state.red+'_'+this.state.black;this.pair[this.state.component]??={};this.pair[this.state.component][key]=evidence;if(this.state.component==='2N7000'){this.gateVoltage=m.gateVoltage;this.gateAt=performance.now();}}
  else{const phase=this.lessonId==='B3_P4'?this.scrPhase:this.lessonId==='B2_P3'?'VIN'+this.assembly.vin:this.lessonId==='B3_P3'?this.lightCondition():'Q';this.captures[phase]??={};this.captures[phase][m.role]=evidence;}
  this.evidenceLabel();this.update();
 }
 lightCondition(){return this.shade?.visible?'DARK':this.lightHit?'BRIGHT':'ROOM';}
 evidenceLabel(){if($('transistorEvidence'))$('transistorEvidence').textContent=this.lesson.part===1?'Đã ghi nhận: '+Object.keys(this.pair[this.state.component]||{}).join(', '):'Số đo từng trạng thái: '+Object.entries(this.captures).map(([key,values])=>key+': '+Object.keys(values).join('/')).join(' · ');}
 readyToRecord(){return this.makeRecord(false)!==null;}
 makeRecord(notify=true){
  const reject=text=>{if(notify)this.toast(text);return null;};let key,columns,measurements;
  if(this.lesson.part===1){
   key=this.state.component;const pairs=this.pair[key]||{},required=['PIN_A_PIN_B','PIN_A_PIN_C','PIN_B_PIN_A','PIN_B_PIN_C','PIN_C_PIN_A','PIN_C_PIN_B'];if(required.some(k=>!pairs[k]))return reject('Cần đo đủ sáu chiều chân thật trước khi ghi.');
   const fields=this.lesson.course===2?['type','B','E','C']:['G','S','D','quality'],inference=Object.fromEntries(fields.map(f=>[f,$('infer_'+f).value]));if(Object.values(inference).includes('Chưa kết luận'))return reject('Hãy nhập kết luận chân và loại linh kiện.');
   const numbers=Object.entries(inference).filter(([f])=>!['type','quality'].includes(f)).map(([,value])=>value);if(new Set(numbers).size!==3)return reject('Ba chân kết luận phải khác nhau.');
   const display=(a,b)=>{const forward=pairs[a+'_'+b],reverse=pairs[b+'_'+a];return forward.value===null?reverse.display:forward.display;};
   if(this.lesson.course===2){if(!pairs.HFE)return reject('Cần cắm socket và đo hFE trước khi ghi.');columns=[key,display('PIN_A','PIN_B'),display('PIN_A','PIN_C'),inference.type,inference.B,inference.E,inference.C,pairs.HFE.value.toFixed(1)];}
   else columns=[key,display('PIN_A','PIN_B'),display('PIN_A','PIN_C'),display('PIN_B','PIN_C'),inference.G,inference.S,inference.D,inference.quality];
   measurements={pairs:structuredClone(pairs),inference};
  }else if(this.lessonId==='B2_P2'||this.lessonId==='B3_P2'){
   const c=this.captures.Q||{},required=this.lessonId==='B2_P2'?['VB','VE','VC','VCE','VCC']:['VS','VG','VGS','VD','VDS'];if(required.some(k=>!c[k]))return reject('Chưa đủ các điện áp thực nghiệm của điểm Q.');if(required.some(k=>c[k].signature!==this.configurationKey()))return reject('Mạch đã đổi sau khi đo; cần đo lại cấu hình hiện tại.');
   key=this.lesson.keys.find(k=>!this.rows.some(r=>r.key===k));if(!key)return reject('Bảng đã đủ hàng; không ghi đè dữ liệu cũ.');
   if(!this.assembly.standard||!this.result||this.result.mode!=='CV')return reject('Bảng chuẩn cần đủ topology, giá trị linh kiện và nguồn CV đúng giáo trình.');
   const isBjt=this.lessonId==='B2_P2',theory=isBjt?referenceBjtQ({vcc:12,r1:47000,r2:10000,rc:2200,re:1000,beta:220}):referenceJfetQ({vdd:12,rd:1000,rs:1000,rg:1e6,idss:.008,vp:-1.5});
   const value=key==='IE'?c.VE.value/1000*1000:key==='IC'?(c.VCC.value-c.VC.value)/2200*1000:key==='ID'?c.VS.value/1000*1000:c[key].value,expected=theory[key.toLowerCase()]*(key==='IE'||key==='IC'||key==='ID'?1000:1),unit=['IE','IC','ID'].includes(key)?'mA':'V',region=this.result.devices[this.lesson.parts[0][0]].region;
   columns=isBjt?[key+' ('+unit+')',expected.toFixed(4),value.toFixed(4),(Math.abs(expected)>1e-12?Math.abs((value-expected)/expected)*100:0).toFixed(2),region]:[key+' ('+unit+')',key==='ID'?'ID=VS/RS':key==='VGS'?'VG−VS':key==='VDS'?'VD−VS':key==='VD'?'VDD−ID·RD':key==='VS'?'ID·RS':'IG≈0 ⇒ VG≈0',value.toFixed(4),region];
   measurements={captures:structuredClone(c),value,unit,calculated:['IE','IC','ID'].includes(key),reference:theory};
  }else if(this.lessonId==='B2_P3'){
   key='VIN'+this.assembly.vin;const c=this.captures[key]||{};if(!['VIN0','VIN5'].includes(key)||!this.assembly.standard||!this.result||this.result.mode!=='CV')return reject('Bảng chuẩn cần Vin=0 hoặc 5 V và mạch đúng giá trị.');if(['VBE','VCE','IC'].some(k=>!c[k]||c[k].signature!==this.configurationKey()))return reject('Cần đủ VBE, VCE và dòng IC đo nối tiếp của cùng cấu hình.');
   const q=this.result.devices.BC547;columns=[key==='VIN0'?'0 V':'5 V',c.VBE.value.toFixed(4),c.VCE.value.toFixed(4),(c.IC.value*1000).toFixed(4),this.ledCurrent>.0001?'Sáng':'Tắt',q.region];measurements={captures:structuredClone(c),ledCurrent:this.ledCurrent,region:q.region};
  }else if(this.lessonId==='B3_P3'){
   key=this.thresholdRequested?'THRESHOLD':this.lightCondition();const c=this.captures[this.lightCondition()]||{};if(!this.assembly.standard||!this.result||this.result.mode!=='CV')return reject('Cần mạch 5 V chuẩn, đủ tiếp xúc và nguồn CV.');if(['RLDR','VGS'].some(k=>!c[k]||c[k].signature!==this.configurationKey()))return reject('Đo RLDR khi nguồn tắt và VGS khi nguồn bật ở cùng ánh sáng/vị trí POT.');
   if(key==='THRESHOLD'&&(!this.thresholdBracket||this.ambient<.1||this.ambient>2||this.lightCondition()!=='ROOM'||Math.abs(this.ledCurrent-.0001)>.0001))return reject('Ở chập tối 0,1–2 lux, xoay POT thật qua ngưỡng LED 0,1 mA rồi đo lại gần điểm chuyển.');
   const q=this.result.devices['2N7000'];columns=[key==='THRESHOLD'?'Ngưỡng Rpot='+Math.round(100000*(1-this.pot))+' Ω':{BRIGHT:'Chiếu sáng mạnh',ROOM:'Ánh sáng phòng',DARK:'Che tối hoàn toàn'}[key],c.RLDR.value.toFixed(2),c.VGS.value.toFixed(4),this.ledCurrent>.0001?'Sáng':'Tắt',q.region];measurements={captures:structuredClone(c),lux:this.illuminance(),potResistance:100000*(1-this.pot),ledCurrent:this.ledCurrent,region:q.region,...(key==='THRESHOLD'?{thresholdBracket:structuredClone(this.thresholdBracket)}:{})};
  }else if(this.lessonId==='B3_P4'){
   key=this.scrPhase;const c=this.captures[key]||{};if(['VAK','VGK'].some(k=>!c[k]||c[k].signature!==this.configurationKey()))return reject('Cần đo VAK/VGK trong cùng trạng thái SCR.');if(!this.assembly.standard)return reject('Bảng chuẩn cần nguồn đặt 5 V và linh kiện đúng.');
   columns=[{INITIAL:'Ban đầu',TRIGGER:'Kích dẫn',HOLD:'Tự duy trì',INTERRUPT:'Ngắt dòng'}[key],this.button?'Nhấn':'Thả',c.VAK.value.toFixed(4),c.VGK.value.toFixed(4),this.ledCurrent>.0001?'Sáng':'Tắt'];measurements={captures:structuredClone(c),scr:structuredClone(this.scr),ledCurrent:this.ledCurrent};
  }else return reject('Bằng chứng cho bảng này chưa đủ để ghi.');
  if(this.rows.some(r=>r.key===key))return reject('Trường hợp đã lưu; không tạo trùng hoặc ghi đè.');
  return {schemaVersion:1,lessonId:this.lessonId,key,recordedAt:new Date().toISOString(),columns,measurements,configuration:this.setup(),verifiedByTeacher:false};
 }
 record(){const row=this.makeRecord();if(!row)return;if(this.validateRows([row]).length!==1){this.toast('Bằng chứng đo chưa qua kiểm tra cấu trúc; chưa ghi kết quả.');return;}this.rows.push(row);try{localStorage.setItem(this.storageKey,JSON.stringify(this.rows));this.toast('Đã lưu bản dự phòng trên máy; chờ xác nhận Firebase.');}catch{this.toast('Không ghi được bản dự phòng; hãy xuất Excel/CSV.');}$('semiCloud').textContent='Chưa xác nhận Firebase cho trường hợp mới.';this.report();this.update();}
 validateRows(rows){return validateTransistorRecords(rows,this.lessonId);}
 report(){this.table=transistorTable(this.lessonId,this.rows);const head=document.querySelector('.report thead tr'),body=$('reportRows');head.replaceChildren();body.replaceChildren();for(const text of this.table.headers){const th=document.createElement('th');th.textContent=text;head.append(th);}for(const row of this.table.rows){const tr=document.createElement('tr');for(const text of row){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);}$('progressText').textContent=`${this.rows.length}/${this.lesson.keys.length} trường hợp đã ghi`;$('progressBar').style.width=this.rows.length/this.lesson.keys.length*100+'%';this.message('labvirt:transistor-report',{lessonId:this.lessonId,records:this.rows,sessionId:this.sessionId,total:this.lesson.keys.length});}
 export(format){
  if(!this.rows.length){this.toast('Chưa có dữ liệu thực nghiệm để xuất.');return;}const identity=this.identity(),rows=[['LABVIRT · Bảng '+this.lesson.table],[this.lesson.title],['Họ tên',identity.fullName||'', 'MSSV',identity.studentCode||''],['Lớp',identity.className||''],['Nguồn','Mô phỏng Blender; chưa xác nhận điểm'],this.table.headers,...this.table.rows];
  if(this.table.threshold)rows.push([],['Ngưỡng POT đo ở chập tối'],this.table.threshold.columns,['Rpot (Ω)',String(this.table.threshold.measurements.potResistance)]);
  const csvCell=transistorCsvCell;
  const data=format==='xlsx'?buildTableWorkbook(rows,'Bảng '+this.lesson.table,{sourceDescription:'Số đo Blender thực; ô chưa đo để trống',note:this.lesson.note}):new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=`LABVIRT-${this.lessonId}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
 }
 drawScreens(force){if(!force)return;const s=this.instruments.state;for(const [key,surface]of Object.entries(this.instruments.surfaces)){const {context:c,canvas,texture}=surface;c.fillStyle='#091622';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#82e7d2';c.font='bold 48px monospace';if(key==='supply'){c.fillText('DC · '+(this.result?.mode||'OFF'),30,65);c.font='bold 85px monospace';c.fillText((s.supplyPower?(this.result?.outputVoltage??s.voltage):0).toFixed(2)+' V',30,170);c.font='52px monospace';c.fillText((Math.max(0,this.result?.currents.PSU??0)*1000).toFixed(3)+' mA',30,290);}else c.fillText(key==='scope'?'SCOPE · OFF':'FG · OFF',30,65);texture.needsUpdate=true;}}
 diagnostics(){return{bodyBounds:this.bodyBounds(),boardTop:this.manifest.breadboard.bounds.max[1],lessonId:this.lessonId,mounted:this.mounts(),settings:this.setup().settings,issue:this.issue,pair:structuredClone(this.pair),captures:structuredClone(this.captures),rows:this.rows.length,target:this.target,readyToRecord:this.readyToRecord(),physicalProbes:{red:this.state.redPhysical,black:this.state.blackPhysical},socket:this.socket,sockets:this.sockets?.map(s=>({type:s.type,contacts:s.contacts.map(c=>({name:c.name,position:c.position.toArray()}))})),result:this.result?{mode:this.result.mode,outputVoltage:this.result.outputVoltage,currents:this.result.currents,devices:this.result.devices}:null,ledCurrent:this.ledCurrent,lightHit:this.lightHit,lightRay:this.lightRay,lux:this.illuminance(),potResistance:100000*(1-this.pot),scr:{...this.scr,phase:this.scrPhase,button:this.button}};}
 dispose(){clearInterval(this.scrTimer);clearTimeout(this.dischargeRetractTimer);for(const cable of this.dischargeCables||[]){this.scene.remove(cable);cable.geometry.dispose();cable.material.dispose();}this.listeners.forEach(stop=>stop());this.style.remove();}
}
