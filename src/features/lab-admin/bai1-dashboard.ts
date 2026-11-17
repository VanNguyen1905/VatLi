import {validateRecords} from '../../../public/labvirt/lab-v11/semiconductor-records.js';

export type Bai1Part='B1_P1'|'B1_P2'|'B1_P3'|'B1_P4';
export type Bai1Row={key:string;columns:string[];recordedAt:string;serverUpdatedAt:string;component?:string;value?:number|null;unit?:string;nominal?:string;conclusion?:string;configuration:Record<string,unknown>;measurements?:Record<string,unknown>};
export type Bai1Snapshot={status:'loading'|'ready'|'offline'|'denied'|'error'|'disabled';hasConfirmed:boolean;rows:Bai1Row[];invalidCount:number;receivedAt?:string;error?:string};
export type Bai1Student={id:string;uid:string;studentCode:string;fullName:string;className:string;enrollmentStatus?:string};
const defects=['NORMAL','SHORT','OPEN'];
export const BAI1_PARTS:ReadonlyArray<{id:Bai1Part;title:string;short:string;table:string;total:number;keys:string[]}>=([
 {id:'B1_P1',title:'Linh kiện thụ động',short:'R · C · L',table:'1.1',total:18,keys:['R1','R2','R3','C1','C2','L'].flatMap(c=>defects.map(d=>c+':'+d))},
 {id:'B1_P2',title:'Diode và Zener',short:'A → K',table:'1.2',total:9,keys:['1N4007','1N4148','ZENER_5V1'].flatMap(c=>defects.map(d=>c+'_'+d))},
 {id:'B1_P3',title:'Chỉnh lưu cầu và tụ lọc',short:'AC → DC',table:'1.3',total:4,keys:[0,10,100,1000].map(c=>'C'+c)},
 {id:'B1_P4',title:'Ổn áp Zener',short:'Vout / Vin',table:'1.4',total:11,keys:[1,2,3,4,5,6,7,8,9,10,12].map(v=>'VIN'+v)},
] as const);
export const partDefinition=(part:Bai1Part)=>BAI1_PARTS.find(p=>p.id===part)!;
const validTime=(value:unknown):value is string=>typeof value==='string'&&!!value&&Number.isFinite(Date.parse(value));
export function decodeBai1Documents(part:Bai1Part,documents:{id:string;data:Record<string,unknown>}[],validateP1:(rows:unknown[])=>unknown[]){
 const rows:Bai1Row[]=[],seen=new Set<string>(),keys=partDefinition(part).keys;let invalidCount=0;
 for(const {id,data}of documents){
  const valid=part==='B1_P1'?validateP1([data.record]):validateRecords([data.record],part),record=valid[0] as Bai1Row|undefined;
  if(data.lessonId!==part||data.source!=='CLIENT_SIMULATION'||data.verifiedByTeacher!==false||!validTime(data.updatedAt)||!record||!keys.includes(record.key)||id!==(part==='B1_P1'?record.key.replace(':','_'):record.key)||seen.has(record.key)){invalidCount++;continue;}
  seen.add(record.key);rows.push({...record,serverUpdatedAt:data.updatedAt});
 }
 rows.sort((a,b)=>keys.indexOf(a.key)-keys.indexOf(b.key));return {rows,invalidCount};
}
export function summarizeBai1(part:Bai1Part,snapshot:Bai1Snapshot|undefined){
 const definition=partDefinition(part),rows=snapshot?.hasConfirmed?[...new Map(snapshot.rows.filter(row=>definition.keys.includes(row.key)).map(row=>[row.key,row])).values()]:[],completed=rows.length;
 return {rows,total:definition.total,completed,percent:Math.round(completed/definition.total*100),state:!snapshot?.hasConfirmed?'unknown':!completed?'not-started':completed===definition.total?'complete':'in-progress',missing:definition.keys.filter(key=>!rows.some(row=>row.key===key)),latest:[...rows].sort((a,b)=>b.serverUpdatedAt.localeCompare(a.serverUpdatedAt))[0]};
}
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().trim();
export function filterBai1Roster<T extends Bai1Student>(students:T[],filter:{className:string;code:string;name:string;studentId:string}){
 return students.filter(s=>s.enrollmentStatus!=='withdrawn'&&(!filter.className||(filter.className==='__EMPTY__'?!s.className:s.className===filter.className))&&normalize(s.studentCode).includes(normalize(filter.code))&&normalize(s.fullName).includes(normalize(filter.name))&&(!filter.studentId||s.id===filter.studentId));
}
export function bai1IdentityConflicts(students:Bai1Student[]){const ids=new Map<string,Set<string>>();for(const s of students){if(!s.uid||s.enrollmentStatus==='withdrawn')continue;const list=ids.get(s.uid)||new Set<string>();list.add(s.id);ids.set(s.uid,list);}return new Set([...ids].filter(([,list])=>list.size>1).map(([uid])=>uid));}
export function bai1Kpis(students:Bai1Student[],part:Bai1Part,snapshots:Record<string,Bai1Snapshot>){
 const conflicts=bai1IdentityConflicts(students),summaries=students.map(s=>summarizeBai1(part,conflicts.has(s.uid)?undefined:snapshots[s.uid+':'+part])),confirmed=summaries.filter(s=>s.state!=='unknown').length,records=summaries.reduce((sum,s)=>sum+s.completed,0),partial=confirmed!==students.length||students.some(s=>snapshots[s.uid+':'+part]?.status!=='ready');
 return {students:students.length,confirmed,started:summaries.filter(s=>s.completed>0).length,complete:summaries.filter(s=>s.state==='complete').length,records,average:students.length&&!partial?Number((records/(students.length*partDefinition(part).total)*100).toFixed(2)):null,partial};
}
const time=(value:string|undefined)=>validTime(value)?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
export const formatBai1Time=time;
const dateCells=(r:Bai1Row|undefined)=>[time(r?.recordedAt),time(r?.serverUpdatedAt)];
function diodeConclusion(row:Bai1Row){const m=row.measurements as {FWD?:{value:number|null};REV?:{value:number|null}};if(m?.FWD?.value===null&&m.REV?.value===null)return 'Hở cả hai chiều';if(m?.FWD?.value!==null&&m?.REV?.value!==null&&Number(m.FWD?.value)<.01&&Number(m.REV?.value)<.01)return 'Dẫn gần ngắn mạch hai chiều';return row.conclusion||'—';}
export function bai1Table(part:Bai1Part,rows:Bai1Row[],defect='NORMAL'){
 const lookup=(key:string)=>rows.find(r=>r.key===key);
 if(part==='B1_P1')return {headers:['Trường hợp','Linh kiện','Danh định','Dung sai','Thực tế đo','Trạng thái','Kết luận','Ghi phép đo','Server xác nhận'],rows:partDefinition(part).keys.map(key=>{const r=lookup(key);return [key,...(r?.columns||[key.split(':')[0],'—','—','—','Chưa đo','—']),...dateCells(r)];})};
 if(part==='B1_P2')return {headers:['Mã diode','Thuận (V)','Ngược (V)','Tốt/Hỏng','Kết luận','Ghi phép đo','Server xác nhận'],rows:['1N4007','1N4148','ZENER_5V1'].map(kind=>{const r=lookup(kind+'_'+defect);return [...(r?.columns||[kind,'—','—','Chưa đo']),r?diodeConclusion(r):'—',...dateCells(r)];})};
 if(part==='B1_P3')return {headers:['C (µF)','Vp,out (V)','VDC (V)','Vripple (Vpp)','Dạng sóng đã lưu','Ghi phép đo','Server xác nhận'],rows:[0,10,100,1000].map(c=>{const r=lookup('C'+c),wave=r?.measurements?.waveform;return [String(c),...(r?.columns.slice(1,4)||['—','—','—']),Array.isArray(wave)?`${wave.length} mẫu`:'Chưa đo',...dateCells(r)];})};
 return {headers:['Vin (V)','Vout (V)','IL (mA)','Sụt áp Rs (V)','Trạng thái ổn áp','Ghi phép đo','Server xác nhận'],rows:[1,2,3,4,5,6,7,8,9,10,12].map(v=>{const r=lookup('VIN'+v);return [...(r?.columns||[String(v),'—','—','—']),'Không lưu kết luận vùng',...dateCells(r)];})};
}
export type ChartPoint={x:number;y:number;index:number;label:string;series?:string};
export type Bai1Chart={title:string;xLabel:string;yLabel:string;unit:string;points:ChartPoint[];segments:[ChartPoint,ChartPoint][];annotations:{x:number;label:string}[];categories?:string[];note?:string;trace?:boolean};
const pointNumber=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
export function bai1Chart(part:Bai1Part,rows:Bai1Row[],defect='NORMAL',component='R1'):Bai1Chart{
 const base:Bai1Chart={title:'',xLabel:'',yLabel:'',unit:'V',points:[],segments:[],annotations:[]};
 if(part==='B1_P1'){
  const row=rows.find(r=>r.key===component+':NORMAL'),nominal=row?.nominal?.match(/^([\d.]+)\s*(k|m|µ|n)?(Ω|F|H)$/),unit=row?.unit,actual=row?.value;
  base.title='Danh định và số đo · '+component;base.xLabel='Cùng đại lượng và đơn vị';base.yLabel=unit||'';base.unit=unit||'';base.categories=['Danh định','Thực đo'];
  if(!nominal||!pointNumber(actual)||!unit){base.note='Chưa có số đo NORMAL phù hợp để so sánh.';return base;}
  const scales:Record<string,number>={'':1,k:1000,m:.001,'µ':1e-6,n:1e-9},actualUnit=unit.match(/^(k|m|µ|n)?(Ω|F|H)$/);
  if(!actualUnit||nominal[3]!==actualUnit[2]){base.note='Rdc (Ω) của cuộn dây và điện cảm danh định (mH) là hai đại lượng khác nhau; không vẽ chung.';return base;}
  base.points=[{x:0,y:Number(nominal[1])*scales[nominal[2]||'']/scales[actualUnit[1]||''],index:0,label:'Danh định'},{x:1,y:actual,index:1,label:'Thực đo'}];return base;
 }
 if(part==='B1_P2'){
  base.title='Phân cực thuận / ngược';base.xLabel='Diode';base.yLabel='Điện áp (V)';base.categories=['1N4007','1N4148','Zener 5,1 V'];base.note='OL là ngoài dải/hở mạch; không phải 0 V.';
  ['1N4007','1N4148','ZENER_5V1'].forEach((kind,i)=>{const row=rows.find(r=>r.key===kind+'_'+defect);if(!row)return;for(const [direction,offset]of [['FWD',-.1],['REV',.1]] as const){const measured=(row.measurements?.[direction] as {value?:number|null;display?:string})||{};if(pointNumber(measured.value))base.points.push({x:i+offset,y:measured.value,index:i,label:kind+' '+direction,series:direction});else if(measured.display==='OL')base.annotations.push({x:i+offset,label:'OL'});}});return base;
 }
 base.title=part==='B1_P3'?'Độ gợn theo điện dung tụ':'Đặc tuyến Vout theo Vin';base.xLabel=part==='B1_P3'?'C (µF)':'Vin (V)';base.yLabel=part==='B1_P3'?'Vripple (Vpp)':'Vout (V)';
 partDefinition(part).keys.forEach((key,index)=>{const row=rows.find(r=>r.key===key);if(!row)return;const x=Number(row.columns[0]),y=Number(row.columns[part==='B1_P3'?3:1]);if(Number.isFinite(x)&&Number.isFinite(y))base.points.push({x,y,index,label:part==='B1_P3'?`${x} µF`:`Vin ${x} V`});});
 for(let i=1;i<base.points.length;i++)if(base.points[i].index===base.points[i-1].index+1)base.segments.push([base.points[i-1],base.points[i]]);base.note='Chỉ các điểm đã lưu. Đường bị ngắt tại trường hợp chưa đo.';return base;
}
export function bai1Waveform(rows:Bai1Row[],key:string):Bai1Chart{
 const wave=rows.find(r=>r.key===key)?.measurements?.waveform,points:ChartPoint[]=Array.isArray(wave)?wave.flatMap((s:unknown,index)=>{const p=s as {time?:number;output?:number};return pointNumber(p?.time)&&pointNumber(p.output)?[{x:p.time*1000,y:p.output,index,label:'t='+String(p.time*1000)+' ms'}]:[];}):[];
 return {title:'Dạng sóng đã lưu · '+key,xLabel:'Thời gian (ms)',yLabel:'Vout (V)',unit:'V',points,segments:[],annotations:[],trace:true,note:'Dữ liệu mẫu đã lưu trong cùng bản ghi Firestore; không dựng sóng minh họa.'};
}
export function bai1Export(students:Bai1Student[],part:Bai1Part,snapshots:Record<string,Bai1Snapshot>){
 const headers=['MSSV','Họ tên','Lớp','Phần','Case ID','Ghi phép đo (UTC)','Server xác nhận (UTC)',...(part==='B1_P1'?['Linh kiện','Danh định','Dung sai','Thực tế đo','Trạng thái','Kết luận']:part==='B1_P2'?['Diode','Thuận (V)','Ngược (V)','Tốt/Hỏng']:part==='B1_P3'?['C (µF)','Vp,out (V)','VDC (V)','Vripple (Vpp)','Dạng sóng']:['Vin (V)','Vout (V)','IL (mA)','Sụt áp Rs (V)'])];
 const conflicts=bai1IdentityConflicts(students),rows:string[][]=[headers];for(const s of students){if(conflicts.has(s.uid))continue;for(const r of summarizeBai1(part,snapshots[s.uid+':'+part]).rows)rows.push([s.studentCode,s.fullName,s.className,part,r.key,r.recordedAt,r.serverUpdatedAt,...r.columns]);}return {rows};
}
