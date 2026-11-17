/**
 * Bài 1 / Phần 1: chẩn đoán theo dữ liệu mô phỏng DMM, không dựa vào LLM.
 * Dùng một máy trạng thái cho 18 cặp (linh kiện, tình trạng SỐNG/CHẠM/ĐỨT).
 * Không chấm điểm: lưu số liệu chỉ do người học bấm nút của LABVIRT.
 */
const META = Object.freeze({
  R1:{label:'điện trở R1',type:'RES',nominal:1000,unit:'Ω'},
  R2:{label:'điện trở R2',type:'RES',nominal:10000,unit:'Ω'},
  R3:{label:'điện trở R3',type:'RES',nominal:220,unit:'Ω'},
  C1:{label:'tụ gốm C1',type:'CAP',nominal:100,unit:'nF'},
  C2:{label:'tụ hóa C2',type:'CAP',nominal:100,unit:'µF'},
  L:{label:'cuộn cảm L',type:'IND',nominal:10,unit:'mH'}
});
const instruction = (id,title,detail,target=null)=>({id,title,detail,target});
export function modeFor(component,defect){
  const cap=META[component]?.type==='CAP';
  if(defect==='SHORT')return 'OHM';
  return cap?'CAP':'OHM';
}
export function nextStep(s){
  if(!s || s.ready!==true)return instruction('WAIT','Chờ phòng 3D tải xong','Chờ đến khi dòng trạng thái báo phòng Blender sẵn sàng.');
  if(!Object.prototype.hasOwnProperty.call(META,s.component))return instruction('PICK','Chọn linh kiện','Mở Khay thực hành, chọn R1/R2/R3/C1/C2/L rồi chọn trạng thái SỐNG, CHẠM hoặc ĐỨT.');
  if(s.boardMounted===false)return instruction('BOARD','Đặt linh kiện lên breadboard','Nhấn “Đưa linh kiện lên breadboard” ở Khay thực hành; hai chân đo phải nằm trên bảng trắng trước khi chạm kim.','PIN_A');
  if(s.blackJack!=='COM')return instruction('JACK_BLACK','Cắm jack đen vào COM',s.blackJack==='NONE'?'Chọn jack đen rồi cắm vào cổng COM của DMM.':'Jack đen đang cắm sai cổng. Rút ra, cắm lại vào COM.','JACK_COM');
  if(s.redJack!=='VOHM')return instruction('JACK_RED','Cắm jack đỏ vào VΩ',s.redJack==='NONE'?'Chọn jack đỏ và cắm vào cổng VΩ; không cắm vào cổng đo dòng.':'Jack đỏ đang cắm sai cổng. Chuyển về VΩ.','JACK_VOHM');
  if(s.powered)return instruction('POWER','Tắt nguồn trước khi đo Ω/C','Nguồn đang bật. Tắt nguồn, và xả tụ theo quy trình an toàn trước khi đo điện trở hoặc điện dung.');
  const expected=modeFor(s.component,s.defect);
  if(s.mode!==expected)return instruction('MODE',`Chọn thang ${expected==='CAP'?'điện dung C':'điện trở Ω'}`,`DMM đang ở ${s.mode||'chưa rõ'}. Chọn ${expected==='CAP'?'C để đo điện dung.':'Ω để đo điện trở/thông mạch theo bài 1.'}`,'DMM_DIAL');
  if(s.measurement?.reason==='CHARGED_CAPACITOR')return instruction('DISCHARGE','Xả tụ trước khi đo','Tụ đang tích điện trong mô phỏng. Phải xả tụ theo hướng dẫn an toàn trước khi đo điện dung.');
  if(!s.black)return instruction('BLACK_CONTACT','Chạm que đen vào chân linh kiện','Chọn que đen, sau đó chạm PIN_A trên linh kiện đang chọn.','PIN_A');
  if(!s.red)return instruction('RED_CONTACT','Chạm que đỏ vào chân còn lại',`Chọn que đỏ, sau đó chạm ${s.black==='PIN_A'?'PIN_B':'PIN_A'}.`,'PIN_B');
  if(s.black===s.red)return instruction('SAME_CONTACT','Hai que đang chạm cùng chân','Chuyển một đầu kim sang chân còn lại. Không tự coi thao tác này là đo hợp lệ.',s.black==='PIN_A'?'PIN_B':'PIN_A');
  if(s.measurement?.valid!==true) {
    const description=s.measurement?.status||s.measurement?.reason||'Bộ đo chưa có kết quả hợp lệ';
    return instruction('INVALID','Đọc cảnh báo đồng hồ',`Bộ đo chưa xác nhận phép đo hợp lệ: ${description}. Kiểm tra thang đo, trạng thái mạch và vị trí chạm.`,'DMM_DIAL');
  }
  const alreadyRecorded=Array.isArray(s.savedCases)&&s.savedCases.some(c=>c&&c.component===s.component&&c.defect===s.defect);
  if(!alreadyRecorded)return instruction('RECORD','Ghi Bảng số liệu 1.1',`LCD mô phỏng đang hiển thị ${s.measurement.display||'—'} và báo phép đo hợp lệ. Hãy tự nhấn “Ghi vào Bảng 1.1” để lưu trường hợp ${s.component} / ${s.defect}.`);
  return instruction('DONE','Đã lưu trường hợp hiện tại',`Đã lưu ${s.component} / ${s.defect}. Tiếp tục chọn tình trạng khác hoặc linh kiện tiếp theo để hoàn thành đủ 18 trường hợp.`);
}
const normalize=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
export function localHint(question,s){
  const q=normalize(question),step=nextStep(s);
  if(!s?.ready)return step.detail;
  if(/(o\.l|\bol\b|khong (len|ra|hien) so|sai o dau|loi dong ho|tai sao dong ho)/.test(q)) {
    if(s.measurement?.valid===true&&s.measurement?.reason==='OPEN_CIRCUIT')return `Màn hình O.L vì mẫu ${s.component} đang ở trạng thái ĐỨT: bộ đo đã xác nhận hở mạch hợp lệ sau khi đủ jack và hai điểm chạm. Đó không phải lỗi kết nối. Hãy ghi Bảng 1.1.`;
    if(s.measurement?.reason==='OVER_RANGE')return 'Bộ đo báo vượt thang đo. Kiểm tra phạm vi đo, thang đo và thông số mẫu; không mặc định coi linh kiện hỏng.';
    if(s.measurement?.valid===true)return `Bộ đo xác nhận phép đo hợp lệ: ${s.measurement.display}. ${s.measurement.conclusion||''}`;
    return `Chưa thể kết luận linh kiện hỏng từ O.L hoặc dấu chờ. ${step.detail}`;
  }
  if(/(ket qua|gia tri|doc so|bao nhieu|so do|lcd)/.test(q)) {
    if(s.measurement?.valid===true) return `Kết quả mô phỏng của ${s.component}: ${s.measurement.display}. ${s.measurement.conclusion||''} Đây không phải số đo của phần cứng thật.`;
    return `Đồng hồ chưa xác nhận kết quả đo hợp lệ. ${step.detail}`;
  }
  if(/(dung sai|sai so|cong thuc|phan tram)/.test(q)) {
    const part=META[s.component];
    if(s.defect!=='NORMAL'||s.measurement?.valid!==true)return `Chưa có giá trị đo hợp lệ của mẫu bình thường để tính sai lệch. ${step.detail}`;
    if(part?.type==='IND')return 'Thang Ω chỉ đo điện trở thuần của cuộn dây, không suy ra dung sai điện cảm 10 mH từ giá trị Rdc.';
    const value=s.measurement?.value;
    if(!Number.isFinite(value))return 'Thiếu giá trị số từ solver; không tự suy ra giá trị từ chữ trên LCD.';
    const error=(value-part.nominal)/part.nominal*100;
    return `Sai lệch có dấu = (${value} − ${part.nominal}) / ${part.nominal} × 100% = ${error.toFixed(2)}%. Đối chiếu dung sai ghi trên linh kiện và bảng 1.1.`;
  }
  if(/(led|den|anh sang|oscilloscope|nguon dc)/.test(q))return 'Bài 1/Phần 1 chỉ xác minh R/C/L. LED và mạch bán dẫn phải dùng solver và thí nghiệm tương ứng; mình không khẳng định trạng thái điện khi chưa có dữ liệu.';
  return `Bước hiện tại: ${step.title}. ${step.detail}`;
}
export {META};
