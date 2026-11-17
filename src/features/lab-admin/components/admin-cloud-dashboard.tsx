import {useEffect,useMemo,useState} from 'react';
import {collection,onSnapshot} from 'firebase/firestore';
import {db} from '@/services/firebase/config';
import type {RosterStudent} from '@/features/lab/lab-model';
import {listenPracticeCases,progressSyncEnabled,type PracticeSummary} from '@/features/lab/services/practice-progress';

export function AdminCloudDashboard({students,mode='overview',online}:{students:RosterStudent[];mode?:'overview'|'monitor'|'reports';online:number}){
  const [summaries,setSummaries]=useState<Record<string,PracticeSummary>>({}),[steps,setSteps]=useState<Record<string,number>>({});
  const [error,setError]=useState(''),[search,setSearch]=useState(''),[className,setClassName]=useState(''),[chosen,setChosen]=useState('');
  const linked=useMemo(()=>students.filter(s=>s.uid&&s.enrollmentStatus!=='withdrawn'),[students]);
  useEffect(()=>{
    let active=true;
    const stops=linked.flatMap(student=>[
      listenPracticeCases(student.uid,value=>{if(active)setSummaries(old=>({...old,[student.uid]:value}));},message=>{if(active)setError(message);}),
      ...(progressSyncEnabled?[onSnapshot(collection(db,'users',student.uid,'labProgress','B1_P1','steps'),{includeMetadataChanges:true},snapshot=>{
        if(active&&!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites)setSteps(old=>({...old,[student.uid]:snapshot.docs.filter(row=>row.data().completed===true).length}));
      },()=>{if(active)setError('Không đọc được các bước thực hành đã lưu.');})]:[])
    ]);
    return()=>{active=false;stops.forEach(stop=>stop());};
  },[linked]);
  const filtered=linked.filter(s=>(!className||s.className===className)&&`${s.studentCode} ${s.fullName}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  const student=filtered.find(s=>s.uid===chosen)??filtered[0],summary=student?summaries[student.uid]:undefined;
  const loaded=linked.filter(s=>summaries[s.uid]),total=loaded.reduce((sum,s)=>sum+summaries[s.uid].completed,0);
  const recent=linked.flatMap(s=>(summaries[s.uid]?.records??[]).map(record=>({s,record}))).sort((a,b)=>b.record.recordedAt.localeCompare(a.record.recordedAt)).slice(0,7);
  async function exportRecords(csv=false){
    try{
      const rows:unknown[][]=[['MSSV','Họ tên','Lớp','Bài / bảng','Trường hợp','Danh định','Dung sai','Thực tế đo','Trạng thái','Kết luận','Thời điểm ghi']];
      filtered.forEach(s=>(summaries[s.uid]?.records??[]).forEach(r=>rows.push([s.studentCode,s.fullName,s.className,'B1 / 1.1',r.key,...r.columns.slice(1),r.recordedAt])));
      if(rows.length===1)throw Error('Chưa có phép đo được server xác nhận để xuất.');
      let blob:Blob;
      if(csv){const cell=(v:unknown)=>{const text=String(v??'');return '"'+(/^[\s]*[=+@-]|^[\t\r\n]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"';};blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});}
      else{const path=new URL('/labvirt/lab-v11/lab-xlsx-export.js',location.origin).href;const module=await import(/* @vite-ignore */path) as {buildTableWorkbook:(rows:unknown[][],title:string)=>Blob};blob=module.buildTableWorkbook(rows,'Kết quả Firestore');}
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`LABVIRT-ket-qua-cloud.${csv?'csv':'xlsx'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
    }catch(failure){setError(failure instanceof Error?failure.message:'Không xuất được báo cáo');}
  }
  return <section data-cloud-loaded={loaded.length===linked.length} className="admin-cloud space-y-5">
    {!progressSyncEnabled&&<p role="status">Đồng bộ tiến độ production chưa được bật. Chưa xác minh dữ liệu học tập trên các máy sinh viên.</p>}
    {error&&<p role="alert">{error}</p>}
    <div className="admin-metrics">{[[students.filter(s=>s.enrollmentStatus!=='withdrawn').length,'Sinh viên đang học'],[online,'Đang truy cập · phiên còn hiệu lực'],[loaded.length?`${total}/${loaded.length*18}`:'Chưa xác minh','Phép đo đã lưu / hồ sơ đã tải'],[loaded.length?`${Math.round(total/(loaded.length*18)*100)}%`:'Chưa xác minh',`Tiến độ Bài 1 · đã tải ${loaded.length}/${linked.length} UID`]].map(([value,label])=><article key={label}><span>⌁</span><strong>{value}</strong><p>{label}</p></article>)}</div>
    {mode==='overview'&&<div className="admin-chart-grid"><article className="admin-panel"><h2>Phân bố tiến độ Bài 1</h2><p>Chỉ các UID đã được Firestore xác nhận tải thành công.</p><div className="admin-bars">{[[0,3],[4,7],[8,11],[12,15],[16,18]].map(([min,max])=>{const count=loaded.filter(s=>summaries[s.uid].completed>=min&&summaries[s.uid].completed<=max).length;return <div key={min}><strong>{loaded.length?count:'—'}</strong><i style={{height:loaded.length?`${count/loaded.length*130}px`:'0'}}/><small>{min}–{max}</small></div>;})}</div></article><article className="admin-panel"><h2>Hoạt động học tập gần đây</h2>{recent.length?recent.map(({s,record})=><p className="admin-activity" key={s.uid+record.key}><strong>{s.fullName} · {record.key}</strong><span>{String(record.lcd??'')} · {new Date(record.recordedAt).toLocaleString('vi-VN')}</span></p>):<p>Chưa có bản ghi đo được server xác nhận. Không suy đoán hoạt động từ trạng thái đăng nhập.</p>}</article></div>}
    <article className="admin-panel"><div className="admin-filter"><h2>{mode==='reports'?'Kết quả & Báo cáo':'Theo dõi tiến độ đã lưu'}</h2><input aria-label="Tra cứu dữ liệu cloud" placeholder="Tìm sinh viên / MSSV" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Lọc lớp dữ liệu cloud" value={className} onChange={e=>setClassName(e.target.value)}><option value="">Tất cả lớp</option>{[...new Set(linked.map(s=>s.className))].map(c=><option key={c} value={c}>{c||'Chưa khai báo lớp'}</option>)}</select><button onClick={()=>void exportRecords()}>Xuất Excel chi tiết</button><button onClick={()=>void exportRecords(true)}>Xuất CSV chi tiết</button></div>
      <div className="overflow-x-auto"><table><thead><tr><th>Sinh viên</th><th>Bài thực hành</th><th>Bước đã lưu</th><th>Phép đo</th><th>Cập nhật</th><th>Chi tiết</th></tr></thead><tbody>{filtered.map(s=>{const value=summaries[s.uid];return <tr key={s.uid}><td><strong>{s.fullName}</strong><small>{s.studentCode} · {s.className||'Chưa khai báo lớp'}</small></td><td>Bài 1 · Phần 1</td><td>{steps[s.uid]===undefined?'Chưa xác minh':`${steps[s.uid]}/8`}</td><td>{value?`${value.completed}/18`:'Đang chờ server'}</td><td>{value?.updatedAt?new Date(value.updatedAt).toLocaleString('vi-VN'):'—'}</td><td><button onClick={()=>setChosen(s.uid)}>Xem kết quả</button></td></tr>;})}</tbody></table></div></article>
    {student&&<article className="admin-panel"><h2>{student.fullName} · {student.studentCode}</h2><p>{summary?`${summary.completed}/18 trường hợp đã lưu Firebase`:'Chưa xác minh kết quả từ server'} · Kết quả mô phỏng chưa phải điểm đã được giảng viên xác minh.</p><div className="overflow-x-auto"><table><thead><tr><th>Trường hợp</th><th>Danh định</th><th>Dung sai</th><th>Thực tế đo</th><th>Trạng thái</th><th>Kết luận</th><th>Thời điểm ghi</th></tr></thead><tbody>{summary?.records?.map(r=><tr key={r.key}><td>{r.key}</td>{r.columns.slice(1).map((c,i)=><td key={i}>{c}</td>)}<td>{new Date(r.recordedAt).toLocaleString('vi-VN')}</td></tr>)}</tbody></table></div><p>Chưa làm: {summary?['R1','R2','R3','C1','C2','L'].flatMap(c=>['NORMAL','SHORT','OPEN'].map(d=>`${c}:${d}`)).filter(key=>!summary.records?.some(r=>r.key===key)).join(', '):'Chưa xác minh'}</p></article>}
  </section>;
}
