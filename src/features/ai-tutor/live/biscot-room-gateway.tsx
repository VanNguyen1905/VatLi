import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { askBiscotGemini, type BiscotMessage } from '@/features/ai-tutor/live/biscot-knowledge-service';
import type { LabLiveContext } from './lab-live-context';
import { connectPracticeProgress, progressCore, readLocalPractice, storeLocalPractice, type MeasurementRecord, type PracticeActivity } from '@/features/lab/services/practice-progress';
import {biscotErrorMessage} from '@/services/firebase/biscot-error';
import {connectLessonSteps,practiceStepDefinition} from '@/features/lab/services/lesson-progress';
import {useRosterIdentity} from '@/features/lab/services/use-roster-identity';

/**
 * Cổng nối bảo mật giữa AI Biscot của website chính và cửa sổ LABVIRT 3D.
 * - Không nhúng API key, không sao chép đối tượng đăng nhập sang iframe.
 * - Chỉ tiếp nhận đúng runtime lab-v11 cùng origin và route bài thực hành.
 * - Trạng thái lấy bằng cách đọc trực tiếp API chẩn đoán, không tin payload do iframe tự kê khai.
 * - Không chạy công cụ, không ghi Firestore, không tác động phép đo.
 */
type RuntimeDiagnostics = {
  learningMode?:string;
  nominalValue?:number;tolerancePercent?:number;
  lessonId?:string;total?:number;
  modelsLoaded?: boolean; frameVerified?: boolean; component?: string; defect?: string;
  mode?: string; redPin?: string | null; blackPin?: string | null;
  redJack?: string; blackJack?: string; lcd?: string;
  validMeasure?: boolean; reason?: string; completed?: number;
  measurementStatus?: string; boardMounted?: boolean; powered?:boolean;
  dirty?:boolean;measurementQuantity?:string;measurementValue?:number;measurementConclusion?:string;
  transistor?:{target?:string;issue?:string;ledCurrent?:number;lux?:number;potResistance?:number;result?:{mode?:string;devices?:Record<string,{region?:string}>};scr?:{latched?:boolean;button?:boolean}};
};
const STUDIO_PATHS = new Set(['/roadmap','/experiments','/my-practices','/lab-reports','/module-1']);
const safeText = (x: unknown, max = 100) => typeof x === 'string' ? x.slice(0, max) : undefined;

function verifiedFrame(source: MessageEventSource | null): source is Window {
  if (!source || !('location' in source)) return false;
  try {
    const child = source as Window;
    return child.location.origin === window.location.origin
      && child.location.pathname === '/labvirt/lab-v11/index.html'
      && document.querySelector<HTMLIFrameElement>('.labvirt-portal-frame')?.contentDocument?.querySelector<HTMLIFrameElement>('#labRuntime')?.contentWindow === child
      && typeof (child as Window & { labvirtDiagnostics?: unknown }).labvirtDiagnostics === 'function';
  } catch { return false; }
}
function deriveAction(raw: RuntimeDiagnostics): string {
  if(raw.modelsLoaded!==true || raw.frameVerified!==true)return 'SCENE_NOT_READY';
  if(raw.mode==='HFE'&&raw.validMeasure===true)return'MEASUREMENT_VALID';
  if(raw.boardMounted!==true)return 'PLACE_ON_BREADBOARD';
  if(raw.blackJack!=='COM')return 'CONNECT_BLACK_COM';
  if(raw.redJack!=='VOHM'&&!(raw.mode==='DCA'&&raw.redJack==='AMP'))return 'CONNECT_RED_VOHM';
  if(raw.mode==='OFF')return 'SELECT_MODE';
  if(!raw.blackPin)return 'TOUCH_BLACK';
  if(!raw.redPin)return 'TOUCH_RED';
  if(raw.redPin===raw.blackPin)return 'DIFFERENT_PINS';
  if(raw.validMeasure!==true)return 'CHECK_MEASUREMENT';
  return 'MEASUREMENT_VALID';
}
function readTelemetry(source: Window): LabLiveContext | null {
  try {
    const get = (source as Window & {labvirtDiagnostics?: () => RuntimeDiagnostics}).labvirtDiagnostics;
    const raw = get?.();
    if (!raw || typeof raw !== 'object') return null;
    return {
      source: 'labvirt-v8', lessonId: /^B(?:1_P[1234]|2_P[123]|3_P[1234])$/.test(raw.lessonId||'')?raw.lessonId:'B1_P1', screen: 'practice', stepId:deriveAction(raw),
      task:raw.transistor?safeText(`Đo ${raw.transistor.target||''}; ${Object.values(raw.transistor.result?.devices||{})[0]?.region||''}; ${raw.transistor.issue||''}; LED=${((raw.transistor.ledCurrent||0)*1000).toFixed(3)}mA; lux=${raw.transistor.lux??''}; Rpot=${raw.transistor.potResistance??''}`,120):undefined,
      selectedComponent: safeText(raw.component,20), componentDefect:safeText(raw.defect,20),
      mode:safeText(raw.mode,20), redJack:safeText(raw.redJack,20), blackJack:safeText(raw.blackJack,20),
      redPin:raw.redPin === null ? null : safeText(raw.redPin,30),
      blackPin:raw.blackPin === null ? null : safeText(raw.blackPin,30),
      lcd:safeText(raw.lcd,60), lcdState:safeText(raw.measurementStatus,80),
      measurementValid:raw.validMeasure === true,boardMounted:raw.boardMounted===true,
      powered:raw.powered===true,
      measurementReason:safeText(raw.reason,80),
      learningMode:raw.learningMode==='DEMO'?'DEMO':'SELF_PRACTICE',
      measurementValue:Number.isFinite(raw.measurementValue)?raw.measurementValue:undefined,
      nominalValue:Number.isFinite(raw.nominalValue)?raw.nominalValue:undefined,
      tolerancePercent:Number.isFinite(raw.tolerancePercent)?raw.tolerancePercent:undefined,
      sceneReady:raw.modelsLoaded === true && raw.frameVerified === true,
      completed:Number.isInteger(raw.completed) && raw.completed! >= 0 && raw.completed! <= 18 ? raw.completed : undefined,
      total:typeof raw.total==='number'&&[2,4,6,9,11,18].includes(raw.total)?raw.total:18,
    };
  } catch { return null; }
}

