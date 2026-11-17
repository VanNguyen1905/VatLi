import {useEffect,type RefObject} from 'react';
import {useAuthStore} from '@/stores';
import {auth} from '@/services/firebase/config';
import {connectSemiconductorProgress,isSemiconductorLesson,mergeSemiconductorRecords,readSemiconductorCache,writeSemiconductorCache,type SemiconductorLesson,type SemiconductorRecord} from './semiconductor-progress';
type NativeApi={records:()=>unknown;restore:(rows:SemiconductorRecord[])=>void;cloudState:(text:string)=>void;context:()=>{partId:string}};
type NativeWindow=Window&{labvirtSemiconductorSession?:NativeApi;labvirtDiagnostics?:()=>{frameVerified:boolean};labvirtSession?:{identify:(identity:object)=>void}};
export function SemiconductorAccountBridge({iframeRef,identity}:{iframeRef:RefObject<HTMLIFrameElement|null>;identity:object}){
 const user=useAuthStore(s=>s.user),demo=useAuthStore(s=>s.isDemo);
 useEffect(()=>{
  if(!user||demo)return;const uid=user.uid;let stopped=false,busy=false,current:NativeWindow|undefined;const restored=new WeakSet<NativeApi>();
  const sessions=new Map<SemiconductorLesson,{rows:SemiconductorRecord[];canonical:SemiconductorRecord[];connection:ReturnType<typeof connectSemiconductorProgress>;ready:boolean}>();
  const native=()=>{try{const target=iframeRef.current?.contentDocument?.querySelector<HTMLIFrameElement>('#labRuntime')?.contentWindow as NativeWindow|undefined;return target?.location.origin===location.origin&&target.location.pathname==='/labvirt/lab-v11/index.html'&&target.labvirtSemiconductorSession&&target.labvirtDiagnostics?.().frameVerified?target:undefined;}catch{return undefined;}};
  const publish=(lesson:SemiconductorLesson,text:string)=>{const session=sessions.get(lesson);if(!session||stopped)return;iframeRef.current?.contentWindow?.postMessage({type:'academy:semiconductor-state',uid,lessonId:lesson,records:session.rows,confirmed:session.canonical.map(row=>row.key),status:text},location.origin);};
  for(const lesson of ['B1_P2','B1_P3','B1_P4'] as const){
   const next={rows:readSemiconductorCache(uid,lesson),canonical:[] as SemiconductorRecord[],ready:false,connection:undefined as unknown as ReturnType<typeof connectSemiconductorProgress>};sessions.set(lesson,next);
   next.connection=connectSemiconductorProgress(uid,lesson,rows=>{if(stopped||auth.currentUser?.uid!==uid)return;next.canonical=mergeSemiconductorRecords(lesson,next.canonical,rows);const activeApi=current===native()&&current?.labvirtSemiconductorSession?.context().partId===lesson?current.labvirtSemiconductorSession:undefined;next.rows=mergeSemiconductorRecords(lesson,next.rows,activeApi?.records(),next.canonical);writeSemiconductorCache(uid,lesson,next.rows);publish(lesson,'Đã tải dữ liệu server');activeApi?.restore(next.rows);},text=>{publish(lesson,text);if(!stopped&&current===native()&&current?.labvirtSemiconductorSession?.context().partId===lesson)current.labvirtSemiconductorSession.cloudState(text);});
   void next.connection.ready.then(()=>{if(!stopped){next.ready=true;next.connection.append(next.rows);}}).catch(()=>{});
  }
  const request=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==iframeRef.current?.contentWindow||stopped||auth.currentUser?.uid!==uid)return;
   const summary=(session:{ready:boolean;rows:SemiconductorRecord[];canonical:SemiconductorRecord[]})=>session.ready&&session.rows.every(row=>session.canonical.some(saved=>saved.key===row.key))?'Đã tải Firebase · server xác nhận các số đo hiện có.':'Đang chờ server xác nhận; bản cục bộ được giữ.';
   if(event.data?.type==='labvirt:semiconductor-request')for(const [lesson,session]of sessions)publish(lesson,summary(session));
   if(event.data?.type==='labvirt:semiconductor-records'&&event.data.uid===uid&&isSemiconductorLesson(event.data.lessonId)){const lesson=event.data.lessonId,session=sessions.get(lesson);if(!session)return;session.rows=mergeSemiconductorRecords(lesson,session.rows,event.data.records,session.canonical);writeSemiconductorCache(uid,lesson,session.rows);publish(lesson,summary(session));if(session.ready)session.connection.append(session.rows);}
  };window.addEventListener('message',request);
  const tick=async()=>{
   if(stopped||busy||auth.currentUser?.uid!==uid||useAuthStore.getState().isLoading)return;const frame=native(),api=frame?.labvirtSemiconductorSession,lesson=api?.context().partId;
   if(!frame||!api||!isSemiconductorLesson(lesson))return;busy=true;
   try{
    current=frame;const session=sessions.get(lesson);if(!session)return;
    frame.labvirtSession?.identify(identity);
    const raw=api.records();session.rows=mergeSemiconductorRecords(lesson,session.rows,raw,session.canonical);writeSemiconductorCache(uid,lesson,session.rows);if(JSON.stringify(raw)!==JSON.stringify(session.rows))api.restore(session.rows);const confirmed=new Set(session.canonical.map(row=>row.key));publish(lesson,session.ready&&session.rows.every(row=>confirmed.has(row.key))?'Đã tải Firebase · số đo hiện có được server xác nhận.':'Số đo mô phỏng; chờ các trường hợp mới được server xác nhận.');
    if(session.ready){session.connection.append(session.rows);if(!restored.has(api)){restored.add(api);iframeRef.current?.contentWindow?.postMessage({type:'academy:runtime-restored',uid,lessonId:lesson},location.origin);}}
   }finally{busy=false;}
  };
  const timer=window.setInterval(()=>{void tick().catch(()=>{current?.labvirtSemiconductorSession?.cloudState('Chưa đồng bộ Firebase; dữ liệu cục bộ được giữ.');});},1000);
  return()=>{stopped=true;window.clearInterval(timer);window.removeEventListener('message',request);sessions.forEach(session=>session.connection.stop());};
 },[user,demo,iframeRef,identity]);
 return null;
}
