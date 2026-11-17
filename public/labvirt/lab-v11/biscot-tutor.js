import {DemoTimeline,DEMO_STEPS,labContext,explainMeasurement,LabEventMonitor} from './biscot-tutor-core.js';

export class BiscotTutor {
 constructor(e){
  this.e=e;this.monitor=new LabEventMonitor();this.lastTime=0;this.shown=false;this.saved=null;this.disposed=false;this.voice=false;this.listeners=[];
  this.ui=document.createElement('aside');this.ui.id='biscot-tutor';this.ui.hidden=true;
  this.ui.innerHTML=`<header class="tutor-handle"><span>✧ BISCOT · HƯỚNG DẪN TRONG PHÒNG</span><button data-action="collapse" aria-label="Thu gọn hướng dẫn">−</button></header>
   <div class="tutor-body"><div class="tutor-intro"><div class="tutor-hologram" data-mood="wave"><i></i><img src="/ai-biscot-avatar-transparent.png" alt="Biscot"/><span>✦ · ✧ · ✦</span></div><div><small>BÀI 1 · PHẦN 1</small><h2>Quan sát R1.<br>Tự khám phá R2.</h2><p>Đọc linh kiện, chọn thang đo và kiểm tra kết quả từ đồng hồ trong phòng.</p></div></div>
   <nav aria-label="Nội dung hướng dẫn"><button data-tab="intro" aria-selected="true">Mục tiêu</button><button data-tab="steps" aria-selected="false">Quy trình</button><button data-tab="demo" aria-selected="false">Xem mẫu</button></nav>
   <section data-content="intro"><h3>Điện trở · tụ điện · cuộn cảm</h3><p>Nhận biết trị số danh định, dung sai và trạng thái linh kiện. Dùng DMM trên breadboard; đọc và ghi kết quả vào Bảng 1.1.</p><p>Thiết bị: DMM, hai dây đo, linh kiện R/C/L. Ngắt nguồn trước khi đo Ω/C. Thang Ω đo điện trở dây quấn, không đo trực tiếp mH.</p></section>
   <section data-content="steps" hidden><ol><li>Nhận biết linh kiện và mã màu.</li><li>Chuẩn bị DMM, ngắt nguồn mạch.</li><li>Đen → COM, đỏ → VΩ.</li><li>Chọn thang phù hợp.</li><li>Đặt hai que vào hai chân khác nhau.</li><li>Đọc LCD, đánh giá dung sai.</li><li>Tự giải thích rồi ghi Bảng 1.1.</li></ol></section>
   <section data-content="demo" hidden><div class="tutor-step">Bước <b id="tutor-step">1/8</b> · <strong id="tutor-title">Quan sát thao tác thật</strong></div><progress id="tutor-progress" max="8" value="0"></progress><p id="tutor-subtitle" aria-live="polite">Nhấn xem mẫu để Biscot thao tác R1 trong phòng. Dòng demo không tăng tiến độ của bạn.</p><div class="tutor-controls"><button data-action="pause">Tạm dừng</button><button data-action="replay">Xem lại</button><button data-action="stop">Bỏ qua</button><label>Tốc độ <select id="tutor-speed"><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option></select></label></div></section>
   <div class="tutor-options"><label><input id="tutor-voice" type="checkbox"/> Đọc lời thoại</label><label><input id="tutor-proactive" type="checkbox" checked/> Gợi ý chủ động</label><label>Giải thích <select id="tutor-level"><option value="1">Dễ hiểu</option><option value="2">Nguyên lý</option><option value="3">Kỹ thuật</option></select></label></div>
   <footer><button data-action="start" class="tutor-primary">▶ Xem Biscot làm mẫu R1</button><button data-action="self">Bắt đầu tự làm</button><button data-action="reset-layout">Đặt lại bố cục</button><button data-action="reset-dmm">Đặt lại DMM</button></footer><small>Kéo thanh tiêu đề để di chuyển bảng. Kéo thân DMM để di chuyển; Shift + kéo để xoay.</small></div>`;
  document.body.append(this.ui);this.find=s=>this.ui.querySelector(s);
  this.timeline=new DemoTimeline({begin:()=>this.begin(),enter:i=>this.enter(i),update:(i,t)=>this.update(i,t),leave:i=>this.leave(i),finish:()=>this.finish(),cancel:()=>this.cancel(),pause:()=>{window.speechSynthesis?.pause();this.updateUI();},resume:()=>{window.speechSynthesis?.resume();this.updateUI();},error:text=>this.say(text,'warn')});
  this.on(this.ui,'click',event=>{const action=event.target.closest('[data-action]')?.dataset.action,tab=event.target.closest('[data-tab]')?.dataset.tab;if(tab)this.tab(tab);if(action)try{this.execute(action);}catch(error){this.say(error.message,'warn');}});
  this.on(this.find('#tutor-speed'),'change',event=>this.timeline.setSpeed(Number(event.target.value)));
  this.on(this.find('#tutor-voice'),'change',event=>{this.voice=event.target.checked;if(!this.voice)window.speechSynthesis?.cancel();});
  if(!('speechSynthesis'in window)){this.find('#tutor-voice').disabled=true;this.find('#tutor-voice').parentElement.title='Trình duyệt không hỗ trợ đọc lời thoại; phụ đề vẫn hoạt động.';}
  this.on(this.find('#tutor-proactive'),'change',event=>{this.monitor.enabled=event.target.checked;});
  this.on(document.getElementById('helpBtn'),'click',()=>{document.getElementById('guide').classList.add('hidden');this.open();});
  this.on(window,'biscot:open-guide',()=>this.open());
  this.on(document,'visibilitychange',()=>{if(document.hidden)this.timeline.pause();});
  this.on(window,'blur',()=>this.timeline.pause());
  this.dragPanel();
  window.labvirtTutor={execute:(name,args={})=>this.action(name,args),context:()=>this.context(),diagnostics:()=>({status:this.timeline.status,step:this.timeline.step,elapsed:this.timeline.elapsed,speed:this.timeline.speed,pose:e.devices.pose(),demoRows:this.demoRecord?[structuredClone(this.demoRecord)]:[]})};
 }
 on(target,event,fn,options){target?.addEventListener(event,fn,options);this.listeners.push(()=>target?.removeEventListener(event,fn,options));}
 get active(){return this.timeline.active;}
 context(){return labContext(this.e.snapshot(),this.e.measurement(),this.active?'DEMO':'SELF_PRACTICE',this.monitor.errors);}
 open(){this.ui.hidden=false;this.ui.classList.remove('collapsed');this.fit?.();}
 tab(tab){for(const section of this.ui.querySelectorAll('[data-content]'))section.hidden=section.dataset.content!==tab;for(const button of this.ui.querySelectorAll('[data-tab]'))button.setAttribute('aria-selected',String(button.dataset.tab===tab));}
 say(text,mood='point'){
  this.find('#tutor-subtitle').textContent=text;this.find('.tutor-hologram').dataset.mood=mood;
  window.dispatchEvent(new CustomEvent('biscot:tutor-say',{detail:{text,mood}}));
  if(this.voice&&'speechSynthesis'in window){speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='vi-VN';utterance.rate=.85*this.timeline.speed;const voice=speechSynthesis.getVoices().find(v=>v.lang.startsWith('vi'));if(voice)utterance.voice=voice;speechSynthesis.speak(utterance);}
 }
 execute(action){
  if(action==='start'||action==='replay'){this.open();this.tab('demo');this.timeline.start();}
  else if(action==='pause'){if(this.timeline.status==='PAUSED')this.timeline.resume();else this.timeline.pause();}
  else if(action==='stop'||action==='self'){this.timeline.stop();this.ui.hidden=true;}
  else if(action==='collapse')this.ui.classList.toggle('collapsed');
  else if(action==='reset-layout'){window.labvirtPanelLayout?.reset();this.ui.style.left='22px';this.ui.style.top='96px';this.fit?.();try{localStorage.removeItem('labvirt-biscot-panel-v1');}catch{}}
  else if(action==='reset-dmm'){if(this.active)throw Error('Tạm kết thúc demo trước khi đặt lại DMM.');this.e.devices.reset();}
  this.updateUI();
 }
 action(name,args){
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Tham số không hợp lệ');
  if(name==='get_lab_context')return this.context();
  if(name==='get_current_measurement')return this.context().measurement;
  if(name==='get_selected_component')return this.context().component;
  if(name==='inspect_device_state')return this.context();
  if(name==='explain_measurement')return explainMeasurement(this.context(),Number(this.find('#tutor-level').value));
  if(['focus_camera','highlight_object'].includes(name)){if(this.active)throw Error('Hãy kết thúc demo trước khi đổi góc quan sát.');this.e.devices.focus(String(args.target||args.objectId));return true;}
  if(['open_panel','close_panel'].includes(name)){if(this.active)throw Error('Bảng thiết bị đang được dùng để làm mẫu.');if(!['dmmDock','taskDock','instrumentsDock','wiringDock'].includes(args.panelId))throw Error('Bảng không hợp lệ');document.getElementById(args.panelId).open=name==='open_panel';return true;}
  if(name==='open_result_table'){document.getElementById('reportBody').classList.remove('hidden');return true;}
  const actions={start_demo:'start',pause_demo:'pause',resume_demo:'resume',replay_demo:'replay',stop_demo:'stop'};
  if(name==='resume_demo'||name==='pause_demo'){this.timeline[name==='resume_demo'?'resume':'pause']();this.updateUI();return true;}
  if(Object.hasOwn(actions,name)){this.execute(actions[name]);return true;}
  // Physical device actions are exclusively owned by the scripted demo timeline.
  throw Error('Hành động không được cấp quyền: '+name);
 }
 begin(){
  const e=this.e;if(!e.state.ready||e.cinematic())throw Error('Chờ camera và phòng sẵn sàng.');if(e.snapshot().powered)throw Error('Hãy tắt nguồn mạch trước khi xem mẫu đo Ω.');
  this.saved={state:Object.fromEntries(['component','defect','mode','black','red','blackJack','redJack','dirty'].map(k=>[k,e.state[k]])),pose:e.devices.pose(),view:e.state.view,scene:e.captureDemoScene(),layout:window.labvirtPanelLayout?.snapshot(),panels:[...document.querySelectorAll('.dock-tool')].map(p=>[p.id,p.open]),reportHidden:document.getElementById('reportBody').classList.contains('hidden')};
  e.devices.locked=true;e.controls.enabled=false;document.body.classList.add('biscot-demo-active');document.querySelector('.control-dock').inert=true;document.querySelectorAll('.dock-tool').forEach(p=>{p.open=false;});
  document.querySelectorAll('#toggleTools,.view-buttons,.camera-actions,#resetObject').forEach(p=>{p.inert=true;});
  e.state.defect='NORMAL';e.state.black=e.state.red=null;e.state.blackJack=e.state.redJack='NONE';e.select('R1');e.setMode('OFF');e.devices.refresh();e.updatePins();
  this.demoRecord=null;document.getElementById('biscot-demo-rows')?.remove();
 }
 enter(i){
  const e=this.e;this.say(i===5?explainMeasurement(this.context(),3):DEMO_STEPS[i].text,i===7?'success':'point');
  if(i===0)e.setView('bench');if(i===1){e.placeComponent();e.devices.focus('PIN_A');}
  if(i===2){e.devices.focus('DMM_DIAL');this.knobStart=e.objects.get(e.manifest.dmm.knob.name).quaternion.clone();this.dmmStart=e.devices.group.position.clone();}
  if(i===3){this.jackFrom={BLACK:e.devices.connectorPosition('BLACK'),RED:e.devices.connectorPosition('RED')};}
  if(i===4){e.setView('board-close');this.probeFrom={BLACK:e.devices.probePose('BLACK'),RED:e.devices.probePose('RED')};}
  if(i===5){if(!e.measurement().valid||e.state.component!=='R1'||e.state.defect!=='NORMAL')throw Error('Engine chưa xác nhận phép đo R1 hợp lệ. Demo dừng để bảo toàn kết quả.');e.devices.focus('DMM_LCD');}
  if(i===6){this.demoRecord=e.makeDemoRecord();const body=document.createElement('tbody');body.id='biscot-demo-rows';const row=document.createElement('tr');row.className='biscot-demo-row';this.demoRecord.columns.forEach((value,index)=>{const td=document.createElement('td');td.textContent=(index===0?'DEMO BISCOT · ':'')+value;row.append(td);});body.append(row);document.getElementById('reportRows').after(body);document.getElementById('reportBody').classList.remove('hidden');}
  this.updateUI();
 }
 update(i,t){const e=this.e;
  if(i===2){const knob=e.objects.get(e.manifest.dmm.knob.name);knob.quaternion.copy(this.knobStart);knob.quaternion.premultiply(new this.knobStart.constructor().setFromAxisAngle(e.axisZ,-(e.devices.dialAngle('OHM')-e.devices.dialAngle('OFF'))*Math.PI/180*t));e.devices.group.position.lerpVectors(this.dmmStart,e.devices.home,t*t*(3-2*t));e.devices.refresh();}
  if(i===3){if(t<=.5)e.devices.animateJack('BLACK','COM',t*2,this.jackFrom.BLACK);else{if(e.state.blackJack!=='COM')e.devices.animateJack('BLACK','COM',1,this.jackFrom.BLACK);e.devices.animateJack('RED','VOHM',(t-.5)*2,this.jackFrom.RED);}}
  if(i===4){if(t<=.5)e.devices.animateProbe('BLACK','PIN_A',t*2,this.probeFrom.BLACK);else{if(e.state.black!=='PIN_A')e.devices.animateProbe('BLACK','PIN_A',1,this.probeFrom.BLACK);e.devices.animateProbe('RED','PIN_B',(t-.5)*2,this.probeFrom.RED);}}
  this.find('#tutor-progress').value=i+t;e.renderer.shadowMap.needsUpdate=true;
 }
 leave(i){if(i===2)this.e.setMode('OHM');}
 restoreScene(){
  if(!this.saved)return;this.restoring=true;const e=this.e,s=this.saved;e.state.defect=s.state.defect;e.select(s.state.component);Object.assign(e.state,s.state);e.restoreDemoScene(s.scene);e.devices.restore(s.pose);e.updatePins();e.updateControls();e.updateLCD();e.setView(s.view);
  window.labvirtPanelLayout?.restore(s.layout);for(const [id,open]of s.panels)document.getElementById(id).open=open;document.getElementById('reportBody').classList.toggle('hidden',s.reportHidden);document.querySelector('.control-dock').inert=false;document.querySelectorAll('#toggleTools,.view-buttons,.camera-actions,#resetObject').forEach(p=>{p.inert=false;});document.body.classList.remove('biscot-demo-active');e.devices.locked=false;e.controls.enabled=true;this.saved=null;this.restoring=false;e.dirty(s.state.dirty);window.speechSynthesis?.cancel();
 }
 cancel(){this.restoreScene();this.updateUI();}
 finish(){this.restoreScene();const e=this.e;e.state.defect='NORMAL';e.state.blackJack=e.state.redJack='NONE';e.select('R2');e.setMode('OFF');e.devices.refresh();e.setView('board-close');e.dirty(false);this.say(DEMO_STEPS[7].text,'success');this.updateUI();}
 updateUI(){const t=this.timeline;this.find('#tutor-step').textContent=`${Math.min(8,t.step+1)}/8`;this.find('#tutor-title').textContent=t.status==='COMPLETE'?'Tự thực hành R2':DEMO_STEPS[Math.min(t.step,7)].title;this.find('[data-action="pause"]').textContent=t.status==='PAUSED'?'Tiếp tục':'Tạm dừng';this.find('[data-action="pause"]').disabled=!t.active;this.ui.dataset.status=t.status;}
 tick(now){
  const dt=this.lastTime?now-this.lastTime:0;this.lastTime=now;
  if(!this.shown&&this.e.state.ready&&!this.e.cinematic()&&!document.body.classList.contains('cinematic-mode')&&!document.hidden){this.shown=true;const key='biscot-guided-session:'+this.e.sessionId;try{if(!sessionStorage.getItem(key)){sessionStorage.setItem(key,'1');this.open();}}catch{this.open();}}
  if(this.timeline.status==='PAUSED')this.e.freezeCamera(dt);
  this.timeline.tick(dt);if(this.timeline.status!=='PAUSED')this.e.devices.tick(dt);
  const hint=this.monitor.observe(this.context(),now);if(hint)this.say(hint,'point');
 }
 dragPanel(){
  let drag=null;const handle=this.find('.tutor-handle'),key='labvirt-biscot-panel-v1';
  const fit=()=>{const r=this.ui.getBoundingClientRect();if(!r.width)return;this.ui.style.left=Math.max(8,Math.min(innerWidth-r.width-8,parseFloat(this.ui.style.left)||22))+'px';this.ui.style.top=Math.max(8,Math.min(innerHeight-r.height-8,parseFloat(this.ui.style.top)||96))+'px';};
  try{const p=JSON.parse(localStorage.getItem(key));if(Number.isFinite(p?.x)&&Number.isFinite(p?.y)){this.ui.style.left=p.x+'px';this.ui.style.top=p.y+'px';}}catch{}
  this.fit=fit;this.on(window,'resize',fit);
  this.on(handle,'pointerdown',event=>{if(event.button!==0||event.target.closest('button'))return;const r=this.ui.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX-r.left,y:event.clientY-r.top};handle.setPointerCapture(event.pointerId);event.preventDefault();});
  this.on(handle,'pointermove',event=>{if(drag?.id!==event.pointerId)return;this.ui.style.left=(event.clientX-drag.x)+'px';this.ui.style.top=(event.clientY-drag.y)+'px';fit();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.on(handle,type,()=>{if(!drag)return;drag=null;try{localStorage.setItem(key,JSON.stringify({x:parseFloat(this.ui.style.left),y:parseFloat(this.ui.style.top)}));}catch{}});
 }
 dispose(){this.timeline.stop();this.disposed=true;this.listeners.forEach(fn=>fn());this.ui.remove();delete window.labvirtTutor;window.speechSynthesis?.cancel();}
}
