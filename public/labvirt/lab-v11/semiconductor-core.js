import {solveSemiconductorCircuit} from './circuit-core.js';
export const DIODE_MODELS=Object.freeze({'1N4007':{vf:.65,ron:2},'1N4148':{vf:.62,ron:2},ZENER_5V1:{vf:.7,ron:2,vz:5.1,rz:1}});
export const ZENER_VIN=Object.freeze([1,2,3,4,5,6,7,8,9,10,12]);
export const FILTER_CAPS=Object.freeze([0,10,100,1000]);
const invalid=reason=>({valid:false,reason,status:reason,display:'—',value:null});
export function measureDiode(s){
 if(!DIODE_MODELS[s.kind]||!['NORMAL','SHORT','OPEN'].includes(s.defect))return invalid('UNKNOWN_COMPONENT');
 if(!s.ready)return invalid('SCENE_NOT_READY');if(s.mode!=='DIODE')return {...invalid('SELECT_DIODE_RANGE'),display:s.mode==='OFF'?'OFF':'—'};
 if(s.blackJack!=='COM'||s.redJack!=='VOHM')return invalid('DMM_JACKS');
 if(s.powered)return invalid('REMOVE_POWER');if(!s.mounted)return invalid('DIODE_NOT_MOUNTED');
 if(!['PIN_A','PIN_B'].includes(s.red)||!['PIN_A','PIN_B'].includes(s.black))return invalid('PROBES_NOT_CONNECTED');
 if(s.red===s.black)return invalid('SAME_NODE');
 const direction=s.red==='PIN_A'?'FWD':'REV',model=DIODE_MODELS[s.kind];
 // Educational constant-current diode range: 1 mA, 2.0 V compliance.
 // The reverse Zener threshold is above compliance, so it correctly reads OL.
 const voltage=s.defect==='SHORT'?.0001:s.defect==='OPEN'?Infinity:direction==='FWD'?model.vf+.001*model.ron:Infinity;
 const value=voltage<=2?voltage:null;
 return {valid:true,reason:value===null?'OPEN_LIMIT':'DIODE_VOLTAGE',status:direction==='FWD'?'Chiều thuận A → K':'Chiều ngược K → A',display:value===null?'OL':value.toFixed(3)+' V',value,direction,kind:s.kind,defect:s.defect,quantity:'DIODE_VOLTAGE',unit:'V'};
}
export function makeDiodeRecord(configuration,pair){
 const {FWD,REV}=pair||{};
 if(!FWD?.valid||!REV?.valid||FWD.direction!=='FWD'||REV.direction!=='REV'||[FWD,REV].some(m=>m.kind!==configuration.kind||m.defect!==configuration.defect))throw Error('BOTH_DIRECTIONS_REQUIRED');
 const healthy=FWD.value!==null&&FWD.value>.1&&REV.value===null;
 return {schemaVersion:1,lessonId:'B1_P2',key:configuration.kind+'_'+configuration.defect,recordedAt:new Date().toISOString(),configuration:structuredClone(configuration),measurements:{FWD:structuredClone(FWD),REV:structuredClone(REV)},conclusion:healthy?'Tốt':'Hỏng',columns:[configuration.kind,FWD.display,REV.display,healthy?'Tốt':'Hỏng'],verifiedByTeacher:false};
}
export function solveZenerReferenceCircuit({vin,rs=220,rl=1000,vz=5.1,defect='NORMAL'}){
 if(![vin,rs,rl,vz].every(Number.isFinite)||vin<0||vin>12||rs<=0||rl<=0)throw Error('INVALID_ZENER_INPUT');
 const solved=solveSemiconductorCircuit({sources:[{id:'PSU',a:'VIN',b:'GND',volts:vin}],resistors:[{a:'VIN',b:'OUT',ohms:rs},{a:'OUT',b:'GND',ohms:rl}],diodes:[{a:'GND',b:'OUT',vf:.7,ron:2,vz,rz:1,defect}]});
 const vout=solved.voltage('OUT','GND'),il=vout/rl,iz=-solved.diodeCurrents[0];return {vin,vout,il,iz,vs:vin-vout,regulated:solved.diodeModes[0]==='ZENER',powerZener:vout*iz,powerRs:(vin-vout)**2/rs,solution:solved};
}
export function scopeGroundConflict({ch1,ch2}){return !!ch1?.ground&&!!ch2?.ground&&ch1.ground!==ch2.ground;}
export function canRecordSemiconductor({part,measurement,pair={},captures={},signature,scopeReady=false,sourceLimited=false}){
 if(!measurement?.valid||sourceLimited)return false;
 if(part===2)return !!pair.FWD?.valid&&!!pair.REV?.valid;
 const required=part===3?['VOUT','SCOPE_DC','SCOPE_AC']:['VIN','VOUT'];
 return (part!==3||scopeReady)&&required.every(key=>captures[key]?.signature===signature);
}
export function bridgeNetwork({load=1000,defects={}}={}){
 return {sources:[{id:'AC',a:'AC_A',b:'AC_B',volts:0}],resistors:[{a:'OUT',b:'GND',ohms:load}],diodes:[['AC_A','OUT'],['AC_B','OUT'],['GND','AC_A'],['GND','AC_B']].map(([a,b],i)=>({a,b,vf:.65,ron:2,defect:defects['D'+(i+1)]||'NORMAL'}))};
}
/** Backward-Euler capacitor companion in the shared MNA solver. No pre-drawn wave. */
export function simulateBridge({network,inputA='AC_A',inputB='AC_B',outputA='OUT',outputB='GND',rms=9,frequency=50,capacitance=0,stepsPerCycle=500,cycles=25}){
 if(![rms,frequency,capacitance,stepsPerCycle,cycles].every(Number.isFinite)||rms<=0||frequency<=0||capacitance<0||stepsPerCycle<100||cycles<3)throw Error('INVALID_BRIDGE_INPUT');
 const dt=1/frequency/stepsPerCycle,C=capacitance*1e-6,samples=[];let previous=0,preferred=[];
 for(let step=0;step<stepsPerCycle*cycles;step++){
  const t=step*dt,vin=rms*Math.SQRT2*Math.sin(2*Math.PI*frequency*t),sources=network.sources.map(s=>s.id==='AC'?{...s,volts:vin}:s),resistors=[...network.resistors],currentSources=[];
  if(C>0){resistors.push({a:outputA,b:outputB,ohms:dt/C});currentSources.push({a:outputB,b:outputA,amps:C/dt*previous});}
  const solution=solveSemiconductorCircuit({...network,sources,resistors,currentSources},preferred);preferred=solution.diodeModes;previous=solution.voltage(outputA,outputB);
  if(step>=stepsPerCycle*(cycles-1))samples.push({time:(step-stepsPerCycle*(cycles-1))*dt,input:solution.voltage(inputA,inputB),output:previous,conducting:preferred.map((mode,i)=>mode==='FWD'?'D'+(i+1):null).filter(Boolean)});
 }
 const values=samples.map(s=>s.output),peak=Math.max(...values),minimum=Math.min(...values),vdc=values.reduce((a,b)=>a+b,0)/values.length;
 return {samples,peak,minimum,vdc,ripple:peak-minimum,inputPeak:rms*Math.SQRT2,inputFrequency:frequency,rippleFrequency:frequency*2,capacitance,model:'PWL diode 0.65 V + 2 ohm; backward Euler capacitor; 1 Gohm+ leakage',finalVoltage:previous};
}
export function simulateReferenceBridge(options){return simulateBridge({...options,network:bridgeNetwork(options)});}
