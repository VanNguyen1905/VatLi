import * as THREE from 'three';
import {STEPS,TOPICS,findNextStep,answerOffline} from './lab-lessons.js';

const $=id=>document.getElementById(id);
const material=color=>new THREE.MeshBasicMaterial({color});
function sphere(r,color,x,y,z,parent,scale=[1,1,1]){const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),material(color));mesh.position.set(x,y,z);mesh.scale.set(...scale);parent.add(mesh);return mesh;}
function createAvatar(camera){
 const group=new THREE.Group();group.name='LABVIRT_AI_MENTOR_ONLY';camera.add(group);group.position.set(.50,-.32,-.95);group.scale.setScalar(.23);
 const core=new THREE.Group();group.add(core);sphere(.33,0x50b8ba,0,0,0,core,[.90,1.05,.68]);
 const head=new THREE.Group();head.position.set(0,.53,0);core.add(head);sphere(.36,0xf0f5fc,0,0,0,head,[1,0.85,.77]);
 sphere(.09,0x0d2f48,-.15,.045,.275,head,[1,1,.35]);sphere(.09,0x0d2f48,.15,.045,.275,head,[1,1,.35]);
 sphere(.037,0x7df5e5,-.15,.045,.30,head);sphere(.037,0x7df5e5,.15,.045,.30,head);
 const mouth=sphere(.08,0x3cf4cd,0,-.16,.29,head,[1.2,.2,.27]);sphere(.09,0x748ee8,0,.36,0,head,[1,.8,1]);
 const left=new THREE.Group(),right=new THREE.Group();left.position.set(-.36,.18,0);right.position.set(.36,.18,0);core.add(left,right);
 sphere(.21,0xe0ebf1,-.20,-.06,0,left,[1.5,.4,.65]);sphere(.21,0xe0ebf1,.20,-.06,0,right,[1.5,.4,.65]);
 sphere(.17,0x1e617a,-.18,-.52,0,core,[.55,1.6,.6]);sphere(.17,0x1e617a,.18,-.52,0,core,[.55,1.6,.6]);
 return {group,core,head,left,right,mouth,phase:0,animation:'idle',until:0};
}
const clean=s=>String(s||'').slice(0,1400);
export class LabMentor {
 constructor({scene,camera,hotspots,views,setView,readContext}){
  Object.assign(this,{scene,camera,hotspots,views,setView,readContext});this.avatar=createAvatar(camera);this.currentStepId='JACK_BLACK';this.pending=false;this.online=false;this.active=false;this.lastState='';this.lastHighlight=null;this.muted=true;this.disposed=false;
  this.listen=[];const on=(id,event,handler)=>{const node=$(id);node.addEventListener(event,handler);this.listen.push(()=>node.removeEventListener(event,handler));};
  on('mentorOpen','click',()=>this.open());on('mentorClose','click',()=>this.close());on('mentorAsk','submit',event=>{event.preventDefault();void this.ask($('mentorInput').value);});
  on('mentorHelp','click',()=>void this.ask('Tôi đang làm bước nào? Chỉ cho tôi từng bước.'));
  on('mentorCheck','click',()=>void this.ask('Kiểm tra tôi đã làm đúng chưa và tại sao đồng hồ hiện số này?'));
  on('mentorDance','click',()=>this.respond({text:'Robot đang nhảy chúc bạn học vui!',animation:'dancing',highlight:null}));
  on('mentorMute','click',()=>{this.muted=!this.muted;$('mentorMute').textContent=this.muted?'🔇 Bật đọc':'🔊 Tắt đọc';if(this.muted&&'speechSynthesis' in window)window.speechSynthesis.cancel();});
  on('mentorPoint','click',()=>{const step=findNextStep(this.readContext());if(step){this.highlight(step.target);if(step.target?.startsWith('JACK')||step.target==='DMM_DIAL')this.setView('dmm');else this.setView('board');this.respond({text:step.instruction,animation:'pointing',highlight:step.target,page:step.page});}});
  $('mentorTopics').replaceChildren();for(const topic of TOPICS){const el=document.createElement('option');el.value=topic.id;el.textContent=topic.name+(topic.supported==='REFERENCE_ONLY'?' · Lý thuyết':' · Tương tác');$('mentorTopics').append(el);}
  on('mentorTopics','change',()=>{const topic=TOPICS.find(x=>x.id===$('mentorTopics').value);this.respond({text:topic.supported==='PRACTICE'?`Bài đang thực hành: ${topic.name}.`:`${topic.name} (trang ${topic.pages}). Hiện chỉ hỗ trợ giải thích lý thuyết: ${topic.description} Chưa có bộ giải điện tử đầy đủ cho bài này.`,animation:'explaining',highlight:null});});
  this.status();this.stateChanged();
 }
 async status(){try{const r=await fetch('./ai-hosting-config.json',{signal:AbortSignal.timeout(3500)});if(r.ok){const a=await r.json();this.online=a.configured===true;}}catch{}if(!this.disposed)$('mentorConnection').textContent=this.online?'● AI trực tuyến sẵn sàng':'● Trợ giảng quy tắc ngoại tuyến';}
 stateChanged(){if(this.disposed)return;const context=this.readContext(),step=findNextStep(context);this.currentStepId=step?.id||'DONE';const label=step?`Bước ${STEPS.indexOf(step)+1}/${STEPS.length}: ${step.title}`:'Đã hoàn thành quy trình đo R1';if(label!==this.lastState){$('mentorStep').textContent=label;this.lastState=label;}}
 open(){$('mentorPanel').hidden=false;this.active=true;this.stateChanged();if(!$('mentorLog').children.length)this.respond({text:'Chào bạn! Tôi có thể chỉ cách cắm jack, chạm chân điện trở, giải thích O.L và số đo hiện tại. Chọn “Hướng dẫn bước này” để bắt đầu.',animation:'greeting',highlight:null});}
 close(){$('mentorPanel').hidden=true;this.active=false;this.highlight(null);}
 append(role,text){const msg=document.createElement('p');msg.className='mentor-message '+role;msg.textContent=clean(text);$('mentorLog').append(msg);$('mentorLog').scrollTop=$('mentorLog').scrollHeight;}
 async ask(question){const text=clean(question).trim();if(!text||this.pending)return;$('mentorInput').value='';this.append('student',text);this.pending=true;$('mentorSend').disabled=true;this.animate('thinking',2000);
  try{
   const context=this.readContext();let reply=answerOffline(text,context);
   if(this.online){try{const r=await fetch('/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:text,context:{lessonId:'B1_P1',mode:context.mode,component:context.component,defect:context.defect,redJack:context.redJack,blackJack:context.blackJack,red:context.red,black:context.black,measurement:context.measurement,stepId:context.stepId,powered:context.powered,ready:context.ready,finishedRecords:context.finishedRecords}}),signal:AbortSignal.timeout(18000)});const data=await r.json();if(r.ok&&typeof data.text==='string'&&data.text.trim()){reply={...reply,text:data.text.slice(0,1300)};}else{reply.text+=' (AI trực tuyến chưa phản hồi, đang hướng dẫn ngoại tuyến.)';}}catch{reply.text+=' (Không kết nối được AI trực tuyến; câu trả lời dựa trên quy tắc trong phòng.)';}}
   this.respond(reply);
  }finally{this.pending=false;$('mentorSend').disabled=false;this.stateChanged();}
 }
 respond({text,animation='speaking',highlight=null,page=null}){this.append('mentor',text+(page?` [Tài liệu tr. ${page}]`:''));this.animate(animation,animation==='dancing'?4600:2200);this.highlight(highlight);if(!this.muted&&'speechSynthesis'in window){try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='vi-VN';u.rate=1.0;speechSynthesis.speak(u);}catch{}}}
 animate(animation,duration=2100){this.avatar.animation=animation;this.avatar.until=performance.now()+duration;}
 highlight(id){if(this.lastHighlight){const prev=this.hotspots.get(this.lastHighlight);if(prev)prev.material.opacity=this.lastHighlight==='DMM_DIAL'?0.04:0.015;}this.lastHighlight=id;const h=this.hotspots.get(id);if(h)h.material.opacity=.6;}
 tick(now,cinematic){const a=this.avatar;a.group.visible=this.active && !cinematic && !document.body.classList.contains('qa-clean');if(now>a.until)a.animation='idle';const t=now*.001,slow=Math.sin(t*2);a.phase=t;a.core.position.y=slow*.025;a.head.rotation.z=Math.sin(t)*.07;a.left.rotation.z=-.15+Math.sin(t*1.7)*.06;a.right.rotation.z=.15-Math.sin(t*1.7)*.06;a.core.rotation.z=0;a.mouth.scale.y=a.animation==='speaking'? .16+Math.abs(Math.sin(t*12))*.35:.2;
  if(['pointing','explaining'].includes(a.animation))a.right.rotation.z=-2.1;
  if(a.animation==='listening')a.head.rotation.x=.15;
  if(a.animation==='speaking')a.right.rotation.z=-.6+Math.sin(t*6)*.14;
  if(a.animation==='greeting')a.right.rotation.z=-2.0+Math.sin(t*13)*.35;
  if(a.animation==='thinking')a.head.rotation.z=.24;
  if(a.animation==='warning'){a.left.rotation.z=1.1;a.right.rotation.z=-1.1;a.head.rotation.z=Math.sin(t*12)*.07;}
  if(a.animation==='success'){a.left.rotation.z=2.0;a.right.rotation.z=-2.0;a.core.position.y=.09+Math.sin(t*12)*.07;}
  if(a.animation==='dancing'){a.left.rotation.z=1.7+Math.sin(t*8)*.7;a.right.rotation.z=-1.7+Math.sin(t*8+1)*.7;a.core.rotation.z=Math.sin(t*9)*.22;a.core.position.y=.14+Math.abs(Math.sin(t*9))*.18;}
 }
 diagnostics(){return{mode:this.online?'ONLINE_READY':'OFFLINE_RULES',avatar:this.avatar.animation,stepId:this.currentStepId,panelOpen:this.active};}
 dispose(){this.disposed=true;this.highlight(null);this.listen.forEach(fn=>fn());this.camera.remove(this.avatar.group);this.avatar.group.traverse(obj=>{obj.geometry?.dispose();obj.material?.dispose();});if('speechSynthesis'in window)speechSynthesis.cancel();}
}
