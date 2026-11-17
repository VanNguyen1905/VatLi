import {doc, runTransaction, serverTimestamp} from 'firebase/firestore';
import {db} from '@/services/firebase/config';

export interface AdminVersion {revision?: number; updatedAt?: unknown}
function timestampKey(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const time=value as {seconds?:number;nanoseconds?:number};
  return `${time.seconds ?? ''}:${time.nanoseconds ?? ''}`;
}
/** The editor keeps the version it opened. A retry never silently adopts a newer version. */
export async function commitAdminRecord(collectionName:'labExperiments'|'labEquipment'|'labRoster', id:string,
  expected:AdminVersion|null, changes:Record<string,unknown>):Promise<void>{
  if(!/^[a-zA-Z0-9_-]{1,150}$/.test(id))throw Error('Mã hồ sơ không hợp lệ');
  const ref=doc(db,collectionName,id);
  await runTransaction(db,async transaction=>{
    const snapshot=await transaction.get(ref);
    if(expected===null){
      if(snapshot.exists())throw Error('Hồ sơ đã tồn tại. Không ghi đè dữ liệu cũ.');
      transaction.set(ref,{...changes,revision:1,updatedAt:serverTimestamp()});
      return;
    }
    if(!snapshot.exists())throw Error('Hồ sơ không còn tồn tại. Hãy tải lại danh sách.');
    const current=snapshot.data();
    if((current.revision??0)!==(expected.revision??0)||timestampKey(current.updatedAt)!==timestampKey(expected.updatedAt)){
      throw Error('Xung đột cập nhật: hồ sơ đã được sửa ở phiên khác. Nội dung đang nhập vẫn được giữ; hãy tải bản mới trước khi lưu lại.');
    }
    transaction.update(ref,{...changes,revision:(current.revision??0)+1,updatedAt:serverTimestamp()});
  });
}
