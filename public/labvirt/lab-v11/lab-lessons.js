/** Các bước Bài 1 Phần 1 từ tài liệu thực hành trang 6–7.
 * Chỉ đánh giá những chức năng V7 có dữ liệu tương tác; các bài khác chỉ tra cứu. */
export const STEPS=Object.freeze([
  {id:'SELECT_COMPONENT',title:'Chọn linh kiện cần kiểm tra',page:6,target:'PIN_A',instruction:'Mở Khay thực hành, chọn điện trở R1 và tình trạng SỐNG.',check:s=>s.component==='R1'&&s.defect==='NORMAL'},
  {id:'JACK_BLACK',title:'Cắm jack đen vào COM',page:6,target:'JACK_COM',instruction:'Mở Điều khiển DMM, chọn jack đen rồi click cổng COM; hoặc bấm Cắm đen → COM.',check:s=>s.blackJack==='COM'},
  {id:'JACK_RED',title:'Cắm jack đỏ vào VΩ',page:6,target:'JACK_VOHM',instruction:'Cắm jack đỏ vào cổng VΩ của đồng hồ, tuyệt đối không chọn cổng đo dòng.',check:s=>s.redJack==='VOHM'},
  {id:'SET_OHM',title:'Chọn thang điện trở Ω',page:6,target:'DMM_DIAL',instruction:'Xoay núm DMM sang Ω và bảo đảm nguồn cấp cho linh kiện đã tắt.',check:s=>s.mode==='OHM'&&!s.powered},
  {id:'TOUCH_BLACK',title:'Đặt que đen lên chân A',page:6,target:'PIN_A',instruction:'Chọn que đen rồi chạm chân PIN_A của điện trở R1.',check:s=>s.black==='PIN_A'},
  {id:'TOUCH_RED',title:'Đặt que đỏ lên chân B',page:6,target:'PIN_B',instruction:'Chọn que đỏ rồi chạm chân PIN_B (chân còn lại) của điện trở R1.',check:s=>s.red==='PIN_B'},
  {id:'VERIFY',title:'Đọc và giải thích số đo',page:6,target:'DMM_DIAL',instruction:'Quan sát LCD gốc. Với điện trở mẫu R1 trị số 996 Ω, lệch -0,4% so với danh định 1 kΩ, nằm trong ±5%.',check:s=>s.measurement?.valid&&s.measurement?.quantity==='RESISTANCE'},
  {id:'RECORD',title:'Ghi kết quả Bảng 1.1',page:7,target:null,instruction:'Nhấn Ghi vào Bảng 1.1 khi phép đo hợp lệ. Đây là số liệu mô phỏng, không phải đo phần cứng thật.',check:s=>s.finishedRecords>0}
]);
export const TOPICS=Object.freeze([
  {id:'B1_P1',name:'Bài 1 · Đọc và đo R/C/L',pages:'6–7',supported:'PRACTICE',description:'Điện trở, tụ và điện trở thuần của cuộn cảm; trạng thái sống/chạm/đứt.'},
  {id:'B1_P2',name:'Bài 1 · Diode chỉnh lưu / Zener',pages:'7–8',supported:'REFERENCE_ONLY',description:'Đo thuận và ngược; đánh giá O.L và sụt áp diode.'},
  {id:'B1_P3',name:'Bài 1 · Chỉnh lưu cầu và tụ lọc',pages:'8–11',supported:'REFERENCE_ONLY',description:'Bốn diode 1N4007, nguồn 9 VAC, tụ 10/100/1000 µF; chú ý mass oscilloscope.'},
  {id:'B1_P4',name:'Bài 1 · Ổn áp Zener',pages:'11–12',supported:'REFERENCE_ONLY',description:'Zener 5,1 V, Rs=220 Ω, RL=1 kΩ; khảo sát Vin 0–12 V.'},
  {id:'B2',name:'Bài 2 · Transistor BJT',pages:'13–18',supported:'REFERENCE_ONLY',description:'BC547, BC557, hFE, điểm làm việc Q, LED đóng cắt.'},
  {id:'B3',name:'Bài 3 · JFET/MOSFET/LDR/SCR',pages:'19–26',supported:'REFERENCE_ONLY',description:'J113, 2N7000, cảm biến ánh sáng, SCR duy trì dẫn.'}
]);
export function findNextStep(context){return STEPS.find(step=>!step.check(context))||null;}
const say=(text,step,animation='speaking',highlight=step?.target||null)=>({text,animation,highlight,page:step?.page||null});
/** Offline tutor: never claims to be an online generative model. */
export function answerOffline(question,context){
 const q=String(question).toLocaleLowerCase('vi-VN').trim().slice(0,1000),m=context.measurement||{},step=findNextStep(context);
 if(/nhảy|múa|dance|ăn mừng|vỗ tay/.test(q))return say('Tôi sẽ nhảy một điệu ngắn để cổ vũ bạn. Khi cần học tiếp, nhấn “Bước tiếp theo”.',step,'dancing',null);
 if(/chào|hello|xin chào/.test(q))return say('Chào bạn! Tôi là trợ giảng LABVIRT. Hiện tôi đang theo dõi trạng thái DMM và Bài 1, Phần 1.',step,'greeting',null);
 if(/đèn|led|ánh sáng|bóng/.test(q))return say('Để xác định LED sáng hay tắt phải xem đúng mạch, điện áp nguồn, chiều LED, dòng qua điện trở hạn dòng và transistor. Bộ solver V7 chỉ xử lý mạch thuần trở, nên tôi chưa thể xác nhận mạch LED bán dẫn chưa được triển khai. Tài liệu: trang 17–18, 23–24.',step,'thinking',null);
 if(/diode|zener|chỉnh lưu/.test(q))return say('Tài liệu trang 7–12 hướng dẫn đo diode và khảo sát cầu chỉnh lưu/Zener. Trong V8, phần này hiện là nội dung tham khảo, chưa được tính bằng solver diode. Khi thử diode, O.L chiều ngược có thể là bình thường.',step,'explaining',null);
 if(/bjt|mosfet|fet|scr|transistor/.test(q))return say('Nội dung transistor BJT ở trang 13–18; JFET, MOSFET, LDR, SCR ở trang 19–26. Mạch bán dẫn chưa có nghiệm thiết bị đầy đủ trong solver hiện tại, tôi không tự bịa số đo.',step,'explaining',null);
 if(/tại sao|vì sao|số|kết quả|đo |lcd|o\.l|ol|không hiện|chưa hiện|không lên/.test(q)){
  const reason=m.reason||'UNKNOWN';
  if(!context.ready)return say('Cảnh Blender đang tải. Hãy chờ đến khi phòng được xác nhận sẵn sàng.',step,'thinking');
  if(context.mode==='OFF')return say('Đồng hồ hiện đang OFF. Hãy bật thang Ω để đo điện trở R1.',STEPS[3],'pointing');
  if(context.powered&&['OHM','CONT','CAP'].includes(context.mode))return say('Bạn đang đo Ω/C khi mạch được cấp nguồn. Hãy ngắt nguồn và xả tụ nếu cần trước khi đo.',step,'warning');
  if(context.redJack!=='VOHM'||context.blackJack!=='COM')return say('DMM chưa đủ jack đúng: đen phải cắm COM, đỏ phải cắm VΩ. Hãy làm đúng hai bước này trước.',context.blackJack!=='COM'?STEPS[1]:STEPS[2],'pointing');
  if(!context.black||!context.red)return say('Bạn đã cắm jack nhưng chưa chạm đủ hai đầu kim lên hai chân linh kiện. Chọn que đen → PIN_A và que đỏ → PIN_B.',!context.black?STEPS[4]:STEPS[5],'pointing');
  if(reason==='SAME_PIN')return say('Cả hai que đang chạm cùng một chân; hãy chuyển một que sang chân còn lại.',STEPS[5],'warning');
  if(reason==='LIVE_CIRCUIT')return say('Ngắt nguồn trước khi đo Ω hoặc điện dung. Không đo điện trở ở mạch đang cấp điện.',step,'warning');
  if(reason==='CHARGED_CAPACITOR')return say('Tụ còn tích điện. Phải xả tụ an toàn trước khi đo; tham khảo quy trình tại trang 4.',step,'warning');
  if(m.valid&&m.reason==='OPEN_CIRCUIT')return say('O.L lúc này là kết quả hở mạch hợp lệ trong mẫu mô phỏng, vì bạn đã kết nối và chọn thang đúng. Đây không phải lỗi LCD.',step,'explaining');
  if(m.valid){const nominal={R1:1000,R2:10000,R3:220,C1:100,C2:100,L:null}[context.component];const percent=nominal!=null&&Number.isFinite(m.value)&&context.defect==='NORMAL'&&m.quantity!=='WINDING_RESISTANCE'?` Độ lệch = (${m.value} − ${nominal}) / ${nominal} × 100% = ${((m.value-nominal)/nominal*100).toFixed(2)}%.`:'';return say(`Số đo hiện tại ${m.display}. ${m.conclusion||''}${percent} Đây là giá trị từ mô hình LABVIRT, không phải thiết bị thật.`,step,'success');}
  return say(`Kết quả chưa hợp lệ: ${m.status||reason}. ${step?.instruction||'Hãy kiểm tra dây và thang đo.'}`,step,'pointing');
 }
 if(/que|cắm|jack|com|vω|chân|đầu|dây/.test(q))return say(step?.instruction||'Hai jack và hai đầu đo đã hợp lệ. Bạn có thể ghi số vào bảng 1.1.',step,'pointing');
 if(/công thức|dung sai|996|1000|1k/.test(q))return say('R1 danh định 1.000 Ω, mẫu LABVIRT = 996 Ω. Độ lệch (996−1000)/1000×100% = −0,4%. Với dung sai ±5%, mẫu đạt. Theo tài liệu Bài 1 trang 5–7.',step,'explaining');
 if(/bước|tiếp|làm gì|kiểm tra|giúp|hướng dẫn/.test(q))return say(step?`Bước “${step.title}”: ${step.instruction} (tài liệu trang ${step.page}).`:'Bạn đã hoàn thành các bước đo R1. Hãy kiểm tra Bảng 1.1 hoặc chọn linh kiện tiếp theo.',step,'pointing');
 return say(`Tôi hướng dẫn theo tài liệu và trạng thái thực trong lab. ${step?`Hiện cần: ${step.instruction}`:'Các bước đo R1 đã hoàn tất.'} Hãy hỏi cụ thể về jack, que đo, O.L, số đo hoặc công thức.`,step,'speaking');
}
