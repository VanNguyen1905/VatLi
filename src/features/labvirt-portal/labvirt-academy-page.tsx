import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, Info, ExternalLink } from 'lucide-react';
import { useAuthStore } from '@/stores';
import './labvirt-portal.css';
import { readLocalPractice,progressSyncEnabled,connectPracticeProgress,storeLocalPractice,listenPracticeCases,type PracticeSummary } from '@/features/lab/services/practice-progress';
import {connectLessonSteps,practiceStepDefinition,type LessonProgress} from '@/features/lab/services/lesson-progress';
import {useRosterIdentity} from '@/features/lab/services/use-roster-identity';
import {SemiconductorAccountBridge} from '@/features/lab/services/semiconductor-account-bridge';
import {TransistorAccountBridge} from '@/features/lab/services/transistor-account-bridge';
import {RuntimeEntryBridge} from '@/features/lab/services/runtime-entry-bridge';

/** Một website / một sidebar: LABVIRT STUDIO là phần nội dung của các route React.
 * Đồ họa GLB, ánh sáng và camera được giữ nguyên trong runtime /labvirt/lab-v11/.
 * Giữ bản dự phòng theo UID; cloud chỉ bật cùng Rules đã duyệt. Tiến độ không phải điểm.
 */
export type StudioView = 'roadmap' | 'catalog' | 'mine' | 'report';
type StudioProgress = { part: number; records: number; updatedAt?: string };
const pathForView: Record<StudioView, string> = {
  roadmap: '/experiments', catalog: '/experiments', mine: '/my-practices', report: '/lab-reports'
};
const titleForView: Record<StudioView, string> = {
  roadmap: 'Thí nghiệm & Lộ trình thực hành', catalog: 'Thí nghiệm & Lộ trình thực hành', mine: 'Thực hành của tôi', report: 'Kết quả & Báo cáo'
};
function isStudioView(value: unknown): value is StudioView {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(pathForView, value);
}
function progressKey(uid: string) {
  return `labvirt-portal-progress-v1:${uid}`;
}
function readProgress(uid: string): StudioProgress {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(progressKey(uid)) || '{}');
    if (!data || typeof data !== 'object') return { part: 1, records: 0 };
    const p = data as { part?: unknown; records?: unknown; updatedAt?: unknown };
    return {
      part: typeof p.part === 'number' && [1, 2, 3, 4].includes(p.part) ? p.part : 1,
      records: 0, // Count is loaded asynchronously from validated canonical records below.
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt.slice(0, 40) : undefined
    };
  } catch { return { part: 1, records: 0 }; }
}

