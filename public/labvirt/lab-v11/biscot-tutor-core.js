import {COMPONENTS} from './measurement-core.js';
import {nextStep,localHint} from './biscot-step-engine.js';

export const DEMO_STEPS=Object.freeze([
 {title:'Chuẩn bị phép đo R1',duration:6500,text:'Chào bạn! Mình là Biscot. Mình sẽ làm mẫu một lần đo R1. Bạn có thể tạm dừng ở bất kỳ bước nào.'},
 {title:'Nhận biết điện trở R1',duration:7000,text:'R1 có các vạch nâu – đen – đỏ – nhũ vàng: 1 kΩ, dung sai ±5%. Quan sát hai chân trên breadboard.'},
 {title:'Chuẩn bị đồng hồ',duration:6500,text:'Với điện trở đã ngắt nguồn, chọn thang Ω. Quan sát núm xoay thật và màn LCD của DMM.'},
 {title:'Cắm hai jack vào DMM',duration:10000,text:'Đầu đen cắm COM, đầu đỏ cắm VΩ. Cổng đo dòng không dùng cho phép đo điện trở này.'},
 {title:'Tiếp xúc hai đầu R1',duration:11000,text:'Đưa que đen tới chân A, que đỏ tới chân B. Chỉ khi kim đến đúng điểm neo thì engine mới xác nhận tiếp xúc.'},
 {title:'Đọc số và đối chiếu dung sai',duration:9000,text:''},
 {title:'Ghi dòng minh họa Bảng 1.1',duration:7000,text:'Dòng DEMO BISCOT là minh họa. Nó không được tính vào 18 phép đo của bạn và không được gửi lên Firebase.'},
 {title:'Đến lượt bạn: R2',duration:6500,text:'Bạn đã thấy cách đo R1. Bây giờ hãy tự đo R2 — 10 kΩ. Mình sẽ gợi ý khi bạn cần; bạn tự thao tác và tự kết luận.'},
]);

/** One clock controls all demo effects. No timeout can mutate the scene after stop. */
export class DemoTimeline {
 constructor(adapter){this.adapter=adapter;this.status='IDLE';this.step=0;this.elapsed=0;this.speed=.75;this.error=null;}
 get active(){return this.status==='RUNNING'||this.status==='PAUSED';}
 setSpeed(speed){if(![.75,1,1.25].includes(speed))throw Error('Tốc độ không hợp lệ');this.speed=speed;}
 start(){if(this.active)this.stop();this.step=0;this.elapsed=0;this.error=null;this.status='RUNNING';try{this.adapter.begin();this.adapter.enter(0);}catch(e){this.fail(e);}}
 pause(){if(this.status==='RUNNING'){this.status='PAUSED';this.adapter.pause?.();}}
 resume(){if(this.status==='PAUSED'){this.status='RUNNING';this.adapter.resume?.();}}
 stop(){if(!this.active)return;this.status='STOPPED';this.adapter.cancel();}
 fail(error){this.error=String(error?.message||error);this.status='ERROR';this.adapter.cancel();this.adapter.error?.(this.error);}
 tick(dt){
  if(this.status!=='RUNNING')return;
  try{
   this.elapsed+=Math.max(0,Math.min(dt,100))*this.speed;
   const duration=DEMO_STEPS[this.step].duration;
   this.adapter.update(this.step,Math.min(1,this.elapsed/duration));
   if(this.elapsed>=duration){this.adapter.leave(this.step);this.elapsed=0;this.step++;if(this.step===DEMO_STEPS.length){this.status='COMPLETE';this.adapter.finish();}else this.adapter.enter(this.step);}
  }catch(e){this.fail(e);}
 }
}

export function labContext(state,measurement,learningMode='SELF_PRACTICE',errors={}){
 const definition=COMPONENTS[state.component];
 const context={lessonId:'B1_P1',component:state.component,defect:state.defect,mode:state.mode,
  ready:state.ready===true,boardMounted:state.boardMounted===true,powered:state.powered===true,
  blackJack:state.blackJack,redJack:state.redJack,black:state.black,red:state.red,
  measurement:{valid:measurement.valid===true,value:Number.isFinite(measurement.value)?measurement.value:null,unit:measurement.unit,display:measurement.display,quantity:measurement.quantity,reason:measurement.reason,status:measurement.status,conclusion:measurement.conclusion},
  nominalValue:definition?.nominalValue??null,tolerancePercent:definition?.tolerance??null,
  nominal:definition?.nominal??'',componentType:definition?.type??'',learningMode,
  savedCases:(state.entries||[]).map(r=>({component:r.component,defect:r.defect})),errorCounts:{...errors}};
 context.currentStep=nextStep(context);context.completed=context.savedCases.length;
 return context;
}

