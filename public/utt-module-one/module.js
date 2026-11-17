/* UTT Lab Module 1 - Bài 1: trải nghiệm thực hành có tiến độ theo người học.
   Không yêu cầu Gemini trực tuyến để dẫn dắt các thao tác xác định trước.
   Tiến độ của phiên bản này lưu trong localStorage theo UID của tài khoản. */
(() => {
  'use strict';
  const PARTS = [
    { title: 'Đọc và đo kiểm tra linh kiện thụ động', label: 'DMM · R / C / L', ready: true },
    { title: 'Kiểm tra chất lượng Diode chỉnh lưu và Diode Zener', label: 'DMM · Diode', ready: false },
    { title: 'Khảo sát mạch chỉnh lưu cầu có tụ lọc nguồn', label: 'Máy hiện sóng · Chỉnh lưu', ready: false },
    { title: 'Khảo sát mạch ổn áp dùng Diode Zener', label: 'Nguồn DC · Đặc tuyến', ready: false },
  ];
  const COMPONENTS = [
    { id: 'R_1K', name: 'R1', value: '1 kΩ ±5%', glyph: '🔩', kind: 'resistor' },
    { id: 'R_10K', name: 'R2', value: '10 kΩ ±5%', glyph: '🔩', kind: 'resistor' },
    { id: 'R_220', name: 'R3', value: '220 Ω ±5%', glyph: '🔩', kind: 'resistor' },
    { id: 'C_104', name: 'C1', value: '100 nF', glyph: '🟠', kind: 'capacitor' },
    { id: 'C_100U', name: 'C2', value: '100 µF', glyph: '🔋', kind: 'capacitor' },
    { id: 'L_10M', name: 'L', value: '10 mH', glyph: '🧲', kind: 'inductor' },
  ];
  const TASKS = [
    { id:'NORMAL', title:'Kiểm tra linh kiện bình thường', short:'SỐNG', desc:'Chọn đủ sáu linh kiện, đo và xác nhận chất lượng đạt.', color:'green' },
    { id:'SHORT', title:'Kiểm tra linh kiện ngắn mạch', short:'CHẠM', desc:'Đo thông mạch, nhận diện các linh kiện bị chập.', color:'red' },
    { id:'OPEN', title:'Kiểm tra linh kiện hở mạch', short:'ĐỨT', desc:'Đo thông mạch, nhận diện linh kiện bị đứt.', color:'' }
  ];
  const status = document.getElementById('saveStatus');
  const screen = document.getElementById('screen');
  const biscot = document.getElementById('biscot');
  const biscotText = document.getElementById('biscotText');
  const state = { screen:'roadmap', task:'NORMAL', selected:new Set(), userId:'guest', scores:{NORMAL:{},SHORT:{},OPEN:{}}, announced:false, frame:null };
  // Một nguồn trạng thái cho AI Biscot ở website chính; tuyệt đối không cập nhật ngược lên bộ đo.
  window.uttBiscotContext = () => ({
    screen:state.screen, task:state.task, selectedCount:state.selected.size,
    completed:totalComplete(),
  });
  const safeText = (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const keyFor = (id) => 'utt-module1-part1-v10:' + String(id).replace(/[^\w-]/g,'').slice(0,128);
  const completed = (task) => Object.keys(state.scores[task]||{}).filter(id => COMPONENTS.some(c=>c.id===id)).length;
  const allComplete = () => TASKS.every(task => completed(task.id)===6);
  const totalComplete = () => TASKS.reduce((sum,task)=>sum+completed(task.id),0);
  const formatProgress = (number,max=18) => `${Math.round(number*100/max)}%`;
  function persist(){
    try { localStorage.setItem(keyFor(state.userId),JSON.stringify(state.scores)); status.textContent='Đã lưu trên trình duyệt'; }
    catch { status.textContent='Không lưu được tiến độ'; }
    window.parent.postMessage({ type:'utt-module-progress', completed:totalComplete(), total:18, payload:state.scores },location.origin==='null'?'*':location.origin);
  }
  function load(id){
    state.userId=id||'guest'; state.scores={NORMAL:{},SHORT:{},OPEN:{}};
    try {
      const val=JSON.parse(localStorage.getItem(keyFor(state.userId))||'{}');
      for(const task of TASKS){
        const entries = val[task.id];
        if(entries && typeof entries==='object' && !Array.isArray(entries)) {
          for(const c of COMPONENTS){
            const r=entries[c.id];
            if(r && typeof r==='object' && typeof r.reading==='string' && r.reading.length<70 && ['OHM','CAP','CONT'].includes(r.mode)){
              state.scores[task.id][c.id]={reading:r.reading,mode:r.mode,at:typeof r.at==='number'?r.at:0};
            }
          }
        }
      }
    } catch { /* Bỏ qua dữ liệu trình duyệt không hợp lệ. */ }
  }
  function say(message){biscotText.textContent=message;biscot.hidden=false;}
  function hideBiscot(){biscot.hidden=true;}
  function progressBar(value,max){return `<div class="progress-bar"><i style="width:${formatProgress(value,max)}"></i></div>`;}
  function partButtons(){return PARTS.map((p,i)=>`<button type="button" data-part="${i}" class="part-card ${i===0?'active':''}" aria-label="Phần ${i+1}: ${safeText(p.title)}"><span class="number">0${i+1}</span><span><strong>${safeText(p.title)}</strong><small>${safeText(p.label)} · ${i===0?`${totalComplete()}/18 trường hợp`:'Mẫu tham khảo của giáo viên'}</small></span><span class="chev">›</span></button>`).join('');}
  function roadmap(){
    state.screen='roadmap';
    const n=totalComplete();
    screen.innerHTML=`<div class="kicker">☷ LỘ TRÌNH THỰC HÀNH · CHƯƠNG TRÌNH ĐIỆN TỬ</div><h1 class="headline">Module 1 — Thực hành điện tử cơ bản</h1><p class="lead">Bốn phần lớn của Bài 1. Chọn Module 1 để vào phòng lab; AI Biscot sẽ giới thiệu bài và hướng dẫn chọn nhiệm vụ. Tiến độ xanh/đỏ cập nhật sau mỗi trường hợp đo đạt yêu cầu.</p><div class="roadmap-grid"><div class="roadmap-photo"><div class="photo-caption"><span class="kicker">PHÒNG THÍ NGHIỆM 3D</span><h3>Vào phòng thực hành</h3><p>Camera từ xa tiến tới bàn thiết bị, sau đó AI Biscot sẽ trình chiếu 4 phần của Bài 1.</p><button class="btn" data-action="enter">Vào phòng thí nghiệm →</button></div></div><div class="panel panel-pad"><h2 style="margin-top:0">BÀI 1 — 4 PHẦN LỚN</h2><div class="cards4">${partButtons()}</div><div class="road-group"><h3 class="road-title">Phần 1 · 18 trường hợp đo</h3><div class="progress-summary"><span>Tiến độ của bạn</span><b>${n}/18 · ${formatProgress(n)}</b></div>${progressBar(n)}<div class="status-list" style="margin-top:14px">${TASKS.map(t=>`<div class="status-row"><span class="indicator ${completed(t.id)===6?'done':'todo'}">${completed(t.id)===6?'✓':'×'}</span><span><strong>${safeText(t.title)} (${t.short})</strong><small>${completed(t.id)===6?'Hoàn thành':'Chưa hoàn thành đủ các trường hợp'}</small></span><span class="score">${completed(t.id)}/6</span></div>`).join('')}</div></div></div></div>`;
    hideBiscot();
  }
  function enterRoom(){
    state.screen='room'; screen.innerHTML=`<div class="room"><div class="room-photo"></div><iframe class="room-model" id="room3d" title="Mô hình phòng thí nghiệm Blender 3D" src="./intro3d.html" loading="lazy"></iframe><div class="room-content"><section><span class="kicker">TRẢI NGHIỆM PHÒNG THỰC HÀNH</span><h1 class="room-title">MODULE 1</h1><p class="room-p">Camera đang tiến từ cửa phòng tới bàn thí nghiệm. AI Biscot sẽ trình chiếu bốn phần lớn trong Bài 1.</p><button class="btn btn-secondary" data-action="parts">Bỏ qua hoạt ảnh →</button></section><div id="roomPanel" class="glass glass-panel" hidden><div class="kicker">AI BISCOT · BÀI 1</div><h2>Chọn một phần thực hành</h2>${partButtons(true)}</div></div></div>`;
    say('Chào mừng đến Module 1. Mình sẽ giới thiệu 4 phần lớn của Bài 1. Bạn chọn Phần 1 để bắt đầu nhé!');
    clearTimeout(enterRoom.timer);
    enterRoom.timer=setTimeout(()=>{if(state.screen==='room') revealParts();},2600);
  }
  function revealParts(){state.screen='parts';const panel=document.getElementById('roomPanel');if(panel){panel.hidden=false;panel.scrollIntoView({block:'nearest'});}say('Bài 1 gồm 4 phần: linh kiện thụ động, Diode, mạch chỉnh lưu cầu, và mạch ổn áp Zener. Hãy chọn Phần 1.');}
  function tasks(){state.screen='tasks';screen.innerHTML=`<div class="kicker">MODULE 1 › BÀI 1 › PHẦN 1</div><h1 class="headline">Đọc và đo kiểm tra linh kiện thụ động</h1><p class="lead">Chọn một trong ba nhiệm vụ. Mỗi nhiệm vụ cần đo đủ sáu linh kiện: R1, R2, R3, C1, C2 và cuộn cảm L. Làm xong một nhiệm vụ, quay lại để làm mục tiếp theo.</p><div class="task-grid">${TASKS.map((t,i)=>`<button type="button" class="task-card ${t.color}" data-task="${t.id}"><span class="task-count">0${i+1} · ${completed(t.id)}/6</span><div><strong>${completed(t.id)===6?'✓':'○'}</strong><h3>${safeText(t.title)} (${t.short})</h3><p>${safeText(t.desc)}</p></div><b>${completed(t.id)===6?'ĐÃ HOÀN THÀNH':'CHỌN NHIỆM VỤ'} →</b></button>`).join('')}</div><div style="margin-top:22px;display:flex;gap:12px;flex-wrap:wrap"><button class="btn btn-secondary" data-action="room">← Trở về 4 phần lớn</button><button class="btn btn-secondary" data-action="roadmap">Xem tiến độ tổng</button></div>`;say('Phần 1 có ba nhiệm vụ: SỐNG, CHẠM và ĐỨT. Chọn một nhiệm vụ, mình sẽ hướng dẫn chọn đủ bộ linh kiện.');}
  function kit(){
    state.screen='kit'; const task=TASKS.find(x=>x.id===state.task);
    screen.innerHTML=`<div class="kicker">MODULE 1 › PHẦN 1 › ${task.short}</div><h1 class="headline">AI Biscot · Chuẩn bị dụng cụ</h1><p class="lead">Trước khi đo, hãy chọn đủ 6 linh kiện để luyện tập trong tình trạng ${task.title.toLowerCase()}. Chỉ khi chọn đủ mới mở mô phỏng.</p><div class="kit-wrap"><div class="panel kit-left"><img class="mascot" src="/ai-biscot-avatar-transparent.png" alt="AI Biscot" onerror="this.style.display='none'"><h2>Hướng dẫn chọn linh kiện</h2><div class="speech">Mình là Biscot! Nhiệm vụ hiện tại: <strong>${task.title} (${task.short})</strong>.<br>Chọn đủ <b>R1, R2, R3, C1, C2 và L</b> sau đó nhấn <b>Xác nhận</b>. Chú ý lựa chọn đúng thang DMM khi bắt đầu đo.</div><p style="font-size:12px;color:#a4c4e7">Nhấn từng hình linh kiện bên phải để lựa chọn.</p></div><div class="panel panel-pad"><h2 style="margin-top:0">Bộ linh kiện cần kiểm tra <span id="count" style="color:#64dff8">0/6</span></h2><div class="kit-grid">${COMPONENTS.map(c=>`<button type="button" class="component-card ${state.selected.has(c.id)?'selected':''}" data-comp="${c.id}" aria-pressed="${state.selected.has(c.id)}"><span class="component-visual"><img src="./components/${c.id}.svg" alt="" width="116" height="63" /></span><b>${c.name}</b><small>${c.value}</small><span>${state.selected.has(c.id)?'✓ Đã chọn':'＋ Chọn'}</span></button>`).join('')}</div><div class="kit-actions"><button id="confirm" class="btn btn-green" data-action="confirm" ${state.selected.size===6?'':'disabled'}>Xác nhận bộ linh kiện & bắt đầu →</button><button class="btn btn-secondary" data-action="tasks">← Quay lại nhiệm vụ</button></div><p style="color:#abc4df;font-size:12px">Đã hoàn thành trước đó: ${completed(state.task)}/6. Bạn có thể đo lại để ôn tập.</p></div></div>`;
    updateKit();say('Hãy chọn đủ sáu linh kiện: R1, R2, R3, C1, C2 và cuộn cảm L. Mình sẽ kiểm tra danh sách trước khi cho bắt đầu.');
  }
  function updateKit(){if (document.getElementById('count')) { (document.getElementById('count').textContent=`${state.selected.size}/6`); }const b=document.getElementById('confirm');if(b)b.disabled=state.selected.size!==6; for(const b of document.querySelectorAll('[data-comp]')){const on=state.selected.has(b.dataset.comp); b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));b.lastElementChild.textContent=on?'✓ Đã chọn':'＋ Chọn';}}
  function measurements(){return COMPONENTS.map(c=>`<div class="measured-item ${state.scores[state.task][c.id]?'hit':''}"><b>${c.name}</b>${state.scores[state.task][c.id]?'✓ Đạt · '+safeText(state.scores[state.task][c.id].reading):'○ Chưa đo'}</div>`).join('');}
  function practice(){
    state.screen='practice';const task=TASKS.find(t=>t.id===state.task);
    screen.innerHTML=`<div class="practice-head"><div><span class="kicker">PHẦN 1 / ${task.short} / PHÒNG ĐO 3D</span><h2>${safeText(task.title)}</h2></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="small-btn" data-action="tasks">← Danh sách 3 nhiệm vụ</button><button class="small-btn" data-action="guide">📖 Quy tắc đo</button></div></div><div class="measured-grid" id="measuredGrid">${measurements()}</div><iframe id="sim" class="pr-frame" title="Mô phỏng DMM 3D và Bảng số liệu 1.1" src="./teacher/part1.html" allow="fullscreen" referrerpolicy="same-origin"></iframe><p style="font-size:12px;color:#9eb9d7;margin-top:12px">Chọn linh kiện trên bảng bên phải, vặn thang Ω / 🔔 / C, cắm đủ hai que đo, sau đó nhấn “Ghi vào Bảng số liệu 1.1”. Phải đo hợp lệ đủ 6 linh kiện để kết thúc nhiệm vụ.</p>`;
    state.frame=document.getElementById('sim');state.frame.addEventListener('load',()=>{state.frame?.contentWindow?.postMessage({type:'utt-init-practice',task:state.task,already:Object.keys(state.scores[state.task])},location.origin);});
    say(`Nhiệm vụ ${task.short}: ${task.id==='NORMAL'?'điện trở và cuộn cảm dùng thang Ω, tụ dùng thang C.':'dùng thang thông mạch 🔔 để phát hiện chạm hoặc đứt.'} Hãy cắm đủ hai que đo trước khi ghi báo cáo.`);
  }
  function result(){
    state.screen='result';const task=TASKS.find(t=>t.id===state.task);
    screen.innerHTML=`<div class="panel result"><div class="trophy">🏆</div><div class="kicker">HOÀN THÀNH NHIỆM VỤ</div><h1>Chúc mừng! Đã hoàn thành mục ${task.short}</h1><p>Bạn đã ghi đủ <b>6/6</b> trường hợp trong mục <b>${task.title}</b>. Tiến độ đã được lưu trên trình duyệt theo tài khoản đang dùng.<br>Tổng Phần 1: <b>${totalComplete()}/18</b>.</p><div class="result-actions"><button class="btn btn-green" data-action="tasks">← Quay lại chọn mục tiếp theo</button><button class="btn btn-secondary" data-action="roadmap">Xem lộ trình xanh/đỏ</button>${allComplete()?'<button class="btn" data-action="room">✓ Đã hoàn thành Phần 1 · Về 4 phần lớn</button>':''}</div></div>`;
    say('Bạn đã hoàn thành sáu linh kiện của nhiệm vụ này. Hãy quay lại danh sách ba nhiệm vụ để chọn mục tiếp theo!');
  }
  function selectPart(i){
    if(i===0){tasks();return;}
    const p=PARTS[i];
    screen.innerHTML=`<div class="kicker">MODULE 1 · PHẦN ${i+1}</div><h1 class="headline">${safeText(p.title)}</h1><p class="lead">Mô phỏng mẫu của giáo viên được giữ nguyên để bạn tham khảo. Bản này tập trung hoàn thiện Phần 1 và chưa dùng tiến độ của Phần ${i+1} để chấm kết quả.</p><button class="btn btn-secondary" data-action="room">← Quay lại 4 phần lớn</button><iframe class="pr-frame" style="margin-top:18px" title="Mô phỏng mẫu giáo viên Phần ${i+1}" src="./teacher/part${i+1}.html"></iframe>`;
    state.screen='preview';say(`Đây là mô phỏng mẫu của Phần ${i+1}. Khi hoàn thiện lộ trình phần này, mình sẽ hướng dẫn theo từng nhiệm vụ.`);
  }
  function renderRoadmap(){clearTimeout(enterRoom.timer);state.screen='roadmap';roadmap();}
  document.getElementById('roadmapBtn').addEventListener('click',renderRoadmap);
  screen.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    const action=button.dataset.action;
    if(button.dataset.part!==undefined){selectPart(Number(button.dataset.part));return;}
    if(button.dataset.task){state.task=button.dataset.task;state.selected.clear();kit();return;}
    if(button.dataset.comp){if (state.selected.has(button.dataset.comp)) { state.selected.delete(button.dataset.comp); } else { state.selected.add(button.dataset.comp); }updateKit();return;}
    switch(action){case 'enter':enterRoom();break;case 'parts':revealParts();break;case 'room':enterRoom();break;case 'roadmap':renderRoadmap();break;case 'tasks':tasks();break;case 'all':COMPONENTS.forEach(c=>state.selected.add(c.id));updateKit();break;case 'confirm':if(state.selected.size===6)practice();break;case 'guide':say('Đo điện trở/cuộn cảm bình thường: Ω. Đo tụ bình thường: thang C. Kiểm tra chập/đứt: thang thông mạch 🔔. Cắm hai que vào hai đầu linh kiện, không đo khi DMM ở OFF.');break;}
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin)return;
    const m=event.data;if(!m||typeof m!=='object')return;
    if(m.type==='utt-host-init'){
      // UID do React gửi từ tài khoản xác thực. Không nhận UID từ iframe thí nghiệm.
      if(event.source!==window.parent)return;
      const id=typeof m.uid==='string' && m.uid.length<=128 ? m.uid : 'guest';
      if(id!==state.userId){load(id);if(state.screen==='roadmap')roadmap();}
    }
    if(m.type==='utt-practice-record'){
      if(state.screen!=='practice'||event.source!==state.frame?.contentWindow||m.task!==state.task)return;
      if(!COMPONENTS.some(c=>c.id===m.component)||!['OHM','CAP','CONT'].includes(m.mode))return;
      const expected=m.task==='NORMAL'?(COMPONENTS.find(c=>c.id===m.component).kind==='capacitor'?'CAP':'OHM'):'CONT';
      if(m.mode!==expected||typeof m.reading!=='string'||m.reading.length>60)return;
      state.scores[state.task][m.component]={reading:m.reading,mode:m.mode,at:Date.now()};persist();
      if (document.getElementById('measuredGrid')) { (document.getElementById('measuredGrid').innerHTML=measurements()); }
      say(`Đã ghi kết quả ${COMPONENTS.find(c=>c.id===m.component).name}: ${m.reading}. Tiến độ nhiệm vụ ${completed(state.task)}/6.`);
      if(completed(state.task)===6){setTimeout(()=>{if(state.screen==='practice')result();},850);}
    }
    if(m.type==='utt-room-ready' && ['room','parts'].includes(state.screen) && event.source===document.getElementById('room3d')?.contentWindow){document.getElementById('room3d').classList.add('ready');}
    if(m.type==='utt-practice-alert'&&state.screen==='practice'&&event.source===state.frame?.contentWindow){say(String(m.text||'Vui lòng kiểm tra thao tác đo.').slice(0,220));}
  });
  load('guest');roadmap();
  if(new URLSearchParams(location.search).get('enter')==='1')enterRoom();
  // Cho phép người dùng mở trực tiếp file (không đăng nhập) để xem trước bằng localStorage guest.
})();
