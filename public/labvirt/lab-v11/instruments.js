import * as THREE from 'three';
import {solveCircuit,solveLimitedCircuit,waveform} from './circuit-core.js';
import {COMPONENTS} from './measurement-core.js';
import {evaluateDCMeasurement} from './dc-measurement.js';
import {displaySurface,validateBindings} from './scene-support.js';
import {mountedContactWires,contactsLiveSource} from './board-circuit-topology.js';

const $=id=>document.getElementById(id),v=a=>new THREE.Vector3(...a);
export class InstrumentLab {
 constructor({scene,objects,manifest,hotspot,pinPosition,getBoardContacts=()=>({}),getState,onChange,toast,parity=false}){
  Object.assign(this,{scene,objects,manifest,pinPosition,getBoardContacts,getState,onChange,toast});
  this.binding=validateBindings(objects,manifest);this.wires=[];this.cables=[];this.surfaces={};this.portPositions=new Map();this.picking=null;this.rotations=new Map();
  this.state={supplyPower:false,voltage:5,currentLimit:.02,generatorPower:false,frequency:1000,amplitude:1,shape:'SINE',scopePower:false,timeDiv:.0002,voltsDiv:1,trigger:0,run:true};
  this.portNodes=new Map();this.solution=null;this.error=null;this.lastScreen=-Infinity;this.timeIndex=2;this.voltsIndex=3;
  this.holes=new Map(manifest.boardTopology.holes.map(h=>['BB:'+h.id,h]));
  for(const [key,d]of Object.entries(manifest.devices)){
   if(!parity)this.surfaces[key]=displaySurface(scene,manifest.screens[{scope:'oscilloscope',supply:'dcSupply',generator:'functionGenerator'}[key]],1024,key==='scope'?680:430);
   for(const c of d.controls){const p=[...c.position];p[2]=c.bounds.max[2]+.001;const h=hotspot('DEVICE_'+c.action,p,Math.max(.006,Math.min(.018,(c.bounds.max[0]-c.bounds.min[0])/2)),0x77dfd6,'device');h.userData.action=c.action;h.material.opacity=.04;
    const pivot=new THREE.Group();pivot.name='TECHNICAL_PIVOT_'+c.node;pivot.position.copy(objects.get(c.node).getWorldPosition(new THREE.Vector3()));scene.add(pivot);
    for(const [name,obj]of objects)if(name===c.node||name.startsWith(c.node+'_'))pivot.attach(obj);
    this.rotations.set(c.action,{object:pivot,initial:pivot.quaternion.clone(),count:0});}
   for(const [id,port]of Object.entries(d.ports)){const p=[...port.position];p[2]=port.bounds.max[2]+.002;this.portPositions.set(id,v(p));const h=hotspot('PORT_'+id,p,id==='FG_GND'?.002:.004,0xe1ba73,'port');h.userData.port=id;this.portNodes.set(id,port.node);}
  }
  this.bindUI();this.refresh();
 }
 endpointIds(){return [...this.portPositions.keys(),...Object.keys(COMPONENTS).flatMap(k=>[k+':PIN_A',k+':PIN_B']),...this.holes.keys()];}
 canonical(id){return this.holes.has(id)?'BB:'+this.holes.get(id).node:id;}
 position(id){if(this.portPositions.has(id))return this.portPositions.get(id).clone();if(this.holes.has(id))return v(this.holes.get(id).position).add(new THREE.Vector3(0,.002,0));const [key,pin]=id.split(':');return this.pinPosition(pin,key);}
 bindUI(){
  for(const id of ['wireFrom','wireTo'])for(const name of this.endpointIds()){const option=document.createElement('option');option.value=name;option.textContent=name.replace('BB:','Lỗ ').replace(':PIN_',' / chân ');$(id).append(option);}
  $('wireFrom').value='PSU_POS';$('wireTo').value='R1:PIN_A';
  for(const [id,key]of [['supplyVoltage','voltage'],['supplyCurrent','currentLimit'],['generatorFrequency','frequency'],['generatorAmplitude','amplitude'],['scopeTime','timeDiv'],['scopeVolts','voltsDiv'],['scopeTrigger','trigger']])$(id).addEventListener('input',()=>{this.state[key]=Number($(id).value);this.refresh();this.onChange();});
  for(const action of ['supplyPower','generatorPower','scopePower','scopeRun'])$(action).onclick=()=>this.action(action);
  $('generatorWave').onchange=()=>{this.state.shape=$('generatorWave').value;this.refresh();this.onChange();};
  $('addWire').onclick=()=>this.addWire($('wireFrom').value,$('wireTo').value);
  for(const [id,side]of [['pickWireFrom','wireFrom'],['pickWireTo','wireTo']])$(id).onclick=()=>{this.picking=side;this.toast('Chọn cổng, chân linh kiện hoặc lỗ breadboard thật trong cảnh.');};
  $('removeWires').onclick=()=>{this.wires=[];this.picking=null;this.refresh();this.onChange();};
  $('wireList').onclick=e=>{const button=e.target.closest('[data-remove-wire]');if(!button)return;this.wires.splice(Number(button.dataset.removeWire),1);this.refresh();this.onChange();};
 }
 action(name){
  const s=this.state;
  if(['supplyPower','generatorPower','scopePower'].includes(name))s[name]=!s[name];
  else if(name==='scopeRun')s.run=!s.run;
  else if(name==='supplyVoltage')s.voltage=s.voltage>=12?0:s.voltage+1;
  else if(name==='supplyCurrent')s.currentLimit=s.currentLimit>=.1?.01:s.currentLimit+.01;
  else if(name==='generatorFrequency')s.frequency=s.frequency>=10000?100:s.frequency*2;
  else if(name==='generatorAmplitude')s.amplitude=s.amplitude>=5?.5:s.amplitude+.5;
  else if(name==='generatorWave')s.shape=['SINE','SQUARE','RAMP','PULSE'][(['SINE','SQUARE','RAMP','PULSE'].indexOf(s.shape)+1)%4];
  else if(name==='scopeTime'){this.timeIndex=(this.timeIndex+1)%6;s.timeDiv=[.00005,.0001,.0002,.0005,.001,.002][this.timeIndex];}
  else if(name==='scopeVolts'){this.voltsIndex=(this.voltsIndex+1)%6;s.voltsDiv=[.1,.2,.5,1,2,5][this.voltsIndex];}
  else if(name==='scopeTrigger')s.trigger=s.trigger>=2?-2:s.trigger+.5;
  const binding=this.rotations.get(name);if(binding){binding.count++;binding.object.quaternion.copy(binding.initial);if(/Power|Run|Wave/.test(name))binding.object.rotation.x=(binding.count%2)*.08;else binding.object.rotateOnWorldAxis(new THREE.Vector3(0,0,1),binding.count*Math.PI/8);}
  this.refresh();this.onChange();
 }
 hit(info){
  if(info.role==='device'){this.action(info.action);return true;}
  if(info.role==='port'){if(this.picking)this.pick(info.port);else this.toast(info.port+' · Dùng Kết nối mạch để nối hoặc tháo dây.');return true;}
  if(info.role==='pin'&&this.picking){this.pick(this.getState().component+':'+info.id);return true;}
  return false;
 }
 pick(id){if(!this.picking)return;$(this.picking).value=id;this.toast('Đã chọn '+id);this.picking=null;}
 pickBoard(point){if(!this.picking)return false;const nearest=[...this.holes.entries()].map(([id,h])=>({id,d:v(h.position).distanceTo(point)})).sort((a,b)=>a.d-b.d)[0];if(nearest?.d<.012){this.pick(nearest.id);return true;}return false;}
 addWire(a,b){if(a===b||!this.endpointIds().includes(a)||!this.endpointIds().includes(b)){this.toast('Hai đầu dây phải là hai điểm hợp lệ khác nhau.');return;}if(this.wires.length>=40){this.toast('Giới hạn 40 dây cho mạch bài này.');return;}if(this.wires.some(w=>w.includes(a)&&w.includes(b))){this.toast('Dây này đã tồn tại.');return;}this.wires.push([a,b]);this.refresh();this.onChange();}
 network(){
  const current=this.getState(),s=this.state;
  const resistors=Object.entries(COMPONENTS).filter(([,c])=>c.type!=='CAP').flatMap(([key,c])=>{
   const defect=key===current.component?current.defect:'NORMAL';return defect==='OPEN'?[]:[{a:key+':PIN_A',b:key+':PIN_B',ohms:defect==='SHORT'?.01:c.value}];
  });
  const sources=[];if(s.supplyPower)sources.push({id:'PSU',a:'PSU_POS',b:'PSU_NEG',volts:s.voltage});if(s.generatorPower)sources.push({id:'FG',a:'FG_OUT',b:'FG_GND',volts:0});
  // Nối pin linh kiện vào nút breadboard tương ứng khi đã đặt lên lỗ hợp lệ.
  // Không tạo dây giả/mesh: đây là topology điện của chân đang tiếp xúc bảng trắng.
  const contactWires=mountedContactWires(this.getBoardContacts(),this.manifest.boardTopology.holes);
  return {resistors,sources,wires:[...this.wires.map(w=>w.map(id=>this.canonical(id))),...contactWires]};
 }
 refresh(){
  const s=this.state;this.error=null;this.solution=null;this.gain=0;this.dc=null;
  const ranges={voltage:[0,30],currentLimit:[.001,1],frequency:[1,100000],amplitude:[0,10],timeDiv:[.000001,1],voltsDiv:[.01,20],trigger:[-10,10]};
  for(const [key,[min,max]]of Object.entries(ranges))if(!Number.isFinite(s[key])||s[key]<min||s[key]>max){this.error='Giá trị '+key+' phải nằm trong '+min+'…'+max;}
  if(this.error){$('circuitStatus').textContent='Mạch chưa hợp lệ: '+this.error;this.drawScreens(true);return;}
  try{
   const network=this.network();this.solution=solveLimitedCircuit(network,s.currentLimit);
   this.dc=this.solution.voltage('SCOPE_CH1','SCOPE_GND');
   if(s.generatorPower){const probe=solveCircuit({...network,sources:network.sources.map(x=>({...x,volts:x.id==='FG'?1:this.solution.outputVoltage}))});this.gain=probe.voltage('SCOPE_CH1','SCOPE_GND')-this.dc;}
  }catch(error){this.error=error.message;}
  for(const [id,key]of [['supplyVoltage','voltage'],['supplyCurrent','currentLimit'],['generatorFrequency','frequency'],['generatorAmplitude','amplitude'],['scopeTime','timeDiv'],['scopeVolts','voltsDiv'],['scopeTrigger','trigger']])$(id).value=String(s[key]);
  $('generatorWave').value=s.shape;
  for(const id of ['supplyPower','generatorPower','scopePower']){$(id).textContent=(s[id]?'● ĐANG BẬT':'○ ĐANG TẮT');$(id).setAttribute('aria-pressed',String(s[id]));}
  $('scopeRun').textContent=s.run?'Dừng quét':'Tiếp tục quét';
  const voltage=this.solution&&Number.isFinite(this.solution.outputVoltage)?this.solution.outputVoltage.toFixed(2)+' V':'chưa xác định';
  const current=this.solution&&Number.isFinite(this.solution.currents?.PSU)?(this.solution.currents.PSU*1000).toFixed(2)+' mA':'chưa xác định';
  $('circuitStatus').textContent=this.error?'Mạch chưa hợp lệ: '+this.error:`${this.wires.length} dây · ${this.solution?.mode||'CHƯA CÓ NGHIỆM'} · U ra ${voltage} · I ${current}`;
  $('wireList').replaceChildren();this.wires.forEach((w,i)=>{const li=document.createElement('li'),b=document.createElement('button');li.textContent=w.join(' ↔ ')+' ';b.textContent='Tháo';b.dataset.removeWire=String(i);li.append(b);$('wireList').append(li);});
  this.drawCables();this.drawScreens(true);return this.solution;
 }
 drawCables(){
  for(const c of this.cables){this.scene.remove(c);c.geometry.dispose();c.material.dispose();}this.cables=[];
  this.wires.forEach((w,i)=>{const a=this.position(w[0]),b=this.position(w[1]);if(!a||!b)return;const mid=a.clone().lerp(b,.5);mid.y=Math.max(a.y,b.y)+.028+(i%3)*.012;
   const curve=new THREE.CatmullRomCurve3([a,a.clone().add(new THREE.Vector3(0,.018,.01)),mid,b.clone().add(new THREE.Vector3(0,.018,.01)),b]);
   const cable=new THREE.Mesh(new THREE.TubeGeometry(curve,24,.0012,5,false),new THREE.MeshStandardMaterial({color:[0xe05b59,0x58a8cd,0xd9b851,0x6aa887][i%4],roughness:.7}));cable.name='TECHNICAL_CONNECTED_WIRE_'+i;this.scene.add(cable);this.cables.push(cable);
  });
 }
 dcMeasurement(){
  return evaluateDCMeasurement({state:this.getState(),network:this.network(),solution:this.solution,error:this.error});
 }
 isPowered(){
  if(!this.state.supplyPower&&!this.state.generatorPower)return false;
  const sample=this.getState()?.component;
  return contactsLiveSource(this.network(),sample);
 }
 drawScreens(force=false,now=performance.now()){
  // Triggered periodic traces are stationary. Upload display textures only when
  // their inputs change instead of uploading three megapixel canvases at 10 Hz.
  if(!force)return;this.lastScreen=now;
  for(const [key,surface]of Object.entries(this.surfaces)){
   if(key==='scope'&&!this.state.run&&!force)continue;
   const {context:c,canvas,texture}=surface,w=canvas.width,h=canvas.height;c.fillStyle='#0b1722';c.fillRect(0,0,w,h);c.font='bold 38px monospace';c.textBaseline='top';
   const power=this.state[{scope:'scopePower',supply:'supplyPower',generator:'generatorPower'}[key]];
   if(!power){c.fillStyle='#54636b';c.fillText('OFF',40,40);texture.needsUpdate=true;continue;}
   c.fillStyle='#80e9d8';
   if(key==='supply'){c.fillText('DC / '+(this.solution?.mode||'ERROR'),35,25);c.font='bold 106px monospace';c.fillText(this.solution&&Number.isFinite(this.solution.outputVoltage)?this.solution.outputVoltage.toFixed(2)+' V':'— V',35,110);c.fillStyle='#acd982';c.fillText(this.solution&&Number.isFinite(this.solution.currents?.PSU)?(this.solution.currents.PSU*1000).toFixed(2)+' mA':'— mA',35,240);}
   if(key==='generator'){c.fillText(this.state.shape+' / OUTPUT',35,25);c.font='bold 85px monospace';c.fillText(this.state.frequency.toFixed(0)+' Hz',35,110);c.fillText(this.state.amplitude.toFixed(2)+' Vpk',35,225);}
   if(key==='scope'){
    c.strokeStyle='#24404c';c.lineWidth=2;for(let x=0;x<=10;x++){c.beginPath();c.moveTo(x*w/10,80);c.lineTo(x*w/10,h-80);c.stroke();}for(let y=0;y<=8;y++){c.beginPath();c.moveTo(0,80+y*(h-160)/8);c.lineTo(w,80+y*(h-160)/8);c.stroke();}
    c.fillText('CH1 '+this.state.voltsDiv+'V/div  '+(this.state.timeDiv*1000).toFixed(2)+'ms/div',25,20);
    // Không vẽ một đường phẳng 0 V giả khi solver chưa có nghiệm hợp lệ.
    if(!this.solution||this.error){
      c.fillStyle='#fbbf9a';c.font='32px sans-serif';
      c.fillText(this.error?'MẠCH CHƯA HỢP LỆ':'CHƯA CÓ NGHIỆM',35,h/2);
      texture.needsUpdate=true;continue;
    }
    c.strokeStyle='#78f0b3';c.lineWidth=4;c.beginPath();
    let phase=0;this.triggerLocked=false;const amplitude=(Number.isFinite(this.gain)?this.gain:0)*this.state.amplitude;
    if(Math.abs(amplitude)>1e-12){const ratio=(this.state.trigger-this.dc)/amplitude;if(Math.abs(ratio)<1){this.triggerLocked=true;
      if(this.state.shape==='SINE')phase=(amplitude>0?Math.asin(ratio):Math.PI-Math.asin(ratio))/(2*Math.PI*this.state.frequency);
      else if(this.state.shape==='RAMP')phase=amplitude>0?(ratio+1)/(2*this.state.frequency):0;
      else phase=amplitude>0?0:(this.state.shape==='PULSE'?.2:.5)/this.state.frequency;
    }}
    for(let x=0;x<=w;x+=2){const t=x/w*this.state.timeDiv*10+phase,yVal=(Number.isFinite(this.dc)?this.dc:0)+(Number.isFinite(this.gain)?this.gain:0)*(this.state.generatorPower?waveform(this.state,t):0),y=h/2-yVal/this.state.voltsDiv*(h-160)/8;const clipped=Math.max(81,Math.min(h-81,y));if(x===0)c.moveTo(x,clipped);else c.lineTo(x,clipped);}c.stroke();
    c.fillStyle='#9bb9c3';c.font='28px monospace';c.fillText(this.error||(!this.solution?'CHƯA CÓ NGHIỆM MẠCH':`${this.triggerLocked?'TRIG':'AUTO'} ${this.state.trigger.toFixed(1)} V · ${this.wires.length?'TÍN HIỆU TỪ MẠCH':'CHƯA KẾT NỐI'}`),25,h-53);
   }
   texture.needsUpdate=true;
  }
 }
 diagnostics(){return {bindings:this.binding,devices:{...this.state},wireCount:this.wires.length,wires:this.wires.map(w=>[...w]),error:this.error,outputVoltage:this.solution?.outputVoltage,current:Number.isFinite(this.solution?.currents?.PSU)?this.solution.currents.PSU:null,mode:this.solution?.mode,scopeDC:this.dc,scopeGain:this.gain,triggerLocked:this.triggerLocked};}
 dispose(){this.cables.forEach(c=>{c.geometry.dispose();c.material.dispose();});Object.values(this.surfaces).forEach(s=>s.dispose());}
}