export function explainMeasurement(context,level=1){
 const c=context,m=c.measurement;
 if(!m.valid)return 'Hướng dẫn theo trạng thái: '+localHint('Vì sao đồng hồ chưa hiện số?',c);
 if(m.reason==='OPEN_CIRCUIT')return 'Engine đã xác nhận đủ điều kiện đo và mẫu đang hở mạch. O.L trong trường hợp này khác với việc chưa chạm đủ hai que.';
 if(c.componentType==='IND')return `LCD đang đọc ${m.display}: điện trở thuần của dây quấn. Thang Ω không đo điện cảm ${c.nominal}; cần phép đo điện cảm phù hợp để xác định mH.`;
 if(!Number.isFinite(m.value)||!Number.isFinite(c.nominalValue)||c.nominalValue<=0)return 'Chưa đủ dữ liệu số để tính dung sai.';
 const n=c.nominalValue,t=c.tolerancePercent,lo=n*(1-t/100),hi=n*(1+t/100),delta=(m.value-n)/n*100;
 const result=m.value>=lo&&m.value<=hi?'nằm trong':'nằm ngoài';
 let text=`${c.component}: danh định ${n} ${m.unit}, dung sai ±${t}%. Khoảng chấp nhận ${Number(lo.toFixed(4))}–${Number(hi.toFixed(4))} ${m.unit}. Engine đọc ${m.display}, ${result} khoảng này.`;
 if(level>=2)text+=` Dung sai là mức biến thiên cho phép quanh trị số danh định, không phải yêu cầu số đo trùng tuyệt đối với nhãn.`;
 if(level>=3)text+=` Δ = (${m.value} − ${n}) / ${n} × 100% = ${delta.toFixed(2)}%. Với phép đo thực, điện trở tiếp xúc và sai số DMM cũng ảnh hưởng; ở đây số đọc do engine mẫu mô phỏng xác định.`;
 return text;
}

const normalize=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
export function requestedTarget(question){
 const q=normalize(question);if(!/(o dau|chi|vi tri|nhin|phong|zoom|cong)/.test(q))return null;
 if(/com/.test(q))return 'JACK_COM';if(/vω|vohm|v.?ohm/.test(q))return 'JACK_VOHM';
 if(/num|thang.*ω|thang.*ohm/.test(q))return 'DMM_DIAL';if(/lcd|man hinh/.test(q))return 'DMM_LCD';
 if(/que den/.test(q))return 'PROBE_BLACK';if(/que do/.test(q))return 'PROBE_RED';
 if(/chan.*b/.test(q))return 'PIN_B';if(/chan/.test(q))return 'PIN_A';
 if(/breadboard|bang trang/.test(q))return 'BREADBOARD';if(/hien song/.test(q))return 'SCOPE';if(/nguon dc/.test(q))return 'PSU';if(/phat ham/.test(q))return 'GENERATOR';return null;
}

export class LabEventMonitor {
 constructor(){this.errors={};this.lastReason='';this.signature='';this.lastChange=0;this.lastHint=-Infinity;this.enabled=true;}
 observe(c,now){
  const signature=JSON.stringify([c.component,c.defect,c.mode,c.blackJack,c.redJack,c.black,c.red,c.measurement.reason,c.completed]);
  const changed=signature!==this.signature;
  if(changed){this.signature=signature;this.lastChange=now;}
  if(!this.enabled||c.learningMode==='DEMO'||!c.ready)return null;
  const reason=c.measurement.reason;
  if(changed&&reason!==this.lastReason){if(!c.measurement.valid&&c.mode!=='OFF')this.errors[reason]=(this.errors[reason]||0)+1;this.lastReason=reason;}
  if(now-this.lastHint<30000)return null;
  const active=c.mode!=='OFF'&&(c.red||c.black||c.redJack!=='NONE'||c.blackJack!=='NONE');
  if(changed&&active&&c.measurement.valid){this.lastHint=now;return 'Số đo đã hợp lệ. Bạn thử giải thích nó có nằm trong dung sai trước khi ghi bảng nhé.';}
  if(active&&((changed&&['WRONG_JACK','SAME_PIN','RESISTOR_REQUIRES_OHM','CAP_REQUIRES_CAP','INDUCTOR_REQUIRES_OHM','LIVE_CIRCUIT'].includes(reason))||now-this.lastChange>25000)){
   this.lastHint=now;const step=c.currentStep;return (this.errors[reason]||0)>1?step.detail:`Bạn thử kiểm tra bước “${step.title}”. Cần giải thích thêm, hãy hỏi mình nhé.`;
  }
  return null;
 }
}
