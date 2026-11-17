import { useCallback,useEffect,useRef,useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection,getDocs,limit,query } from 'firebase/firestore';
import { Download,FileSpreadsheet,ShieldCheck,Users } from 'lucide-react';
import { useAuthStore } from '@/stores';
import {RequestedStudentDraft} from './requested-student-draft';
import { verifyOwner } from '@/services/firebase/admin-service';
import { db } from '@/services/firebase/config';
import { archiveExperiment,importOfficialCurriculum,listenEquipment,listenExperiments,listenRoster,listSessionEvidence,listStudentSessions,listStudentTutorChats,reviewSession,saveExperiment,saveRosterEntries } from '@/features/lab/services/lab-service';
import { type EquipmentAssetRecord } from '@/features/lab/data/equipment-catalog';
import { canCountAs3DProof,type Experiment,type LabEvidence,type LabSession,type RosterStudent } from '@/features/lab/lab-model';
import { describePresence, isOnlineNow, listenStudentPresence, type StudentPresence } from '@/features/lab/services/student-presence';
import { listenLiveRooms, liveRoomLabel, type LiveLabRoom } from '@/features/lab/services/live-lab-rooms';
import { LiveRoomScene } from '@/features/lab/components/live-room-scene';
import { CanvasLiveViewer } from '@/features/lab-live/canvas-viewer';
import './admin-physics.css';
import {AdminCloudDashboard} from './admin-cloud-dashboard';
import {RosterEditor,EquipmentEditor} from './admin-record-editor';
import {PracticeProgressAdmin} from './practice-progress-admin';
import {TransistorProgressAdmin} from './transistor-progress-admin';

