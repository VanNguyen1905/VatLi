import {TRANSISTOR_LESSONS} from './transistor-lessons.js';
import {DEVICE_MODELS,ldrResistance} from './transistor-core.js';
const pin=(id,index)=>id+':PIN_'+String.fromCharCode(65+index);
export function transistorNodes({mounts={},wires=[]}){
 const parent=new Map(),root=id=>{if(!parent.has(id))parent.set(id,id);if(parent.get(id)!==id)parent.set(id,root(parent.get(id)));return parent.get(id);},join=(a,b)=>parent.set(root(a),root(b)),contacts=[];
 for(const [id,mount]of Object.entries(mounts))for(const [key,node]of Object.entries(mount))if(/^PIN_[A-D]$/.test(key)&&typeof node==='string'){const pair=[id+':'+key,node];contacts.push(pair);join(...pair);}
 for(const pair of wires)if(Array.isArray(pair)&&pair.length===2&&pair.every(id=>typeof id==='string'))join(...pair);
 return {root,same:(...ids)=>ids.every(id=>root(id)===root(ids[0])),contacts};
}
const standardVoltage=id=>['B2_P2','B3_P2'].includes(id)?12:5;
export function validateTransistorAssembly(lessonId,setup){
 const lesson=TRANSISTOR_LESSONS[lessonId];if(!lesson)throw Error('UNKNOWN_LESSON');const {mounts={},wires=[],settings={},defects={},values={},meter}=setup,rawNodes=transistorNodes(setup),nodes=meter?.series?transistorNodes({...setup,wires:[...wires,[meter.red,meter.black]]}):rawNodes,same=nodes.same,issues=[];
 if(meter?.series&&rawNodes.same(meter.red,meter.black))issues.push('DMM_AMMETER_BYPASS');
 const between=(id,a,b)=>same(pin(id,0),a)&&same(pin(id,1),b)||same(pin(id,1),a)&&same(pin(id,0),b);
 for(const [id,,ohms]of lesson.parts){const count=DEVICE_MODELS[id]||id==='POT'?3:id==='BUTTON'?4:2;for(let i=0;i<count;i++)if(typeof mounts[id]?.['PIN_'+String.fromCharCode(65+i)]!=='string')issues.push('UNMOUNTED_'+id);if(ohms&&(!Number.isFinite(values[id]??ohms)||(values[id]??ohms)<=0))issues.push('INVALID_RESISTANCE_'+id);}
 if(wires.length>80||wires.some(w=>!Array.isArray(w)||w.length!==2||w.some(s=>typeof s!=='string'||s.length>100)))issues.push('INVALID_WIRE');
 const isolated=lesson.part===1;
 if(same('PSU_POS','PSU_NEG'))issues.push('SOURCE_SHORT');
 const kind=lesson.parts[0][0],terminals=Object.fromEntries((DEVICE_MODELS[kind]?.pins||[]).map((name,i)=>[name,pin(kind,i)]));
 let topology=true,vin=null;
 if(lessonId==='B2_P2')topology=between('R1','PSU_POS',terminals.B)&&between('R2',terminals.B,'PSU_NEG')&&between('RC','PSU_POS',terminals.C)&&between('RE',terminals.E,'PSU_NEG');
 if(lessonId==='B2_P3'){
  topology=between('RL','PSU_POS',pin('LED',0))&&same(pin('LED',1),terminals.C)&&same(terminals.E,'PSU_NEG');
  if(between('RB',terminals.B,'PSU_NEG'))vin=0;else if(between('RB',terminals.B,'PSU_POS'))vin=settings.voltage;else topology=false;
 }
 if(lessonId==='B3_P2'){
  if(between('RD','PSU_POS',terminals.S)&&between('RS',terminals.D,'PSU_NEG'))[terminals.D,terminals.S]=[terminals.S,terminals.D];
  topology=between('RD','PSU_POS',terminals.D)&&between('RS',terminals.S,'PSU_NEG')&&between('RG',terminals.G,'PSU_NEG');
 }
 if(lessonId==='B3_P3')topology=same('PSU_POS',pin('POT',0),pin('POT',1))&&same(pin('POT',2),terminals.G)&&between('LDR',terminals.G,'PSU_NEG')&&same(terminals.S,'PSU_NEG')&&between('RL','PSU_POS',pin('LED',0))&&same(pin('LED',1),terminals.D);
 if(lessonId==='B3_P4')topology=between('RL','PSU_POS',pin('LED',0))&&same(pin('LED',1),terminals.A)&&same(terminals.K,'PSU_NEG')&&same(pin('BUTTON',0),'PSU_POS')&&between('RG',pin('BUTTON',1),terminals.G);
 if(!isolated&&!topology)issues.push('INCOMPLETE_OR_UNSAFE_TOPOLOGY');
 if(!isolated&&(!Number.isFinite(settings.voltage)||settings.voltage<0||settings.voltage>30))issues.push('SOURCE_RANGE');
 if(isolated&&wires.length)issues.push('ISOLATE_DEVICE');
 const network={resistors:[],devices:[],diodes:[],sources:[{id:'PSU',a:'PSU_POS',b:'PSU_NEG',volts:settings.voltage??0}],wires:[...wires,...nodes.contacts]};
 if(meter?.series)network.resistors.push({id:'DMM_SHUNT',a:meter.red,b:meter.black,ohms:1});
 for(const [id,,ohms]of lesson.parts){const defect=defects[id]??'NORMAL';
  if(DEVICE_MODELS[id])network.devices.push({id,kind:id,pins:Object.fromEntries(DEVICE_MODELS[id].pins.map((name,i)=>[name,pin(id,i)])),defect,on:id==='C106D'&&settings.scrOn});
  else if(ohms&&defect!=='OPEN')network.resistors.push({id,a:pin(id,0),b:pin(id,1),ohms:defect==='SHORT'?.1:(values[id]??ohms)});
  else if(id==='LED')network.diodes.push({id,a:pin(id,0),b:pin(id,1),vf:1.9,ron:12,defect});
  else if(id==='LDR'&&defect!=='OPEN')network.resistors.push({id,a:pin(id,0),b:pin(id,1),ohms:defect==='SHORT'?.1:ldrResistance(settings.lux??10)});
  else if(id==='POT'&&defect!=='OPEN'){const fraction=Math.max(0,Math.min(1,settings.pot??.5));network.resistors.push({id:'POT_AW',a:pin(id,0),b:pin(id,1),ohms:Math.max(.1,100000*fraction)},{id:'POT_WB',a:pin(id,1),b:pin(id,2),ohms:Math.max(.1,100000*(1-fraction))});}
  else if(id==='BUTTON'){network.wires.push([pin(id,0),pin(id,2)],[pin(id,1),pin(id,3)]);if(settings.button||defect==='SHORT')network.resistors.push({id:'BUTTON_CONTACT',a:pin(id,0),b:pin(id,1),ohms:.1});}
 }
 const standard=topology&&settings.voltage===standardVoltage(lessonId)&&lesson.parts.every(([id,,value])=>(!defects[id]||defects[id]==='NORMAL')&&(!value||(values[id]??value)===value));
 return {valid:issues.length===0,issues,network,nodes,terminals,vin,standard};
}
/** Declarative PDF connectivity is used by reference tests and the displayed
 * wiring guide only. Runtime never calls this function to connect student wires. */
