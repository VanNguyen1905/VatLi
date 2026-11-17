import {validateAssembly} from './semiconductor-assembly.js';
const map=value=>!!value&&typeof value==='object'&&!Array.isArray(value),number=value=>typeof value==='number'&&Number.isFinite(value),close=(text,value)=>number(value)&&typeof text==='string'&&text.trim()!==''&&Math.abs(Number(text)-value)<.00051;
export function configurationSignature(c){return JSON.stringify({mounts:c.mounts,wires:c.wires.filter(pair=>!pair.some(id=>id.startsWith('SCOPE_'))),settings:c.settings,defects:c.defects});}
export function toFirestoreRecord(record){const copy=structuredClone(record);if(copy.configuration?.wires)copy.configuration.wires=copy.configuration.wires.map(([from,to])=>({from,to}));return copy;}
export function fromFirestoreRecord(record){if(!map(record))return record;const copy=structuredClone(record);if(Array.isArray(copy.configuration?.wires))copy.configuration.wires=copy.configuration.wires.map(pair=>map(pair)&&typeof pair.from==='string'&&typeof pair.to==='string'?[pair.from,pair.to]:pair);return copy;}
export function validateRecords(value,lesson){
 if(!/^B1_P[234]$/.test(lesson)||!Array.isArray(value))return [];const seen=new Set(),part=Number(lesson.slice(-1));
 return value.map(fromFirestoreRecord).filter(r=>{try{
  if(!map(r)||r.schemaVersion!==1||r.lessonId!==lesson||r.verifiedByTeacher!==false||typeof r.key!=='string'||seen.has(r.key)||typeof r.recordedAt!=='string'||!Number.isFinite(Date.parse(r.recordedAt))||!map(r.configuration)||!map(r.measurements)||!Array.isArray(r.columns)||!r.columns.every(c=>typeof c==='string'&&c.length<500)||JSON.stringify(r).length>180000)return false;
  const c=r.configuration,m=r.measurements;
  if(part===2){
   const f=m.FWD,b=m.REV;if(!/^(1N4007|1N4148|ZENER_5V1)_(NORMAL|SHORT|OPEN)$/.test(r.key)||r.key!==c.kind+'_'+c.defect||r.columns.length!==4||!f?.valid||!b?.valid||f.direction!=='FWD'||b.direction!=='REV'||[f,b].some(p=>p.kind!==c.kind||p.defect!==c.defect))return false;
   const healthy=f.value!==null&&f.value>.1&&b.value===null;if(r.conclusion!==(healthy?'Tốt':'Hỏng')||r.columns[0]!==c.kind||r.columns[1]!==f.display||r.columns[2]!==b.display||r.columns[3]!==r.conclusion)return false;
  }else{
   if(!map(c.mounts)||!Array.isArray(c.wires)||!map(c.settings)||!map(c.defects)||!validateAssembly(part,c).valid)return false;const signature=configurationSignature(c);
   if(part===3){if(!/^C(0|10|100|1000)$/.test(r.key)||r.key!=='C'+c.settings.capacitance||r.columns.length!==5||!m.VOUT||!m.SCOPE_DC||!m.SCOPE_AC||[m.VOUT,m.SCOPE_DC,m.SCOPE_AC].some(p=>p.signature!==signature)||!Array.isArray(m.waveform)||!m.waveform.length||m.waveform.length>1000)return false;
    if(r.columns[0]!==String(c.settings.capacitance)||!close(r.columns[1],m.SCOPE_DC.peak)||!close(r.columns[2],m.VOUT.value)||!close(r.columns[3],m.SCOPE_AC.ripple)||m.waveform.some(p=>!map(p)||!number(p.time)||!number(p.input)||!number(p.output)||Math.abs(p.output)>30))return false;
   }else{if(!/^VIN([1-9]|10|12)$/.test(r.key)||r.key!=='VIN'+c.settings.vin||r.columns.length!==4||!m.VIN||!m.VOUT||m.VIN.signature!==signature||m.VOUT.signature!==signature||!close(r.columns[0],m.VIN.value)||!close(r.columns[1],m.VOUT.value)||!close(r.columns[2],m.VOUT.value)||!close(r.columns[3],m.VIN.value-m.VOUT.value))return false;}
  }
  seen.add(r.key);return true;
 }catch{return false;}});
}
