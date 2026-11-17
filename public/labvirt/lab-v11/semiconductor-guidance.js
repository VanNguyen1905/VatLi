export function semiconductorStep(state,semi){
 const step=(id,title,detail,target=null)=>({id,title,detail,target});
 if(!state.ready)return step('WAIT','Chờ phòng Blender','Chưa có khung hình sẵn sàng; không suy ra đã đo.');
 if(semi.issue)return step('INVALID','Kiểm tra mạch trước khi cấp nguồn',String(semi.issue));
 if(semi.partId==='B1_P2'){
  if(!state.boardMounted)return step('PLACE','Cắm diode lên breadboard','Anode là PIN_A; Cathode có vạch là PIN_B. Hai chân cần đúng hai lỗ điện khác nhau.');
  if(state.blackJack!=='COM'||state.redJack!=='VOHM')return step('JACKS','Cắm COM và VΩ','Đen vào COM, đỏ vào VΩ/Diode. Không dùng cổng dòng.','JACK_COM');
  if(state.mode!=='DIODE')return step('MODE','Chọn thang Diode','DMM dùng nguồn thử 1 mA, compliance 2 V; không đủ đo đánh thủng Zener 5,1 V.','DMM_DIAL');
  if(!semi.pair?.FWD)return step('MEASURE_FWD','Đo và ghi nhận chiều thuận','Kéo đỏ đến A, đen đến K rồi ghi nhận số đang đo. Không tự điền từ tình trạng mẫu.','PIN_A');
  if(!semi.pair?.REV)return step('MEASURE_REV','Đảo hai que và đo chiều ngược','Đỏ đến K, đen đến A; NORMAL thường OL, SHORT gần 0 V cả hai chiều.','PIN_B');
  return step('RECORD','Ghi Bảng 1.2','Đã có cả hai kết quả đo; đối chiếu Tốt/Hỏng rồi ghi. Đây là mô phỏng chưa xác nhận điểm.');
 }
 if(semi.partId==='B1_P3')return step('SCOPE','Đo lần lượt CH1 rồi CH2','Nguồn chuẩn 9 VAC/50 Hz, bốn 1N4007, RL=1 kΩ. Chỉ CH1 đo secondary, sau đó tháo cả đầu đo và mass CH1. CH2 đo DC+/DC−; đọc DC coupling và gợn AC coupling. Không nối hai mass khác nút.');
 if(!state.powered)return step('POWER','Kiểm tra rồi bật nguồn DC','Zener K đến OUT, A đến GND; Rs=220 Ω, RL=1 kΩ. Không bỏ Rs.','DEVICE_supplyPower');
 if(!semi.captures?.VIN)return step('VIN','Đo điện áp vào thực tế','Chọn hai cổng Vin, chạm hai que lên hai cổng nguồn rồi ghi nhận. Không lấy slider làm số đo.');
 if(!semi.captures?.VOUT)return step('VOUT','Đo trên tải/Zener','Chọn Vout và chạm hai que vào hai chân RL; ghi nhận giá trị DMM.');
 return step('RECORD','Ghi Bảng 1.4','Đã có hai số đo; IL=Vout/RL và sụt áp Rs=Vin−Vout. Chỉ ghi các mức 1–10 V và 12 V.');
}
export function semiconductorHint(state,semi){const step=semiconductorStep(state,semi),point=semi.result;return `${step.title}: ${step.detail}${point?` Mạch hiện tại: Vin=${Number(point.vin).toFixed(3)} V, Vout=${Number(point.vout).toFixed(3)} V.${semi.partId==='B1_P4'?point.iz>1e-8?' Zener đang dẫn ngược trong mô hình.':' Chưa ổn áp; với cấu hình chuẩn, ngưỡng gần 6,222 V.':''}`:''}`;}
