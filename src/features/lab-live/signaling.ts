import {collection,deleteDoc,doc,getDocFromServer,getDocs,limit,onSnapshot,query,runTransaction,serverTimestamp,setDoc,Timestamp,updateDoc,writeBatch,type Unsubscribe} from 'firebase/firestore';
import {auth,db} from '@/services/firebase/config';
export const canvasLiveEnabled=import.meta.env.VITE_USE_FIREBASE_EMULATOR==='true'||import.meta.env.VITE_LAB_CANVAS_LIVE==='true';
export const roomRef=(uid:string)=>doc(db,'labLiveRooms',uid,'canvasLive','state');
export const requestsRef=(uid:string)=>collection(roomRef(uid),'canvasRequests');
export const requestRef=(uid:string,viewer:string)=>doc(requestsRef(uid),viewer);
export type CanvasRoom={uid:string;roomId:string;available:boolean;updatedAt:Timestamp;expiresAt:Timestamp};
export type CanvasRequest={studentUid:string;viewerUid:string;requestId:string;roomId:string;studentState:'pending'|'offered'|'declined'|'stopped'|'failed';viewerState:'requesting'|'answered'|'watching'|'stopped'|'failed';createdAt:Timestamp;expiresAt:Timestamp;studentSeenAt:Timestamp;viewerSeenAt:Timestamp;offer?:string;answer?:string};
export type RtcCore=typeof import('../../../public/labvirt/live/rtc-core.js');
let corePromise:Promise<RtcCore>|undefined;
export const rtcCore=()=>corePromise??=import(/* @vite-ignore */new URL('/labvirt/live/rtc-core.js',location.origin).href).catch(error=>{corePromise=undefined;throw error;}) as Promise<RtcCore>;
export const fresh=(timestamp:Timestamp|undefined,lease:number)=>!!timestamp&&Date.now()-timestamp.toMillis()<lease&&timestamp.toMillis()<Date.now()+10_000;
export const liveRoom=(room:CanvasRoom|undefined)=>!!room?.available&&room.expiresAt?.toMillis()>Date.now()&&fresh(room.updatedAt,90_000);
export function watchRoom(uid:string,receive:(room:CanvasRoom|undefined)=>void,error:()=>void):Unsubscribe{return onSnapshot(roomRef(uid),{includeMetadataChanges:true},snapshot=>{if(!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites)receive(snapshot.exists()?snapshot.data() as CanvasRoom:undefined);},error);}
export async function publishRoom(uid:string,roomId:string,available:boolean,claim=false){
 const actor=auth.currentUser;if(actor?.uid!==uid)throw Error('CANVAS_AUTH_CHANGED');
 await runTransaction(db,async transaction=>{const ref=roomRef(uid),previous=await transaction.get(ref);if(auth.currentUser!==actor)return;if(previous.exists()&&previous.data().roomId!==roomId&&liveRoom(previous.data() as CanvasRoom)){if(!available)return;if(!claim)throw Error('CANVAS_ROOM_REPLACED');}transaction.set(ref,{uid,roomId,available,updatedAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+90_000)});});
}
export function watchStudentRequests(uid:string,receive:(rows:CanvasRequest[])=>void,error:()=>void):Unsubscribe{return onSnapshot(query(requestsRef(uid),limit(10)),{includeMetadataChanges:true},snapshot=>{if(!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites)receive(snapshot.docs.map(row=>row.data() as CanvasRequest));},error);}
export function watchRequest(uid:string,viewer:string,receive:(value:CanvasRequest|undefined)=>void,error:()=>void):Unsubscribe{return onSnapshot(requestRef(uid,viewer),{includeMetadataChanges:true},snapshot=>{if(!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites)receive(snapshot.exists()?snapshot.data() as CanvasRequest:undefined);},error);}
export async function removeRequest(uid:string,viewer:string,requestId:string){
 const ref=requestRef(uid,viewer),current=await getDocFromServer(ref);if(!current.exists()||current.data().requestId!==requestId)return;
 const data=current.data();if(!['stopped','declined','failed'].includes(data.studentState)&&!['stopped','failed'].includes(data.viewerState)&&data.expiresAt.toMillis()>Date.now())await updateDoc(ref,{requestId,...(auth.currentUser?.uid===uid?{studentState:'stopped',studentSeenAt:serverTimestamp()}:{viewerState:'stopped',viewerSeenAt:serverTimestamp()})});
 for(let i=0;i<4;i++){const ice=await getDocs(query(collection(ref,'canvasIce'),limit(260)));if(!ice.size)break;const batch=writeBatch(db);ice.docs.forEach(row=>batch.delete(row.ref));await batch.commit();if(i===3&&ice.size===260)throw Error('CANVAS_CLEANUP_LIMIT');}
 // Rules only permit deleting a terminal/expired room request. A stale cleanup
 // cannot delete a fresh active request that reused this viewer slot.
 await deleteDoc(ref);
}
export async function newRequest(uid:string,roomId:string):Promise<CanvasRequest>{
 const viewer=auth.currentUser?.uid;if(!viewer||viewer===uid)throw Error('CANVAS_VIEWER_INVALID');
 const state=await getDocFromServer(roomRef(uid));if(!state.exists()||!liveRoom(state.data() as CanvasRoom)||state.data().roomId!==roomId)throw Error('CANVAS_ROOM_UNAVAILABLE');
 const ref=requestRef(uid,viewer),old=await getDocFromServer(ref);
 if(old.exists()){const previous=old.data() as CanvasRequest;if(previous.roomId===roomId&&fresh(previous.viewerSeenAt,45_000)&&previous.expiresAt.toMillis()>Date.now()&&!['stopped','failed'].includes(previous.viewerState)&&!['declined','stopped','failed'].includes(previous.studentState))throw Error('CANVAS_VIEW_ALREADY_OPEN');await removeRequest(uid,viewer,previous.requestId);}
 const requestId=crypto.randomUUID();await runTransaction(db,async transaction=>{const existing=await transaction.get(ref);if(existing.exists())throw Error('CANVAS_VIEW_ALREADY_OPEN');transaction.set(ref,{studentUid:uid,viewerUid:viewer,requestId,roomId,studentState:'pending',viewerState:'requesting',createdAt:serverTimestamp(),studentSeenAt:serverTimestamp(),viewerSeenAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+30*60_000)});});
 return (await getDocFromServer(ref)).data() as CanvasRequest;
}
export async function patchRequest(row:CanvasRequest,values:Record<string,unknown>){
 const actor=auth.currentUser;if(!actor||![row.studentUid,row.viewerUid].includes(actor.uid))return false;
 const ref=requestRef(row.studentUid,row.viewerUid),current=await getDocFromServer(ref);
 if(auth.currentUser!==actor)return false;
 if(!current.exists()||current.data().requestId!==row.requestId)return false;
 if(['stopped','declined','failed'].includes(current.data().studentState)||['stopped','failed'].includes(current.data().viewerState))return false;
 // Party-specific field masks do not overwrite the other peer. Including the
 // immutable requestId makes Rules reject a stale write if the slot was reused.
 await updateDoc(ref,{...values,requestId:row.requestId});return true;
}
export async function sendIce(row:CanvasRequest,side:'student'|'viewer',index:number,candidate:RTCIceCandidateInit){
 if(index>=64)throw Error('CANVAS_ICE_LIMIT');const ref=doc(collection(requestRef(row.studentUid,row.viewerUid),'canvasIce'),`${row.requestId}_${side}_${index}`);
 const clean={candidate:candidate.candidate??'',sdpMid:candidate.sdpMid??null,sdpMLineIndex:candidate.sdpMLineIndex??null,usernameFragment:candidate.usernameFragment??null};
 await setDoc(ref,{requestId:row.requestId,side,index,senderUid:auth.currentUser?.uid,candidate:clean,createdAt:serverTimestamp(),expiresAt:row.expiresAt});
}
export function watchIce(row:CanvasRequest,side:'student'|'viewer',receive:(candidate:RTCIceCandidateInit)=>void,error:()=>void){const seen=new Set<string>();return onSnapshot(query(collection(requestRef(row.studentUid,row.viewerUid),'canvasIce'),limit(260)),snapshot=>{if(snapshot.metadata.fromCache)return;snapshot.docs.forEach(item=>{const data=item.data();if(data.requestId!==row.requestId||data.side===side||seen.has(item.id))return;seen.add(item.id);receive(data.candidate);});},error);}
export {serverTimestamp,Timestamp,updateDoc};