export function referenceAssembly(lessonId){
 const lesson=TRANSISTOR_LESSONS[lessonId],mounts=Object.fromEntries(lesson.parts.map(([id])=>[id,Object.fromEntries(Array.from({length:DEVICE_MODELS[id]||id==='POT'?3:id==='BUTTON'?4:2},(_,i)=>['PIN_'+String.fromCharCode(65+i),'BB:'+id+i]))]));
 const t=Object.fromEntries((DEVICE_MODELS[lesson.parts[0][0]]?.pins||[]).map((key,i)=>[key,pin(lesson.parts[0][0],i)])),groups={
  B2_P2:[['PSU_POS','R1:PIN_A','RC:PIN_A'],[t.B,'R1:PIN_B','R2:PIN_A'],['PSU_NEG','R2:PIN_B','RE:PIN_B'],[t.C,'RC:PIN_B'],[t.E,'RE:PIN_A']],
  B2_P3:[['PSU_POS','RL:PIN_A','RB:PIN_A'],['RL:PIN_B','LED:PIN_A'],['LED:PIN_B',t.C],['PSU_NEG',t.E],['RB:PIN_B',t.B]],
  B3_P2:[['PSU_POS','RD:PIN_A'],['RD:PIN_B',t.D],['RS:PIN_A',t.S],['PSU_NEG','RS:PIN_B','RG:PIN_B'],['RG:PIN_A',t.G]],
  B3_P3:[['PSU_POS','POT:PIN_A','POT:PIN_B','RL:PIN_A'],['POT:PIN_C',t.G,'LDR:PIN_A'],['PSU_NEG',t.S,'LDR:PIN_B'],['RL:PIN_B','LED:PIN_A'],['LED:PIN_B',t.D]],
  B3_P4:[['PSU_POS','RL:PIN_A','BUTTON:PIN_A'],['RL:PIN_B','LED:PIN_A'],['LED:PIN_B',t.A],['PSU_NEG',t.K],['BUTTON:PIN_B','RG:PIN_A'],['RG:PIN_B',t.G]],
 };
 return {mounts,wires:(groups[lessonId]||[]).flatMap(([first,...rest])=>rest.map(n=>[first,n])),settings:{voltage:standardVoltage(lessonId),pot:.5,lux:10,button:false,scrOn:false},defects:{},values:{}};
}