export function LabvirtAcademyPage({ view }: { view: StudioView }) {
  const uid=useAuthStore(state=>state.user?.uid||'guest');
  return <StudioSession key={uid} view={view}/>;
}
function StudioSession({view}:{view:StudioView}){
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [initialView]=useState(view);
  const uid = useAuthStore(state => state.user?.uid || 'guest');
  const profile=useAuthStore(state=>state.profile);
  const roster=useRosterIdentity(uid);
  const isDemo=useAuthStore(state=>state.isDemo);
  const navigate = useNavigate();
  const [progress, setProgress] = useState<StudioProgress>(() => readProgress(uid));
  const [frameReady, setFrameReady] = useState(false);
  const [hydrated,setHydrated]=useState(!progressSyncEnabled||isDemo);
  const [loadError,setLoadError]=useState('');
  const [lesson,setLesson]=useState<LessonProgress>();
  const [cloud,setCloud]=useState<PracticeSummary>();

  const sendHostState = useCallback(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target || !hydrated) return;
    void readLocalPractice(uid).then(local=>{
      if(iframeRef.current?.contentWindow!==target)return;
      target.postMessage({type:'academy:session',uid,records:local.records,identity:roster?.identity??{fullName:profile?.displayName||'',studentCode:profile?.studentCode||'',className:''}},window.location.origin);
    }).catch(error=>console.warn('[LABVIRT session]',error));
    target.postMessage({type:'academy:sync-state',enabled:progressSyncEnabled,confirmed:cloud?.records?.map(record=>record.key)??null,error:loadError,steps:lesson?.ready?lesson.completed:null,totalSteps:lesson?.total??null},window.location.origin);
  }, [uid,profile,roster,hydrated,cloud,loadError,lesson]);

  useEffect(()=>{
    if(isDemo||uid==='guest')return;
    let active=true,steps:ReturnType<typeof connectLessonSteps>|undefined;
    const connection=connectPracticeProgress(uid,async rows=>{await storeLocalPractice(uid,rows);},message=>{if(active)setLoadError(message);});
    const stopCloud=listenPracticeCases(uid,value=>{if(active)setCloud(value);},message=>{if(active)setLoadError(message);});
    void connection.ready.then(()=>{if(active){setHydrated(true);setLoadError('');}}).catch(()=>{if(active)setLoadError('Không tải được tiến độ tài khoản. Hãy kiểm tra kết nối hoặc quyền truy cập.');});
    void practiceStepDefinition().then(definition=>{if(active)steps=connectLessonSteps(uid,definition,value=>{if(active)setLesson(value);});}).catch(()=>{if(active)setLoadError('Không tải được các bước thực hành.');});
    return()=>{active=false;connection.stop();stopCloud();steps?.stop();};
  },[uid,isDemo]);

  useEffect(() => {
    let active=true;
    void readLocalPractice(uid).then(local=>{if(active){setProgress(old=>({...old,records:local.records.length}));setHydrated(true);}}).catch(error=>{if(active)setLoadError('Không đọc được bản dự phòng trên thiết bị. Hãy thử tải lại trang.');console.warn('[LABVIRT progress]',error);});
    const changed=(event:Event)=>{const data=(event as CustomEvent<{uid:string;completed:number}>).detail;if(data.uid===uid)setProgress(old=>({...old,records:data.completed}));};
    window.addEventListener('labvirt:practice-updated',changed);
    return()=>{active=false;window.removeEventListener('labvirt:practice-updated',changed);};
  }, [uid]);
  useEffect(() => { sendHostState(); }, [sendHostState]);
  useEffect(()=>{if(frameReady&&hydrated)iframeRef.current?.contentWindow?.postMessage({type:'academy:open-view',view},window.location.origin);},[frameReady,hydrated,view]);
  useEffect(() => {
    let active=true;
    const reloadProgress=()=>{void readLocalPractice(uid).then(local=>{if(active)setProgress({...readProgress(uid),records:local.records.length});}).catch(error=>console.warn('[LABVIRT progress]',error));};
    function onMessage(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== 'object') return;
      const message = event.data as { type?: unknown; view?: unknown; progress?: unknown };
      if (message.type === 'labvirt:studio-ready') { setFrameReady(true); sendHostState(); return; }
      if (message.type === 'labvirt:navigate' && isStudioView(message.view)) {
        const target = pathForView[message.view];
        if (window.location.pathname !== target) navigate(target);
        return;
      }
      if (message.type === 'labvirt:portal-progress') {
        reloadProgress();
      }
    }
    function onStorage(e: StorageEvent) {
      if (e.key === progressKey(uid)||e.key===`labvirt:b1:qa1:${uid}`) reloadProgress();
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    return () => { active=false;window.removeEventListener('message', onMessage); window.removeEventListener('storage', onStorage); };
  }, [navigate, uid, sendHostState]);

  const src = `/labvirt/index.html?embed=1&view=${encodeURIComponent(initialView)}`;
  return <section className="labvirt-portal" aria-label={titleForView[view]}>
    <RuntimeEntryBridge iframeRef={iframeRef} identity={roster?.identity??profile??{}}/>
    <SemiconductorAccountBridge iframeRef={iframeRef} identity={roster?.identity??profile??{}}/>
    <TransistorAccountBridge iframeRef={iframeRef} identity={roster?.identity??profile??{}}/>
    <header className="labvirt-portal-heading">
      <div className="labvirt-portal-title"><FlaskConical aria-hidden="true" />
        <div><span>VIRTUAL LAB ACADEMY · LABVIRT STUDIO</span><h1>{titleForView[view]}</h1></div>
      </div>
      <div className="labvirt-portal-controls">
        <span className="labvirt-portal-count">{hydrated?`Bài 1 · ${progress.records}/18 phép đo đã ghi${lesson?.ready?` · ${lesson.completed}/${lesson.total} bước`:''}`:'Đang tải tiến độ tài khoản…'}</span>
        <span className="labvirt-portal-dot" title={frameReady ? 'Studio đã khởi tạo' : 'Đang tải Studio'} aria-label={frameReady ? 'Studio sẵn sàng' : 'Đang tải Studio'} />
        <a className="labvirt-portal-newtab" href={src} target="_blank" rel="noopener noreferrer" title="Mở Studio toàn màn hình trong tab mới"><ExternalLink size={16} aria-hidden="true" /> <span>Toàn màn hình</span></a>
      </div>
    </header>
    {(loadError||lesson?.error)&&<p role="alert">{loadError||lesson?.error}</p>}
    {roster?.error&&<p role="status">{roster.error} Không tự đoán tên lớp.</p>}
    {lesson?.status==='pending'&&<p role="status">Đang chờ lưu tiến độ khi có kết nối. Bản trên thiết bị vẫn được giữ.</p>}
    <div className="labvirt-portal-frame-wrap">
      {!frameReady&&<div className="studio-skeleton" role="status"><span>Đang mở không gian thực hành…</span><div/><div/><div/></div>}
      <iframe ref={iframeRef} key={uid} src={src} onLoad={sendHostState}
        className="labvirt-portal-frame" title={`LABVIRT STUDIO — ${titleForView[view]}`}
        allow="fullscreen" loading="eager" />
    </div>
    <p className="labvirt-portal-note"><Info size={15} aria-hidden="true" /> {progressSyncEnabled?'Các bảng lưu theo tài khoản; chỉ báo đã lưu Firebase khi server xác nhận. Giảng viên cần xác nhận trước khi chấm điểm.':'Bản dự phòng trên thiết bị; chưa bật đồng bộ Firestore.'} Phần 1, 2, 3, 4 dùng các bảng và khóa kết quả riêng.</p>
  </section>;
}
