import {collection,doc,getDocFromServer,onSnapshot,serverTimestamp,setDoc} from 'firebase/firestore';
import {auth,db} from '@/services/firebase/config';
import {progressSyncEnabled} from './practice-progress';
import {validateRecords,toFirestoreRecord} from '../../../../public/labvirt/lab-v11/semiconductor-records.js';
export type SemiconductorLesson='B1_P2'|'B1_P3'|'B1_P4';
export type SemiconductorRecord={schemaVersion:1;lessonId:SemiconductorLesson;key:string;recordedAt:string;configuration:Record<string,unknown>;measurements:Record<string,unknown>;columns:string[];verifiedByTeacher:false;conclusion?:string};
export const isSemiconductorLesson=(value:unknown):value is SemiconductorLesson=>typeof value==='string'&&/^B1_P[234]$/.test(value);
export function validateSemiconductorRecords(value:unknown,lesson:SemiconductorLesson):SemiconductorRecord[]{
 return validateRecords(value,lesson) as SemiconductorRecord[];
}
export function mergeSemiconductorRecords(lesson:SemiconductorLesson,...sets:unknown[]){const merged=new Map<string,SemiconductorRecord>();for(const set of sets)for(const row of validateSemiconductorRecords(set,lesson))merged.set(row.key,row);return [...merged.values()].sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));}
const cacheKey=(uid:string,lesson:SemiconductorLesson)=>`labvirt-semiconductor-account-v1:${uid}:${lesson}`;
export function readSemiconductorCache(uid:string,lesson:SemiconductorLesson){try{const cached=JSON.parse(localStorage.getItem(cacheKey(uid,lesson))||'{}');return cached.uid===uid?validateSemiconductorRecords(cached.records,lesson):[];}catch{return [];}}
export function writeSemiconductorCache(uid:string,lesson:SemiconductorLesson,records:SemiconductorRecord[]){try{localStorage.setItem(cacheKey(uid,lesson),JSON.stringify({uid,lessonId:lesson,records:validateSemiconductorRecords(records,lesson)}));return true;}catch{return false;}}
export function connectSemiconductorProgress(uid:string,lesson:SemiconductorLesson,receive:(rows:SemiconductorRecord[])=>void,status:(text:string)=>void){
 let stopped=false,loaded=!progressSyncEnabled,resolveReady:()=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};const known=new Set<string>(),pending=new Set<string>(),canonical=new Map<string,SemiconductorRecord>();
 const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});void ready.catch(()=>{});if(loaded)resolveReady();
 const ref=collection(db,'users',uid,'labProgress',lesson,'cases');
 const stop=progressSyncEnabled?onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
  if(stopped)return;if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites){status('Đang chờ kết nối/xác nhận server; chưa xác nhận lưu Firebase.');return;}
  const rows=validateSemiconductorRecords(snapshot.docs.map(d=>d.data().record),lesson);rows.forEach(row=>{known.add(row.key);canonical.set(row.key,row);});receive(rows);loaded=true;resolveReady();status(rows.length?'Đã lưu Firebase · server xác nhận '+rows.length+' trường hợp.':'Đã tải Firebase · chưa có số đo.');
 },error=>{if(!stopped){rejectReady(new Error('SEMICONDUCTOR_CLOUD_LOAD_FAILED'));status('Chưa đồng bộ Firebase: '+error.message);}}):()=>{};
 return {ready,stop:()=>{stopped=true;stop();rejectReady(new Error('SEMICONDUCTOR_DISPOSED'));},append:(input:unknown)=>{
  if(stopped||!loaded||!progressSyncEnabled||auth.currentUser?.uid!==uid)return;
  for(const record of validateSemiconductorRecords(input,lesson)){
   if(known.has(record.key)||pending.has(record.key))continue;pending.add(record.key);status('Đang chờ server lưu '+lesson+'/'+record.key+'; bản cục bộ vẫn được giữ.');
   void setDoc(doc(ref,record.key),{record:toFirestoreRecord(record),lessonId:lesson,source:'CLIENT_SIMULATION',verifiedByTeacher:false,updatedAt:serverTimestamp()}).then(()=>{known.add(record.key);if(!stopped&&auth.currentUser?.uid===uid)status('Đã lưu Firebase · server xác nhận '+record.key);}).catch(async error=>{
    if(stopped||auth.currentUser?.uid!==uid)return;
    if(error.code==='permission-denied')try{const existing=await getDocFromServer(doc(ref,record.key)),rows=validateSemiconductorRecords([existing.data()?.record],lesson);if(!stopped&&auth.currentUser?.uid===uid&&rows.length===1&&rows[0].key===record.key){known.add(record.key);canonical.set(record.key,rows[0]);receive([...canonical.values()]);status('Dùng bản đã được server xác nhận; không ghi đè trường hợp trùng.');return;}}catch{/* No success without an authorized server acknowledgement. */}
    if(!stopped)status('Chưa lưu Firebase: '+error.message);
   }).finally(()=>pending.delete(record.key));
  }
 }};
}
export function listenSemiconductorCases(uid:string,lesson:SemiconductorLesson,receive:(rows:SemiconductorRecord[])=>void,error:(text:string)=>void){
 if(!progressSyncEnabled)return()=>{};
 return onSnapshot(collection(db,'users',uid,'labProgress',lesson,'cases'),{includeMetadataChanges:true},snapshot=>{if(!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites)receive(validateSemiconductorRecords(snapshot.docs.map(d=>d.data().record),lesson));},e=>error(e.message));
}
