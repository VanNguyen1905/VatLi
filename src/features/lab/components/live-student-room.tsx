import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores';
import { LiveRoomScene } from './live-room-scene';
import { COMPONENT_LABELS, INSTRUMENT_LABELS, prepareStudentRoom, writeStudentRoom, type LiveLabRoom, type PreviewComponent, type PreviewInstrument } from '../services/live-lab-rooms';
import {connectLessonSteps,preparationStepDefinition,type LessonProgress,type LessonDefinition} from '../services/lesson-progress';

/** Trang student chuan bi dung duoc ngay; khong tu cho la da lam thi nghiem 3D. */
export function LiveStudentRoom({sessionId}:{sessionId:string}) {
  const uid=useAuthStore(s=>s.user?.uid);
  const code=useAuthStore(s=>s.profile?.studentCode);
  const accountType=useAuthStore(s=>s.profile?.accountType);
  const isDemo=useAuthStore(s=>s.isDemo);
  return <StudentRoomSession key={`${uid}:${code}:${accountType}:${isDemo}:${sessionId}`} {...{sessionId,uid,code,accountType,isDemo}}/>;
}
function StudentRoomSession({sessionId,uid,code,accountType,isDemo}:{sessionId:string;uid?:string;code?:string;accountType?:string;isDemo:boolean}){
  const [room,setRoom]=useState<LiveLabRoom>();
  const [progress,setProgress]=useState<LessonProgress>();
  const [definition,setDefinition]=useState<LessonDefinition>();
  const [instructions,setInstructions]=useState<string[]>([]);
  const stepConnection=useRef<ReturnType<typeof connectLessonSteps>>(undefined);
  const busy=!progress?.ready;
  const [error,setError]=useState('');
  const writeChain=useRef<Promise<void>>(Promise.resolve());
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{
    if(!uid||!code||accountType!=='student'||isDemo)return;
    let alive=true;
    void prepareStudentRoom(uid,code,sessionId).then(v=>{if(alive)setRoom(v)}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Khong ket noi duoc phong Lab')});
    return()=>{alive=false};
  },[uid,code,accountType,isDemo,sessionId]);
  const experimentId=room?.experimentId,practicalId=room?.practicalId;
  useEffect(()=>{
    if(!uid||!experimentId||!practicalId||isDemo)return;
    let alive=true,first=true,connection:ReturnType<typeof connectLessonSteps>|undefined;
    void preparationStepDefinition(experimentId,practicalId).then(({definition:value,instructions:content})=>{
      if(!alive)return;setDefinition(value);setInstructions(content);
      connection=connectLessonSteps(uid,value,snapshot=>{
        if(!alive)return;setProgress(snapshot);
        if(first&&snapshot.ready){first=false;const next=Array.from({length:value.totalSteps},(_,index)=>index).find(index=>!snapshot.completedSteps.includes(index))??value.totalSteps-1;setRoom(old=>old?{...old,stepIndex:next}:old);}
      });stepConnection.current=connection;
    }).catch(()=>{if(alive)setError('Không tải được các bước đã xuất bản của bài học. Chưa ghi tiến độ mới.');});
    return()=>{alive=false;connection?.stop();stepConnection.current=undefined;};
  },[uid,experimentId,practicalId,isDemo]);
  function changeRoom(patch:Partial<Pick<LiveLabRoom,'selectedInstrument'|'selectedComponent'|'stepIndex'>>) {
    if(!room||busy)return;
    const next:LiveLabRoom={...room,...patch};
    setRoom(next);setError('');
    // Xep hang ghi tuong ung thao tac, tranh yeu cau den Firestore sai thu tu.
    writeChain.current=writeChain.current.catch(()=>undefined).then(()=>{if(active.current)return writeStudentRoom(next);});
    void writeChain.current.catch(()=>{if(active.current)setError('Chưa cập nhật được trạng thái phòng. Tiến độ chưa gửi vẫn được giữ trên thiết bị.');});
  }
  function nextStep(){if(!room||busy||!definition)return;stepConnection.current?.complete([room.stepIndex]);changeRoom({stepIndex:Math.min(room.stepIndex+1,definition.totalSteps-1)});}
  return <section className="space-y-4">
    <h2 className="text-xl font-bold">Bàn thực hành — đồng bộ với Admin</h2>
    <p className="text-sm text-muted-foreground">Khi bạn chọn dụng cụ hoặc chuyển bước, Admin nhìn thấy lựa chọn này qua Firebase. Đây là bước chuẩn bị, chưa có cảnh 3D hoặc phép đo điện.</p>
    {!uid||isDemo||accountType!=='student'?<p className="text-amber-500 text-sm">Chế độ này chỉ ghi nhận trạng thái tài khoản sinh viên thật.</p>:null}
    {error?<p role="alert" className="rounded-xl border border-destructive/50 p-3 text-sm text-destructive">{error}</p>:null}
    {(!room&&uid&&accountType==='student'&&!error)?<p className="text-sm text-muted-foreground">Đang mở phòng riêng và xác thực phiên...</p>:null}
    <LiveRoomScene room={room}/>
    <p role="status">{progress?.ready?`${progress.completed}/${progress.total} bước chuẩn bị đã ghi nhận · ${progress.status==='saved'?'Đã lưu Firebase':progress.status==='local'?'Lưu trên thiết bị':progress.status==='error'?'Chưa lưu cloud':'Đang chờ lưu Firebase'}`:'Đang tải tiến độ bài học…'}</p>
    {progress?.error&&<p role="alert">{progress.error} <button onClick={()=>stepConnection.current?.retry()}>Thử kết nối lại</button></p>}
    {room&&instructions[room.stepIndex]&&<p>{instructions[room.stepIndex]}</p>}
    {room&&<div className="grid md:grid-cols-3 gap-3">
      <label className="text-sm space-y-2"><span className="font-semibold">Chọn thiết bị</span><select disabled={busy} value={room.selectedInstrument} onChange={e=>changeRoom({selectedInstrument:e.target.value as PreviewInstrument})} className="w-full rounded-xl border border-border bg-background p-3">{Object.entries(INSTRUMENT_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-sm space-y-2"><span className="font-semibold">Chọn linh kiện</span><select disabled={busy} value={room.selectedComponent} onChange={e=>changeRoom({selectedComponent:e.target.value as PreviewComponent})} className="w-full rounded-xl border border-border bg-background p-3">{Object.entries(COMPONENT_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <div className="space-y-2"><p className="font-semibold text-sm">Bước chuẩn bị</p><div className="flex gap-2"><button disabled={busy||room.stepIndex===0} className="rounded-xl border border-border px-4 py-2 disabled:opacity-40" onClick={()=>changeRoom({stepIndex:room.stepIndex-1})}>Trước</button><span className="py-2">{room.stepIndex+1}/{definition?.totalSteps||'…'}</span><button disabled={busy||(room.stepIndex===(definition?.totalSteps||0)-1&&progress?.completedSteps.includes(room.stepIndex))} className="rounded-xl border border-border px-4 py-2 disabled:opacity-40" onClick={nextStep}>{room.stepIndex===(definition?.totalSteps||0)-1?'Hoàn tất bước':'Tiếp'}</button></div></div>
    </div>}
  </section>;
}
