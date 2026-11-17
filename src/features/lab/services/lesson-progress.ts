import {collection,doc,getDoc,getDocFromServer,onSnapshot,serverTimestamp,setDoc} from 'firebase/firestore';
import {onAuthStateChanged} from 'firebase/auth';
import {auth,db} from '@/services/firebase/config';
import {progressCore,progressSyncEnabled} from './practice-progress';

/** Extends users/{uid}/labProgress: steps and measurement cases have separate totals. */
export type LessonDefinition={lessonId:string;experimentId:string;practicalId:string;practicalIndex:number;totalSteps:number;source:'PREPARATION'|'CLIENT_SIMULATION'};
export type LessonProgress={lessonId:string;completedSteps:number[];completed:number;total:number;ready:boolean;pending:number;status:'loading'|'saved'|'pending'|'local'|'error';error?:string;verifiedByTeacher:false};
const idOk=(value:string)=>/^[A-Za-z0-9_-]{1,160}$/.test(value);
function validDefinition(value:LessonDefinition){return idOk(value.lessonId)&&idOk(value.experimentId)&&idOk(value.practicalId)&&Number.isInteger(value.totalSteps)&&value.totalSteps>0&&value.totalSteps<=50&&Number.isInteger(value.practicalIndex)&&value.practicalIndex>=0&&value.practicalIndex<50&&['PREPARATION','CLIENT_SIMULATION'].includes(value.source);}
export async function practiceStepDefinition():Promise<LessonDefinition>{return {lessonId:'B1_P1',experimentId:'L01',practicalId:'L01-P01',practicalIndex:0,totalSteps:(await progressCore()).PRACTICE_STEP_IDS.length,source:'CLIENT_SIMULATION'};}
export async function preparationStepDefinition(experimentId:string,practicalId:string):Promise<{definition:LessonDefinition;instructions:string[]}>{
  if(!idOk(experimentId)||!idOk(practicalId))throw Error('LESSON_INVALID');
  const snap=await getDoc(doc(db,'labExperiments',experimentId));const data=snap.data();
  const practicals=Array.isArray(data?.practicals)?data.practicals:[],index=practicals.findIndex(item=>item.id===practicalId),practical=practicals[index];
  if(!snap.exists()||data?.published!==true||index<0||!Array.isArray(practical?.instructions)||!practical.instructions.every((item:unknown)=>typeof item==='string'&&item.trim()))throw Error('LESSON_STEPS_NOT_PUBLISHED');
  const definition:LessonDefinition={lessonId:experimentId+'__'+practicalId,experimentId,practicalId,practicalIndex:index,totalSteps:practical.instructions.length,source:'PREPARATION'};
  if(!validDefinition(definition))throw Error('LESSON_STEPS_INVALID');return {definition,instructions:practical.instructions};
}
export function connectLessonSteps(uid:string,definition:LessonDefinition,receive:(progress:LessonProgress)=>void){
  if(!idOk(uid)||!validDefinition(definition)||auth.currentUser?.uid!==uid)throw Error('LESSON_SCOPE_INVALID');
  const storageKey=`labvirt:steps:v1:${uid}:${definition.lessonId}`,fingerprint=JSON.stringify(definition);
  const completed=new Set<number>(),known=new Set<number>(),writing=new Set<number>(),dirty=new Set<number>(),remotePending=new Set<number>();
  let stopped=false,hydrated=!progressSyncEnabled,error='',localWarning='',cacheWritable=true,stopSnapshot=()=>{},stopAuth=()=>{};
  const validIndex=(value:unknown):value is number=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<definition.totalSteps;
  function archive(raw:string){try{localStorage.setItem(storageKey+':unmatched:'+Date.now(),raw);}catch{cacheWritable=false;localWarning='Không tạo được bản sao cache cũ; cache cũ được giữ nguyên. Tiến độ mới vẫn được gửi Firebase khi có mạng.';}}
  let raw:string|null=null;
  try{raw=localStorage.getItem(storageKey);const local=JSON.parse(raw||'null');if(local?.uid===uid&&local.fingerprint===fingerprint&&Array.isArray(local.completedSteps)){for(const index of local.completedSteps)if(validIndex(index)){completed.add(index);dirty.add(index);}}else if(raw)archive(raw);}catch{if(raw)archive(raw);}
  const active=()=>!stopped&&auth.currentUser?.uid===uid;
  const persist=()=>{if(!cacheWritable)return;try{localStorage.setItem(storageKey,JSON.stringify({schemaVersion:1,uid,fingerprint,completedSteps:[...completed].sort((a,b)=>a-b)}));localWarning='';}catch{localWarning='Không lưu được bản dự phòng trên thiết bị. Giữ trang mở để chờ xác nhận lưu Firebase.';}};
  const emit=()=>{
    if(!active())return;
    const pending=progressSyncEnabled?[...completed].filter(index=>!known.has(index)).length:0;
    const status=error||(!progressSyncEnabled&&localWarning)?'error':!hydrated?'loading':!progressSyncEnabled?'local':pending?'pending':'saved';
    receive({lessonId:definition.lessonId,completedSteps:[...completed].sort((a,b)=>a-b),completed:completed.size,total:definition.totalSteps,ready:hydrated,pending,status,...((error||localWarning)?{error:error||localWarning}:{}),verifiedByTeacher:false});
  };
  const ref=collection(db,'users',uid,'labProgress',definition.lessonId,'steps');
  function validRow(data:Record<string,unknown>|undefined,index:number){return data?.schemaVersion===1&&data.stepIndex===index&&data.completed===true&&Object.entries(definition).every(([key,value])=>data[key]===value)&&data.verifiedByTeacher===false;}
  function flush(){
    if(!active()||!hydrated||!progressSyncEnabled||error)return;
    for(const index of dirty){if(known.has(index)||writing.has(index)||remotePending.has(index))continue;writing.add(index);
      const target=doc(ref,'step_'+index);
      void setDoc(target,{schemaVersion:1,...definition,stepIndex:index,completed:true,verifiedByTeacher:false,updatedAt:serverTimestamp()}).then(()=>{if(!active())return;known.add(index);dirty.delete(index);persist();emit();}).catch(async failure=>{
        if(!active())return;
        if(failure.code==='permission-denied')try{const existing=await getDocFromServer(target);if(!active())return;if(existing.exists()&&validRow(existing.data(),index)){known.add(index);dirty.delete(index);emit();return;}}catch{/* Report the original rejection; never silently discard unsaved local progress. */}
        if(active()){error='Chưa lưu được tiến độ Firebase. Dữ liệu trên máy vẫn được giữ; hãy kiểm tra kết nối hoặc quyền truy cập.';emit();}
      }).finally(()=>writing.delete(index));
    }
  }
  function listen(){stopSnapshot=onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
    if(!active())return;
    remotePending.clear();
    for(const item of snapshot.docs){const data=item.data(),index=data.stepIndex;if(validIndex(index)&&item.id==='step_'+index&&validRow(data,index)&&data.completed===true){completed.add(index);if(item.metadata.hasPendingWrites)remotePending.add(index);else{known.add(index);dirty.delete(index);}}}
    if(!snapshot.metadata.fromCache){hydrated=true;error='';}
    persist();emit();flush();
  },()=>{if(active()){error='Không tải được tiến độ Firebase. Chưa xác nhận tiến độ trên tài khoản; không ghi trạng thái mặc định đè dữ liệu.';emit();}});}
  if(progressSyncEnabled)listen();
  const stop=()=>{if(stopped)return;stopped=true;stopSnapshot();stopAuth();};
  stopAuth=onAuthStateChanged(auth,user=>{if(user?.uid!==uid)stop();});emit();
  return {stop,complete:(indices:number[])=>{
    if(!active())return;
    if(!Array.isArray(indices)||!indices.every(validIndex))throw Error('LESSON_STEP_INVALID');
    let changed=false;for(const index of indices)if(!completed.has(index)){completed.add(index);dirty.add(index);changed=true;}if(!changed)return;persist();emit();flush();
  },retry:()=>{if(!active())return;error='';if(progressSyncEnabled){stopSnapshot();listen();}emit();flush();}};
}
