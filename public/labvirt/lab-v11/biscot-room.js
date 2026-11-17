/** LABVIRT B1/P1 — trợ giảng Biscot thực trong phòng.
 * Không can thiệp geometry, solver, camera, giá trị LCD hoặc ghi điểm.
 * Online chỉ gọi qua React/Firebase cùng origin đã xác thực; offline đọc diagnostics.
 */
import { nextStep as passiveNextStep, localHint as passiveLocalHint } from './biscot-step-engine.js';
import {semiconductorStep,semiconductorHint} from './semiconductor-guidance.js';
import {transistorStep,transistorHint} from './transistor-guidance.js';
import {TRANSISTOR_LESSONS} from './transistor-lessons.js';
import { readableBiscotText } from './biscot-text-format.js';
import { resolveKnowledge, isLiveStateQuestion } from './biscot-knowledge-engine.js';
import {requestedTarget} from './biscot-tutor-core.js';

(() => {
  'use strict';
  if (window.__biscotRoomV12) return;
  window.__biscotRoomV12 = true;
  const root = document.createElement('aside');
  root.id = 'biscot-room';
  root.dataset.mood = 'idle';
  root.setAttribute('aria-label','AI Biscot trong phòng thí nghiệm');
  const asset='/ai-biscot-avatar-transparent.png';
  root.innerHTML = `
    <section class="biscot-panel" id="biscot-room-panel" role="dialog" aria-label="Hỏi AI Biscot về bài 1" hidden>
      <header class="biscot-header"><img class="biscot-character" src="${asset}" alt="AI Biscot"/><div><strong>AI Biscot ✨</strong><small>Trợ giảng Bài 1 · Phần 1</small></div><button type="button" class="biscot-close" id="biscot-close" aria-label="Thu nhỏ Biscot">×</button></header>
      <div class="biscot-live" role="status"><i class="biscot-light" id="biscot-light"></i><span id="biscot-live-text">Đang chờ trạng thái DMM…</span></div>
      <div id="biscot-progress" class="biscot-progress" aria-live="off">Tiến độ Bài 1: đang tải…</div>
      <div id="biscot-talk" class="biscot-talk" role="log" aria-live="polite"></div>
      <div class="biscot-actions"><button type="button" data-biscot-action="next">Bước tiếp</button><button type="button" data-biscot-action="point">Chỉ vị trí</button><button type="button" data-biscot-action="diagnose">Kiểm tra DMM</button><button type="button" data-biscot-action="wave">Chào</button><button type="button" data-biscot-action="run">Chạy</button><button type="button" data-biscot-action="jump">Nhảy</button><button type="button" data-biscot-action="dance">Nhảy múa</button></div>
      <div class="biscot-actions"><button type="button" id="biscot-guide">Hướng dẫn & làm mẫu</button><button type="button" id="biscot-mic" aria-pressed="false">🎙 Nói</button><small id="biscot-voice-status" role="status">Gõ câu hỏi hoặc dùng mic của trình duyệt.</small></div>
      <form id="biscot-form" class="biscot-form"><input id="biscot-question" type="text" maxlength="900" autocomplete="off" aria-label="Hỏi Biscot" placeholder="Ví dụ: Vì sao DMM hiện O.L?"/><button id="biscot-send" type="submit">Gửi</button></form>
    </section>
    <button type="button" class="biscot-launch" id="biscot-launch" aria-label="Hỏi AI Biscot trong phòng 3D" aria-expanded="false"><img class="biscot-character" src="${asset}" alt=""/><span>Biscot ✨<small>Hỏi ngay trong phòng lab</small></span></button>
    <div class="biscot-spot" id="biscot-spot" hidden><span id="biscot-spot-label">Vị trí thao tác</span></div>`;
  document.body.append(root);
  // Ẩn robot demo cũ; không xóa dữ liệu, mesh/phòng, hoặc module đo.
  for (const id of ['mentorOpen','mentorPanel']) { const el=document.getElementById(id); if(el) el.style.display='none'; }

  const byId=id=>document.getElementById(id);
  const semiconductor=()=>window.labvirtSemiconductorSession?.context?.();
  const transistor=()=>window.labvirtTransistorSession?.context?.();
  const nextStep=state=>{const advanced=transistor(),semi=semiconductor();return advanced?transistorStep(state,advanced):semi?semiconductorStep(state,semi):passiveNextStep(state);};
  const localHint=(question,state)=>{const advanced=transistor(),semi=semiconductor();return advanced?transistorHint(question,state,advanced):semi?semiconductorHint(state,semi):passiveLocalHint(question,state);};
  const log=byId('biscot-talk'), panel=byId('biscot-room-panel'), input=byId('biscot-question');
  const sendButton=byId('biscot-send'), spot=byId('biscot-spot');
  let current=null, previous='', previousRecorded=null, moodTimeout=0, highlightUntil=0, inFlight=null, seq=0, hostReady=false, scope=null, querying=false,answerTimer=0;
  let externalHighlight=false,recognition=null;
  const own = (o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function clamp(value,max=120){return String(value??'').slice(0,max);}
  function say(text,role='mentor') {
    const node=document.createElement('p');node.className='biscot-bubble'+(role==='student'?' user':role==='system'?' system':'');
    node.textContent=readableBiscotText(clamp(text,12000));log.append(node);
    while(log.children.length>32)log.firstElementChild?.remove();log.scrollTop=log.scrollHeight;
  }
  function animate(mood, duration=2500) {
    clearTimeout(moodTimeout);root.dataset.mood=mood;
    moodTimeout=setTimeout(()=>root.dataset.mood='idle',duration);
  }
  function open() {
    document.querySelectorAll('.dock-tool[open]').forEach(tool=>{tool.open=false;});
    root.classList.add('is-open');
    const report=document.getElementById('reportBody');
    if(report && !report.classList.contains('hidden')){
      report.classList.add('hidden');
      const toggle=document.getElementById('reportToggle');
      if(toggle)toggle.textContent='Mở bảng ▴';
    }
    panel.hidden=false;byId('biscot-launch').setAttribute('aria-expanded','true');animate('wave');
    if(!log.childElementCount) say('Chào bạn! Mình là Biscot của website chính. Mình đang theo dõi trạng thái mô phỏng: thiết bị, jack, que đo, màn LCD và bước thực hành. Bạn có thể hỏi ngay khi gặp khó khăn.');
    input.focus({preventScroll:true});
  }
  function close(){panel.hidden=true;root.classList.remove('is-open');byId('biscot-launch').setAttribute('aria-expanded','false');spot.hidden=true;}
  byId('biscot-guide').onclick=()=>{if(!window.labvirtTutor)return say('Làm mẫu tương tác hiện hỗ trợ Bài 1 Phần 1. Các phần khác dùng hướng dẫn theo trạng thái hiện có.','system');close();window.dispatchEvent(new Event('biscot:open-guide'));};
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(Recognition){
    recognition=new Recognition();recognition.lang='vi-VN';recognition.interimResults=false;recognition.maxAlternatives=1;
    recognition.onresult=event=>{input.value=String(event.results?.[0]?.[0]?.transcript||'').slice(0,900);byId('biscot-voice-status').textContent='Kiểm tra nội dung rồi nhấn Gửi.';};
    recognition.onerror=()=>{byId('biscot-voice-status').textContent='Không nhận được giọng nói. Bạn vẫn có thể nhập câu hỏi.';};
    recognition.onend=()=>byId('biscot-mic').setAttribute('aria-pressed','false');
    byId('biscot-mic').onclick=()=>{if(byId('biscot-mic').getAttribute('aria-pressed')==='true'){recognition.stop();return;}try{recognition.start();byId('biscot-mic').setAttribute('aria-pressed','true');byId('biscot-voice-status').textContent='Đang nghe bằng dịch vụ nhận giọng nói của trình duyệt…';}catch{byId('biscot-voice-status').textContent='Mic chưa sẵn sàng; hãy nhập bằng bàn phím.';}};
  }else{byId('biscot-mic').disabled=true;byId('biscot-voice-status').textContent='Trình duyệt chưa hỗ trợ nhận giọng nói. Dùng ô nhập câu hỏi.';}
  window.addEventListener('biscot:tutor-say',event=>{if(typeof event.detail?.text==='string'){say(event.detail.text);animate(event.detail.mood||'point');}});
  window.addEventListener('biscot:point',event=>{const p=event.detail;externalHighlight=!!p;spot.hidden=!p?.visible;if(p?.visible){spot.style.left=p.x+'px';spot.style.top=p.y+'px';byId('biscot-spot-label').textContent=p.label;}});
  byId('biscot-launch').addEventListener('click',()=>panel.hidden?open():close());
  byId('biscot-close').addEventListener('click',close);
  const reportToggle=document.getElementById('reportToggle');
  if(reportToggle)reportToggle.addEventListener('click',()=>{
    if(!document.getElementById('reportBody')?.classList.contains('hidden'))close();
  });
  document.querySelectorAll('.dock-tool').forEach(tool=>tool.addEventListener('toggle',()=>{if(tool.open)close();}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)close();});
  function fromDiagnostics() {
    if(typeof window.labvirtDiagnostics!=='function')return null;
    let d;try {d=window.labvirtDiagnostics();}catch{return null;}
    if(!d||typeof d!=='object')return null;
    const state={
      lessonId:clamp(d.lessonId||'B1_P1',24), screen:'practice', source:'labvirt-v8',
      component:clamp(d.component,20),defect:clamp(d.defect||'UNKNOWN',20),boardMounted:d.boardMounted===true,
      mode:clamp(d.mode||'OFF',20),blackJack:clamp(d.blackJack||'NONE',20),redJack:clamp(d.redJack||'NONE',20),
      black:d.blackPin||null,red:d.redPin||null,
      powered:d.powered===true,ready:d.modelsLoaded===true&&d.frameVerified===true,
      measurement:{valid:d.validMeasure===true,display:clamp(d.lcd,60),reason:clamp(d.reason,60),status:clamp(d.measurementStatus||d.lcdState||'',90),quantity:clamp(d.measurementQuantity,50),value:Number.isFinite(d.measurementValue)?d.measurementValue:null,conclusion:clamp(d.measurementConclusion,150)},
      finishedRecords:Number.isInteger(d.completed)?d.completed:0,
      contacts:d.contacts||{},savedCases:Array.isArray(d.savedCases)?d.savedCases:[],error:clamp(d.error||'',160),
    };
    return state;
  }
  function progressDisplay(state, step) {
    const advanced=transistor(),definition=advanced&&TRANSISTOR_LESSONS[advanced.lessonId];if(definition){byId('biscot-progress').textContent=`${advanced.lessonId}: ${advanced.rows}/${definition.keys.length} trường hợp mô phỏng đã ghi. ${step.title}. Chưa xác nhận điểm.`;root.querySelector('.biscot-header small').textContent=`Trợ giảng Bài ${definition.course} · Phần ${definition.part}`;panel.setAttribute('aria-label',`Hỏi AI Biscot về Bài ${definition.course}`);return;}
    const semi=semiconductor();if(semi){const total=semi.partId==='B1_P2'?9:semi.partId==='B1_P3'?4:11;byId('biscot-progress').textContent=`${semi.partId}: ${semi.rows}/${total} trường hợp mô phỏng đã ghi. ${step.title}.`;root.querySelector('.biscot-header small').textContent='Trợ giảng Bài 1 · Phần '+semi.partId.slice(-1);return;}
    const total=18;
    const saved=Array.isArray(state.savedCases)?state.savedCases:[];
    const unique=new Set(saved.filter(item=>item&&typeof item.component==='string'&&typeof item.defect==='string')
      .map(item=>`${item.component}:${item.defect}`));
    const completed=Math.max(0,Math.min(total,Math.min(unique.size,state.finishedRecords)));
    const currentKey=`${state.component}:${state.defect}`;
    const hasCurrent=unique.has(currentKey);
    const el=byId('biscot-progress');
    el.textContent=`BÀI 1 · PHẦN 1: ${completed}/${total} trường hợp đã ghi trên máy (${Math.round(completed/total*100)}%). `+
      `Mẫu ${state.component} / ${state.defect}: ${hasCurrent?'đã có bản ghi':'chưa ghi'}. Bước: ${step.title}.`;
    el.dataset.completed=String(completed);
  }
  function track() {
    const next=fromDiagnostics();if(!next){byId('biscot-live-text').textContent='Chưa có nguồn dữ liệu DMM. Đang chờ phòng 3D…';byId('biscot-light').classList.remove('is-live');return;}
    current=next;
    const step=nextStep(next);
    const fingerprint=JSON.stringify([next.component,next.defect,next.boardMounted,next.mode,next.blackJack,next.redJack,next.black,next.red,next.measurement,next.finishedRecords,next.ready]);
    if(fingerprint!==previous){
      progressDisplay(next,step);
      const badge=next.ready?'Đang nhận trạng thái mô phỏng':'Phòng 3D chưa sẵn sàng';
      byId('biscot-live-text').textContent=`${badge} · ${next.component} · ${next.mode} · LCD: ${next.measurement.display||'—'} · ${step?'Bước: '+step.title:'Đang xác định bước'}`;
      byId('biscot-light').classList.toggle('is-live',next.ready);
      if(previousRecorded!==null&&next.finishedRecords>previousRecorded){animate('success',3000);if(!panel.hidden)say(`Đã ghi thêm một trường hợp mô phỏng của ${next.lessonId}. Kiểm tra nhãn lưu server trên bảng; chưa xác nhận điểm.`);}
      previous=fingerprint;previousRecorded=next.finishedRecords;
      if (window.top!==window) { const total=TRANSISTOR_LESSONS[next.lessonId]?.keys.length||(next.lessonId==='B1_P2'?9:next.lessonId==='B1_P3'?4:next.lessonId==='B1_P4'?11:18);window.top.postMessage({type:'biscot:lab-context',source:'labvirt-v8',state:{lessonId:next.lessonId,screen:'practice',selectedComponent:next.component,componentDefect:next.defect,boardMounted:next.boardMounted,powered:next.powered,mode:next.mode,blackJack:next.blackJack,redJack:next.redJack,blackPin:next.black,redPin:next.red,lcd:next.measurement.display,measurementValid:next.measurement.valid,measurementReason:next.measurement.reason,sceneReady:next.ready,completed:next.finishedRecords,total,stepId:step?.id||'WAIT'}},location.origin); }
    }
    if(!externalHighlight){if(!spot.hidden&&Date.now()<highlightUntil)positionSpot();else spot.hidden=true;}
  }
  function positionSpot(){
    if(!current||!own(current.contacts,spot.dataset.target))return spot.hidden=true;
    const pos=current.contacts[spot.dataset.target];
    if(!pos||!pos.visible||!Number.isFinite(pos.x)||!Number.isFinite(pos.y))return spot.hidden=true;
    spot.style.left=pos.x+'px';spot.style.top=pos.y+'px';spot.hidden=false;
  }
  function point() {
    if(!current||!current.ready)return say('Cảnh Blender chưa tải xong nên mình chưa thể chỉ vị trí.','system');
    const step=nextStep(current);

    say(`Bước cần thực hiện: ${step.title}. ${step.detail} (Ngữ cảnh ${current.lessonId}).`);
    animate('point');
    if(!step.target)return;
    if(window.labvirtTutor){try{window.labvirtTutor.execute('focus_camera',{target:step.target});}catch(error){say(error.message,'system');}return;}
    spot.dataset.target=step.target;byId('biscot-spot-label').textContent=step.title;highlightUntil=Date.now()+6500;
    positionSpot();
    if(spot.hidden)say('Điểm tương tác đang ngoài khung hình. Hãy chọn góc DMM hoặc Breadboard trên thanh camera rồi nhấn Chỉ vị trí lần nữa.','system');
  }
  function offline(raw) {
    if(!current)return say('Mình chưa đọc được trạng thái phòng. Hãy chờ cảnh Blender tải xong.','system');
    const context=window.labvirtTutor?.context();
    const text=context&&/dung sai|sai số|số đo|kết quả|giá trị/i.test(raw)?window.labvirtTutor.execute('explain_measurement'):localHint(raw,current);
    say('Hướng dẫn theo trạng thái mô phỏng (không gọi Gemini): '+text);
    const step=nextStep(current);
    animate(step.id==='DONE'?'success':step.id==='POWER'||step.id==='INVALID'?'warn':'point');
    if(step.target){spot.dataset.target=step.target;byId('biscot-spot-label').textContent=step.title;highlightUntil=Date.now()+5500;positionSpot();}
  }

  async function ask(raw) {
    const question=String(raw||'').trim();
    if(!question||inFlight||querying)return;
    if(question.length>900){say('Câu hỏi quá dài (tối đa 900 ký tự).','system');return;}
    querying=true;sendButton.disabled=true;
    if(window.top!==window)window.top.postMessage({type:'biscot:practice-help'},location.origin);
    say(question,'student');input.value='';
    try {
      if(/nhảy múa|múa đi|dance/i.test(question)){animate('dance',5000);say('Biscot nhảy cổ vũ bạn nhé!');return;}
      if(/chạy đi|chạy thử/i.test(question)){animate('run',3500);say('Biscot chạy tại chỗ để cổ vũ!');return;}
      if(/nhảy đi|bật nhảy/i.test(question)){animate('jump',2600);say('Biscot nhảy rồi!');return;}
      if(/^(chào|hello|hi|vẫy tay)[!?.\s]*$/i.test(question)){animate('wave');say('Chào bạn! Mình sẵn sàng hướng dẫn '+(current?.lessonId||'bài thực hành hiện tại')+'.');return;}
      if(/(tiến độ|bao nhiêu trường hợp|đã hoàn thành mấy)/i.test(question)){
        if(!current)return say('Phòng chưa cung cấp trạng thái mô phỏng.','system');
        say(byId('biscot-progress').textContent);return;
      }
      // Chẩn đoán LIVE lấy trực tiếp từ solver, tuyệt đối không trả lời từ kho cũ.
      const target=requestedTarget(question);
      if(target&&window.labvirtTutor){try{window.labvirtTutor.execute('focus_camera',{target});say('Mình đã đưa góc nhìn tới điểm tương tác '+target+'. Bạn tự thực hiện thao tác nhé.');}catch(error){say(error.message,'system');}return;}
      if(isLiveStateQuestion(question)||/^(?:bước tiếp theo|chỉ vị trí|hướng dẫn bước|tôi cần làm gì|em cần làm gì)[?!.\s]*$/i.test(question)){offline(question);return;}
      const hit=await resolveKnowledge(question,{scope,allowLocal:false});
      if(hit){say(hit.origin==='local-ai-cache'?`${hit.text}\n\nNguồn: ${hit.source}.`:hit.text);animate('point');return;}
      if(isLiveStateQuestion(question) || /^(?:bước tiếp theo|chỉ vị trí|hướng dẫn bước|tôi cần làm gì|em cần làm gì)[?!.\s]*$/i.test(question)){offline(question);return;}
      // Câu chưa có trong kho mới chuyển đến Firebase AI của website chính.
      if(!hostReady){
        say('Chưa có trong 200 câu đã duyệt và chưa kết nối tài khoản Firebase. Đăng nhập để hỏi kiến thức mới; các bước DMM vẫn được hỗ trợ offline.','system');
        return;
      }
      const id=`br12-${++seq}`;inFlight=id;animate('think',14000);
      window.top.postMessage({type:'biscot:room-question',id,question},location.origin);
      answerTimer=setTimeout(()=>{
        if(inFlight!==id)return;
        inFlight=null;sendButton.disabled=false;
        say('Dịch vụ AI trực tuyến chưa phản hồi. Bạn có thể hỏi về công thức khác đã có trong kho.','system');
      },16000);
    } finally {querying=false;if(!inFlight)sendButton.disabled=false;}
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.top||!event.data||typeof event.data!=='object')return;
    if(event.data.type==='biscot:room-ready'){hostReady=event.data.enabled===true;scope=hostReady&&typeof event.data.scope==='string'?event.data.scope:null;return;}
    if(event.data.type!=='biscot:room-answer'||event.data.id!==inFlight)return;
    clearTimeout(answerTimer);inFlight=null;sendButton.disabled=false;
    if(event.data.ok===true&&typeof event.data.text==='string'){
      say(event.data.text);animate('point');}
    else {say(typeof event.data.text==='string'?event.data.text:'AI trực tuyến chưa sẵn sàng; dùng hướng dẫn DMM nội bộ.','system');}
  });
  byId('biscot-form').addEventListener('submit',e=>{e.preventDefault();void ask(input.value);});
  root.querySelectorAll('[data-biscot-action]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.biscotAction;
    if(['point','next','diagnose'].includes(action)&&window.top!==window)window.top.postMessage({type:'biscot:practice-help'},location.origin);
    if(action==='point')return point();
    if(action==='next')return offline('Bước tiếp theo tôi cần làm gì?');
    if(action==='diagnose')return offline('Vì sao đồng hồ DMM chưa hiện số?');
    animate(action,action==='dance'?5200:2700);
  }));
  const ping=()=>{if(window.top!==window)window.top.postMessage({type:'biscot:room-ping'},location.origin);};
  ping();const pingTimer=setInterval(ping,9000);
  track();const timer=setInterval(track,450);
  window.addEventListener('pagehide',()=>{recognition?.abort();clearInterval(timer);clearInterval(pingTimer);clearTimeout(moodTimeout);clearTimeout(answerTimer);},{once:true});
})();
