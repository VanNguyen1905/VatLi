import {useState} from 'react';
import type {RosterStudent} from '@/features/lab/lab-model';
import {prepareRequestedStudent} from '@/features/lab/requested-student';
export function RequestedStudentDraft({students}:{students:RosterStudent[]}){
  const [open,setOpen]=useState(false),draft=prepareRequestedStudent(students);
  if(!draft.ready)return <p className="mt-3 text-xs text-muted-foreground">Sinh viên minh họa: {draft.reason}</p>;
  return <div className="mt-3 rounded-xl border border-primary/30 p-3 text-sm">
    <button type="button" className="font-semibold text-primary" onClick={()=>setOpen(value=>!value)}>Chuẩn bị Sinh viên minh họa vào nhóm 46 sinh viên hiện có</button>
    {open&&<div className="mt-3 space-y-2" aria-label="Hồ sơ Sinh viên minh họa chờ duyệt">
      <p>Nhóm hiện có: {draft.record.className||'Chưa lưu tên lớp trong Firestore'}. Giữ nguyên tên lớp hiện tại, không tự đặt tên mới.</p>
      <p>MSSV: {draft.record.studentCode} · Họ tên: {draft.record.fullName}</p>
      <p>UID để trống, chưa tạo tài khoản đăng nhập. Sau khi được duyệt thêm: 46 → 47 sinh viên đang học.</p>
      <pre className="overflow-x-auto rounded-lg bg-background p-2 text-xs">{JSON.stringify(draft.record,null,2)}</pre>
      <p role="status">Đây là bản ghi dự kiến. Chưa ghi Firestore; cần Owner phê duyệt thao tác production riêng.</p>
    </div>}
  </div>;
}
