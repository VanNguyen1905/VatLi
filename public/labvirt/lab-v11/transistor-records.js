import {TRANSISTOR_LESSONS} from './transistor-lessons.js';
import {DEVICE_MODELS} from './transistor-core.js';
import {transistorNodes,validateTransistorAssembly} from './transistor-assembly.js';
const map=v=>!!v&&typeof v==='object'&&!Array.isArray(v),number=v=>typeof v==='number'&&Number.isFinite(v),close=(text,value,precision=4)=>typeof text==='string'&&text.trim()!==''&&number(value)&&Math.abs(Number(text)-value)<=.5*10**(-precision)+1e-9;
const pinCount=id=>(DEVICE_MODELS[id]||id==='POT')?3:id==='BUTTON'?4:2;
export function transistorConfigurationKey(lessonId,setup){
 const lesson=TRANSISTOR_LESSONS[lessonId];if(!lesson)throw Error('UNKNOWN_LESSON');const terminals=lesson.parts.flatMap(([id])=>Array.from({length:pinCount(id)},(_,i)=>id+':PIN_'+String.fromCharCode(65+i))),nodes=transistorNodes({...setup,wires:[...setup.wires,...(setup.meter?.series?[[setup.meter.red,setup.meter.black]]:[])]}),groups=[...terminals,'PSU_POS','PSU_NEG'].map(id=>[id,...terminals.filter(t=>t!==id&&nodes.same(id,t)),...['PSU_POS','PSU_NEG'].filter(t=>t!==id&&nodes.same(id,t))].sort().join('|')).sort();
 return JSON.stringify({groups,values:lesson.parts.map(([id,,value])=>[id,setup.values[id]??value??null]),defects:lesson.parts.map(([id])=>[id,setup.defects[id]??'NORMAL']),voltage:setup.settings.voltage,currentLimit:setup.settings.currentLimit,...(lessonId==='B3_P3'?{pot:setup.settings.pot,lux:setup.settings.lux}:{})});
}
function transform(value,decode,key=''){
 if(Array.isArray(value))return key==='wires'?value.map(pair=>decode&&map(pair)?[pair.from,pair.to]:!decode&&Array.isArray(pair)?{from:pair[0],to:pair[1]}:pair):value.map(v=>transform(v,decode));
 if(map(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,transform(v,decode,k)]));return value;
}
export const toFirestoreTransistorRecord=record=>transform(record,false);
export const fromFirestoreTransistorRecord=record=>transform(record,true);
function jsonSafe(value,depth=0){if(depth>18)return false;if(value===null||typeof value==='boolean')return true;if(number(value))return true;if(typeof value==='string')return value.length<=18000;if(Array.isArray(value))return value.length<=100&&value.every(v=>jsonSafe(v,depth+1));if(map(value))return Object.entries(value).every(([key,v])=>!['__proto__','prototype','constructor','score','grade','assessedScore'].includes(key)&&jsonSafe(v,depth+1));return false;}
function configurationOk(c){return map(c)&&map(c.mounts)&&Object.keys(c.mounts).length<=8&&Array.isArray(c.wires)&&c.wires.length<=40&&c.wires.every(w=>Array.isArray(w)&&w.length===2&&w.every(n=>typeof n==='string'&&n.length>0&&n.length<=100))&&map(c.settings)&&number(c.settings.voltage)&&c.settings.voltage>=0&&c.settings.voltage<=30&&number(c.settings.currentLimit)&&c.settings.currentLimit>0&&c.settings.currentLimit<=1&&map(c.defects)&&map(c.values);}
function readingOk(e,mode,lessonId,{isolate=false}={}){
 if(!map(e)||e.valid!==true||!map(e.instrument)||e.instrument.physicalContacts!==true||!configurationOk(e.configuration)||!number(Date.parse(e.instrument.capturedAt))||typeof e.signature!=='string'||e.signature!==transistorConfigurationKey(lessonId,e.configuration))return false;
 const i=e.instrument;if(mode==='HFE')return i.mode==='HFE'&&number(e.value)&&e.value>=0&&e.value<=1000;
 if(!['OHM','DIODE','DCV','DCA'].includes(i.mode)||mode&&i.mode!==mode||i.blackJack!=='COM'||typeof i.red!=='string'||typeof i.black!=='string'||i.red===i.black)return false;
 if(i.mode==='DCA'){if(i.redJack!=='AMP')return false;}else if(i.redJack!=='VOHM')return false;
 if(e.value!==null&&(!number(e.value)||Math.abs(e.value)>1e9))return false;
 if(isolate&&(e.configuration.wires.length||e.configuration.settings.powered===true))return false;
 return typeof e.display==='string'&&e.display.length<100;
}
function partOneOk(r,lesson){
 const pairs=r.measurements.pairs,conclusion=r.measurements.inference,kind=r.key;if(!map(pairs)||!map(conclusion))return false;
 const names=['PIN_A','PIN_B','PIN_C'];for(const red of names)for(const black of names)if(red!==black){const e=pairs[red+'_'+black];if(!readingOk(e,null,r.lessonId,{isolate:true})||!['DIODE','OHM'].includes(e.instrument.mode)||e.instrument.red!==kind+':'+red||e.instrument.black!==kind+':'+black||names.some(pin=>!e.configuration.mounts[kind]?.[pin]))return false;}
 const fields=lesson.course===2?['B','E','C']:['G','S','D'];if(new Set(fields.map(f=>conclusion[f])).size!==3||fields.some(f=>!['1','2','3'].includes(conclusion[f])))return false;
 const display=(a,b)=>pairs[a+'_'+b].value===null?pairs[b+'_'+a].display:pairs[a+'_'+b].display;
 if(lesson.course===2)return ['NPN','PNP'].includes(conclusion.type)&&readingOk(pairs.HFE,'HFE',r.lessonId)&&r.columns[0]===kind&&r.columns[1]===display('PIN_A','PIN_B')&&r.columns[2]===display('PIN_A','PIN_C')&&r.columns[3]===conclusion.type&&r.columns[4]===conclusion.B&&r.columns[5]===conclusion.E&&r.columns[6]===conclusion.C&&close(r.columns[7],pairs.HFE.value,1);
 return ['Tốt','Hỏng'].includes(conclusion.quality)&&r.columns[0]===kind&&r.columns[1]===display('PIN_A','PIN_B')&&r.columns[2]===display('PIN_A','PIN_C')&&r.columns[3]===display('PIN_B','PIN_C')&&r.columns[4]===conclusion.G&&r.columns[5]===conclusion.S&&r.columns[6]===conclusion.D&&r.columns[7]===conclusion.quality;
}
function circuitRecordOk(r){
 const lesson=r.lessonId,m=r.measurements,c=m.captures;if(!map(c)||!validateTransistorAssembly(lesson,r.configuration).valid||!validateTransistorAssembly(lesson,r.configuration).standard)return false;
 const required=lesson==='B2_P2'?['VB','VE','VC','VCE','VCC']:lesson==='B2_P3'?['VBE','VCE','IC']:lesson==='B3_P2'?['VS','VG','VGS','VD','VDS']:lesson==='B3_P3'?['RLDR','VGS']:['VAK','VGK'];
 const signature=transistorConfigurationKey(lesson,r.configuration);
 if(required.some(key=>!readingOk(c[key],key==='IC'?'DCA':key==='RLDR'?'OHM':'DCV',lesson)||c[key].role!==key||c[key].value===null||c[key].signature!==signature))return false;
 if(lesson==='B2_P2'||lesson==='B3_P2'){
  const value=r.key==='IE'?c.VE.value:r.key==='IC'?(c.VCC.value-c.VC.value)/2200*1000:r.key==='ID'?c.VS.value:c[r.key].value;
  return number(m.value)&&Math.abs(m.value-value)<1e-9&&close(r.columns[2],value)&&m.unit===(['IE','IC','ID'].includes(r.key)?'mA':'V')&&m.calculated===['IE','IC','ID'].includes(r.key);
 }
 if(lesson==='B2_P3')return r.key==='VIN'+validateTransistorAssembly(lesson,r.configuration).vin&&close(r.columns[1],c.VBE.value)&&close(r.columns[2],c.VCE.value)&&close(r.columns[3],c.IC.value*1000)&&number(m.ledCurrent)&&r.columns[4]===(m.ledCurrent>.0001?'Sáng':'Tắt');
 if(lesson==='B3_P3')return close(r.columns[1],c.RLDR.value,2)&&close(r.columns[2],c.VGS.value)&&number(m.potResistance)&&m.potResistance>=0&&m.potResistance<=100000&&number(m.ledCurrent)&&r.columns[3]===(m.ledCurrent>.0001?'Sáng':'Tắt')&&(r.key!=='THRESHOLD'||map(m.thresholdBracket));
 return close(r.columns[2],c.VAK.value)&&close(r.columns[3],c.VGK.value)&&map(m.scr)&&typeof m.scr.latched==='boolean'&&number(m.ledCurrent)&&r.columns[4]===(m.ledCurrent>.0001?'Sáng':'Tắt');
}
export function validateTransistorRecords(value,lessonId){
 const lesson=TRANSISTOR_LESSONS[lessonId];if(!lesson||!Array.isArray(value))return[];const seen=new Set();
 return value.map(fromFirestoreTransistorRecord).filter(r=>{try{
  if(!map(r)||Object.keys(r).some(k=>!['schemaVersion','lessonId','key','recordedAt','configuration','measurements','columns','verifiedByTeacher','conclusion'].includes(k))||r.schemaVersion!==1||r.lessonId!==lessonId||!lesson.keys.includes(r.key)||seen.has(r.key)||r.verifiedByTeacher!==false||typeof r.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(r.recordedAt)||!number(Date.parse(r.recordedAt))||!configurationOk(r.configuration)||!map(r.measurements)||!Array.isArray(r.columns)||r.columns.length!==lesson.headers.length||r.columns.some(v=>typeof v!=='string'||v.length>300)||!jsonSafe(r)||JSON.stringify(r).length>190000)return false;
  if(!(lesson.part===1?partOneOk(r,lesson):circuitRecordOk(r)))return false;seen.add(r.key);return true;
 }catch{return false;}});
}
