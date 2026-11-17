import {useEffect,type RefObject} from 'react';
import {useAuthStore} from '@/stores';
import {auth} from '@/services/firebase/config';
import {TRANSISTOR_LESSON_IDS,connectTransistorProgress,isTransistorLesson,mergeTransistorCases,readTransistorCache,writeTransistorCache,transistorSyncEnabled,listenTransistorReport,saveTransistorReport,validateTransistorReport,type TransistorLesson,type TransistorRecord,type TransistorReport} from './transistor-progress';
type NativeApi={records:()=>unknown;restore:(rows:TransistorRecord[])=>void;cloudState:(text:string)=>void;context:()=>{lessonId:string}};
type NativeWindow=Window&{labvirtTransistorSession?:NativeApi;labvirtDiagnostics?:()=>{frameVerified:boolean};labvirtSession?:{identify:(identity:object)=>void}};
export function TransistorAccountBridge({iframeRef,identity}:{iframeRef:RefObject<HTMLIFrameElement|null>;identity:object}){
 const user=useAuthStore(s=>s.user),demo=useAuthStore(s=>s.isDemo);
 useEffect(()=>{
  if(!user||demo)return;const uid=user.uid;let stopped=false,current:NativeWindow|undefined;const restored=new WeakSet<NativeApi>(),sent=new Map<string,string>(),reportStops:(()=>void)[]=[],reports=new Map<string,TransistorReport>();
  const sessions=new Map<TransistorLesson,{rows:TransistorRecord[];canonical:TransistorRecord[];ready:boolean;connection:ReturnType<typeof connectTransistorProgress>}>();
  const native=()=>{try{const frame=iframeRef.current?.contentDocument?.querySelector<HTMLIFrameElement>('#labRuntime')?.contentWindow as NativeWindow|undefined;return frame?.location.origin===location.origin&&frame.location.pathname==='/labvirt/lab-v11/index.html'&&frame.labvirtTransistorSession&&frame.labvirtDiagnostics?.().frameVerified?frame:undefined;}catch{return undefined;}};
  const send=(key:string,data:object)=>{if(stopped||auth.currentUser?.uid!==uid)return;const text=JSON.stringify(data);if(sent.get(key)===text)return;sent.set(key,text);iframeRef.current?.contentWindow?.postMessage(data,location.origin);};
  const message=(lesson:TransistorLesson)=>{const s=sessions.get(lesson);if(!transistorSyncEnabled)return'Chưa bật đồng bộ Bài 2–3; bản dự phòng được giữ theo UID.';return s?.ready&&s.rows.every(row=>s.canonical.some(c=>c.key===row.key))?'Firebase đã xác nhận các trường hợp hiện có.':'Đang chờ server xác nhận; chưa tính hoàn thành cloud.';};
  const publish=(lesson:TransistorLesson,text=message(lesson))=>{const s=sessions.get(lesson);if(s)send(lesson,{type:'academy:transistor-state',uid,lessonId:lesson,records:s.rows,confirmed:s.canonical.map(r=>r.key),enabled:transistorSyncEnabled,status:text});};
  for(const lesson of TRANSISTOR_LESSON_IDS){
   const next={rows:readTransistorCache(uid,lesson),canonical:[] as TransistorRecord[],ready:false,connection:undefined as unknown as ReturnType<typeof connectTransistorProgress>};sessions.set(lesson,next);
   next.connection=connectTransistorProgress(uid,lesson,rows=>{if(stopped||auth.currentUser?.uid!==uid)return;next.canonical=rows;const api=current===native()&&current?.labvirtTransistorSession?.context().lessonId===lesson?current.labvirtTransistorSession:undefined;next.rows=mergeTransistorCases(lesson,next.rows,api?.records(),rows);writeTransistorCache(uid,lesson,next.rows);api?.restore(next.rows);publish(lesson);},text=>{publish(lesson,text);if(current===native()&&current?.labvirtTransistorSession?.context().lessonId===lesson)current.labvirtTransistorSession.cloudState(text);});
   void next.connection.ready.then(()=>{if(stopped)return;next.ready=true;next.connection.append(next.rows);publish(lesson);}).catch(()=>{});
  }
  for(const course of ['B2','B3'] as const)reportStops.push(listenTransistorReport(uid,course,report=>{if(stopped||auth.currentUser?.uid!==uid)return;reports.set(course,report);send('report'+course,{type:'academy:transistor-report-state',uid,courseId:course,report,status:'Đã tải báo cáo từ server.',confirmed:true});},status=>send('report-error'+course,{type:'academy:transistor-report-state',uid,courseId:course,status,confirmed:false})));
  const onMessage=(event:MessageEvent)=>{
   if(stopped||event.origin!==location.origin||event.source!==iframeRef.current?.contentWindow||auth.currentUser?.uid!==uid)return;const data=event.data;
   if(data?.type==='labvirt:transistor-request'){sent.clear();for(const lesson of TRANSISTOR_LESSON_IDS)publish(lesson);for(const [course,report]of reports)send('report'+course,{type:'academy:transistor-report-state',uid,courseId:course,report,status:'Đã tải báo cáo từ server.',confirmed:true});}
   if(data?.type==='labvirt:transistor-records'&&data.uid===uid&&isTransistorLesson(data.lessonId)){const lesson=data.lessonId,s=sessions.get(lesson);if(!s)return;s.rows=mergeTransistorCases(lesson,s.rows,data.records,s.canonical);writeTransistorCache(uid,lesson,s.rows);publish(lesson);if(s.ready)s.connection.append(s.rows);}
   if(data?.type==='labvirt:transistor-save-report'&&data.uid===uid){const report=validateTransistorReport(data.report);if(!report)return;send('report-save'+report.courseId,{type:'academy:transistor-report-state',uid,courseId:report.courseId,status:'Đang chờ server lưu báo cáo; chưa thông báo thành công.',confirmed:false});void saveTransistorReport(uid,report).then(revision=>{if(!stopped)send('report-save'+report.courseId,{type:'academy:transistor-report-state',uid,courseId:report.courseId,report:{...report,revision},status:'Đã lưu Firebase · server xác nhận báo cáo phiên bản '+revision,confirmed:true});}).catch(error=>send('report-save'+report.courseId,{type:'academy:transistor-report-state',uid,courseId:report.courseId,status:error instanceof Error?error.message:'Chưa lưu được báo cáo. Bản nháp được giữ.',confirmed:false}));}
  };window.addEventListener('message',onMessage);
  const tick=()=>{
   if(stopped||auth.currentUser?.uid!==uid||useAuthStore.getState().isLoading)return;const frame=native(),api=frame?.labvirtTransistorSession,lesson=api?.context().lessonId;if(!frame||!api||!isTransistorLesson(lesson))return;current=frame;const s=sessions.get(lesson);if(!s)return;
   frame.labvirtSession?.identify(identity);const raw=api.records();s.rows=mergeTransistorCases(lesson,s.rows,raw,s.canonical);writeTransistorCache(uid,lesson,s.rows);if(JSON.stringify(raw)!==JSON.stringify(s.rows))api.restore(s.rows);publish(lesson);api.cloudState(message(lesson));
   if(s.ready){s.connection.append(s.rows);if(!restored.has(api)){restored.add(api);iframeRef.current?.contentWindow?.postMessage({type:'academy:runtime-restored',uid,lessonId:lesson},location.origin);}}
  };
  const timer=window.setInterval(()=>{try{tick();}catch{current?.labvirtTransistorSession?.cloudState('Chưa đồng bộ; bản dự phòng được giữ.');}},1000);
  return()=>{stopped=true;window.clearInterval(timer);window.removeEventListener('message',onMessage);sessions.forEach(s=>s.connection.stop());reportStops.forEach(stop=>stop());};
 },[user,demo,iframeRef,identity]);
 return null;
}
