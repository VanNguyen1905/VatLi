import {useEffect,useState} from 'react';
import {listenSemiconductorCases,type SemiconductorLesson,type SemiconductorRecord} from '@/features/lab/services/semiconductor-progress';
export function SemiconductorProgressAdmin({uid}:{uid:string}){
 const [lesson,setLesson]=useState<SemiconductorLesson>('B1_P2'),[defect,setDefect]=useState('NORMAL');
 const [result,setResult]=useState<{scope:string;rows:SemiconductorRecord[];error:string}>({scope:'',rows:[],error:''});
 const scope=uid+':'+lesson,rows=result.scope===scope?result.rows:[],error=result.scope===scope?result.error:'';
 useEffect(()=>{let active=true;const stop=listenSemiconductorCases(uid,lesson,records=>{if(active)setResult({scope,rows:records,error:''});},message=>{if(active)setResult({scope,rows:[],error:message});});return()=>{active=false;stop();};},[uid,lesson,scope]);
 const headers=lesson==='B1_P2'?['Mã linh kiện','Điện áp thuận (V)','Kết quả ngược (V)','Trạng thái Tốt/Hỏng']:lesson==='B1_P3'?['Tham số',...['0','10','100','1000'].map(c=>c+' µF')]:['Vin (V)','Vout (V)','IL (mA)','Sụt áp Rs (V)'];
 const values=lesson==='B1_P2'?['1N4007','1N4148','ZENER_5V1'].map(kind=>rows.find(r=>r.key===kind+'_'+defect)?.columns||[kind,'—','—','Chưa đo']):lesson==='B1_P3'?['Vp,out (V)','VDC (V)','Vripple (V)','Dạng sóng'].map((title,i)=>[title,...[0,10,100,1000].map(c=>rows.find(r=>r.key==='C'+c)?.columns[i+1]||'—')]):[1,2,3,4,5,6,7,8,9,10,12].map(vin=>rows.find(r=>r.key==='VIN'+vin)?.columns||[String(vin),'—','—','—']);
 async function exportTable(){try{const url=new URL('/labvirt/lab-v11/lab-xlsx-export.js',location.origin).href,module=await import(/* @vite-ignore */url) as {buildTableWorkbook:(rows:string[][],title:string)=>Blob};if(!rows.length)throw Error('Chưa có dữ liệu server để xuất.');const objectUrl=URL.createObjectURL(module.buildTableWorkbook([headers,...values],'Bài 1 / '+lesson+' / '+uid));const a=document.createElement('a');a.href=objectUrl;a.download='LABVIRT-'+lesson+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),3000);}catch(e){setResult({scope,rows,error:e instanceof Error?e.message:'Không xuất được báo cáo.'});}}
 return <article className="admin-panel" data-semiconductor-admin={lesson}>
  <h3>Kết quả Bài 1 / Phần 2–4</h3><p>Đọc cùng users/UID/labProgress với sinh viên; chỉ số liệu server xác nhận, chưa là điểm.</p>
  <label>Phần học <select aria-label="Chọn phần bán dẫn" value={lesson} onChange={e=>setLesson(e.target.value as SemiconductorLesson)}><option value="B1_P2">Phần 2 · Bảng 1.2</option><option value="B1_P3">Phần 3 · Bảng 1.3</option><option value="B1_P4">Phần 4 · Bảng 1.4</option></select></label>
  {lesson==='B1_P2'&&<label>Tình trạng <select value={defect} onChange={e=>setDefect(e.target.value)}><option value="NORMAL">Bình thường</option><option value="SHORT">Chập</option><option value="OPEN">Đứt</option></select></label>}
  {error&&<p role="alert">Chưa tải được dữ liệu Firebase: {error}</p>}<p role="status">{result.scope===scope?`${rows.length} trường hợp server xác nhận`:'Đang tải dữ liệu Firebase…'}</p>
  <div className="overflow-x-auto"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{values.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
  <button type="button" disabled={!rows.length} onClick={()=>void exportTable()}>Xuất Excel phần đang xem</button>
 </article>;
}
