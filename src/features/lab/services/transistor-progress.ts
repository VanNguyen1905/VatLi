import {collection,doc,getDocFromServer,onSnapshot,serverTimestamp,setDoc,runTransaction} from 'firebase/firestore';
import {auth,db} from '@/services/firebase/config';
import {validateTransistorRecords,toFirestoreTransistorRecord} from '../../../../public/labvirt/lab-v11/transistor-records.js';
export const TRANSISTOR_LESSON_IDS=['B2_P1','B2_P2','B2_P3','B3_P1','B3_P2','B3_P3','B3_P4'] as const;
export type TransistorLesson=typeof TRANSISTOR_LESSON_IDS[number];
export type TransistorRecord={schemaVersion:1;lessonId:TransistorLesson;key:string;recordedAt:string;columns:string[];measurements:Record<string,unknown>;configuration:Record<string,unknown>;verifiedByTeacher:false};
export const transistorSyncEnabled=import.meta.env.VITE_USE_FIREBASE_EMULATOR==='true'||import.meta.env.VITE_TRANSISTOR_PROGRESS_SYNC==='true';
export const isTransistorLesson=(id:unknown):id is TransistorLesson=>typeof id==='string'&&TRANSISTOR_LESSON_IDS.some(lesson=>lesson===id);
export const validateTransistorCases=(value:unknown,lesson:TransistorLesson)=>validateTransistorRecords(value,lesson) as TransistorRecord[];
export function mergeTransistorCases(lesson:TransistorLesson,...sets:unknown[]){const rows=new Map<string,TransistorRecord>();for(const set of sets)for(const row of validateTransistorCases(set,lesson))rows.set(row.key,row);return [...rows.values()].sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));}
const cacheKey=(uid:string,lesson:TransistorLesson)=>`labvirt-transistor-account-v1:${uid}:${lesson}`;
export function readTransistorCache(uid:string,lesson:TransistorLesson){try{const data=JSON.parse(localStorage.getItem(cacheKey(uid,lesson))||'{}');return data.uid===uid?validateTransistorCases(data.records,lesson):[];}catch{return[];}}
export function writeTransistorCache(uid:string,lesson:TransistorLesson,rows:TransistorRecord[]){try{localStorage.setItem(cacheKey(uid,lesson),JSON.stringify({uid,lessonId:lesson,records:validateTransistorCases(rows,lesson)}));return true;}catch{return false;}}
export function connectTransistorProgress(uid:string,lesson:TransistorLesson,receive:(rows:TransistorRecord[])=>void,status:(text:string)=>void){
 let stopped=false,loaded=!transistorSyncEnabled,resolveReady:()=>void=()=>{},rejectReady:(e:Error)=>void=()=>{};const known=new Map<string,TransistorRecord>(),pending=new Set<string>(),denied=new Set<string>();
 const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});void ready.catch(()=>{});
 if(loaded){resolveReady();status('Chưa bật đồng bộ Bài 2–3; đang giữ bản dự phòng theo tài khoản.');}
 const ref=collection(db,'users',uid,'labProgress',lesson,'cases');
 const stop=transistorSyncEnabled?onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
  if(stopped||auth.currentUser?.uid!==uid)return;if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites){status('Đang chờ server; bản cache không được tính hoàn thành cloud.');return;}
  const rows=validateTransistorCases(snapshot.docs.map(d=>d.data().record),lesson);known.clear();rows.forEach(row=>known.set(row.key,row));receive(rows);loaded=true;resolveReady();status(rows.length===snapshot.size?`Firebase xác nhận ${rows.length} trường hợp của ${lesson}.`:`Có ${snapshot.size-rows.length} bản ghi không hợp lệ; chỉ tính ${rows.length} bản đã kiểm tra.`);
 },error=>{if(!stopped){rejectReady(new Error('TRANSISTOR_CLOUD_LOAD_FAILED'));status('Chưa tải Firebase Bài 2–3: '+error.message);}}):()=>{};
 return {ready,stop:()=>{stopped=true;stop();rejectReady(new Error('TRANSISTOR_DISPOSED'));},append:(value:unknown)=>{
  if(stopped||!loaded||!transistorSyncEnabled||auth.currentUser?.uid!==uid)return;
  for(const record of validateTransistorCases(value,lesson)){
   if(known.has(record.key)||pending.has(record.key)||denied.has(record.key))continue;pending.add(record.key);status('Đang chờ server lưu '+lesson+'/'+record.key+'.');
   void setDoc(doc(ref,record.key),{record:toFirestoreTransistorRecord(record),lessonId:lesson,source:'CLIENT_SIMULATION',verifiedByTeacher:false,updatedAt:serverTimestamp()}).then(()=>{if(stopped||auth.currentUser?.uid!==uid)return;known.set(record.key,record);receive([...known.values()]);status('Đã lưu Firebase · server xác nhận '+lesson+'/'+record.key);}).catch(async error=>{
    if(stopped||auth.currentUser?.uid!==uid)return;
    if(error.code==='permission-denied'){
     try{const document=await getDocFromServer(doc(ref,record.key)),existing=validateTransistorCases([document.data()?.record],lesson);if(!stopped&&auth.currentUser?.uid===uid&&existing.length===1&&existing[0].key===record.key){known.set(record.key,existing[0]);receive([...known.values()]);status('Đang dùng bản chuẩn đã được server xác nhận; không ghi đè bản trùng.');return;}}catch{/* A denied read is not an acknowledgement. */}
     denied.add(record.key);
    }
    if(!stopped)status('Chưa lưu Firebase: '+error.message+' Bản dự phòng vẫn được giữ.');
   }).finally(()=>pending.delete(record.key));
  }
 }};
}
export type TransistorReport={schemaVersion:1;courseId:'B2'|'B3';revision:number;fields:{group:string;objectives:string;theory:string;discussion:string;answers:string[]};updatedAt?:string};
export function validateTransistorReport(input:unknown):TransistorReport|null{
 if(!input||typeof input!=='object')return null;const r=input as TransistorReport;if(r.schemaVersion!==1||!['B2','B3'].includes(r.courseId)||!Number.isInteger(r.revision)||r.revision<0||!r.fields||!['group','objectives','theory','discussion'].every(key=>typeof r.fields[key as keyof typeof r.fields]==='string'&&String(r.fields[key as keyof typeof r.fields]).length<=4000)||!Array.isArray(r.fields.answers)||r.fields.answers.length!==3||r.fields.answers.some(v=>typeof v!=='string'||v.length>4000))return null;return r;
}
export function listenTransistorReport(uid:string,course:'B2'|'B3',receive:(report:TransistorReport)=>void,error:(message:string)=>void,empty?:()=>void){
 if(!transistorSyncEnabled)return()=>{};return onSnapshot(doc(db,'users',uid,'labProgress',course),{includeMetadataChanges:true},snapshot=>{if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;if(!snapshot.exists()){empty?.();return;}const data=snapshot.data(),report=validateTransistorReport({...data.report,updatedAt:data.updatedAt?.toDate?.()?.toISOString()});if(report)receive(report);else error('Báo cáo trên server không đúng cấu trúc; chưa khôi phục.');},e=>error(e.message));
}
/** Report metadata uses the existing labProgress parent. No duplicate result
 * table: all numerical rows remain exclusively in each lesson's cases. */
export async function saveTransistorReport(uid:string,input:TransistorReport){
 if(!transistorSyncEnabled)throw Error('Chưa bật lưu báo cáo Bài 2–3 trên Firebase.');if(auth.currentUser?.uid!==uid)throw Error('Phiên đăng nhập đã thay đổi.');const report=validateTransistorReport(input);if(!report)throw Error('Báo cáo không hợp lệ.');
 const ref=doc(db,'users',uid,'labProgress',report.courseId);
 const revision=await runTransaction(db,async transaction=>{if(auth.currentUser?.uid!==uid)throw Error('Phiên đăng nhập đã thay đổi.');const existing=await transaction.get(ref),current=existing.exists()?existing.data().revision:0;if(current!==report.revision)throw Error('REPORT_CONFLICT: Báo cáo đã được cập nhật trên máy khác. Tải lại bản server trước khi lưu.');const next=current+1;transaction.set(ref,{schemaVersion:1,courseId:report.courseId,uid,revision:next,report:{schemaVersion:1,courseId:report.courseId,revision:next,fields:report.fields},source:'CLIENT_SIMULATION',verifiedByTeacher:false,updatedAt:serverTimestamp()});return next;});return revision;
}