type AdminTab='overview'|'experiments'|'equipment'|'students'|'monitor'|'reports'|'tutor'|'practice'|'transistor';
type Profile = {uid:string; displayName:string; username:string; studentCode:string; accountType:string; enrollmentStatus:string};
const WITHDRAWN_CODE='DEMO21175';
function normalizeSearch(value:string){ return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim(); }
function accessMatches(queryText:string,...values:string[]){const key=normalizeSearch(queryText);return !key||values.some(value=>normalizeSearch(value).includes(key));}
function lastActivity(p:StudentPresence|undefined){const date=p?.updatedAt?.toDate?.();return date?date.toLocaleString('vi-VN'):'Chưa có dữ liệu';}
const card='rounded-2xl border border-border bg-card p-5';
const field='w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground';
async function exportAdminExcel(name:string,rows:string[][]){
  if(rows.length<2){window.alert('Chưa có dữ liệu sinh viên được tải để xuất Excel.');return;}
  try{
  const modulePath=new URL('/labvirt/lab-v11/lab-xlsx-export.js',window.location.origin).href;
  const module=await import(/* @vite-ignore */ modulePath) as {
    buildTableWorkbook:(rows:string[][],title:string)=>Blob
  };
  const workbook=module.buildTableWorkbook(rows,name.replace(/\.csv$/i,''));
  const url=URL.createObjectURL(workbook),a=document.createElement('a');
  a.href=url;a.download=name.replace(/\.csv$/i,'.xlsx');
  document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),3000);
  }catch(error){window.alert(error instanceof Error?error.message:'Không xuất được báo cáo Excel.');}
}
function makeId(){return 'exp_'+Math.random().toString(36).slice(2,11)}
export function LabAdminPage(){
  const uid=useAuthStore(s=>s.user?.uid||'guest'),demo=useAuthStore(s=>s.isDemo);
  return <AdminSession key={`${uid}:${demo}`}/>;
}
function AdminSession(){
  const user=useAuthStore(s=>s.user);const isDemo=useAuthStore(s=>s.isDemo);
  const [allowed,setAllowed]=useState<boolean|null>(null);
  const [checkedUid,setCheckedUid]=useState('');
  const [params,setParams]=useSearchParams();
  const requestedTab=params.get('tab')||'overview';
  const tab:AdminTab=['overview','experiments','equipment','students','monitor','reports','tutor','practice','transistor'].includes(requestedTab)?requestedTab as AdminTab:'overview';
  const setTab=(value:AdminTab)=>setParams({tab:value});
  const [rosterEditor,setRosterEditor]=useState<RosterStudent|null>(null);
  const [equipmentEditor,setEquipmentEditor]=useState<EquipmentAssetRecord|null>(null);
  const [classFilter,setClassFilter]=useState('');
  const [enrollmentFilter,setEnrollmentFilter]=useState('active');
  const [experiments,setExperiments]=useState<Experiment[]>([]);
  const [roster,setRoster]=useState<RosterStudent[]>([]);
  const [rosterReady,setRosterReady]=useState(false),[presenceReady,setPresenceReady]=useState(false),[experimentsReady,setExperimentsReady]=useState(false);
  const [equipment,setEquipment]=useState<EquipmentAssetRecord[]>([]);
  const [presence,setPresence]=useState<Record<string, StudentPresence>>({});
  const [liveRooms,setLiveRooms]=useState<Record<string,LiveLabRoom>>({});
  const [nowMs,setNowMs]=useState(()=>Date.now());
  const [profiles,setProfiles]=useState<Profile[]>([]);
  const [sessions,setSessions]=useState<Record<string,LabSession[]>>({});
  const [warning,setWarning]=useState('');const [busy,setBusy]=useState(false);
  const [editor,setEditor]=useState<Experiment|null>(null);
  const [rosterInput,setRosterInput]=useState('');const [studentFilter,setStudentFilter]=useState('');
  const [selectedUid,setSelectedUid]=useState('');const [selectedSession,setSelectedSession]=useState('');
  const [evidence,setEvidence]=useState<LabEvidence[]>([]);
  const [tutorUid,setTutorUid]=useState('');
  const [tutorRecords,setTutorRecords]=useState<Awaited<ReturnType<typeof listStudentTutorChats>>>([]);
  const [score,setScore]=useState('');const [reviewNote,setReviewNote]=useState('');
  const [limited,setLimited]=useState(false);
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{if(!user||isDemo)return;let alive=true;verifyOwner().then(ok=>{if(alive){setCheckedUid(user.uid);setAllowed(ok)}}).catch(()=>{if(alive)setAllowed(false)});return()=>{alive=false}},[user,isDemo]);
  useEffect(()=>{if(!allowed)return;const stop1=listenExperiments(true,rows=>{setExperiments(rows);setExperimentsReady(true);},setWarning);const stop2=listenRoster(rows=>{setRoster(rows);setRosterReady(true);},setWarning);const stop3=listenEquipment(setEquipment,setWarning);const stop4=listenStudentPresence(rows=>{setPresence(rows);setPresenceReady(true);},setWarning);const stop5=listenLiveRooms(setLiveRooms,setWarning);const timer=window.setInterval(()=>setNowMs(Date.now()),15_000);return()=>{stop1();stop2();stop3();stop4();stop5();window.clearInterval(timer)}},[allowed]);
  async function loadStudents(){
    const docs=await getDocs(query(collection(db,'users'),limit(101)));
    const people=docs.docs.slice(0,100).map(d=>({uid:d.id,displayName:String(d.data().displayName||''),username:String(d.data().username||''),studentCode:String(d.data().studentCode||''),accountType:String(d.data().accountType||''),enrollmentStatus:String(d.data().enrollmentStatus||'active')}));
    const next:Record<string,LabSession[]>={};
    // 49 người => tối đa 49 truy vấn nhỏ, không đọc các collection cá nhân cũ.
    const result=await Promise.allSettled(people.map(p=>listStudentSessions(p.uid)));
    result.forEach((r,i)=>{if(r.status==='fulfilled'&&people[i])next[people[i].uid]=r.value});
    const errors=result.filter(r=>r.status==='rejected').length;
    return {people,sessions:next,limited:docs.size>100,warning:errors?`Không thể tải phiên lab của ${errors} sinh viên. Thống kê hiện chưa đầy đủ.`:''};
  }
  const applyStudents=useCallback((result:Awaited<ReturnType<typeof loadStudents>>)=>{setProfiles(result.people);setSessions(result.sessions);setLimited(result.limited);setWarning(result.warning);},[]);
  async function refreshStudents(){setWarning('');setBusy(true);try{const result=await loadStudents();if(active.current)applyStudents(result);}catch(err){if(active.current)setWarning(err instanceof Error?err.message:'Lỗi tải dữ liệu');}finally{if(active.current)setBusy(false);}}
  useEffect(()=>{if(!allowed)return;let alive=true;void loadStudents().then(result=>{if(alive)applyStudents(result);}).catch(err=>{if(alive)setWarning(err instanceof Error?err.message:'Lỗi tải dữ liệu');});return()=>{alive=false;};},[allowed,applyStudents]);
  const linkedActiveIds=new Set(roster.filter(r=>r.enrollmentStatus!=='withdrawn').map(r=>r.uid).filter(Boolean));
  const activeProfiles=profiles.filter(p=>p.accountType==='student'&&p.studentCode.toUpperCase()!==WITHDRAWN_CODE&&p.enrollmentStatus!=='withdrawn'&&linkedActiveIds.has(p.uid));
  const allSessions=activeProfiles.flatMap(p=>sessions[p.uid]||[]);
  const reviewed=allSessions.filter(s=>s.status==='PASSED'||s.status==='FAILED');
  const unreviewed=allSessions.filter(s=>s.status!=='PASSED'&&s.status!=='FAILED');
  const filteredRoster=roster.filter(r=>accessMatches(studentFilter,r.fullName,r.studentCode,r.className)&&(!classFilter||r.className===classFilter)&&(!enrollmentFilter||(r.enrollmentStatus||'active')===enrollmentFilter));
  const connected=roster.filter(r=>isOnlineNow(presence[r.uid],nowMs));
  const studying=connected.filter(r=>['READING','PREPARING','LAB_PENDING'].includes(presence[r.uid]?.mode??''));
  const selected=activeProfiles.some(p=>p.uid===selectedUid)?(sessions[selectedUid]||[]).find(s=>s.id===selectedSession):undefined;
  async function showEvidence(uid:string,session:string){setSelectedUid(uid);setSelectedSession(session);setScore('');setReviewNote('');setEvidence([]);try{setEvidence(await listSessionEvidence(uid,session))}catch(err){setWarning(err instanceof Error?err.message:'Không tải được bằng chứng')}}
  async function submitReview(result:'PASSED'|'FAILED'){
    if(!user||!selected)return;
    const parsed=Number(score);if(score.trim()===''||!Number.isInteger(parsed)||parsed<0||parsed>100){setWarning('Nhập điểm nguyên từ 0 tới 100');return;}
    const experiment=experiments.find(e=>e.id===selected.experimentId);
    const practical=experiment?.practicals.find(p=>p.id===selected.practicalId);
    if(result==='PASSED'&&practical&&parsed<practical.minimumScore){setWarning(`Không thể cho đạt dưới ngưỡng ${practical.minimumScore} điểm`);return;}
    if(result==='PASSED'&&!evidence.some(canCountAs3DProof)){
      setWarning('CHẶN: Chưa có bằng chứng đo kiểm 3D được backend tin cậy xác minh. Không được duyệt Đạt.');return;
    }
    setBusy(true);setWarning('');try{await reviewSession(selectedUid,selected.id,result,parsed,reviewNote,user.uid,selected.reviewRevision??0);await refreshStudents();setWarning('Đã lưu đánh giá — backend xác nhận.')}catch(err){setWarning(err instanceof Error?err.message:'Không lưu được kết quả')}finally{setBusy(false)}
  }
  async function importCurriculum(){
    if(!window.confirm('Nhập 3 bài lớn / 11 bài nhỏ từ giáo án vào Firestore? Chỉ tạo bài còn thiếu, không ghi đè bài hiện có. Các bài nhập ở trạng thái BẢN NHÁP.'))return;
    setBusy(true);setWarning('');
    try {const result=await importOfficialCurriculum();setWarning(`Đã nhập ${result.created} bài lớn và ${result.assetsCreated} loại thiết bị; giữ nguyên ${result.skipped} bài, ${result.assetsSkipped} thiết bị đã có.`);}
    catch(err){setWarning(err instanceof Error?err.message:'Nhập giáo án thất bại');}
    finally{setBusy(false)}
  }
  async function save(){if(!editor)return;setBusy(true);setWarning('');try{if(!editor.title.trim()||!editor.code.trim())throw new Error('Mã bài và tên không được trống');if(!editor.practicals.length)throw new Error('Cần ít nhất một bài thực hành nhỏ');if(editor.practicals.some(p=>!p.title.trim()||p.instructions.length===0||p.requiredEvidence.length===0))throw new Error('Mỗi bài nhỏ cần tên, quy trình và bằng chứng bắt buộc');await saveExperiment(editor);setEditor(null);setWarning('Đã lưu Firebase — server xác nhận giáo án.')}catch(err){setWarning(err instanceof Error?err.message:'Không lưu được')}finally{setBusy(false)}}
  async function openTutorHistory(uid:string){setBusy(true);setWarning('');setTutorUid(uid);setTutorRecords([]);try{setTutorRecords(await listStudentTutorChats(uid));}catch(err){setWarning(err instanceof Error?err.message:'Không đọc được lịch sử trợ giảng')}finally{setBusy(false)}}
  function createNew(){setEditor({id:makeId(),code:`LAB-${String(experiments.length+1).padStart(2,'0')}`,title:'',description:'',category:'Điện tử cơ bản',published:false,order:experiments.length+1,practicals:[{id:'p1',title:'',objective:'',durationMinutes:45,instructions:['Kiểm tra điều kiện an toàn'],requiredEvidence:['Nhật ký thao tác 3D được xác minh'],minimumScore:70,labReadiness:'NOT_BUILT'}]})}
  function patchPractical(index:number,changes:object){setEditor(x=>x?{...x,practicals:x.practicals.map((p,i)=>i===index?{...p,...changes}:p)}:null)}
  function parseRoster(text:string):Omit<RosterStudent,'id'>[]{
    const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(lines.length>100)throw new Error('Tối đa 100 dòng');
    const items=lines.map((line,i)=>{
      // Định dạng TSV tránh lỗi tên chứa dấu phẩy: msv<TAB>họ tên<TAB>lớp<TAB>uid
      const cols=line.split('\t').map(c=>c.trim());
      if(cols.length<3||!cols[0]||!cols[1]||!cols[2])throw new Error(`Dòng ${i+1}: cần MSV, họ tên, lớp (ngăn bằng Tab)`);
      if(!/^[a-zA-Z0-9_-]{2,40}$/.test(cols[0]))throw new Error(`Mã sinh viên không hợp lệ ở dòng ${i+1}`);
      return {studentCode:cols[0],fullName:cols[1],className:cols[2],uid:cols[3]||''};
    });
    if(items.some(i=>i.studentCode.toUpperCase()===WITHDRAWN_CODE))throw new Error('DEMO21175 đã nghỉ học, không nhập vào danh sách đang học.');
    if(new Set(items.map(i=>i.studentCode.toLowerCase())).size!==items.length)throw new Error('Danh sách có mã sinh viên bị trùng');
    return items;
  }
  async function importRoster(){try{setBusy(true);setWarning('');const data=parseRoster(rosterInput);const newClasses=[...new Set(data.map(row=>row.className))].filter(name=>!roster.some(row=>row.className===name));if(newClasses.length&&!window.confirm(`Xác nhận nhóm lớp do bạn nhập: ${newClasses.join(", ")}? Tên lớp được lưu trong hồ sơ hiện có, không tạo collection khác.`))return;await saveRosterEntries(data,newClasses);setRosterInput('');setWarning('Đã lưu Firebase — server xác nhận danh sách mới.')}catch(err){setWarning(err instanceof Error?err.message:'Nhập lỗi')}finally{setBusy(false)}}
  const rosterReport=roster.map(r=>{
    const linked=r.uid?activeProfiles.find(p=>p.uid===r.uid):undefined;
    const own=linked?(sessions[linked.uid]||[]):[];
    const passed=own.filter(s=>s.status==='PASSED').length;
    const failed=own.filter(s=>s.status==='FAILED').length;
    const overdue=experiments.flatMap(e=>e.practicals.map(p=>({e,p}))).filter(({e,p})=>
      e.published && p.deadline && p.deadline < new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}) &&
      !own.some(s=>s.experimentId===e.id&&s.practicalId===p.id&&s.status==='PASSED')
    ).length;
    return {...r,account:linked,attempts:own.length,passed,failed,overdue};
  });
  const summaryRows=activeProfiles.map(p=>{const own=sessions[p.uid]||[];const pass=own.filter(s=>s.status==='PASSED').length;const fail=own.filter(s=>s.status==='FAILED').length;return {p,count:own.length,pass,fail,unverified:own.length-pass-fail}});
  if(!user||isDemo)return <main className="p-10">Không có quyền quản trị. Cần đăng nhập tài khoản Owner.</main>;
  if(allowed===null||(allowed&&checkedUid!==user?.uid))return <main className="p-10">Đang xác minh quyền quản trị...</main>;
  if(!allowed)return <main className="p-10"><ShieldCheck className="h-8 w-8 text-primary mb-2"/><h1 className="text-xl font-bold">Không có quyền quản trị</h1><p className="text-muted-foreground">Yêu cầu Firebase Custom Claims admin=true và owner=true; luật Firestore cũng kiểm tra quyền này.</p><Link to="/" className="text-primary underline">Trang chủ</Link></main>;
  if(!rosterReady||!presenceReady||!experimentsReady)return <main className="lab-admin-physics p-6"><h1>Quản trị phòng thí nghiệm</h1><p role="status">Đang tải danh sách lớp và trạng thái hiện diện từ Firebase…</p>{warning&&<p role="alert">{warning}</p>}</main>;
  return <main data-admin-ready="true" className="lab-admin-physics space-y-6 pb-12"><header className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-semibold text-primary uppercase tracking-wider">Admin · Virtual Lab</p><h1 className="text-3xl font-bold">{({overview:'Tổng quan Admin',students:'Danh sách lớp',monitor:'Giám sát sinh viên',transistor:'Tiến độ Bài 2–3',practice:'Tiến độ đo Bài 1',reports:'Kết quả & Báo cáo',experiments:'Chương trình thí nghiệm',equipment:'Danh mục thiết bị',tutor:'Lịch sử trợ giảng AI'})[tab]}</h1><p className="text-sm text-muted-foreground">Quản lý sinh viên đang học, tìm theo tên/MSSV, kiểm tra trạng thái truy cập và tiến độ thực hành.</p></div><Link to="/" className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-4 py-2 text-sm font-semibold text-primary hover:bg-surface-elevated">← Về trang học</Link></header>
    {(warning||limited)&&<p role="alert" className="rounded-xl border border-amber-500/40 p-3 text-sm text-amber-500">{warning}{limited?' Chỉ tải tối đa 100 tài khoản; thống kê chưa đầy đủ.':''}</p>}
    <p className="text-xs text-muted-foreground">{experiments.length} giáo án trên Firestore · {experiments.filter(e=>e.published).length} đã công bố · {roster.filter(r=>r.enrollmentStatus!=="withdrawn").length} hồ sơ đang học · {roster.filter(r=>r.enrollmentStatus==="withdrawn").length} hồ sơ lưu trữ</p><nav className="flex flex-wrap gap-2">{([['overview','Tổng quan Admin'],['experiments','Chương trình thí nghiệm'],['equipment','Kho thiết bị 3D'],['students','Danh sách lớp'],['monitor','Giám sát sinh viên'],['practice','Tiến độ đo Bài 1'],['transistor','Tiến độ Bài 2–3'],['reports','Thống kê & xuất dữ liệu'],['tutor','Lịch sử trợ giảng AI']] as const).map(([k,label])=><button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab===k?'bg-primary text-primary-foreground':'border border-border text-muted-foreground'}`}>{label}</button>)}</nav>
    {tab==='overview'&&<AdminCloudDashboard students={roster} online={connected.length}/>}
    {tab==='monitor'&&<AdminCloudDashboard students={roster} mode="monitor" online={connected.length}/>}
    {tab==='reports'&&<AdminCloudDashboard students={roster} mode="reports" online={connected.length}/>}
    {rosterEditor&&<RosterEditor key={rosterEditor.id} student={rosterEditor} onClose={()=>setRosterEditor(null)}/>}
    {equipmentEditor&&<EquipmentEditor key={equipmentEditor.id} asset={equipmentEditor} onClose={()=>setEquipmentEditor(null)}/>}
    {tab==='practice'&&<PracticeProgressAdmin students={roster}/>}
    {tab==='transistor'&&<TransistorProgressAdmin students={roster}/>}
    {tab==='experiments'&&<section className="space-y-4"><div className="flex items-center justify-between"><h2 className="font-semibold text-lg">Bài thí nghiệm lớn ({experiments.length})</h2><div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded-xl border border-primary px-4 py-2 text-sm text-primary disabled:opacity-50" onClick={()=>void importCurriculum()}>Nhập giáo án 3 bài / 11 phần</button><button className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm" onClick={createNew}>+ Tạo bài thí nghiệm</button></div></div>{experiments.map(e=><div key={e.id} className={`${card} flex flex-wrap justify-between gap-3`}><div><p className="text-xs text-muted-foreground">{e.archived?'ĐÃ LƯU TRỮ · ':''}{e.code} · {e.published?'Đã công bố':'Bản nháp'} · {e.practicals.length} bài nhỏ</p><h3 className="font-semibold">{e.title}</h3></div><button className="text-primary text-sm font-semibold" onClick={()=>setEditor(JSON.parse(JSON.stringify(e)) as Experiment)}>Chỉnh sửa</button><button disabled={busy} onClick={()=>{if(!window.confirm(`${e.archived?'Khôi phục':'Lưu trữ'} giáo án ${e.code}? Giữ nguyên nội dung và kết quả sinh viên.`))return;setBusy(true);void archiveExperiment(e,!e.archived).then(()=>setWarning('Đã lưu Firebase — server xác nhận trạng thái lưu trữ.')).catch(error=>setWarning(error instanceof Error?error.message:'Chưa lưu được')).finally(()=>setBusy(false));}}>{e.archived?'Khôi phục giáo án':'Lưu trữ giáo án'}</button></div>)}{experiments.length===0&&<p className="text-sm text-muted-foreground">Danh mục chưa có dữ liệu. Khi bạn gửi 20 bài, nhập tên và các bài nhỏ tại đây. Không tạo dữ liệu giả.</p>}
      {editor&&<div className={`${card} space-y-3 border-primary/40`}><h3 className="text-lg font-bold">Biên tập bài lớn</h3><div className="grid md:grid-cols-2 gap-3"><label className="text-sm">Mã bài<input className={field} value={editor.code} onChange={e=>setEditor({...editor,code:e.target.value})}/></label><label className="text-sm">Tên bài<input className={field} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></label><label className="text-sm">Nhóm môn/chuyên đề<input className={field} value={editor.category} onChange={e=>setEditor({...editor,category:e.target.value})}/></label><label className="text-sm">Thứ tự<input type="number" className={field} value={editor.order} onChange={e=>setEditor({...editor,order:Number(e.target.value)||0})}/></label></div><label className="text-sm block">Mô tả<textarea className={field} rows={2} value={editor.description} onChange={e=>setEditor({...editor,description:e.target.value})}/></label><label className="text-sm flex gap-2"><input type="checkbox" checked={editor.published} onChange={e=>setEditor({...editor,published:e.target.checked})}/> Công bố cho sinh viên</label><h4 className="font-semibold">Các bài thực hành nhỏ</h4>{editor.practicals.map((p,i)=><div key={p.id} className="rounded-xl border border-border p-3 space-y-3"><div className="flex justify-between"><span className="font-semibold text-sm">Bài nhỏ {i+1}</span><button className="text-xs text-destructive" onClick={()=>setEditor({...editor,practicals:editor.practicals.filter(v=>v.id!==p.id)})}>Xóa bài nhỏ</button></div><input className={field} value={p.title} placeholder="Tên bài nhỏ" onChange={e=>patchPractical(i,{title:e.target.value})}/><input className={field} value={p.objective} placeholder="Mục tiêu" onChange={e=>patchPractical(i,{objective:e.target.value})}/><div className="grid md:grid-cols-3 gap-2"><label className="text-xs">Thời lượng phút<input type="number" min="1" className={field} value={p.durationMinutes} onChange={e=>patchPractical(i,{durationMinutes:Number(e.target.value)})}/></label><label className="text-xs">Điểm đạt tối thiểu<input type="number" min="0" max="100" className={field} value={p.minimumScore} onChange={e=>patchPractical(i,{minimumScore:Number(e.target.value)})}/></label><label className="text-xs">Tình trạng 3D<select className={field} value={p.labReadiness} onChange={e=>patchPractical(i,{labReadiness:e.target.value})}><option value="NOT_BUILT">Chưa làm 3D</option><option value="INTEGRATION">Đang tích hợp</option><option value="VERIFIED">Đã kiểm thử 3D</option></select></label></div><label className="text-xs block">Hạn nộp chung (không bắt buộc, YYYY-MM-DD)<input className={field} type="date" value={p.deadline||''} onChange={e=>patchPractical(i,{deadline:e.target.value})}/></label><label className="text-xs block">Quy trình (mỗi dòng một bước)<textarea className={field} rows={3} value={p.instructions.join('\n')} onChange={e=>patchPractical(i,{instructions:e.target.value.split('\n').map(v=>v.trim()).filter(Boolean)})}/></label><label className="text-xs block">Minh chứng (mỗi dòng một loại)<textarea className={field} rows={2} value={p.requiredEvidence.join('\n')} onChange={e=>patchPractical(i,{requiredEvidence:e.target.value.split('\n').map(v=>v.trim()).filter(Boolean)})}/></label><label className="text-xs block">Kiểm tra an toàn (mỗi dòng một ý)<textarea className={field} rows={2} value={(p.safetyChecks??[]).join('\n')} onChange={e=>patchPractical(i,{safetyChecks:e.target.value.split('\n').map(v=>v.trim()).filter(Boolean)})}/></label><div className="rounded-xl bg-muted/30 p-3 space-y-2"><p className="font-semibold text-sm">Thiết bị đã khai báo: {p.equipment?.length??0} · Tình huống: {p.scenarios?.length??0} · Cột kết quả: {p.measurementFields?.length??0}</p>{(p.equipment??[]).map(eq=><p className="text-xs" key={eq.id}>• {eq.quantity} × {eq.name} — {eq.specification}</p>)}{(p.scenarios??[]).map(sc=><p className="text-xs" key={sc.id}>[{sc.category}] {sc.title}: {sc.expectedOutcome}</p>)}</div></div>)}<button className="text-primary text-sm font-semibold" onClick={()=>setEditor({...editor,practicals:[...editor.practicals,{id:'p'+crypto.randomUUID().slice(0,8),title:'',objective:'',durationMinutes:45,instructions:['Xác nhận an toàn'],requiredEvidence:['Kết quả phép đo đã xác minh'],minimumScore:70,labReadiness:'NOT_BUILT'}]})}>+ Thêm bài thực hành nhỏ</button><div className="flex gap-2"><button disabled={busy} className="bg-primary text-primary-foreground rounded-xl px-4 py-2 font-semibold disabled:opacity-50" onClick={()=>void save()}>Lưu bài</button><button className="border border-border rounded-xl px-4 py-2" onClick={()=>setEditor(null)}>Hủy</button></div></div>}
    </section>}
    {tab==='equipment'&&<section className="space-y-4"><header><h2 className="text-lg font-semibold">Danh mục hiện vật và tài sản 3D ({equipment.length} loại)</h2><p className="text-sm text-muted-foreground">Nạp từ giáo án, dùng để xây đúng bộ thiết bị cho mỗi bài. NOT_MODELED nghĩa là chưa có file mô hình 3D; không được giả định đã hoàn thành.</p></header><div className={`${card} overflow-x-auto`}><table className="w-full text-sm"><thead><tr className="text-left border-b border-border"><th className="p-2">Thiết bị</th><th className="p-2">Phân loại</th><th className="p-2">Thông số</th><th className="p-2">Tương tác cần dựng</th><th className="p-2">3D</th></tr></thead><tbody>{equipment.map(a=><tr key={a.id} className="border-b border-border align-top"><td className="p-2 font-semibold">{a.name}</td><td className="p-2">{a.category}</td><td className="p-2">{a.specification}</td><td className="p-2">{a.interactivity.join(', ')}</td><td className="p-2 text-amber-500">{a.assetStatus}<button className="block" onClick={()=>setEquipmentEditor({...a})}>Sửa thiết bị</button></td></tr>)}</tbody></table>{!equipment.length&&<p className="text-sm p-3">Kho chưa có dữ liệu; nhập chương trình từ giáo án trước.</p>}</div></section>}
    {tab==='students'&&<section className="space-y-4">
      <div className={card}>
        <div className="admin-filter"><label>Lớp<select aria-label="Lớp" value={classFilter} onChange={e=>setClassFilter(e.target.value)}><option value="">Tất cả lớp</option>{[...new Set(roster.map(r=>r.className))].map(c=><option key={c} value={c}>{c||'Chưa khai báo lớp'}</option>)}</select></label><label>Tình trạng<select aria-label="Tình trạng" value={enrollmentFilter} onChange={e=>setEnrollmentFilter(e.target.value)}><option value="active">Đang học</option><option value="withdrawn">Đã nghỉ / lưu trữ</option><option value="">Tất cả hồ sơ</option></select></label></div><h2 className="font-semibold flex items-center gap-2"><Users className="w-5 h-5 text-primary"/> Danh sách sinh viên đang học ({roster.length} hồ sơ)</h2>
        <p className="text-sm text-muted-foreground mt-2">Hồ sơ đã nghỉ được giữ nguyên cùng lịch sử. Dùng bộ lọc để xem hoặc khôi phục; chỉnh sửa danh sách không tạo hay thay đổi tài khoản đăng nhập.</p>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <label className="text-sm">Tìm kiếm nhanh theo họ tên hoặc mã sinh viên<input className={`${field} mt-1`} placeholder="Ví dụ: Sinh viên, DEMO21166, Nguyễn" value={studentFilter} onChange={e=>setStudentFilter(e.target.value)}/></label>
          <div className="text-sm rounded-xl border border-border p-3">Đang học: <strong>{roster.length}</strong> · Đang truy cập: <strong>{connected.length}</strong> · Đang xem bài/chuẩn bị: <strong>{studying.length}</strong></div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Thống kê trạng thái cập nhật theo Firestore. Nếu học viên tắt tab hoặc mất mạng, trạng thái tự hết hiệu lực sau tối đa 150 giây. “Đang chuẩn bị” không phải đã hoàn thành thí nghiệm 3D.</p>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <h3 className="font-semibold mb-3">Kết quả tìm kiếm: {filteredRoster.length} sinh viên</h3>
        <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground border-b border-border"><th className="p-2">MSSV</th><th className="p-2">Họ và tên</th><th className="p-2">Tài khoản</th><th className="p-2">Trạng thái</th><th className="p-2">Hoạt động cuối</th><th className="p-2">Lớp / tình trạng</th><th className="p-2">Hồ sơ</th></tr></thead>
        <tbody>{filteredRoster.map(r=><tr key={r.id} className="border-b border-border"><td className="p-2 font-mono text-xs">{r.studentCode}</td><td className="p-2 font-semibold">{r.fullName}</td><td className="p-2 text-xs">{r.uid?"Đã liên kết UID":"Chưa liên kết tài khoản"}</td><td className="p-2"><span className={isOnlineNow(presence[r.uid],nowMs)?'text-emerald-500':'text-muted-foreground'}>{r.uid?describePresence(presence[r.uid],nowMs):'Chưa liên kết tài khoản'}</span></td><td className="p-2 text-xs">{lastActivity(presence[r.uid])}</td><td className="p-2">{r.className||'Chưa khai báo'} · {r.enrollmentStatus==='withdrawn'?'Đã nghỉ':'Đang học'}</td><td><button onClick={()=>setRosterEditor({...r})}>Sửa hồ sơ</button> <button onClick={()=>{setStudentFilter(r.studentCode);setTab('practice')}}>Tiến độ</button></td></tr>)}</tbody></table>
        {filteredRoster.length===0&&<p className="p-4 text-sm text-muted-foreground">Không tìm thấy sinh viên phù hợp.</p>}
      </div>
      <RequestedStudentDraft students={roster}/><div className={card}><h3 className="font-semibold flex gap-2 items-center"><FileSpreadsheet className="w-4 h-4"/> Bổ sung sinh viên (chỉ Admin)</h3><p className="text-xs text-muted-foreground mt-2">Định dạng mỗi dòng: MSSV [Tab] Họ tên [Tab] Lớp [Tab] UID Firebase (nếu có). Không tự tạo tài khoản Authentication khi chỉ nhập vào danh sách này.</p><button type="button" className="mt-3 inline-flex items-center rounded-lg border border-primary/50 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10" onClick={()=>setRosterInput('DEMO21201\tSinh viên minh họa\t')}>Điền sẵn sinh viên Sinh viên minh họa</button><p className="mt-1 text-xs text-muted-foreground">Bổ sung tên lớp còn thiếu rồi nhấn Nhập thêm danh sách. Không tạo tài khoản hay thay đổi hồ sơ Firebase nếu chưa xác nhận.</p><textarea rows={3} className={`${field} mt-3 font-mono`} value={rosterInput} onChange={e=>setRosterInput(e.target.value)} placeholder={'DEMO21213\tHọ tên\tLớp\tUID nếu có'}/><button disabled={busy||!rosterInput.trim()} className="rounded-xl bg-primary px-4 py-2 text-primary-foreground text-sm font-semibold disabled:opacity-50 mt-2" onClick={()=>void importRoster()}>Nhập thêm danh sách</button></div>
    </section>}
    {tab==='monitor'&&<section className="space-y-4">
      <div className={card}>
        <h2 className="text-xl font-bold">{roster.length} phòng Lab — Giám sát thời gian thực</h2>
        <p className="text-sm text-muted-foreground mt-2">Chọn sinh viên và xem trực tiếp hình ảnh phòng 3D đang hoạt động. Giảng viên chỉ quan sát; sinh viên thấy chỉ báo khi phòng đang được xem. Thông tin chuẩn bị và tiến độ đã lưu vẫn được theo dõi riêng.</p>
        <div className="flex flex-wrap items-center gap-3 mt-3"><input className={`${field} max-w-md`} placeholder="Tìm tên không dấu/có dấu hoặc MSSV" value={studentFilter} onChange={e=>setStudentFilter(e.target.value)}/><button className="rounded-xl border border-border px-3 py-2 text-sm" onClick={()=>void refreshStudents()} disabled={busy}>Làm mới lịch sử</button><span className="text-xs text-muted-foreground">Danh sách phòng cập nhật tự động, không cần F5</span></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {filteredRoster.map(r=>{
          const room=r.uid?liveRooms[r.uid]:undefined;
          const online=isOnlineNow(presence[r.uid],nowMs);
          const inRoom=online && presence[r.uid]?.path===`/lab/preparation/${room?.sessionId??''}`;
          return <button key={r.studentCode} onClick={()=>{setSelectedUid(r.uid);setSelectedSession('');setEvidence([])}} className={`rounded-xl border p-3 text-left space-y-2 transition-colors ${selectedUid===r.uid&&r.uid?'border-primary bg-primary/5':'border-border hover:border-primary/40'}`}>
            <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-muted-foreground">{r.studentCode}</span><span className={`text-[10px] ${inRoom?'text-emerald-500':'text-muted-foreground'}`}>{inRoom?'● ĐANG CHUẨN BỊ':'○'}</span></div>
            <p className="text-sm font-semibold line-clamp-1">{r.fullName}</p>
            <div className="rounded-lg border border-border bg-background/70 p-2 min-h-20 text-xs space-y-1"><p>{room?.selectedInstrument==='NONE'||!room?'Chưa chọn thiết bị':room.selectedInstrument}</p><p>{room?.selectedComponent==='NONE'||!room?'Chưa chọn linh kiện':room.selectedComponent}</p><p className="text-muted-foreground">Bước: {room?room.stepIndex+1:'—'}</p></div>
            <p className={`text-xs ${inRoom?'text-emerald-500':'text-muted-foreground'}`}>Chuẩn bị: {room?liveRoomLabel(room,online,inRoom):'Chưa có dữ liệu'}</p>
          </button>;
        })}
      </div>
      {filteredRoster.length===0&&<p className="text-sm text-muted-foreground">Không tìm thấy sinh viên phù hợp.</p>}
      <div className={`${card} space-y-4`}>
        <h2 className="text-lg font-bold">Góc nhìn phòng Lab của sinh viên</h2>
        {selectedUid && roster.some(r=>r.uid===selectedUid)?<>
          <p className="text-sm">{roster.find(r=>r.uid===selectedUid)?.fullName} · {roster.find(r=>r.uid===selectedUid)?.studentCode}</p>
          <p className="text-xs text-muted-foreground">Trạng thái: {describePresence(presence[selectedUid],nowMs)} · Lần cập nhật cuối: {lastActivity(presence[selectedUid])}</p>
          <CanvasLiveViewer uid={selectedUid} name={roster.find(r=>r.uid===selectedUid)!.fullName} studentCode={roster.find(r=>r.uid===selectedUid)!.studentCode}/>
          <LiveRoomScene room={liveRooms[selectedUid]} summaryOnly/>
          <div className="border-t border-border pt-3"><h3 className="font-semibold mb-2">Các phiên thực hành đã mở</h3>
          {(sessions[selectedUid]||[]).map(s=><button key={s.id} className={`w-full rounded-xl border p-3 mb-2 text-left ${selectedSession===s.id?'border-primary':'border-border'}`} onClick={()=>void showEvidence(selectedUid,s.id)}><p className="font-semibold text-sm">{experiments.find(e=>e.id===s.experimentId)?.practicals.find(p=>p.id===s.practicalId)?.title||s.practicalId}</p><p className="text-xs text-muted-foreground">Phiên {s.id} · {s.status} · {s.score??'Chưa có điểm'}</p></button>)}
          {(sessions[selectedUid]||[]).length===0&&<p className="text-xs text-muted-foreground">Chưa có phiên nào được ghi nhận.</p>}
          </div>
          {selected&&<div className="rounded-xl border border-primary/30 p-3 space-y-3"><h3 className="font-semibold">Dấu vết và duyệt kết quả</h3><p className="text-sm">Tổng sự kiện: {evidence.length}</p><p className="text-sm text-amber-500">Minh chứng 3D được xác minh: {evidence.filter(canCountAs3DProof).length}</p>{evidence.map((ev,i)=><p key={i} className="text-xs text-muted-foreground">{ev.kind} · {ev.source} · {ev.verified?'Đã xác minh':'Chưa xác minh'}</p>)}<label className="text-xs block">Điểm (0–100)<input className={field} type="number" min="0" max="100" value={score} onChange={e=>setScore(e.target.value)}/></label><label className="text-xs block">Nhận xét<textarea className={field} rows={3} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/></label><div className="flex gap-2 flex-wrap"><button disabled={busy} className="bg-emerald-700 rounded-lg text-white px-3 py-2 text-sm disabled:opacity-50" onClick={()=>void submitReview('PASSED')}>Duyệt đạt (cần minh chứng 3D)</button><button disabled={busy} className="border border-rose-500/40 text-rose-400 rounded-lg px-3 py-2 text-sm disabled:opacity-50" onClick={()=>void submitReview('FAILED')}>Đánh giá chưa đạt</button></div></div>}
        </>:<p className="text-sm text-muted-foreground">Nhấn chọn một trong 46 ô phía trên để xem phòng của sinh viên đó.</p>}
      </div>
    </section>}
    {tab==='tutor'&&<section className="space-y-4"><div className={card}><h2 className="font-bold text-lg">Lịch sử hỏi đáp trợ giảng</h2><p className="mt-1 text-xs text-muted-foreground">Dữ liệu được ghi bởi Cloud Function sau khi xác thực người học. Chỉ hiển thị lịch sử 100 lượt gần nhất của tài khoản được chọn. Không đồng nghĩa đã đo hay hoàn thành bài 3D.</p><div className="flex flex-wrap gap-2 mt-3">{activeProfiles.map(p=><button key={p.uid} onClick={()=>void openTutorHistory(p.uid)} className={`rounded-lg px-3 py-2 text-xs border ${tutorUid===p.uid?'border-primary text-primary':'border-border'}`}>{p.displayName||p.username||p.uid}</button>)}</div></div>{tutorUid&&<div className={`${card} space-y-3`}><h3 className="font-semibold">Tài khoản: {activeProfiles.find(p=>p.uid===tutorUid)?.displayName||tutorUid} — {tutorRecords.length} lượt hỏi</h3>{tutorRecords.length===0&&<p className="text-sm text-muted-foreground">Chưa có cuộc trò chuyện được lưu, hoặc đang tải dữ liệu.</p>}{tutorRecords.map(r=><article key={r.id} className="rounded-xl border border-border p-3 space-y-2"><p className="text-xs text-muted-foreground">{r.engine} · Bài {r.experimentId||'Chưa chọn'} / {r.practicalId||'Chưa chọn'} · {r.createdAt?.toDate?.()?.toLocaleString('vi-VN')||'Đang đồng bộ'}</p><p className="text-sm font-semibold">Sinh viên: {r.question}</p><p className="text-sm whitespace-pre-wrap">Trợ giảng: {r.reply}</p></article>)}</div>}</section>}
    {tab==='reports'&&<section className="space-y-4"><div className="grid md:grid-cols-3 gap-3"><div className={card}><p className="text-sm text-muted-foreground">Phiên được duyệt</p><p className="text-3xl font-bold">{reviewed.length}</p></div><div className={card}><p className="text-sm text-muted-foreground">Phiên đạt</p><p className="text-3xl font-bold">{reviewed.filter(s=>s.status==='PASSED').length}</p></div><div className={card}><p className="text-sm text-muted-foreground">Chưa đánh giá</p><p className="text-3xl font-bold">{unreviewed.length}</p></div></div><div className={card}><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">Báo cáo từng sinh viên</h2><button className="inline-flex gap-2 items-center text-primary text-sm" onClick={()=>void exportAdminExcel('bao-cao-phong-lab.csv',[['UID','Họ tên','Username','Số phiên','Đạt','Không đạt','Chưa đánh giá'],...summaryRows.map(x=>[x.p.uid,x.p.displayName,x.p.username,String(x.count),String(x.pass),String(x.fail),String(x.unverified)])])}><Download className="h-4 w-4"/> Xuất Excel</button></div><div className="flex flex-wrap gap-2 mt-3"><button className="text-primary text-sm inline-flex items-center gap-2" onClick={()=>void exportAdminExcel('danh-sach-lop-va-tien-do.csv',[['MSV','Họ tên','Lớp','UID liên kết','Số lần mở','Đạt','Không đạt','Bài quá hạn chưa đạt'],...rosterReport.map(r=>[r.studentCode,r.fullName,r.className,r.uid,String(r.attempts),String(r.passed),String(r.failed),String(r.overdue)])])}><Download className="h-4 w-4"/> Xuất báo cáo theo danh sách lớp ({roster.length})</button></div><p className="text-xs text-muted-foreground mt-2">Chỉ tính quá hạn nếu admin đã cấu hình hạn nộp cho bài nhỏ. Sinh viên chưa liên kết UID có trạng thái chưa đối soát, không tự kết luận đã làm hay chưa làm.</p><p className="text-xs text-amber-500 mt-2">Excel chỉ gồm tài khoản đã tải; {limited?'có giới hạn 100 hồ sơ.':'số phiên có thể bị giới hạn ở 200/tài khoản.'} Không suy đoán học viên đã hoàn thành 3D khi chưa có minh chứng.</p><div className="overflow-x-auto mt-4"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="p-2">Sinh viên</th><th>Số phiên</th><th>Đạt</th><th>Không đạt</th><th>Chờ</th></tr></thead><tbody>{summaryRows.map(row=><tr key={row.p.uid} className="border-t border-border"><td className="p-2">{row.p.displayName||row.p.username}</td><td>{row.count}</td><td>{row.pass}</td><td>{row.fail}</td><td>{row.unverified}</td></tr>)}</tbody></table></div></div></section>}
  </main>;
}
