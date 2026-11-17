/* Cầu nối Phần 1 (mẫu giáo viên) ↔ Lộ trình UTT Lab.
   Giữ scene 3D và logic DMM gốc, nhưng chỉ cho ghi số liệu khi đo hợp lệ.
   Không gửi số liệu ra máy chủ hay bên thứ ba. */
(() => {
  'use strict';
  let task = 'NORMAL';
  const allowed = ['NORMAL','SHORT','OPEN'];
  const validComponents = ['R_1K','R_10K','R_220','C_104','C_100U','L_10M'];
  const done = new Set();
  function report(kind,props){window.parent.postMessage({type:kind,...props},window.location.origin==='null'?'*':window.location.origin);}
  function warning(message){
    const el = document.getElementById('uttFeedback');
    if(el){el.textContent=message;el.classList.add('visible');el.classList.remove('ok');}
    report('utt-practice-alert',{text:message});
  }
  function ok(message){
    const el = document.getElementById('uttFeedback');
    if(el){el.textContent=message;el.classList.add('visible','ok');}
  }
  function mountFeedback(){
    const panel = document.querySelector('.inspect-panel');
    const d=document.createElement('div');d.id='uttFeedback';d.setAttribute('role','status');
    if(panel)panel.appendChild(d);
  }
  function selectTask(name){
    task=allowed.includes(name)?name:'NORMAL';
    const def=document.getElementById('defectPicker');
    if(def){def.value=task;def.disabled=true;def.title='Trạng thái do nhiệm vụ đã chọn quyết định';}
    try { applyDefect(); }catch {warning('Không thể khởi tạo trạng thái mô phỏng. Kiểm tra thư viện Three.js.');}
    const title=document.querySelector('.top-bar h1');
    if(title)title.textContent=`BÀI 1 – PHẦN 1 · ${task==='NORMAL'?'KIỂM TRA LINH KIỆN SỐNG':task==='SHORT'?'KIỂM TRA LINH KIỆN CHẠM':'KIỂM TRA LINH KIỆN ĐỨT'}`;
    ok('Chọn đúng thang đo và cắm đủ hai que vào hai chân linh kiện trước khi ghi Bảng 1.1.');
  }
  function record(){
    try {
      if(!validComponents.includes(activeCompKey))return warning('Linh kiện không hợp lệ.');
      if(task!==activeDefect)return warning('Trạng thái linh kiện đã khác nhiệm vụ hiện tại.');
      if(!probeRedPin||!probeBlackPin||probeRedPin===probeBlackPin)return warning('Phải cắm hai que đo vào hai đầu KHÁC NHAU của linh kiện.');
      const component = COMP_DB[activeCompKey];
      const expected = task==='NORMAL' ? (component.type==='CAP'?'CAP':'OHM') : 'CONT';
      if(dmmMode!==expected)return warning(`Sai thang DMM. ${task==='NORMAL'?(component.type==='CAP'?'Tụ điện chọn thang điện dung (−||−).':'Điện trở/cuộn cảm chọn thang Ω.'):'Kiểm tra CHẠM/ĐỨT chọn thang thông mạch (🔔).'}`);
      const lcd=document.getElementById('lcd-val');
      const read=(lcd?.innerText||lcd?.textContent||'').trim();
      if(!read || read==='OFF')return warning('Chưa có số đo hợp lệ.');
      if(task==='NORMAL' && (!Number.isFinite(parseFloat(read)) || read==='O.L'))return warning('Linh kiện bình thường cần có số đo giá trị hợp lệ.');
      if(task==='OPEN' && read!=='O.L')return warning('Linh kiện ĐỨT phải có kết quả hở mạch O.L.');
      if(task==='SHORT' && !read.includes('0.01'))return warning('Linh kiện CHẠM phải có kết quả thông mạch gần 0 Ω.');
      if(typeof COMP_DB==='undefined')return warning('Mô hình không được tải đúng.');
      const tbody=document.getElementById('reportTbody');
      const existing=tbody.querySelector(`tr[data-utt-id="${activeCompKey}"]`);
      const row=existing||document.createElement('tr');
      row.dataset.uttId=activeCompKey;
      const label=component.name;
      row.innerHTML='';
      [label,component.valNominal,`±${component.tol}%`,read,task==='NORMAL'?'Bình thường':task==='SHORT'?'Ngắn mạch':'Hở mạch','ĐẠT'].forEach((value,index)=>{
        const td=document.createElement('td');td.textContent=value;
        if(index===5){td.style.color='#4ade80';td.style.fontWeight='bold';}
        row.appendChild(td);
      });
      if(!existing)tbody.appendChild(row);
      done.add(activeCompKey);
      report('utt-practice-record',{task,component:activeCompKey,mode:dmmMode,reading:read});
      ok(`Đã ghi ${label}: ${read}. Tiến độ trong phiên ${done.size}/6. ${done.size===6?'Hoàn thành nhiệm vụ!':'Tiếp tục chọn linh kiện khác.'}`);
    }catch {warning('Không thể ghi số liệu. Kiểm tra khởi tạo mô phỏng 3D và DMM.');}
  }
  mountFeedback();
  window.saveToReport=record;
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || event.source!==parent)return;
    const m=event.data;
    if(m?.type==='utt-init-practice'){
      if(allowed.includes(m.task))selectTask(m.task);
      if(Array.isArray(m.already))for(const id of m.already)if(validComponents.includes(id))done.add(id);
    }
  });
  try{
    if(typeof THREE==='undefined' || !document.querySelector('#webgl-canvas canvas'))warning('Không tải được Three.js. Cần kết nối Internet để chạy mô hình 3D của giáo viên.');
    else ok('Mô phỏng 3D đã sẵn sàng. Hãy chọn linh kiện và thao tác đồng hồ DMM.');
  }catch{warning('Mô hình 3D chưa tải được. Kiểm tra Internet.');}
})();
