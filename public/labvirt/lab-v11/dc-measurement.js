/** LABVIRT V8: đo điện áp một chiều tách biệt với phép kiểm tra linh kiện thụ động.
 * Chỉ xác thực số đo từ điện thế nút của solver và kết nối tới nguồn thực sự.
 * Mọi trạng thái không hợp lệ KHÔNG được biến thành 0 V. */
const failure = (reason, status) => ({valid:false,saveable:false,display:'—',reason,status,value:null,unit:'',quantity:'NONE'});
export function evaluateDCMeasurement({state,network,solution,error}) {
  if (state.mode !== 'DCV') return null;
  if (!state.ready) return failure('SCENE_NOT_READY','ĐANG NẠP MÔ HÌNH');
  if (state.redJack === 'NONE' || state.blackJack === 'NONE') return failure('MISSING_JACK','CẮM ĐỦ JACK ĐỎ VΩ / ĐEN COM');
  if (state.redJack !== 'VOHM' || state.blackJack !== 'COM') return failure('WRONG_JACK','ĐỎ VΩ · ĐEN COM');
  if (!state.red || !state.black) return failure('MISSING_CONTACT','CHẠM ĐỦ HAI ĐẦU QUE');
  if (error || !solution) return failure('SIMULATION_ERROR',error || 'BỘ GIẢI CHƯA SẴN SÀNG');
  if (!Array.isArray(network?.sources) || !network.sources.length) return failure('NO_POWER','CHƯA BẬT NGUỒN ĐANG KẾT NỐI');
  const a=state.component+':'+state.red, b=state.component+':'+state.black;
  // Kiểm tra đường dẫn điện bằng cả dây nối và phần tử dẫn; không dùng vị trí hình học.
  const adjacency=new Map();
  const join=(u,v)=>{if(!adjacency.has(u))adjacency.set(u,new Set());if(!adjacency.has(v))adjacency.set(v,new Set());adjacency.get(u).add(v);adjacency.get(v).add(u);};
  for(const [u,v] of network.wires||[])join(u,v);
  for(const e of network.resistors||[])join(e.a,e.b);
  for(const e of network.sources)join(e.a,e.b);
  const reachable=(origin)=>{const found=new Set([origin]),queue=[origin];for(let i=0;i<queue.length;i++)for(const n of adjacency.get(queue[i])||[])if(!found.has(n)){found.add(n);queue.push(n);}return found;};
  const group=reachable(a);
  if(!group.has(b) || !network.sources.some(src=>group.has(src.a)&&group.has(src.b)))return failure('FLOATING_CONTACT','HAI QUE CHƯA NỐI VỚI MẠCH CÓ NGUỒN');
  if(!(a in solution.potentials) || !(b in solution.potentials))return failure('UNKNOWN_NODES','CHƯA CÓ ĐIỆN THẾ TẠI ĐIỂM ĐO');
  const value=solution.voltage(a,b);
  if(!Number.isFinite(value))return failure('SIMULATION_ERROR','ĐIỆN ÁP KHÔNG HỢP LỆ');
  return {valid:true,saveable:false,display:value.toFixed(3)+' V',status:'ĐO DC · MÔ HÌNH MẠCH THUẦN TRỞ',value,unit:'V',quantity:'DC_VOLTAGE',reason:'DC_VOLTAGE_MEASURED',beep:false,conclusion:'Số đo DC từ nghiệm solver; Bảng 1.1 chỉ lưu linh kiện thụ động.'};
}
