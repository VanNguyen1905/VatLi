import {useEffect,useRef,type RefObject} from 'react';
import {useAuthStore} from '@/stores';
import {readLocalPractice,progressCore,type MeasurementRecord} from './practice-progress';
import {isSemiconductorLesson,mergeSemiconductorRecords,readSemiconductorCache,type SemiconductorRecord} from './semiconductor-progress';
import {isTransistorLesson,mergeTransistorCases,readTransistorCache,type TransistorRecord} from './transistor-progress';

type Api<T>={records:()=>unknown;restore:(records:T[])=>void};
type NativeWindow=Window&{
  labvirtDiagnostics?:()=>{frameVerified:boolean};
  labvirtSession?:Api<MeasurementRecord>&{identify:(identity:object)=>void};
  labvirtSemiconductorSession?:Api<SemiconductorRecord>;
  labvirtTransistorSession?:Api<TransistorRecord>;
};
/** Restore this UID's validated local records before reveal. Cloud bridges keep
 * syncing independently and never report server success from this local ACK. */
export function RuntimeEntryBridge({iframeRef,identity}:{iframeRef:RefObject<HTMLIFrameElement|null>;identity:object}){
  const uid=useAuthStore(s=>s.user?.uid),identityRef=useRef(identity);
  useEffect(()=>{identityRef.current=identity;},[identity]);
  useEffect(()=>{
    if(!uid)return;
    let stopped=false;
    const restoring=new WeakMap<object,Promise<void>>();
    const native=()=>{
      try{
        const frame=iframeRef.current?.contentDocument?.querySelector<HTMLIFrameElement>('#labRuntime')?.contentWindow as NativeWindow|undefined;
        return frame?.location.origin===location.origin&&frame.location.pathname==='/labvirt/lab-v11/index.html'&&frame.labvirtDiagnostics?.().frameVerified?frame:undefined;
      }catch{return undefined;}
    };
    const restore=async()=>{
      const studio=iframeRef.current?.contentWindow,frame=native();
      if(stopped||!frame||!studio||useAuthStore.getState().user?.uid!==uid)return;
      const query=new URLSearchParams(frame.location.search),lesson=query.get('lessonId')||'B1_P1',attempt=Number(query.get('attempt'));
      const current=()=>!stopped&&native()===frame&&Number(new URLSearchParams(frame.location.search).get('attempt'))===attempt&&useAuthStore.getState().user?.uid===uid;
      const api=isSemiconductorLesson(lesson)?frame.labvirtSemiconductorSession:isTransistorLesson(lesson)?frame.labvirtTransistorSession:frame.labvirtSession;
      if(!api||!Number.isInteger(attempt))return;
      let pending=restoring.get(api);
      if(!pending){
        pending=(async()=>{
          if(isSemiconductorLesson(lesson)){
            frame.labvirtSemiconductorSession?.restore(mergeSemiconductorRecords(lesson,readSemiconductorCache(uid,lesson),api.records()));
          }else if(isTransistorLesson(lesson)){
            frame.labvirtTransistorSession?.restore(mergeTransistorCases(lesson,readTransistorCache(uid,lesson),api.records()));
          }else{
            const [local,core]=await Promise.all([readLocalPractice(uid),progressCore()]);
            if(!current())return;
            frame.labvirtSession?.restore(core.mergeProgressRecords(local.records,api.records()));
          }
          if(current())frame.labvirtSession?.identify(identityRef.current);
        })();
        restoring.set(api,pending);
      }
      try{
        await pending;
        if(current()){
          studio.postMessage({type:'academy:runtime-local-ready',uid,lessonId:lesson,attempt,cloudConfirmed:false},location.origin);
        }
      }catch{
        restoring.delete(api);
        if(current())studio.postMessage({type:'academy:runtime-restore-error',uid,attempt,message:'Không khôi phục được bản đo trên thiết bị. Hãy thử mở lại phòng; dữ liệu hiện có được giữ nguyên.'},location.origin);
      }
    };
    const message=(event:MessageEvent)=>{if(event.origin===location.origin&&event.source===iframeRef.current?.contentWindow&&event.data?.type==='labvirt:runtime-ready')void restore();};
    window.addEventListener('message',message);void restore();
    return()=>{stopped=true;window.removeEventListener('message',message);};
  },[uid,iframeRef]);
  return null;
}
