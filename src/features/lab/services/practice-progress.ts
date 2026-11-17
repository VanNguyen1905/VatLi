import { collection, doc, getDocFromServer, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/services/firebase/config';

export type MeasurementRecord={key:string;component:string;defect:string;recordedAt:string;columns:string[];configuration:Record<string,unknown>;[key:string]:unknown};
export type PracticeActivity={startedCases?:string[];currentCase?:string|null;activeMs?:number;helpCount?:number;errors?:Record<string,number>};
export type PracticeSummary={lessonId:string;total:number;completed:number;remaining:number;percent:number;startedCases:string[];currentCase:string|null;activeMs:number;helpCount:number;errors:Record<string,number>;verifiedByTeacher:false;updatedAt?:string;records?:MeasurementRecord[]};
type ProgressCore={mergeProgressRecords:(...sets:unknown[])=>MeasurementRecord[];progressSummary:(records:unknown,activity?:PracticeActivity)=>PracticeSummary;progressStorageKey:(uid:string)=>string;PRACTICE_STEP_IDS:readonly string[];completedPracticeSteps:(context:Record<string,unknown>)=>number[]};
let corePromise:Promise<ProgressCore>|undefined;
const memory=new Map<string,{records:MeasurementRecord[];activity:PracticeActivity;localWarning?:string}>();
const canonical=new Map<string,MeasurementRecord[]>();
export function progressCore():Promise<ProgressCore>{
  const path=new URL('/labvirt/lab-v11/lab-progress-core.js',window.location.origin).href;
  return corePromise??=import(/* @vite-ignore */path).catch(error=>{corePromise=undefined;throw error;});
}
// Production sync is opt-in, after the corresponding rules have been reviewed and deployed.
export const progressSyncEnabled=import.meta.env.VITE_USE_FIREBASE_EMULATOR==='true'||import.meta.env.VITE_LAB_PROGRESS_SYNC==='true';
export async function readLocalPractice(uid:string){
  const core=await progressCore();
  let raw:{uid?:string;records?:unknown;activity?:PracticeActivity}={};
  try{raw=JSON.parse(localStorage.getItem(core.progressStorageKey(uid))||'{}')||{};}catch{/* Cloud remains usable if storage is blocked. */}
  const mismatched=!!raw.uid&&raw.uid!==uid;
  if(mismatched)raw={};
  const cached=memory.get(uid),records=core.mergeProgressRecords(raw.records,cached?.records,canonical.get(uid));
  const server=new Map((canonical.get(uid)??[]).map(row=>[row.key,row]));
  const merged=records.map(row=>server.get(row.key)??row);
  return {records:merged,activity:core.progressSummary(merged,cached?.activity??raw.activity),localWarning:mismatched?'Bản cục bộ không khớp tài khoản; không nhập dữ liệu này.':cached?.localWarning};
}
export async function storeLocalPractice(uid:string,records:unknown,activity:PracticeActivity={},fromServer=false){
  const core=await progressCore();
  let previous:{uid?:string;records?:unknown;activity?:PracticeActivity}={};
  try{previous=JSON.parse(localStorage.getItem(core.progressStorageKey(uid))||'{}')||{};}catch{/* Rebuild corrupt local storage from valid incoming rows. */}
  if(previous.uid&&previous.uid!==uid)previous={};
  if(fromServer)canonical.set(uid,core.mergeProgressRecords(records));
  const server=new Map((canonical.get(uid)??[]).map(row=>[row.key,row]));
  const cached=memory.get(uid),valid=core.mergeProgressRecords(previous.records,cached?.records,records).map(row=>server.get(row.key)??row),prior=core.progressSummary(previous.records,previous.activity);
  const summary=core.progressSummary(valid,{...prior,...activity,activeMs:Math.max(prior.activeMs,activity.activeMs||0),helpCount:Math.max(prior.helpCount,activity.helpCount||0),startedCases:[...prior.startedCases,...(activity.startedCases||[])]});
  let localWarning='';
  try{
    const key=core.progressStorageKey(uid),raw=localStorage.getItem(key);
    if(raw&&!localStorage.getItem(key+':before-cloud-v2'))localStorage.setItem(key+':before-cloud-v2',raw);
    localStorage.setItem(key,JSON.stringify({schemaVersion:2,uid,records:valid,activity:summary,updatedAt:new Date().toISOString()}));
  }catch{localWarning='Không lưu được bản dự phòng trên thiết bị; dữ liệu vẫn có thể lưu Firebase khi có mạng.';}
  memory.set(uid,{records:valid,activity:summary,localWarning});
  window.dispatchEvent(new CustomEvent('labvirt:practice-updated',{detail:{uid,completed:valid.length}}));
  return {records:valid,summary,localWarning};
}
/** Append-only case documents avoid one offline device overwriting another device's table. */
export function connectPracticeProgress(uid:string,receive:(rows:MeasurementRecord[])=>void|Promise<void>,onError:(message:string)=>void){
  const known=new Set<string>(),pending=new Set<string>();let stopped=false;
  let loaded=!progressSyncEnabled,resolveReady:()=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};
  const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});void ready.catch(()=>{});
  if(loaded)resolveReady();
  const ref=collection(db,'users',uid,'labProgress','B1_P1','cases');
  const stop=progressSyncEnabled?onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
    void progressCore().then(async core=>{
      if(stopped)return;
      const records=core.mergeProgressRecords(snapshot.docs.map(d=>d.data().record));
      if(!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites)canonical.set(uid,records);
      if(!snapshot.metadata.hasPendingWrites)records.forEach(record=>known.add(record.key.replace(':','_')));await receive(records);
      if(!stopped&&!snapshot.metadata.fromCache){loaded=true;resolveReady();}
    }).catch(error=>{if(!stopped){rejectReady(new Error('PROGRESS_LOAD_FAILED'));onError(String(error));}});
  },error=>{if(!stopped){rejectReady(new Error('PROGRESS_LOAD_FAILED'));onError(error.message);}}):()=>{};
  return {ready,stop:()=>{stopped=true;stop();rejectReady(new Error('PROGRESS_DISPOSED'));},append:async(records:MeasurementRecord[])=>{
    if(stopped||!loaded||!progressSyncEnabled||auth.currentUser?.uid!==uid)return;
    const core=await progressCore();
    if(stopped||auth.currentUser?.uid!==uid)return;
    for(const record of core.mergeProgressRecords(records)){
      const id=record.key.replace(':','_');if(known.has(id)||pending.has(id))continue;
      pending.add(id);
      // Do not await the Firestore offline queue: the local table remains usable offline.
      void setDoc(doc(ref,id),{record,lessonId:'B1_P1',source:'CLIENT_SIMULATION',verifiedByTeacher:false,updatedAt:serverTimestamp()})
        .then(()=>known.add(id)).catch(async error=>{
          if(stopped)return;
          // Another offline client may have created this immutable case first.
          // A permission failure is only reconciled after an authorized server read.
          if(error.code==='permission-denied'){
            try{const existing=await getDocFromServer(doc(ref,id)),rows=core.mergeProgressRecords([existing.data()?.record]);
              if(existing.exists()&&rows.length===1&&rows[0].key===record.key){known.add(id);if(!stopped)receive(rows);return;}
            }catch{/* Preserve the original write failure when a server read cannot verify it. */}
          }
          if(!stopped)onError(error.message);
        }).finally(()=>pending.delete(id));
    }
  }};
}
export function listenPracticeCases(uid:string,receive:(summary:PracticeSummary)=>void,onError:(message:string)=>void){
  if(!progressSyncEnabled)return ()=>{};
  let stopped=false;
  const stop=onSnapshot(collection(db,'users',uid,'labProgress','B1_P1','cases'),{includeMetadataChanges:true},snapshot=>{
    if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
    void progressCore().then(core=>{
      if(stopped)return;
      const updatedAt=snapshot.docs.map(d=>d.data().updatedAt?.toDate?.()?.toISOString()||'').sort().slice(-1)[0];
      const records=core.mergeProgressRecords(snapshot.docs.map(d=>d.data().record));
      receive({...core.progressSummary(records),updatedAt,records});
    }).catch(error=>{if(!stopped)onError(String(error));});
  },error=>{if(!stopped)onError(error.message);});
  return()=>{stopped=true;stop();};
}
