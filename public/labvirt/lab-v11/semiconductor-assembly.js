import {DIODE_MODELS,FILTER_CAPS} from './semiconductor-core.js';
/** Electrical identity follows verified physical mounts and user-created wires. */
export function assemblyNodes({mounts={},wires=[]}){
 const parent=new Map(),root=id=>{if(!parent.has(id))parent.set(id,id);if(parent.get(id)!==id)parent.set(id,root(parent.get(id)));return parent.get(id);},join=(a,b)=>parent.set(root(a),root(b));
 const contacts=[];
 for(const [id,mount]of Object.entries(mounts))for(const pin of ['PIN_A','PIN_B'])if(typeof mount?.[pin]==='string'){const pair=[id+':'+pin,mount[pin]];contacts.push(pair);join(...pair);}
 for(const pair of wires)if(Array.isArray(pair)&&pair.length===2&&pair.every(id=>typeof id==='string'))join(...pair);
 const connected=id=>wires.some(pair=>pair.includes(id));
 return {root,same:(...ids)=>ids.every(id=>root(id)===root(ids[0])),connected,contacts};
}
export function validateAssembly(part,{mounts={},wires=[],settings={},defects={}}){
 const nodes=assemblyNodes({mounts,wires}),issues=[],same=nodes.same;
 const between=(a,b,x,y)=>same(a,x)&&same(b,y)||same(a,y)&&same(b,x);
 const required=part===3?['D1','D2','D3','D4','RL']:['ZENER','RS','RL'];
 for(const id of required)if(!mounts[id]?.PIN_A||!mounts[id]?.PIN_B||mounts[id].PIN_A===mounts[id].PIN_B)issues.push('UNMOUNTED_'+id);
 if(wires.length>80||wires.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(v=>typeof v!=='string'||v.length>100)))issues.push('INVALID_WIRE');
 if(nodes.connected('SCOPE_GND')&&nodes.connected('SCOPE_GND2')&&!same('SCOPE_GND','SCOPE_GND2'))issues.push('SCOPE_COMMON_GROUND_SHORT');
 if(settings.rl!==1000)issues.push('STANDARD_RL_REQUIRED');
 let network,outputA=part===3?'D1:PIN_B':'ZENER:PIN_B',outputB=part===3?'D3:PIN_A':'ZENER:PIN_A';
 if(part===3){
  if(settings.rms!==9||settings.frequency!==50)issues.push('STANDARD_9VAC_50HZ_REQUIRED');
  if(!FILTER_CAPS.includes(settings.capacitance))issues.push('INVALID_CAPACITANCE');
  if(same('AC_A','AC_B')||same(outputA,outputB))issues.push('SHORT_CIRCUIT');
  for(const id of ['D1','D2','D3','D4'])if(defects[id]&&defects[id]!=='NORMAL')issues.push('FAULTY_'+id);
  if(defects.RL&&defects.RL!=='NORMAL')issues.push('FAULTY_RL');
  if(settings.capacitance>0&&defects.CAP&&defects.CAP!=='NORMAL')issues.push('FAULTY_CAP');
  if(!same('AC_A','D1:PIN_A','D3:PIN_B')||!same('AC_B','D2:PIN_A','D4:PIN_B')||!same(outputA,'D2:PIN_B')||!same(outputB,'D4:PIN_A')||!between('RL:PIN_A','RL:PIN_B',outputA,outputB))issues.push('BRIDGE_TOPOLOGY');
  if(settings.capacitance>0&&(!mounts.CAP||!same('CAP:PIN_A',outputA)||!same('CAP:PIN_B',outputB)))issues.push('CAPACITOR_MISSING_OR_REVERSED');
  if(settings.capacitance===0&&(nodes.connected('CAP:PIN_A')||nodes.connected('CAP:PIN_B')))issues.push('REMOVE_CAPACITOR_FOR_C0');
  if(nodes.connected('SCOPE_GND')&&!same('SCOPE_GND','AC_B')&&!same('SCOPE_GND',outputB))issues.push('SCOPE_GROUND');
  if(nodes.connected('SCOPE_GND2')&&!same('SCOPE_GND2',outputB))issues.push('SCOPE_GROUND');
  network={sources:[{id:'AC',a:'AC_A',b:'AC_B',volts:0}],diodes:['D1','D2','D3','D4'].map(id=>({id,a:id+':PIN_A',b:id+':PIN_B',...DIODE_MODELS['1N4007'],defect:defects[id]||'NORMAL'})),resistors:[{a:'RL:PIN_A',b:'RL:PIN_B',ohms:settings.rl}]};
 }else if(part===4){
  if(settings.rs!==220)issues.push('STANDARD_RS_REQUIRED');
  if(!Number.isFinite(settings.vin)||settings.vin<0||settings.vin>12)issues.push('VIN_RANGE');
  if(same('PSU_POS','PSU_NEG')||same(outputA,outputB)||same('RS:PIN_A','RS:PIN_B'))issues.push('SHORT_CIRCUIT');
  if(!between('RS:PIN_A','RS:PIN_B','PSU_POS',outputA)||!between('RL:PIN_A','RL:PIN_B',outputA,outputB)||!same('PSU_NEG',outputB))issues.push('ZENER_TOPOLOGY');
  for(const id of ['ZENER','RS','RL'])if(defects[id]&&defects[id]!=='NORMAL')issues.push('FAULTY_'+id);
  network={sources:[{id:'PSU',a:'PSU_POS',b:'PSU_NEG',volts:settings.vin}],diodes:[{id:'ZENER',a:'ZENER:PIN_A',b:'ZENER:PIN_B',...DIODE_MODELS.ZENER_5V1,defect:defects.ZENER||'NORMAL'}],resistors:[{a:'RS:PIN_A',b:'RS:PIN_B',ohms:settings.rs},{a:'RL:PIN_A',b:'RL:PIN_B',ohms:settings.rl}]};
 }else throw Error('UNKNOWN_PART');
 network.wires=[...wires,...nodes.contacts];
 return {valid:issues.length===0,issues,network,outputA,outputB,nodes};
}
