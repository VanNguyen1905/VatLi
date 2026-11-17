/** Bài 2–3 educational device instances, 25 °C. Terminal currents feed the
 * existing MNA engine; readings never select a textbook answer by lesson ID.
 * Model limits and manufacturer-specific pinouts: docs/.../bai2-bai3/MODELS.md.
 */
import {solveCircuit} from './circuit-core.js';
export const DEVICE_MODELS=Object.freeze({
 BC547:{pins:['C','B','E'],beta:220,reverseBeta:5,vbe:.66,maxV:45,maxI:.1,maxP:.5},
 BC557:{pins:['C','B','E'],beta:220,reverseBeta:5,vbe:.62,maxV:45,maxI:.1,maxP:.625},
 J113:{pins:['D','S','G'],idss:.008,vp:-1.5,maxV:35,maxI:.03,maxP:.625},
 '2N7000':{pins:['S','G','D'],vt:2.1,kp:.08,gateCapacitance:50e-12,gateLeakage:1e12,maxV:60,maxI:.2,maxP:.4},
 C106D:{pins:['K','A','G'],igt:.0002,il:.005,ih:.003,pulse:1e-4,maxV:400,maxI:4,maxP:2},
});
const VT=.02585;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const requireFinite=(v,label)=>{if(!Number.isFinite(v))throw Error('INVALID_'+label);return v;};
const junction=(v,is=1e-14)=>is*Math.expm1(clamp(v/VT,-50,32));
function channel(kind,vd,vg,vs,model){
 const sign=vd>=vs?1:-1,source=Math.min(vd,vs),vds=Math.abs(vd-vs),vgs=vg-source;
 if(kind==='J113'){
  const over=vgs-model.vp,k=model.idss/model.vp**2;
  return sign*(over<=0?0:vds<over?k*(2*over*vds-vds*vds):k*over*over);
 }
 const over=vgs-model.vt;
 const ids=over<=0?0:model.kp*(vds<over?over*vds-vds*vds/2:over*over/2);
 // Reverse body diode S→D is tied to physical terminals, not the selected
 // direction of the symmetric channel calculation.
 return sign*ids-Math.max(0,(vs-vd-.65)/2);
}
export function deviceCurrents(device,voltage){
 const base=DEVICE_MODELS[device.kind];if(!base)throw Error('UNKNOWN_DEVICE');
 const m={...base,...device},p=device.pins;
 const v=Object.fromEntries(Object.entries(p).map(([key,node])=>[key,voltage[node]??0]));
 if(device.defect==='OPEN')return {currents:Object.fromEntries(Object.keys(p).map(k=>[k,0])),region:'OPEN'};
 if(device.defect==='SHORT'){const names=Object.keys(p),last=names.at(-1),currents=Object.fromEntries(names.slice(0,-1).map(k=>[k,(v[k]-v[last])/.1]));currents[last]=-Object.values(currents).reduce((a,b)=>a+b,0);return{currents,region:'SHORT'};}
 if(device.kind==='BC547'||device.kind==='BC557'){
  const polarity=device.kind==='BC547'?1:-1,be=polarity*(v.B-v.E),bc=polarity*(v.B-v.C);
  const af=m.beta/(m.beta+1),ar=m.reverseBeta/(m.reverseBeta+1),is=.002/(af*Math.expm1(m.vbe/VT));
  const forward=junction(be,is),reverse=junction(bc,is),ic=polarity*(af*forward-reverse),ib=polarity*((1-af)*forward+(1-ar)*reverse),ie=ic+ib;
  const region=be<.45?'CUTOFF':bc>.4?'SATURATION':bc<.2?'ACTIVE':'TRANSITION';
  return {currents:{C:ic,B:ib,E:-ie},ic,ib,ie,vbe:v.B-v.E,vce:v.C-v.E,region};
 }
 if(device.kind==='J113'||device.kind==='2N7000'){
  const id=channel(device.kind,v.D,v.G,v.S,m);
  const igs=device.kind==='J113'?junction(v.G-v.S): (v.G-v.S)/1e12;
  const igd=device.kind==='J113'?junction(v.G-v.D):0;
  const vgs=v.G-v.S,vds=v.D-v.S,over=device.kind==='J113'?vgs-m.vp:vgs-m.vt;
  const region=over<=0?'CUTOFF':Math.abs(vds)<over?'OHMIC':'SATURATION';
  return {currents:{D:id-igd,G:igs+igd,S:-id-igs},id,ig:igs+igd,vgs,vds,region};
 }
 const vak=v.A-v.K,vgk=v.G-v.K,ig=Math.max(0,(vgk-.6)/100),ia=device.on?Math.max(0,(vak-.8)/5):vak/1e10;
 return {currents:{A:ia,G:ig,K:-ia-ig},ia,ig,vak,vgk,region:device.on?'CONDUCTING':'BLOCKING'};
}

