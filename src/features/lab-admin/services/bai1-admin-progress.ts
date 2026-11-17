import {collection,onSnapshot} from 'firebase/firestore';
import {db} from '@/services/firebase/config';
import {progressCore,progressSyncEnabled} from '@/features/lab/services/practice-progress';
import {decodeBai1Documents,type Bai1Part,type Bai1Snapshot} from '../bai1-dashboard';

/** Read-only Owner projection of the existing canonical cases, never localStorage. */
export function listenBai1AdminProgress(uid:string,part:Bai1Part,receive:(value:Bai1Snapshot)=>void){
 let stopped=false,revision=0,last:Bai1Snapshot={status:'loading',hasConfirmed:false,rows:[],invalidCount:0};
 const emit=(next:Bai1Snapshot)=>{last=next;if(!stopped)receive(next);};
 if(!progressSyncEnabled){emit({...last,status:'disabled'});return()=>{stopped=true;};}
 if(!uid||uid.includes('/')){emit({...last,status:'error',error:'UID không hợp lệ; chưa truy vấn Firestore.'});return()=>{stopped=true;};}
 const stop=onSnapshot(collection(db,'users',uid,'labProgress',part,'cases'),{includeMetadataChanges:true},snapshot=>{
  const current=++revision;
  if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites){emit({...last,status:'offline',error:'Đang chờ xác nhận server; không tính bản cache mới.'});return;}
  void (part==='B1_P1'?progressCore():Promise.resolve(null)).then(core=>{
   if(stopped||current!==revision)return;
   const documents=snapshot.docs.map(document=>{const data=document.data();return {id:document.id,data:{...data,updatedAt:data.updatedAt?.toDate?.()?.toISOString()||''}};});
   const decoded=decodeBai1Documents(part,documents,rows=>core?.mergeProgressRecords(rows)||[]);emit({...decoded,status:'ready',hasConfirmed:true,receivedAt:new Date().toISOString()});
  }).catch(()=>{if(!stopped&&current===revision)emit({...last,status:'error',error:'Không kiểm tra được cấu trúc bản ghi. Hãy tải lại trang.'});});
 },error=>{revision++;emit({...last,status:error.code==='permission-denied'?'denied':'error',error:error.code==='permission-denied'?'Không có quyền đọc kết quả của UID này.':'Lỗi truy vấn Firestore: '+error.message});});
 return()=>{stopped=true;revision++;stop();};
}
