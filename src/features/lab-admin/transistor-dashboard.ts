import {TRANSISTOR_LESSONS} from '../../../public/labvirt/lab-v11/transistor-lessons.js';
import {validateTransistorRecords} from '../../../public/labvirt/lab-v11/transistor-records.js';
import {bai1IdentityConflicts,type Bai1Student} from './bai1-dashboard.ts';
import type {TransistorLesson,TransistorRecord} from '@/features/lab/services/transistor-progress';
export const TRANSISTOR_PARTS=Object.entries(TRANSISTOR_LESSONS).map(([id,l])=>({id:id as TransistorLesson,course:l.course,part:l.part,title:l.title,table:l.table,keys:l.keys,headers:l.headers,total:l.keys.length}));
export type TransistorSavedCase={record:TransistorRecord;serverUpdatedAt:string};
export type TransistorSnapshot={status:'loading'|'ready'|'offline'|'disabled'|'denied'|'error';hasConfirmed:boolean;rows:TransistorSavedCase[];invalidCount:number;error?:string};
const validTime=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function decodeTransistorDocuments(lesson:TransistorLesson,documents:{id:string;data:Record<string,unknown>}[]){
 const rows:TransistorSavedCase[]=[],seen=new Set<string>();let invalidCount=0;
 for(const {id,data}of documents){const record=validateTransistorRecords([data.record],lesson)[0] as TransistorRecord|undefined;if(!record||id!==record.key||seen.has(id)||data.lessonId!==lesson||data.source!=='CLIENT_SIMULATION'||data.verifiedByTeacher!==false||!validTime(data.updatedAt)){invalidCount++;continue;}seen.add(id);rows.push({record,serverUpdatedAt:data.updatedAt});}
 return {rows,invalidCount};
}
export function summarizeTransistor(lesson:TransistorLesson,snapshot:TransistorSnapshot|undefined){
 const part=TRANSISTOR_PARTS.find(p=>p.id===lesson)!;const rows=snapshot?.hasConfirmed?[...new Map(snapshot.rows.filter(row=>part.keys.includes(row.record.key)).map(row=>[row.record.key,row])).values()]:[],completed=rows.length;
 return {rows,total:part.total,completed,percent:Math.round(completed/part.total*100),missing:part.keys.filter(key=>!rows.some(r=>r.record.key===key)),state:!snapshot?.hasConfirmed?'unknown':!completed?'not-started':completed===part.total?'complete':'in-progress',latest:[...rows].sort((a,b)=>b.serverUpdatedAt.localeCompare(a.serverUpdatedAt))[0]};
}
export function transistorCourseKpis(students:Bai1Student[],course:number,snapshots:Record<string,TransistorSnapshot>){
 const parts=TRANSISTOR_PARTS.filter(p=>p.course===course),conflicts=bai1IdentityConflicts(students),total=parts.reduce((sum,p)=>sum+p.total,0);
 const summaries=students.map(s=>parts.map(p=>summarizeTransistor(p.id,!s.uid||conflicts.has(s.uid)?undefined:snapshots[s.uid+':'+p.id]))),records=summaries.flat().reduce((sum,s)=>sum+s.completed,0),partial=students.some(s=>!s.uid||conflicts.has(s.uid)||parts.some(p=>{const snapshot=snapshots[s.uid+':'+p.id];return snapshot?.status!=='ready'||!snapshot.hasConfirmed||snapshot.invalidCount>0;}));
 return {students:students.length,total,records,started:summaries.filter(parts=>parts.some(p=>p.completed>0)).length,complete:summaries.filter(parts=>parts.every(p=>p.state==='complete')).length,partial,average:students.length&&!partial?Number((records/(students.length*total)*100).toFixed(2)):null};
}
export function transistorStudentTable(lesson:TransistorLesson,snapshot:TransistorSnapshot|undefined){const part=TRANSISTOR_PARTS.find(p=>p.id===lesson)!,summary=summarizeTransistor(lesson,snapshot);return{headers:[...part.headers,'Server xác nhận'],rows:part.keys.map(key=>{const saved=summary.rows.find(r=>r.record.key===key);return[...(saved?.record.columns||[key,...part.headers.slice(1).map(()=>'—')]),saved?new Date(saved.serverUpdatedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa có xác nhận server'];})};}
export function transistorAdminExport(students:Bai1Student[],course:number,snapshots:Record<string,TransistorSnapshot>){
 const conflicts=bai1IdentityConflicts(students),rows:string[][]=[['LABVIRT · Tiến độ và số liệu Bài '+course],['Nguồn','Firestore theo UID; chưa xác nhận điểm. Dữ liệu chưa tải không được suy ra bằng 0.']];
 for(const part of TRANSISTOR_PARTS.filter(p=>p.course===course)){rows.push([],['Bảng '+part.table,part.title],['MSSV','Họ tên','Lớp',...part.headers,'Trường hợp','Đo lúc','Server xác nhận','Trạng thái dữ liệu']);for(const student of students){const snapshot=!student.uid||conflicts.has(student.uid)?undefined:snapshots[student.uid+':'+part.id],summary=summarizeTransistor(part.id,snapshot);for(const key of part.keys){const saved=summary.rows.find(r=>r.record.key===key);rows.push([student.studentCode,student.fullName,student.className||'Chưa khai báo',...(saved?.record.columns||[key,...part.headers.slice(1).map(()=>'')]),key,saved?.record.recordedAt||'',saved?.serverUpdatedAt||'',snapshot?.status||'Chưa xác minh UID/dữ liệu']);}}}
 return {rows,title:'LABVIRT-Bai'+course+'-Lop'};
}
