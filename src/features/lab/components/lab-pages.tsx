import {PremiumOverview} from './premium-overview';
import { useEffect,useMemo,useState } from 'react';
import { Link,useNavigate,useParams } from 'react-router-dom';
import { AlertTriangle,ArrowLeft,ArrowRight,BookOpen,CheckCircle2,ClipboardList,FlaskConical,Microscope,ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores';
import { listenExperiments,listenStudentSessions,startPreparation } from '../services/lab-service';
import { progressOf,type Experiment,type LabSession,type Practical } from '../lab-model';
import { LiveStudentRoom } from './live-student-room';

function useLabData(){
  const {user,isDemo}=useAuthStore();
  const scope=user&&!isDemo?user.uid:null;
  const [catalog,setCatalog]=useState<{scope:string;items:Experiment[];error:string} | null>(null);
  const [history,setHistory]=useState<{scope:string;items:LabSession[];error:string} | null>(null);
  useEffect(()=>{
    if(!scope)return;
    let active=true;
    const stop=listenExperiments(false,items=>{if(active)setCatalog({scope,items,error:''});},error=>{if(active)setCatalog({scope,items:[],error});});
    return()=>{active=false;stop();};
  },[scope]);
  useEffect(()=>{
    if(!scope)return;
    let active=true;
    const stop=listenStudentSessions(scope,items=>{if(active)setHistory({scope,items,error:''});},error=>{if(active)setHistory({scope,items:[],error});});
    return()=>{active=false;stop();};
  },[scope]);
  const experiments=scope&&catalog?.scope===scope?catalog.items:[];
  const sessions=scope&&history?.scope===scope?history.items:[];
  const error=(scope&&catalog?.scope===scope?catalog.error:'')||(scope&&history?.scope===scope?history.error:'');
  const loading=!!scope&&catalog?.scope!==scope;
  return {experiments,sessions,error,loading,user,isDemo};
}
const frame='rounded-2xl border border-border bg-card p-5 shadow-sm';
function State({loading,error,empty}:{loading:boolean,error:string,empty?:string}){
  return <>{loading&&<p className="text-muted-foreground">Đang tải danh mục thí nghiệm...</p>}{error&&<p role="alert" className="rounded-xl border border-destructive/40 p-3 text-destructive">{error}</p>}{!loading&&!error&&empty&&<p className="rounded-xl border border-border p-5 text-muted-foreground">{empty}</p>}</>;
}
export function LabCatalogPage(){
  const {experiments,sessions,error,loading}=useLabData();
  return <div className="space-y-6 pb-12">
    <header className="space-y-2"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Virtual Lab Academy</p><h1 className="text-3xl font-bold">Danh mục thí nghiệm</h1><p className="text-muted-foreground">Chương trình dự kiến khoảng 20 bài lớn. Mỗi bài gồm các bài thực hành nhỏ do giảng viên thiết lập. Không tự tạo môn học hoặc kết quả giả.</p></header>
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <div className={frame}><p className="text-sm text-muted-foreground">Bài đã công bố</p><p className="text-3xl font-bold">{experiments.length}</p></div>
      <div className={frame}><p className="text-sm text-muted-foreground">Bài thực hành nhỏ</p><p className="text-3xl font-bold">{experiments.reduce((s,e)=>s+e.practicals.length,0)}</p></div>
      <div className={frame}><p className="text-sm text-muted-foreground">Bài nhỏ đã đạt</p><p className="text-3xl font-bold">{new Set(sessions.filter(s=>s.status==='PASSED').map(s=>s.experimentId+':'+s.practicalId)).size}</p></div>
    </div>
    <State loading={loading} error={error} empty={!experiments.length?'Chưa có bài thí nghiệm được công bố. Quản trị viên sẽ nhập danh sách bài khi được cung cấp.':''}/>
    <div className="grid md:grid-cols-2 gap-4">{experiments.map(e=>{const p=progressOf(e,sessions);return <Link to={`/experiments/${e.id}`} key={e.id} className={`${frame} hover:border-primary/50 transition-colors space-y-3`}><div className="flex justify-between gap-3"><FlaskConical className="h-7 w-7 text-primary"/><span className="text-xs text-muted-foreground">{e.code}</span></div><h2 className="text-lg font-bold">{e.title}</h2><p className="text-sm text-muted-foreground line-clamp-3">{e.description}</p><div className="flex justify-between text-xs text-muted-foreground"><span>{e.practicals.length} bài nhỏ</span><span>{p.done}/{p.total} đạt chuẩn</span></div><div className="h-2 rounded-full bg-surface-elevated"><div className="h-full rounded-full bg-primary" style={{width:`${p.total?100*p.done/p.total:0}%`}}/></div><span className="flex items-center gap-1 text-sm font-semibold text-primary">Xem chi tiết <ArrowRight className="h-4 w-4"/></span></Link>})}</div>
  </div>;
}
export function ExperimentDetailPage(){
  const {experimentId}=useParams();const {experiments,sessions,error,loading}=useLabData();
  const e=experiments.find(x=>x.id===experimentId);
  return <div className="space-y-5 pb-12"><Link className="inline-flex items-center gap-2 text-sm text-primary" to="/experiments"><ArrowLeft className="h-4 w-4"/> Danh mục thí nghiệm</Link><State loading={loading} error={error} empty={!e&&!loading?'Không tìm thấy bài thí nghiệm đã công bố.':''}/>{e&&<><header className="space-y-2"><p className="text-xs font-bold text-primary">{e.code} · {e.category}</p><h1 className="text-3xl font-bold">{e.title}</h1><p className="text-muted-foreground">{e.description}</p></header><section className="space-y-3"><h2 className="text-lg font-semibold">Các bài thực hành nhỏ ({e.practicals.length})</h2>{e.practicals.map((p,i)=>{const records=sessions.filter(s=>s.experimentId===e.id&&s.practicalId===p.id);const passed=records.some(s=>s.status==='PASSED');return <div key={p.id} className={`${frame} flex flex-wrap items-center justify-between gap-4`}><div className="flex-1 space-y-1"><p className="text-xs text-muted-foreground">Bài nhỏ {i+1} · {p.durationMinutes} phút · Điểm đạt ≥ {p.minimumScore}{p.deadline?` · Hạn ${p.deadline}`:""}</p><h3 className="font-semibold">{p.title}</h3><p className="text-sm text-muted-foreground">{p.objective}</p><p className="text-xs text-muted-foreground">{passed?'Đã được duyệt đạt chuẩn':`${records.length} lượt mở chuẩn bị · Chưa có chứng nhận đạt`}</p></div><Link className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" to={`/experiments/${e.id}/practicals/${p.id}`}>Xem bài <ArrowRight className="h-4 w-4"/></Link></div>})}</section></>}</div>;
}
/** Thông số học liệu hiển thị trước khi thực hành; không suy diễn kết quả đo. */
function PracticeSpecification({practical:p}:{practical:Practical}){
  const equipment=p.equipment??[];const scenarios=p.scenarios??[];
  return <div className="grid lg:grid-cols-2 gap-4">
    <section className={`${frame} space-y-3`}><h2 className="font-semibold">Thiết bị, dụng cụ và linh kiện ({equipment.length} loại)</h2>
      {equipment.length?equipment.map(x=><div key={x.id} className="border-b border-border pb-2 text-sm"><strong>{x.quantity} × {x.name}</strong><p className="text-xs text-muted-foreground">{x.specification}</p></div>):<p className="text-muted-foreground text-sm">Giảng viên chưa khai báo thiết bị.</p>}
      <p className="text-xs text-amber-500">Danh sách này là đặc tả bắt buộc của phòng 3D tương lai, chưa xác nhận có mô hình đã dựng.</p>
    </section>
    <section className={`${frame} space-y-3`}><h2 className="font-semibold text-amber-500">Kiểm tra an toàn bắt buộc</h2>
      {(p.safetyChecks??[]).map((v,i)=><p key={i} className="text-sm">{i+1}. {v}</p>)}
      <h3 className="font-semibold pt-3">Các nhóm tình huống phải hỗ trợ ({scenarios.length})</h3>
      <p className="text-xs text-muted-foreground">Trước khi vào lab, bạn có thể biết các tình huống cần học; kết quả mong đợi sẽ do mô phỏng và phần đánh giá xác minh.</p>
      {scenarios.map(x=><div key={x.id} className="text-sm border-b border-border pb-2"><span className="text-xs text-primary font-medium">{x.category}{x.blocking?' · Nguy cơ phải chặn':''}</span><p>{x.title}</p></div>)}
    </section>
    <section className={`${frame} space-y-2 lg:col-span-2`}><h2 className="font-semibold">Mẫu bảng số liệu cần thu thập</h2>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b border-border"><th className="p-2">Đại lượng</th><th className="p-2">Đơn vị</th><th className="p-2">Yêu cầu</th></tr></thead><tbody>{(p.measurementFields??[]).map(f=><tr key={f.id} className="border-b border-border"><td className="p-2">{f.label}</td><td className="p-2">{f.unit}</td><td className="p-2">{f.description}</td></tr>)}</tbody></table></div>
      {!!p.sourcePages?.length&&<p className="text-xs text-muted-foreground">Đối chiếu giáo án gốc: trang {p.sourcePages.join(', ')}.</p>}
    </section>
  </div>;
}

export function PracticePreparationPage(){
  const {experimentId,practicalId}=useParams();const {experiments,user,isDemo,loading,error}=useLabData();const navigate=useNavigate();
  const e=experiments.find(x=>x.id===experimentId);const p:Practical|undefined=e?.practicals.find(x=>x.id===practicalId);
  const [saving,setSaving]=useState(false);const [actionError,setActionError]=useState('');
  async function begin(){if(!user||isDemo||!e||!p)return;setSaving(true);setActionError('');try{const id=await startPreparation(user.uid,e.id,p.id);navigate(`/lab/preparation/${id}`);}catch(err){setActionError(err instanceof Error?err.message:'Không lưu được phiên chuẩn bị');setSaving(false)}}
  return <div className="space-y-5 pb-12"><Link to={`/experiments/${experimentId}`} className="inline-flex gap-2 items-center text-primary text-sm"><ArrowLeft className="h-4 w-4"/> Quay lại bài lớn</Link><State loading={loading} error={error} empty={!p&&!loading?'Chưa tìm thấy bài thực hành nhỏ.':''}/>{p&&<><header><p className="text-xs font-semibold text-primary">{e?.code} · Bài thực hành nhỏ</p><h1 className="text-3xl font-bold mt-2">{p.title}</h1><p className="text-muted-foreground mt-2">{p.objective}</p></header><div className="grid lg:grid-cols-2 gap-4"><section className={`${frame} space-y-3`}><h2 className="font-semibold flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary"/> Quy trình thực hiện</h2>{p.instructions.map((s,i)=><p className="text-sm" key={i}><span className="font-bold text-primary">{i+1}.</span> {s}</p>)}{p.instructions.length===0&&<p className="text-sm text-muted-foreground">Giảng viên chưa nhập các bước.</p>}</section><section className={`${frame} space-y-3`}><h2 className="font-semibold flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary"/> Bằng chứng bắt buộc</h2>{p.requiredEvidence.map((v,i)=><p className="text-sm" key={i}>• {v}</p>)}{p.requiredEvidence.length===0&&<p className="text-sm text-muted-foreground">Chưa được cấu hình.</p>}<p className="text-xs text-muted-foreground">Điểm đạt tối thiểu: {p.minimumScore}/100. Chỉ admin/giảng viên có quyền mới xác nhận đạt.</p></section></div><PracticeSpecification practical={p}/><section className={`${frame} space-y-3`}><div className="flex gap-2 items-start"><AlertTriangle className="h-5 w-5 text-amber-500 shrink-0"/><div><h2 className="font-semibold">Tình trạng phòng thí nghiệm 3D</h2><p className="text-sm text-muted-foreground">Chưa tích hợp 3D. Chỉ có thể ghi nhận việc mở trang chuẩn bị, không được coi là đã thao tác, đo kiểm hoặc đạt chuẩn.</p></div></div>{p.labReadiness==='VERIFIED'?<p className="text-sm">Mô-đun 3D được đánh dấu đã kiểm chứng nhưng chưa kết nối với trang này. Không tự báo hoàn thành.</p>:null}{actionError&&<p role="alert" className="text-destructive text-sm">{actionError}</p>}<button disabled={saving||isDemo} onClick={begin} className="inline-flex gap-2 items-center rounded-xl bg-primary px-4 py-2.5 text-primary-foreground font-semibold disabled:opacity-50"><Microscope className="h-4 w-4"/>{saving?'Đang ghi phiên...':'Mở trang chuẩn bị phòng Lab'}</button>{isDemo&&<p className="text-xs text-amber-500">Chế độ khách không lưu phiên; đăng nhập tài khoản để theo dõi.</p>}</section></>}</div>;
}
export function LabRoomPendingPage(){
  const {sessionId}=useParams();
  return <div className="space-y-5 pb-12">
    <Link to="/experiments" className="text-primary text-sm flex gap-2 items-center"><ArrowLeft className="h-4 w-4"/> Danh mục thí nghiệm</Link>
    <header className="space-y-2"><h1 className="text-2xl font-bold">Phòng Lab cá nhân</h1><p className="text-sm text-muted-foreground">Phiên chuẩn bị: {sessionId}. Trạng thái được đồng bộ vào 1 trong 46 ô giám sát của Admin.</p></header>
    {sessionId?<LiveStudentRoom sessionId={sessionId}/>:<p role="alert" className="text-destructive">Thiếu mã phiên thí nghiệm.</p>}
  </div>;
}
export function MyLabWorkPage(){const {experiments,sessions,error,loading}=useLabData();const rows=useMemo(()=>sessions.slice().sort((a,b)=>String(b.id).localeCompare(String(a.id))),[sessions]);return <div className="space-y-5 pb-12"><h1 className="text-3xl font-bold">Thực hành của tôi</h1><p className="text-muted-foreground">Các phiên chuẩn bị và kết quả được admin xác minh. Không đánh đồng việc mở trang với việc thực hành 3D.</p><State error={error} loading={loading} empty={rows.length?'':'Chưa có phiên thực hành nào.'}/>{rows.map(s=><div key={s.id} className={`${frame} flex flex-wrap justify-between gap-4`}><div><h2 className="font-semibold">{experiments.find(e=>e.id===s.experimentId)?.practicals.find(p=>p.id===s.practicalId)?.title||s.practicalId}</h2><p className="text-xs text-muted-foreground">Phiên {s.id} · {s.status==='PREPARATION'?'Đã mở trang chuẩn bị':s.status}</p></div><div className="text-sm font-medium">{s.status==='PASSED'?<span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-4 w-4"/> Đạt · {s.score}/100</span>:<span className="text-amber-500">Chưa được xác nhận đạt</span>}</div></div>)}</div>}
export function LabReportsPage(){const {experiments,sessions,error,loading}=useLabData();const passed=sessions.filter(s=>s.status==='PASSED');const failed=sessions.filter(s=>s.status==='FAILED');return <div className="space-y-5 pb-12"><h1 className="text-3xl font-bold">Kết quả & Báo cáo</h1><div className="grid grid-cols-2 lg:grid-cols-3 gap-3"><div className={frame}><p className="text-sm text-muted-foreground">Đã đạt</p><strong className="text-3xl">{passed.length}</strong></div><div className={frame}><p className="text-sm text-muted-foreground">Không đạt</p><strong className="text-3xl">{failed.length}</strong></div><div className={frame}><p className="text-sm text-muted-foreground">Chờ đánh giá/chưa có 3D</p><strong className="text-3xl">{sessions.length-passed.length-failed.length}</strong></div></div><State error={error} loading={loading}/>{sessions.filter(s=>s.status==='PASSED'||s.status==='FAILED').map(s=><article key={s.id} className={`${frame} space-y-1`}><h2 className="font-semibold">{experiments.find(e=>e.id===s.experimentId)?.title||s.experimentId}</h2><p className="text-sm">Điểm: {s.score??'—'} / 100 · {s.status==='PASSED'?'Đạt':'Không đạt'}</p><p className="text-sm text-muted-foreground">Nhận xét: {s.reviewNote||'Không có'}</p></article>)}<p className="text-sm text-muted-foreground flex gap-2"><ShieldCheck className="h-4 w-4"/> Báo cáo này chỉ hiển thị đánh giá đã được người có quyền ghi nhận.</p></div>}
export function LabOverviewPage(){return <PremiumOverview/>;}
