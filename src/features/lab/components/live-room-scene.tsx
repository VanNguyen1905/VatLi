import { type LiveLabRoom, COMPONENT_LABELS, INSTRUMENT_LABELS } from '../services/live-lab-rooms';

/**
 * Mieu ta ban Lab 2D de student/admin thay cung MOT snapshot.
 * Khong gia lap model 3D hoac hien thi so do dien khong ton tai.
 * Ve sau thay bang Unity WebGL / Three renderer ma khong can doi schema quyen truy cap.
 */
export function LiveRoomScene({room,summaryOnly=false}:{room:LiveLabRoom|undefined;summaryOnly?:boolean}){
  return <div className="rounded-2xl border border-border bg-surface-elevated/50 p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-sm">{summaryOnly?'Thông tin chuẩn bị đã lưu · tách riêng với video':'Góc nhìn bàn thực hành đồng bộ'}</p>{!summaryOnly&&<span className="rounded-full border border-amber-500/40 px-2 py-1 text-[11px] text-amber-500">CHƯA CÓ 3D / CHƯA ĐO ĐIỆN</span>}</div>
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-border bg-background/80 p-4 min-h-24"><div className="text-xs text-muted-foreground">Thiết bị đang chọn</div><div className="font-semibold mt-2">{room?INSTRUMENT_LABELS[room.selectedInstrument]:'Chưa có hoạt động'}</div></div>
      <div className="rounded-xl border border-border bg-background/80 p-4 min-h-24"><div className="text-xs text-muted-foreground">Linh kiện đang chọn</div><div className="font-semibold mt-2">{room?COMPONENT_LABELS[room.selectedComponent]:'Chưa có hoạt động'}</div></div>
      {!summaryOnly&&<div className="col-span-2 rounded-xl border border-dashed border-border bg-background/40 p-4 min-h-28 flex flex-col items-center justify-center text-center gap-2"><p className="font-semibold">Khu vực breadboard / mô phỏng 3D</p><p className="text-xs text-muted-foreground max-w-md">Chưa có engine kết nối dây, giải mạch điện và đồ họa 3D. Đây là trạng thái lựa chọn dụng cụ được truyền trực tiếp, không phải hình ảnh hay phép đo giả.</p></div>}
    </div>
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>Bước chuẩn bị: {room?room.stepIndex+1:'—'}</span><span>Nguồn: TẮT (mô phỏng)</span><span>Phiên: {room?.sessionId||'Chưa có'}</span></div>
  </div>;
}