/** Damped numerical Newton linearization. Each terminal derivative becomes a
 * voltage-controlled current stamp in solveCircuit. Source stepping avoids
 * taking an unbounded first exponential step through a forward junction.
 */
export function solveTransistorCircuit(network){
 const devices=network.devices||[],diodes=network.diodes||[];
 const nodes=new Set();for(const e of [...(network.resistors||[]),...(network.sources||[]),...(network.currentSources||[])]){nodes.add(e.a);nodes.add(e.b);}for(const [a,b]of network.wires||[]){nodes.add(a);nodes.add(b);}for(const d of devices)Object.values(d.pins).forEach(n=>nodes.add(n));for(const d of diodes){nodes.add(d.a);nodes.add(d.b);}
 const reference=network.sources?.[0]?.b??[...nodes][0];if(!reference)throw Error('EMPTY_NETWORK');
 const leakage=[...nodes].filter(n=>n!==reference).map(a=>({a,b:reference,ohms:1e9}));
 let guess=Object.fromEntries([...nodes].map(n=>[n,0])),solution,iterations=0;
 function branches(at){
  const out=[];
  for(const d of devices){const currents=deviceCurrents(d,at).currents;const terminals=Object.entries(d.pins),ground=terminals.at(-1)[1];for(const [name,a]of terminals.slice(0,-1))out.push({a,b:ground,nodes:terminals.map(e=>e[1]),value:currents[name],eval:v=>deviceCurrents(d,v).currents[name]});}
  for(const d of diodes){const evaluate=v=>d.defect==='OPEN'?((v[d.a]??0)-(v[d.b]??0))/1e10:d.defect==='SHORT'?((v[d.a]??0)-(v[d.b]??0))/.1:Math.max(0,((v[d.a]??0)-(v[d.b]??0)-(d.vf??.65))/(d.ron??2))+((v[d.a]??0)-(v[d.b]??0))/1e10;out.push({a:d.a,b:d.b,nodes:[d.a,d.b],value:evaluate(at),eval:evaluate});}
  return out;
 }
 for(let step=1;step<=20;step++){
  let converged=false;
  for(let iter=0;iter<160;iter++){
   iterations++;const transconductances=[],currentSources=[...(network.currentSources||[])];
   for(const branch of branches(guess)){
    let offset=branch.value;
    for(const node of [...new Set(branch.nodes)]){const h=1e-5,gradient=(branch.eval({...guess,[node]:(guess[node]??0)+h})-branch.eval({...guess,[node]:(guess[node]??0)-h}))/(2*h);offset-=gradient*(guess[node]??0);if(Math.abs(gradient)>1e-16)transconductances.push({a:branch.a,b:branch.b,c:node,d:reference,siemens:gradient});}
    currentSources.push({a:branch.a,b:branch.b,amps:offset});
   }
   solution=solveCircuit({...network,resistors:[...(network.resistors||[]),...leakage],sources:(network.sources||[]).map(s=>({...s,volts:s.volts*step/20})),currentSources,transconductances});
   const delta=Math.max(...[...nodes].map(n=>Math.abs((solution.potentials[n]??0)-(guess[n]??0))));
   const damping=Math.min(1,.15/Math.max(delta,1e-30));
   const next=Object.fromEntries([...nodes].map(n=>[n,(guess[n]??0)+damping*((solution.potentials[n]??0)-(guess[n]??0))]));
   guess=next;if(delta<1e-7){converged=true;break;}
  }
  if(!converged)throw Error('TRANSISTOR_NO_CONVERGENCE');
 }
 const result=Object.fromEntries(devices.map(d=>[d.id,deviceCurrents(d,solution.potentials)]));
 return {...solution,devices:result,iterations,diodeCurrents:diodes.map(d=>{const v=solution.voltage(d.a,d.b);return d.defect==='OPEN'?v/1e10:d.defect==='SHORT'?v/.1:Math.max(0,(v-(d.vf??.65))/(d.ron??2))+v/1e10;})};
}
export function solveLimitedTransistorCircuit(network,limit){
 requireFinite(limit,'CURRENT_LIMIT');if(limit<=0)throw Error('INVALID_CURRENT_LIMIT');
 const source=network.sources?.find(s=>s.id==='PSU');if(!source)throw Error('PSU_REQUIRED');
 const initial=solveTransistorCircuit(network);if(initial.currents.PSU < -1e-7)throw Error('PSU_REVERSE_CURRENT');if(initial.currents.PSU<=limit+1e-9)return {...initial,mode:'CV',outputVoltage:source.volts};
 let low=0,high=source.volts,result;for(let i=0;i<30;i++){const volts=(low+high)/2;result=solveTransistorCircuit({...network,sources:network.sources.map(s=>s.id==='PSU'?{...s,volts}:s)});if(result.currents.PSU>limit)high=volts;else low=volts;}
 return {...result,mode:'CC',outputVoltage:(low+high)/2};
}

