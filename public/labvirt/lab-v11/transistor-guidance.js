import {TRANSISTOR_LESSONS} from './transistor-lessons.js';
const next=(id,title,detail,target=null)=>({id,title,detail,target});
export function transistorStep(state,room){
 const lesson=TRANSISTOR_LESSONS[room.lessonId];if(!lesson)return next('WAIT','Chờ đúng bài','Chưa có định nghĩa bài thực hành.');
 if(!state.ready)return next('WAIT','Chờ phòng Blender','Chưa có khung hình được xác nhận; chưa thể suy ra tiếp xúc hay phép đo.');
 if(room.rows>=lesson.keys.length)return next('RECORDED','Đã ghi đủ trường hợp mô phỏng',`Bảng ${lesson.table} đã đủ số trường hợp trên máy. Kiểm tra nhãn server của bảng để biết đã lưu cloud hay chưa; đây chưa phải điểm được giảng viên xác nhận.`);
 if(room.issue)return next('INVALID','Kiểm tra mạch và an toàn',String(room.issue)+'. Xem sơ đồ nguyên lý, đủ chân tiếp xúc và điện trở hạn dòng; ngắt nguồn trước khi thay dây.');
 if(state.powered&&['OHM','DIODE','CONT','CAP'].includes(state.mode))return next('SAFE_OFF','Ngắt nguồn ngoài','Không dùng nguồn thử DMM trên mạch đang cấp điện. Tắt PSU trước khi đo Ω/Diode hoặc đổi dây.','DEVICE_supplyPower');
 if(state.mode==='HFE')return next('HFE','Cắm đúng socket hFE','Chọn đúng NPN/PNP, đủ E–B–C; BC547/557 có thứ tự số chân 1–C, 2–B, 3–E. Xoay linh kiện và cắm thật, đọc gain rồi ghi nhận. Không dùng chênh lệch mV để khẳng định E/C.');
 if(!state.boardMounted&&room.target==='COMPONENT')return next('MOUNT','Cắm đủ chân vào breadboard','Mỗi chân phải chạm đúng lỗ; ba chân transistor không được mặc nhiên nối cùng nút. Kéo thân linh kiện hoặc dùng thao tác đặt, rồi kiểm tra tiếp xúc.');
 if(state.blackJack!=='COM')return next('BLACK_COM','Cắm jack đen vào COM','Chọn đầu jack đen rồi chạm cổng COM thật trên DMM.','JACK_COM');
 if(state.mode==='DCA'&&state.redJack!=='AMP')return next('RED_MA','Dùng cổng mA khi đo nối tiếp','Tắt nguồn, tháo dây LED–Collector và nối hai que vào chỗ hở, cắm jack mA. Không mắc thang dòng ngang nguồn.','JACK_MA');
 if(state.mode!=='DCA'&&state.redJack!=='VOHM')return next('RED_VOHM','Cắm jack đỏ vào VΩ','Đo Diode/Ω/DCV dùng cổng VΩ. Thang hFE dùng socket riêng.','JACK_VOHM');
 if(lesson.part===1){
  if(!['DIODE','OHM'].includes(state.mode))return next('MODE','Chọn Diode hoặc Ω','Đo đủ sáu chiều giữa ba chân; OL được giữ là hở, không phải 0.','DMM_DIAL');
  if(!state.red||!state.black)return next('PROBES','Chạm hai que thật','Kéo đầu kim đến các chân 1/2/3 trong cảnh; lựa chọn hỗ trợ trên HTML không thay thế bằng chứng tiếp xúc.','PIN_C');
  return next('PAIR','Ghi nhận và đảo chiều que',lesson.course===2?'Sau sáu chiều, suy luận loại transistor và Base; cắm socket hFE để kiểm tra E/C.':'J113 có tiếp giáp PN Gate–kênh và D/S có thể hoán đổi; 2N7000 có Gate cách điện và diode thân S→D. Xả Gate qua điện trở 100 kΩ khi lặp lại.');
 }
 if(room.readyToRecord)return next('RECORD','Ghi bảng thực nghiệm',`Đã có đủ bằng chứng hiện tại cho một hàng Bảng ${lesson.table}. Ghi kết quả và chờ server xác nhận; không tự cấp điểm.`);
 if(!state.powered&&!(room.lessonId==='B3_P3'&&state.mode==='OHM')&&!(room.lessonId==='B3_P4'&&room.scr?.phase==='INTERRUPT'))return next('POWER','Kiểm tra rồi bật nguồn DC',lesson.guide[1],'DEVICE_supplyPower');
 if(room.lessonId==='B3_P4')return next('SCR','Đo trạng thái kích và duy trì','Đo VAK/VGK; nhấn nút 3D thật, giữ để ghi nhận bằng C, thả để kiểm tra dòng Anode còn trên IH. Ngắt nguồn an toàn để tắt; không hướng dẫn nối tắt A–K trên phần cứng thật.');
 if(room.lessonId==='B3_P3')return next('LIGHT','Đo ánh sáng và tìm ngưỡng POT','Đo RLDR khi PSU tắt rồi VGS khi bật ở cùng ánh sáng/vị trí POT. Tia chiếu phải trúng mặt cảm quang. Ở 0,1–2 lux, xoay vít POT 3D qua ngưỡng LED và đo lại; ánh sáng phòng không có một trạng thái LED cố định.');
 return next('VOLTAGES','Đo các điện áp thực tế',lesson.guide[2]+' Chọn đúng cặp nút đo rồi kéo hai que thật; đổi cấu hình sau khi đo thì cần đo lại.');
}
export function transistorHint(question,state,room){
 const step=transistorStep(state,room),device=Object.values(room.result?.devices||{})[0],operating=device?` Miền hiện tại: ${device.region}; LED=${((room.ledCurrent||0)*1000).toFixed(3)} mA.`:'';
 return `${room.lessonId} · ${step.title}: ${step.detail}${operating}${state.measurement?.display==='OL'?' OL biểu thị không dẫn ở điều kiện thử hiện tại; kiểm tra chiều tiếp giáp hoặc Gate cách điện, không đổi OL thành 0.':''}`;
}
