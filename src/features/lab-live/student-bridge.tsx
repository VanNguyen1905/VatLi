import {useEffect} from 'react';
import {useAuthStore} from '@/stores';
import {auth} from '@/services/firebase/config';
import {beforeAuthStateChanged} from 'firebase/auth';
import {canvasLiveEnabled,fresh,patchRequest,publishRoom,removeRequest,sendIce,serverTimestamp,watchIce,watchStudentRequests,type CanvasRequest} from './signaling';
export function CanvasLiveStudentBridge(){
 const uid=useAuthStore(state=>state.user?.uid),student=useAuthStore(state=>state.profile?.accountType==='student'&&state.profile?.enrollmentStatus!=='withdrawn'),demo=useAuthStore(state=>state.isDemo);
 useEffect(()=>{
  if(!canvasLiveEnabled||!uid||!student||demo)return;
  const studentUid=uid;let disposed=false,authEnding=false,entered=false,available=false,claimed=false,roomId='',lastConfigure=0,lastPublish=0,publishing=false;
  let current:CanvasRequest|undefined,prompt:CanvasRequest|undefined,rows:CanvasRequest[]=[],stopRequests:(()=>void)|undefined,stopIce:(()=>void)|undefined,iceReady=false,iceIndex=0,iceQueue:RTCIceCandidateInit[]=[],answerSent=false,lastPeerBeat=0,iceChain=Promise.resolve();
  let roomWrites=Promise.resolve();
  const writeRoom=(id:string,ready:boolean)=>{const claim=ready&&!claimed;const operation=roomWrites.catch(()=>{}).then(()=>{if(authEnding||ready&&(disposed||!available||roomId!==id))return;return publishRoom(studentUid,id,ready,claim);});roomWrites=operation.then(()=>{},()=>{});return operation;};
  const frame=()=>document.querySelector<HTMLIFrameElement>('.labvirt-portal-frame');
  const send=(operation:string,extra:Record<string,unknown>={})=>frame()?.contentWindow?.postMessage({type:'labvirt:canvas-live',version:1,operation,roomId,...extra},location.origin);
  const cleanup=(row:CanvasRequest)=>{void removeRequest(studentUid,row.viewerUid,row.requestId).catch(()=>{/* Expired/orphan signaling is also eligible for the reviewed TTL policy. */});};
  function finish(mark=true){const old=current;current=undefined;prompt=undefined;stopIce?.();stopIce=undefined;iceReady=false;iceQueue=[];answerSent=false;send('stop',{requestId:old?.requestId});if(old&&mark&&!authEnding&&auth.currentUser?.uid===studentUid&&navigator.onLine)void patchRequest(old,{studentState:'stopped',studentSeenAt:serverTimestamp()}).catch(()=>{});}
  function shutdown(){available=false;finish();stopRequests?.();stopRequests=undefined;rows=[];if(roomId)void writeRoom(roomId,false).catch(()=>{});}
  function fail(){finish();send('notice');}
  function flush(){const row=current;if(!iceReady||!row)return;for(const candidate of iceQueue.splice(0)){const index=iceIndex++;iceChain=iceChain.then(async()=>{if(!disposed&&current?.requestId===row.requestId)await sendIce(row,'student',index,candidate);}).catch(()=>{if(!disposed&&current?.requestId===row.requestId)fail();});}}
  function showNext(){
   if(!available||current||prompt)return;
   const next=rows.find(row=>row.roomId===roomId&&row.studentState==='pending'&&row.viewerState==='requesting'&&fresh(row.createdAt,45_000)&&fresh(row.viewerSeenAt,45_000)&&row.expiresAt.toMillis()>Date.now());
   if(next){prompt=next;send('request',{requestId:next.requestId});}
  }
  function receiveRequests(next:CanvasRequest[]){
   if(disposed)return;rows=next;
   if(current){const updated=rows.find(row=>row.requestId===current?.requestId);if(!updated||['stopped','failed'].includes(updated.viewerState)||['stopped','declined','failed'].includes(updated.studentState)){finish(false);}else{current=updated;if(updated.answer&&!answerSent){answerSent=true;send('answer',{requestId:updated.requestId,sdp:updated.answer});}if(updated.viewerState==='watching')send('watching',{requestId:updated.requestId});}}
   if(prompt&&!rows.some(row=>row.requestId===prompt?.requestId)){send('cancel',{requestId:prompt.requestId});prompt=undefined;}
   showNext();
  }
  function announce(){
   if(publishing||!available||!entered||disposed||!navigator.onLine)return;publishing=true;const id=roomId;
   void writeRoom(id,true).then(()=>{lastPublish=Date.now();if(disposed||!available||roomId!==id){void writeRoom(id,false).catch(()=>{});return;}claimed=true;stopRequests??=watchStudentRequests(studentUid,receiveRequests,fail);}).catch(()=>{if(!disposed){available=false;finish();send('notice');}}).finally(()=>{publishing=false;});
  }
  async function message(event:MessageEvent){
   if(disposed||event.origin!==location.origin||event.source!==frame()?.contentWindow)return;const value=event.data;
   if(['labvirt:lab-entered','labvirt:lab-entering'].includes(value?.type)){if(!entered){entered=true;roomId=crypto.randomUUID();claimed=false;lastConfigure=0;}send('configure');return;}
   if(['labvirt:lab-exited','labvirt:studio-ready'].includes(value?.type)){entered=false;shutdown();return;}
   if(value?.type==='labvirt:runtime-ready'&&entered){send('configure');return;}
   if(value?.type!=='labvirt:canvas-live'||value.version!==1||value.roomId!==roomId||!entered)return;
   if(value.event==='availability'){
    if(value.available&&navigator.onLine&&document.visibilityState==='visible'){
     // The same canvas retains its room lease across a temporary network loss.
     // Each viewing attempt still has a new requestId; stopped media never resumes itself.
     if(!available){available=true;lastPublish=0;announce();}
    }else if(available)shutdown();return;
   }
   if(value.event==='decline'&&prompt&&prompt.requestId===value.requestId){const row=prompt;prompt=undefined;await patchRequest(row,{studentState:'declined',studentSeenAt:serverTimestamp()});showNext();return;}
   if(value.event==='publisher-ready'&&prompt&&prompt.requestId===value.requestId&&typeof value.nonce==='string'&&/^[a-zA-Z0-9-]{20,80}$/.test(value.nonce)){
    const row=rows.find(row=>row.requestId===value.requestId);if(!row||!fresh(row.viewerSeenAt,45_000)||!fresh(row.createdAt,45_000)||row.studentState!=='pending'||row.roomId!==roomId||row.expiresAt.toMillis()<=Date.now())return;
    current=row;prompt=undefined;iceIndex=0;iceReady=false;iceQueue=[];answerSent=false;lastPeerBeat=Date.now();stopIce=watchIce(row,'student',candidate=>{if(current?.requestId===row.requestId)send('ice',{requestId:row.requestId,candidate});},fail);send('start',{requestId:row.requestId,nonce:value.nonce});return;
   }
   const row=current;if(!row||row.requestId!==value.requestId)return;
   if(value.event==='offer'&&typeof value.sdp==='string'&&value.sdp.length>0&&value.sdp.length<=30000){const saved=await patchRequest(row,{studentState:'offered',offer:value.sdp,studentSeenAt:serverTimestamp()});if(!saved){if(current?.requestId===row.requestId)finish(false);return;}if(current?.requestId===row.requestId&&!disposed){iceReady=true;flush();}return;}
   if(value.event==='ice'&&value.candidate){if(iceQueue.length+iceIndex>=64){fail();return;}iceQueue.push(value.candidate);flush();return;}
   if(value.event==='stopped')finish();
  }
  const listener=(event:MessageEvent)=>{void message(event).catch(()=>{if(!disposed)fail();});};window.addEventListener('message',listener);
  const offline=()=>shutdown();window.addEventListener('offline',offline);
  const hidden=()=>{if(document.hidden)shutdown();};document.addEventListener('visibilitychange',hidden);
  const pagehide=()=>{entered=false;shutdown();};window.addEventListener('pagehide',pagehide);
  // Tear down before Firebase removes the token, not one React render later.
  const stopAuth=beforeAuthStateChanged(auth,next=>{if(next?.uid!==studentUid){authEnding=true;entered=false;shutdown();}});
  const timer=window.setInterval(()=>{
   if(disposed)return;
   if(entered&&Date.now()-lastConfigure>3000){lastConfigure=Date.now();send('configure');}
   if(available&&Date.now()-lastPublish>20_000)announce();
   if(current){if(!fresh(current.viewerSeenAt,45_000)||current.expiresAt.toMillis()<=Date.now())finish();else if(iceReady&&Date.now()-lastPeerBeat>15_000){lastPeerBeat=Date.now();const row=current;void patchRequest(row,{studentSeenAt:serverTimestamp()}).catch(()=>{if(current?.requestId===row.requestId)fail();});}}
   if(prompt&&(!fresh(prompt.createdAt,45_000)||!fresh(prompt.viewerSeenAt,45_000))){const row=prompt;send('cancel',{requestId:row.requestId});prompt=undefined;void patchRequest(row,{studentState:'declined',studentSeenAt:serverTimestamp()}).catch(()=>{});}
   // The viewer normally removes signaling. The student only reaps abandoned
   // leases, avoiding two peers racing to delete the same reusable slot.
   for(const row of rows)if(row.requestId!==current?.requestId&&(row.expiresAt.toMillis()<=Date.now()||row.roomId===roomId&&!fresh(row.viewerSeenAt,45_000)))cleanup(row);
   showNext();
  },1000);
  return()=>{const session=useAuthStore.getState();if(session.isLoading||session.user?.uid!==studentUid||session.profile?.enrollmentStatus==='withdrawn')authEnding=true;disposed=true;entered=false;stopAuth();shutdown();clearInterval(timer);window.removeEventListener('message',listener);window.removeEventListener('offline',offline);window.removeEventListener('pagehide',pagehide);document.removeEventListener('visibilitychange',hidden);};
 },[uid,student,demo]);
 return null;
}
