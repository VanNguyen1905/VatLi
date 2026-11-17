import {buildTableWorkbook} from './lab-v11/lab-xlsx-export.js';
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function semiconductorTable(part,records=[],defect='NORMAL'){
 const rows=Array.isArray(records)?records.filter(r=>r?.lessonId==='B1_P'+part&&Array.isArray(r.columns)):[];
 if(part===2)return {head:['Mã linh kiện','Điện áp chiều thuận (V)','Kết quả chiều ngược (V)','Trạng thái Tốt/Hỏng'],rows:['1N4007','1N4148','ZENER_5V1'].map(kind=>rows.find(r=>r.key===kind+'_'+defect)?.columns||[kind,'—','—','Chưa đo'])};
 if(part===3)return {head:['Tham số đo','C = 0 µF','C = 10 µF','C = 100 µF','C = 1000 µF'],rows:['Vp,out (V)','VDC (V)','Vripple (V)','Dạng sóng'].map((label,i)=>[label,...[0,10,100,1000].map(cap=>rows.find(r=>r.key==='C'+cap)?.columns[i+1]||'—')])};
 return {head:['Vin (V)','Vout (V)','IL (mA)','Sụt áp trên Rs (V)'],rows:[1,2,3,4,5,6,7,8,9,10,12].map(vin=>rows.find(r=>r.key==='VIN'+vin)?.columns||[String(vin),'—','—','—'])};
}
export function semiconductorReportMarkup(part,state={},defect='NORMAL'){
 const table=semiconductorTable(part,state.records,defect),count=state.records?.length||0,total=part===2?9:part===3?4:11;
 return `<div class="page-kicker">BÀI 1 / SỔ ĐO PHẦN ${part}</div><div class="report-head"><div><h1>Kết quả &amp; Báo cáo</h1><p>Bảng 1.${part} · ${count}/${total} trường hợp mô phỏng đã ghi. Chưa xác nhận điểm.</p></div><div class="btn-row"><button class="btn btn-primary" data-export-semi="xlsx">↓ Excel</button><button class="btn btn-secondary" data-export-semi="csv">↓ CSV</button><button class="btn btn-secondary" data-go-workbench="${part}">Vào phòng 3D</button></div></div><div class="tabs" role="tablist">${[1,2,3,4].map(p=>`<button class="tab ${p===part?'active':''}" data-report-part="${p}">Bảng 1.${p}</button>`).join('')}</div>${part===2?`<div class="btn-row">${['NORMAL','SHORT','OPEN'].map(d=>`<button class="btn btn-secondary" data-semi-defect="${d}" aria-pressed="${d===defect}">${{NORMAL:'Bình thường',SHORT:'Chập',OPEN:'Đứt'}[d]}</button>`).join('')}</div>`:''}<section class="panel report-preview"><h3>Bảng số liệu 1.${part}</h3><p role="status">${safe(state.status||'Chưa nhận xác nhận Firebase; không suy ra đã lưu cloud.')}</p><div class="overflow-x-auto"><table class="report-table"><thead><tr>${table.head.map(h=>`<th>${safe(h)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map(c=>`<td>${safe(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>Chỉ hiển thị kết quả đã ghi từ dụng cụ; ô chưa đo giữ trống. Phần 1 dùng khóa dữ liệu riêng.</p></section>`;
}
export function semiconductorExportRows(part,records,defect='NORMAL',identity={}){
 const table=semiconductorTable(part,records,defect),rows=[table.head,...table.rows];
 if(part===2){rows.push([],['Phụ lục: các trạng thái đã thực đo'],['Trạng thái mẫu',...table.head,'Kết luận']);for(const condition of ['NORMAL','SHORT','OPEN'])for(const kind of ['1N4007','1N4148','ZENER_5V1']){const record=records.find(r=>r.key===kind+'_'+condition);if(record)rows.push([condition,...record.columns,record.conclusion||'']);}}
 rows.push([],['MSSV',identity.studentCode||''],['Họ tên',identity.fullName||''],['Nguồn','Mô phỏng tương tác Blender; chưa xác nhận điểm']);return rows;
}
export function exportSemiconductorTable(part,state,defect,format,identity={}){
 if(!state?.records?.length)throw Error('Chưa có phép đo hợp lệ để xuất.');const rows=semiconductorExportRows(part,state.records,defect,identity);
 const blob=format==='xlsx'?buildTableWorkbook(rows,'Bảng 1.'+part,{sourceDescription:'Số đo mô phỏng theo tài khoản',note:'Chưa được giảng viên xác minh điểm.'}):new Blob(['\uFEFF'+rows.map(row=>row.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`LABVIRT-Bang-1-${part}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