export function measureThreePin(input){
 const {kind,mode,red,black}=input,m=DEVICE_MODELS[kind];
 if(!m||!['DIODE','OHM'].includes(mode)||!Number.isInteger(red)||!Number.isInteger(black)||red<1||red>3||black<1||black>3||red===black)return {valid:false,reason:'CONTACTS'};
 if(!input.mounted||!input.ready||input.powered||input.redJack!=='VOHM'||input.blackJack!=='COM')return {valid:false,reason:input.powered?'LIVE_RESISTANCE':'SETUP'};
 const r=m.pins[red-1],b=m.pins[black-1];let value=null,gateVoltage=input.gateVoltage??0;
 const testVolts=mode==='DIODE'?2.8:1,series=mode==='DIODE'?2200:10000;
 if(kind==='2N7000'){
  if(r==='G'&&b==='S')gateVoltage=testVolts;
  if(r==='S'&&b==='G')gateVoltage=0;
 }
 const pins=Object.fromEntries(m.pins.map((p,i)=>[p,'pin'+(i+1)])),sources=[{id:'DMM',a:'test',b:pins[b],volts:testVolts}];
 // Stored insulated-gate charge affects D/S tests; a gate-contact measurement
 // itself remains an open circuit after the transient charging current ends.
 if(kind==='2N7000'&&r!=='G'&&b!=='G')sources.push({id:'GATE_CHARGE',a:pins.G,b:pins.S,volts:gateVoltage});
 const solution=solveTransistorCircuit({sources,resistors:[{a:'test',b:pins[r],ohms:series}],devices:[{id:'dut',kind,pins,defect:input.defect??'NORMAL'}]});
 const voltage=solution.voltage(pins[r],pins[b]),amps=(testVolts-voltage)/series;
 if(amps>1e-6&&voltage<testVolts-.02)value=mode==='DIODE'?voltage:voltage/amps;
 return {valid:true,value,unit:mode==='DIODE'?'V':'Ω',display:value===null?'OL':mode==='DIODE'?value.toFixed(3):value.toFixed(1),gateVoltage,testVolts,testCurrent:amps,pins:{red:r,black:b}};
}
export function measureHfe({kind,socket,pins,complete,defect='NORMAL'}){
 const m=DEVICE_MODELS[kind],polarity=kind==='BC547'?'NPN':kind==='BC557'?'PNP':null;
 if(!m||!polarity||!complete||socket!==polarity||pins?.join(',')!=='E,B,C')return {valid:false,value:null,reason:'HFE_INSERTION'};
 if(defect==='SHORT')return {valid:false,value:null,reason:'HFE_SHORT_PROTECTION'};
 const polaritySign=polarity==='NPN'?1:-1,ib=10e-6;
 if(defect==='OPEN')return {valid:true,value:0,unit:'hFE',bias:{vce:polaritySign*5,ib,ic:0}};
 const solution=solveTransistorCircuit({sources:[{id:'SOCKET',a:'c',b:'e',volts:polaritySign*5}],currentSources:[{a:'e',b:'b',amps:polaritySign*ib}],devices:[{id:'dut',kind,pins:{C:'c',B:'b',E:'e'}}]});
 return {valid:true,value:Math.abs(solution.devices.dut.ic/ib),unit:'hFE',bias:{vce:polaritySign*5,ib,ic:solution.devices.dut.ic}};
}
export function referenceBjtQ({vcc,r1,r2,rc,re,beta,vbe=.66}){
 const vth=vcc*r2/(r1+r2),rth=r1*r2/(r1+r2),ib=Math.max(0,(vth-vbe)/(rth+(beta+1)*re)),ic=beta*ib,ie=ib+ic,ve=ie*re,vb=ve+vbe,vc=vcc-ic*rc,vce=vc-ve;
 return {vb,ve,vc,vce,ib,ic,ie,region:ib<=0?'CUTOFF':vce<.2?'SATURATION':'ACTIVE',assumption:'constant VBE; finite beta; active-region reference only'};
}
export function referenceJfetQ({vdd,rd,rs,rg,idss,vp}){
 if(![vdd,rd,rs,rg,idss].every(n=>Number.isFinite(n)&&n>0)||!(vp<0))throw Error('INVALID_JFET_REFERENCE');
 let lo=0,hi=Math.min(idss,Math.abs(vp)/rs);for(let i=0;i<70;i++){const id=(lo+hi)/2;if(id>idss*(1+id*rs/vp)**2)hi=id;else lo=id;}
 const id=(lo+hi)/2,vs=id*rs,vg=0,vgs=-vs,vd=vdd-id*rd,vds=vd-vs;
 return {id,vs,vg,vgs,vd,vds,region:vds>=vgs-vp?'SATURATION':'OUTSIDE_SHOCKLEY_REFERENCE'};
}
export function ldrResistance(lux){requireFinite(lux,'ILLUMINANCE');if(lux<0)throw Error('INVALID_ILLUMINANCE');return clamp(5000*(Math.max(lux,.001)/10)**-.7,100,1e7);}
export function ldrIlluminance({ambient,flashlight=0,hit=false,shaded=false}){if(![ambient,flashlight].every(n=>Number.isFinite(n)&&n>=0))throw Error('INVALID_ILLUMINANCE');return (ambient+(hit?flashlight:0))*(shaded?.01:1);}
export function stepScr(previous,{enabled,ig,ia,dt}){
 if(![ig,ia,dt].every(Number.isFinite)||dt<0)throw Error('INVALID_SCR_STATE');const m=DEVICE_MODELS.C106D;
 if(!enabled)return {latched:false,gateTime:0};
 const gateTime=ig>=m.igt?(previous.gateTime??0)+dt:0;
 return {latched:previous.latched?ia>=m.ih:gateTime>=m.pulse&&ia>=m.il,gateTime};
}
