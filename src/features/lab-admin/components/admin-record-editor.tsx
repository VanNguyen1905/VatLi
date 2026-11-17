import {useState} from 'react';
import type {RosterStudent} from '@/features/lab/lab-model';
import type {EquipmentAssetRecord} from '@/features/lab/data/equipment-catalog';
import {saveEquipment,updateRosterStudent} from '@/features/lab/services/lab-service';

const input='w-full rounded-lg border border-border bg-background p-2';
/** A draft keeps its opened version until save or cancel, including after a conflict. */
export function RosterEditor({student,onClose}:{student:RosterStudent;onClose:()=>void}){
  const [name,setName]=useState(student.fullName),[className,setClassName]=useState(student.className);
  const [status,setStatus]=useState(student.enrollmentStatus??'active');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function save(){
    if(status==='withdrawn'&&student.enrollmentStatus!=='withdrawn'&&!window.confirm(`Lưu trữ hồ sơ ${student.studentCode}? Giữ nguyên tài khoản và toàn bộ kết quả. Thao tác này không xóa dữ liệu.`))return;
    setBusy(true);setMessage('');
    try{await updateRosterStudent(student,{fullName:name,className,enrollmentStatus:status});setMessage('Đã lưu Firebase — server xác nhận. Đóng biểu mẫu để mở phiên bản mới.');}
    catch(error){setMessage(error instanceof Error?error.message:'Chưa lưu được Firebase. Nội dung đang nhập vẫn được giữ.');}
    finally{setBusy(false);}
  }
  return <section className="admin-editor space-y-3" aria-label="Sửa hồ sơ sinh viên"><h3>Sửa hồ sơ · {student.studentCode}</h3>
    <p>MSSV và UID được giữ nguyên. Lớp được lưu ngay trong hồ sơ labRoster hiện có.</p>
    <label className="block">Họ tên<input className={input} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="block">Lớp<input className={input} value={className} onChange={e=>setClassName(e.target.value)}/></label>
    <label className="block">Tình trạng hồ sơ<select className={input} value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="active">Đang học</option><option value="withdrawn">Đã nghỉ / lưu trữ</option></select></label>
    <button disabled={busy} onClick={()=>void save()}>Lưu hồ sơ Firebase</button> <button disabled={busy} onClick={onClose}>Đóng biểu mẫu</button>
    {message&&<p role="status">{message}</p>}
  </section>;
}
export function EquipmentEditor({asset,onClose}:{asset:EquipmentAssetRecord;onClose:()=>void}){
  const [name,setName]=useState(asset.name),[quantity,setQuantity]=useState(asset.quantity),[specification,setSpecification]=useState(asset.specification);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function save(){setBusy(true);setMessage('');try{await saveEquipment(asset,{name,quantity,specification});setMessage('Đã lưu Firebase — server xác nhận.');}catch(error){setMessage(error instanceof Error?error.message:'Chưa lưu được Firebase');}finally{setBusy(false);}}
  return <section className="admin-editor space-y-3" aria-label="Sửa danh mục thiết bị"><h3>Sửa danh mục thiết bị</h3>
    <label className="block">Tên thiết bị<input className={input} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="block">Số lượng<input type="number" className={input} min="1" max="100" value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label>
    <label className="block">Thông số<textarea className={input} value={specification} onChange={e=>setSpecification(e.target.value)}/></label>
    <p>Chỉ sửa danh mục. File mô hình, đường dẫn và trạng thái kiểm thử Blender được giữ nguyên.</p>
    <button disabled={busy} onClick={()=>void save()}>Lưu thiết bị Firebase</button> <button disabled={busy} onClick={onClose}>Đóng biểu mẫu</button>{message&&<p role="status">{message}</p>}
  </section>;
}