export function BiscotRoomGateway() {
  const pathname = useLocation().pathname;
  const user = useAuthStore(s => s.user);
  const demo = useAuthStore(s => s.isDemo);
  const profile=useAuthStore(s=>s.profile);
  const roster=useRosterIdentity(user?.uid||'guest');
  const historyRef = useRef(new WeakMap<Window, BiscotMessage[]>());
  const busyRef = useRef(new WeakSet<Window>());

  useEffect(() => {
    historyRef.current=new WeakMap();busyRef.current=new WeakSet();
    if (!STUDIO_PATHS.has(pathname)) return;
    let disposed=false;
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || !verifiedFrame(event.source)) return;
      const data: unknown = event.data;
      if (!data || typeof data !== 'object') return;
      const payload = data as Record<string, unknown>;
      if (payload.type === 'biscot:room-ping') {
        try { event.source.postMessage({type:'biscot:room-ready',enabled:!!user && !demo,scope:user&&!demo?user.uid:null},window.location.origin); } catch { /* Frame đã đóng */ }
        return;
      }
      if (payload.type !== 'biscot:room-question' || typeof payload.id !== 'string'
          || !/^br12-\d{1,8}$/.test(payload.id) || typeof payload.question !== 'string') return;
      const source = event.source;
      const question = payload.question.trim();
      if (question.length === 0 || question.length > 900) return;
      const id = payload.id;
      const reply = (ok: boolean, text: string) => {
        try { source.postMessage({ type:'biscot:room-answer', id, ok, text:text.slice(0,12000) }, window.location.origin); } catch { /* Frame đã đóng */ }
      };
      if (!user || demo) { reply(false, 'Cần đăng nhập tài khoản Firebase thật để hỏi Biscot trực tuyến. Hướng dẫn theo trạng thái DMM vẫn hoạt động.'); return; }
      if (busyRef.current.has(source)) { reply(false, 'Biscot đang xử lý một câu hỏi khác.'); return; }
      const lab = readTelemetry(source);
      if (!lab || !lab.sceneReady) { reply(false, 'Phòng 3D chưa báo trạng thái sẵn sàng, hãy chờ tải xong.'); return; }
      busyRef.current.add(source);
      const previous = historyRef.current.get(source) ?? [];
      void askBiscotGemini(user, question, previous, {lab,labIsLive:true})
        .then(result => {
          const next: BiscotMessage[] = [...previous, {role:'user' as const,text:question}, {role:'assistant' as const,text:result}].slice(-6);
          if(disposed)return;
          historyRef.current.set(source,next);
          reply(true,result);
        })
        .catch(err => {
          if(disposed)return;
          reply(false,biscotErrorMessage(err));
        })
        .finally(() => busyRef.current.delete(source));
    }
    window.addEventListener('message', onMessage);
    return () => {disposed=true;window.removeEventListener('message', onMessage);};
  }, [pathname, user, demo]);

  useEffect(()=>{
    if(!user||demo||!STUDIO_PATHS.has(pathname))return;
    const uid=user.uid;let stopped=false,frame:Window|null=null,rows:MeasurementRecord[]=[],activity:PracticeActivity={},last='',lastAt=Date.now(),initialized=false;
    let detachSave=()=>{};
    type Runtime=Window&{labvirtSession?:{records:()=>MeasurementRecord[];restore:(records:MeasurementRecord[])=>void;identify:(identity:object)=>void;activity:(activity:PracticeActivity)=>void}};
    const warn=(message:string)=>console.warn('[LABVIRT progress]',message);
    const localReady=readLocalPractice(uid).then(async local=>{const core=await progressCore();if(stopped)return;rows=core.mergeProgressRecords(local.records,rows);activity=local.activity;});
    let steps:ReturnType<typeof connectLessonSteps>|undefined;
    void practiceStepDefinition().then(definition=>{if(!stopped)steps=connectLessonSteps(uid,definition,()=>{});}).catch(error=>warn(String(error)));
    const connection=connectPracticeProgress(uid,remote=>{
      return localReady.then(async()=>{
        if(stopped)return;const core=await progressCore();if(stopped)return;
        rows=core.mergeProgressRecords(rows,remote);
        const local=await storeLocalPractice(uid,rows,activity);if(stopped)return;
        rows=core.mergeProgressRecords(rows,local.records);last='';
        if(frame)(frame as Runtime).labvirtSession?.restore(rows);
      }).catch(error=>warn(String(error)));
    },warn);
    const ready=Promise.all([localReady,connection.ready]).then(()=>{if(!stopped)initialized=true;}).catch(error=>{if(!stopped)warn(String(error));});
    async function capture(){
      await ready;if(stopped||!initialized)return;
      const child=document.querySelector<HTMLIFrameElement>('.labvirt-portal-frame')?.contentDocument?.querySelector<HTMLIFrameElement>('#labRuntime')?.contentWindow;
      if(!child||!verifiedFrame(child))return;
      const runtime=child as Runtime,api=runtime.labvirtSession;if(!api)return;
      if(/^B(?:1_P[234]|2_P[123]|3_P[1234])$/.test(new URLSearchParams(child.location.search).get('lessonId')||'')){detachSave();frame=null;return;}
      const core=await progressCore();if(stopped)return;
      if(frame!==child){
        detachSave();
        frame=child;
        rows=core.mergeProgressRecords(rows,structuredClone(api.records()));api.restore(rows);
        // Identity is from the authenticated profile. Missing class remains unconfirmed.
        api.identify(roster?.identity??{fullName:profile?.displayName||user?.displayName||'',studentCode:profile?.studentCode||'',className:''});
        // Read the real runtime records after its save handler, without changing the solver.
        const runtimeDocument=child.document;
        const onSave=(event:Event)=>{if((event.target as Element|null)?.closest('#saveBtn'))void capture().catch(error=>warn(String(error)));};
        runtimeDocument.addEventListener('click',onSave);
        detachSave=()=>runtimeDocument.removeEventListener('click',onSave);
      }
      const context=readTelemetry(child),now=Date.now();
      const raw=(child as Runtime&{labvirtDiagnostics:()=>RuntimeDiagnostics}).labvirtDiagnostics();
      // Demo actions never award steps, activity time or evidence to the student.
      if(raw.learningMode==='DEMO'){lastAt=now;return;}
      steps?.complete(core.completedPracticeSteps({ready:context?.sceneReady===true,acted:raw.dirty===true||rows.length>0,component:raw.component,defect:raw.defect,mode:raw.mode,powered:raw.powered,blackJack:raw.blackJack,redJack:raw.redJack,black:raw.blackPin,red:raw.redPin,measurement:{valid:raw.validMeasure===true,quantity:raw.measurementQuantity},finishedRecords:rows.length}));
      if(context?.sceneReady&&!document.hidden){
        activity.activeMs=(activity.activeMs||0)+Math.min(now-lastAt,5000);
        activity.currentCase=`${context.selectedComponent}:${context.componentDefect}`;
        activity.startedCases=[...new Set([...(activity.startedCases||[]),activity.currentCase])];
      }
      lastAt=now;
      rows=core.mergeProgressRecords(rows,structuredClone(api.records()));api.activity(activity);
      const signature=JSON.stringify([rows,Math.floor((activity.activeMs||0)/10000),activity.currentCase,activity.helpCount,activity.errors]);
      if(signature===last)return;last=signature;
      await storeLocalPractice(uid,rows,activity);
      await connection.append(rows);
    }
    function onActivity(event:MessageEvent){
      const studio=document.querySelector<HTMLIFrameElement>('.labvirt-portal-frame')?.contentWindow;
      if(event.origin===location.origin&&event.source===studio&&event.data?.type==='labvirt:runtime-ready'){
        void capture().then(()=>{if(!stopped&&initialized)studio?.postMessage({type:'academy:runtime-restored',uid},location.origin);}).catch(error=>warn(String(error)));
        return;
      }
      if(event.origin!==location.origin||!verifiedFrame(event.source)||event.data?.type!=='biscot:practice-help')return;
      activity.helpCount=Math.min(100000,(activity.helpCount||0)+1);
      const reason=readTelemetry(event.source)?.measurementReason;
      if(reason&&/^[A-Z_]{1,50}$/.test(reason)){activity.errors={...activity.errors,[reason]:(activity.errors?.[reason]||0)+1};}
    }
    window.addEventListener('message',onActivity);
    const timer=window.setInterval(()=>{void capture().catch(error=>warn(String(error)));},2000);
    return()=>{stopped=true;detachSave();connection.stop();steps?.stop();window.clearInterval(timer);window.removeEventListener('message',onActivity);};
  },[user,demo,pathname,profile,roster]);
  return null;
}
