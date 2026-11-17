import {useEffect,useRef,useState} from 'react';
import {auth} from '@/services/firebase/config';
import {useAuthStore} from '@/stores';
import {canvasLiveEnabled,fresh,liveRoom,newRequest,patchRequest,removeRequest,rtcCore,sendIce,serverTimestamp,watchIce,watchRequest,watchRoom,type CanvasRequest,type CanvasRoom,type RtcCore} from './signaling';
import './canvas-viewer.css';
type State='idle'|'requesting'|'connecting'|'watching'|'ended'|'error';
type Peer={row:CanvasRequest;pc?:RTCPeerConnection;stream?:MediaStream;inbox?:InstanceType<RtcCore['IceInbox']>;stops:(()=>void)[];timer?:number;timeout?:number;closed:boolean;answering:boolean;iceReady:boolean;iceIndex:number;ice:RTCIceCandidateInit[];chain:Promise<void>;lastFrame:number;stats?:Awaited<ReturnType<RtcCore['mediaStats']>>};
export function CanvasLiveViewer({uid,name,studentCode}:{uid:string;name:string;studentCode:string}){
 return <ViewerSession key={uid} uid={uid} name={name} studentCode={studentCode}/>;
}
function ViewerSession({uid,name,studentCode}:{uid:string;name:string;studentCode:string}){
 const [room,setRoom]=useState<CanvasRoom>(),[state,setState]=useState<State>('idle'),[detail,setDetail]=useState(''),[now,setNow]=useState(Date.now),[started,setStarted]=useState<number>(),[metrics,setMetrics]=useState<{fps:number;rtt:number}>(),[cleaning,setCleaning]=useState(false);
 const video=useRef<HTMLVideoElement>(null),surface=useRef<HTMLDivElement>(null),peer=useRef<Peer|null>(null),mounted=useRef(true),starting=useRef(false),attempt=useRef(0),pendingRemoval=useRef<CanvasRequest[]>([]);
 function close(next:State='ended',message='',write=true){const ticket=++attempt.current;const old=peer.current;peer.current=null;starting.current=false;if(old){old.closed=true;old.stops.splice(0).forEach(stop=>stop());old.ice=[];clearInterval(old.timer);clearTimeout(old.timeout);old.inbox?.close();old.stream?.getTracks().forEach(track=>{track.onended=null;track.onmute=null;track.stop();});if(old.pc){old.pc.ontrack=null;old.pc.onicecandidate=null;old.pc.onconnectionstatechange=null;old.pc.ondatachannel=null;old.pc.close();}if(write&&auth.currentUser?.uid===old.row.viewerUid){if(!navigator.onLine)pendingRemoval.current.push(old.row);else{if(mounted.current)setCleaning(true);void patchRequest(old.row,{viewerState:'stopped',viewerSeenAt:serverTimestamp()}).then(()=>removeRequest(uid,old.row.viewerUid,old.row.requestId)).catch(()=>{}).finally(()=>{if(mounted.current&&attempt.current===ticket)setCleaning(false);});}}}if(video.current)video.current.srcObject=null;if(mounted.current){setState(next);setDetail(message);setMetrics(undefined);}}
 const closeRef=useRef(close);useEffect(()=>{closeRef.current=close;});
 useEffect(()=>{
  mounted.current=true;if(!canvasLiveEnabled)return()=>{mounted.current=false;};
  const stop=watchRoom(uid,value=>{setRoom(value);const current=peer.current;if(current&&(value?.roomId!==current.row.roomId||!liveRoom(value)&&current.answering))closeRef.current('ended','Sinh viên đã rời hoặc dừng phòng 3D.');},()=>closeRef.current('error','Chưa đọc được quyền hoặc trạng thái phòng.',false));
  const offline=()=>closeRef.current('error','Mất kết nối. Kết nối mạng lại rồi yêu cầu xem mới.');window.addEventListener('offline',offline);
  const hidden=()=>{if(document.hidden)closeRef.current('ended','Đã dừng xem khi chuyển sang tab khác.');};document.addEventListener('visibilitychange',hidden);
  const timer=window.setInterval(()=>{setNow(Date.now());const current=peer.current;if(current&&(current.row.expiresAt.toMillis()<=Date.now()||!fresh(current.row.studentSeenAt,45_000)))closeRef.current('error','Phiên quan sát không còn phản hồi.');},1000);
  return()=>{mounted.current=false;stop();clearInterval(timer);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',hidden);closeRef.current('ended','',!useAuthStore.getState().isLoading);};
 },[uid]);
 function flush(current:Peer){if(!current.iceReady||current.closed)return;for(const candidate of current.ice.splice(0)){const index=current.iceIndex++;current.chain=current.chain.then(async()=>{if(!current.closed)await sendIce(current.row,'viewer',index,candidate);}).catch(()=>{if(peer.current===current)close('error','Không gửi được tín hiệu kết nối.');});}}
 async function answer(current:Peer,core:RtcCore){
  if(current.answering||current.closed||!current.row.offer)return;current.answering=true;setState('connecting');
  const pc=new RTCPeerConnection(core.ICE_CONFIG);current.pc=pc;current.inbox=new core.IceInbox(pc,()=>{if(peer.current===current)close('error','Kết nối mạng không thiết lập được.');});
  pc.ondatachannel=event=>event.channel.close();
  pc.onicecandidate=event=>{if(!event.candidate||current.closed)return;if(current.ice.length+current.iceIndex>=64){close('error','Không thiết lập được tuyến truyền video.');return;}current.ice.push(event.candidate.toJSON());flush(current);};
  pc.onconnectionstatechange=()=>{if(current.closed)return;if(['failed','disconnected','closed'].includes(pc.connectionState))close('error','Mất kết nối video. Hãy kết nối lại hoặc thử mạng khác.');};
  pc.ontrack=event=>{
   if(current.closed)return;if(event.track.kind!=='video'){event.track.stop();close('error','Luồng gửi đến không hợp lệ.');return;}
   const element=video.current;if(!element)return;const stream=new MediaStream([event.track]);current.stream=stream;element.srcObject=stream;event.track.onended=()=>{if(peer.current===current)close('ended','Sinh viên đã dừng chia sẻ.');};event.track.onmute=()=>{if(peer.current===current&&(current.stats?.decoded??0)>0)close('error','Luồng video đã tạm ngừng. Hãy kết nối lại khi phòng 3D sẵn sàng.');};void element.play().catch(()=>{if(peer.current===current)close('error','Trình duyệt chưa phát được video. Hãy thử Xem trực tiếp lại.');});
  };
  try{
   await pc.setRemoteDescription({type:'offer',sdp:current.row.offer});if(current.closed)return;
   pc.getTransceivers().forEach(item=>{item.direction='recvonly';});current.inbox.flush();const description=await pc.createAnswer();if(current.closed)return;await pc.setLocalDescription(description);if(current.closed)return;
   await patchRequest(current.row,{answer:pc.localDescription!.sdp,viewerState:'answered',viewerSeenAt:serverTimestamp()});if(current.closed)return;current.iceReady=true;flush(current);
  }catch{if(!current.closed)close('error','Không thiết lập được video. Thử lại hoặc liên hệ quản trị nếu mạng cần hỗ trợ.');}
 }
 async function start(){
  if(cleaning||starting.current||peer.current||!liveRoom(room)||!navigator.onLine)return;const ticket=++attempt.current;starting.current=true;setState('requesting');setDetail('Đang kết nối đến canvas phòng 3D của sinh viên.');
  try{
   const core=await rtcCore();if(!mounted.current||attempt.current!==ticket)return;for(const old of pendingRemoval.current.splice(0)){if(auth.currentUser?.uid===old.viewerUid){await patchRequest(old,{viewerState:'stopped',viewerSeenAt:serverTimestamp()});await removeRequest(old.studentUid,old.viewerUid,old.requestId);}}if(!mounted.current||attempt.current!==ticket)return;const row=await newRequest(uid,room!.roomId);if(!mounted.current||!starting.current||attempt.current!==ticket){void removeRequest(uid,row.viewerUid,row.requestId).catch(()=>{});return;}
   const current:Peer={row,stops:[],closed:false,answering:false,iceReady:false,iceIndex:0,ice:[],chain:Promise.resolve(),lastFrame:Date.now()};peer.current=current;starting.current=false;setStarted(Date.now());
   current.stops.push(watchIce(row,'viewer',candidate=>{if(current.inbox)current.inbox.add(candidate);else current.ice.push(candidate);},()=>{if(peer.current===current)close('error','Không đọc được tín hiệu kết nối.',false);}));
   current.stops.push(watchRequest(uid,row.viewerUid,value=>{
    if(current.closed)return;if(!value||value.requestId!==row.requestId){close('ended','Phiên quan sát đã kết thúc.',false);return;}current.row=value;
    if(value.studentState==='declined'){close('ended','Phòng 3D đang bận hoặc chưa sẵn sàng cho phiên quan sát.');return;}
    if(['stopped','failed'].includes(value.studentState)){close('ended','Sinh viên đã dừng chia sẻ.');return;}
    if(value.offer&&!current.answering){const early=current.ice.splice(0);void answer(current,core).then(()=>{if(!current.closed)early.forEach(candidate=>current.inbox?.add(candidate));});}
   },()=>{if(peer.current===current)close('error','Quyền xem không còn hiệu lực.',false);}));
   current.timeout=window.setTimeout(()=>{if(peer.current===current&&(!video.current||video.current.readyState<2))close('error','Chưa có video. Kiểm tra phòng 3D và đường truyền mạng rồi thử lại.');},45_000);
   let beat=Date.now();
   current.timer=window.setInterval(async()=>{
    if(current.closed)return;
    if(Date.now()-beat>15_000){beat=Date.now();void patchRequest(current.row,{viewerSeenAt:serverTimestamp()}).catch(()=>{if(peer.current===current)close('error','Không xác nhận được quyền xem.');});}
    if(!current.pc)return;try{const stats=await core.mediaStats(current.pc);if(current.closed)return;if(stats.decoded>(current.stats?.decoded??0))current.lastFrame=Date.now();else if(current.row.viewerState==='watching'&&Date.now()-current.lastFrame>8000){close('error','Không nhận được hình ảnh mới. Hãy kết nối lại.');return;}current.stats=stats;setMetrics({fps:stats.fps,rtt:stats.rtt});if(stats.decoded>0&&(video.current?.readyState??0)>=2&&current.row.viewerState!=='watching'){await patchRequest(current.row,{viewerState:'watching',viewerSeenAt:serverTimestamp()});if(!current.closed){setState('watching');setDetail('Chỉ quan sát canvas 3D · không điều khiển, không ghi hình.');clearTimeout(current.timeout);}}}catch{if(!current.closed)close('error','Không xác minh được luồng video.');}
   },1000);
  }catch{if(attempt.current===ticket){starting.current=false;if(mounted.current){setState('error');setDetail('Không mở được yêu cầu xem. Kiểm tra quyền hoặc phiên quan sát đang mở.');}}}
 }
 const watching=state==='watching',busy=['requesting','connecting','watching'].includes(state),available=liveRoom(room),label=watching?'Đang xem':['requesting','connecting'].includes(state)?'Đang kết nối':state==='error'?'Mất kết nối':available?'Có thể xem trực tiếp':'Chưa vào phòng 3D';
 return <section className="canvas-live-viewer" aria-label="Video trực tiếp phòng 3D" data-video-state={state} data-room-id={room?.roomId??''} data-room-available={room?.available===true} data-room-updated={room?.updatedAt?.toMillis?.()??0}>
  <div className="canvas-live-toolbar"><div><strong>{name} · {studentCode}</strong><p role="status">{canvasLiveEnabled?label:'Xem trực tiếp chưa sẵn sàng'}</p></div><div><button disabled={!canvasLiveEnabled||!available||busy||cleaning} onClick={()=>void start()}>Xem trực tiếp</button><button disabled={!busy||cleaning} onClick={()=>close()}>Dừng xem</button><button disabled={!watching} onClick={()=>void surface.current?.requestFullscreen().catch(()=>setDetail('Trình duyệt không cho mở rộng khung xem.'))}>Mở rộng khung xem</button></div></div>
  <div ref={surface} className="canvas-live-video"><video ref={video} autoPlay playsInline muted aria-label={`Video phòng 3D của ${name}`} style={{visibility:watching?'visible':'hidden'}}/>{!watching&&<p>{label}</p>}</div>
  <p>{detail||'Giảng viên đúng quyền có thể xem ngay khi phòng 3D hoạt động; sinh viên luôn thấy chỉ báo đang được quan sát.'}</p><small>{busy&&started?`Phiên ${Math.max(0,Math.floor((now-started)/1000))} giây`:'Chưa có phiên đang xem'}{metrics?` · ${metrics.fps.toFixed(0)} FPS · RTT ${(metrics.rtt*1000).toFixed(0)} ms`:''}</small>
 </section>;
}
