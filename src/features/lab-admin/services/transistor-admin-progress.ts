import {collection,onSnapshot} from 'firebase/firestore';
import {db} from '@/services/firebase/config';
import {transistorSyncEnabled,type TransistorLesson} from '@/features/lab/services/transistor-progress';
import {decodeTransistorDocuments,type TransistorSnapshot} from '../transistor-dashboard';
export function listenTransistorAdminProgress(uid:string,lesson:TransistorLesson,receive:(snapshot:TransistorSnapshot)=>void){
 let stopped=false,last:TransistorSnapshot={status:'loading',hasConfirmed:false,rows:[],invalidCount:0};const emit=(next:TransistorSnapshot)=>{last=next;if(!stopped)receive(next);};
 if(!transistorSyncEnabled){emit({...last,status:'disabled'});return()=>{stopped=true;};}if(!uid||uid.includes('/')){emit({...last,status:'error',error:'UID chưa hợp lệ; chưa truy vấn.'});return()=>{stopped=true;};}
 const stop=onSnapshot(collection(db,'users',uid,'labProgress',lesson,'cases'),{includeMetadataChanges:true},snapshot=>{if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites){emit({...last,status:'offline',error:'Đang chờ xác nhận server; chỉ giữ dữ liệu server lần cuối.'});return;}const documents=snapshot.docs.map(d=>{const data=d.data();return{id:d.id,data:{...data,updatedAt:data.updatedAt?.toDate?.()?.toISOString()||''}};});emit({...decodeTransistorDocuments(lesson,documents),status:'ready',hasConfirmed:true});},error=>emit({...last,status:error.code==='permission-denied'?'denied':'error',error:error.code==='permission-denied'?'Chưa có quyền đọc dữ liệu Bài 2–3.':error.message}));
 return()=>{stopped=true;stop();};
}
