import {ICE_CONFIG,IceInbox,isId,validCandidate,mediaStats} from './rtc-core.js';
const canvas=document.getElementById('scene');
let roomId='',request=null,authorization=null,active=null,lost=false,wasReady=false,disposed=false,lastAvailableAt=0,baselineFps=0;
const counts={created:0,closed:0,captures:0,stoppedTracks:0};
let statusText='',statusSharing=false;
const panel=document.createElement('aside');panel.id='canvas-live-status';panel.hidden=true;panel.setAttribute('aria-live','polite');document.body.append(panel);
function send(event,extra={}){if(parent!==window)parent.postMessage({type:'labvirt:canvas-live',version:1,event,roomId,...extra},location.origin);}
function ready(){const state=window.labvirtDiagnostics?.();return !!(canvas?.captureStream&&window.RTCPeerConnection&&state?.frameVerified&&state.frames>3&&state.cinematic===null&&!document.hidden&&!lost&&navigator.onLine);}
function status(text,sharing=false){if(statusText===text&&statusSharing===sharing)return;statusText=text;statusSharing=sharing;panel.replaceChildren();panel.hidden=!text;panel.classList.toggle('is-sharing',sharing);if(!text)return;const title=document.createElement('strong');title.textContent=text;panel.append(title);if(sharing){const note=document.createElement('small');note.textContent='Chỉ hình ảnh phòng 3D · không micro, webcam hoặc ghi hình';const button=document.createElement('button');button.type='button';button.dataset.liveStop='';button.textContent='Dừng chia sẻ';button.onclick=()=>stop('student-stopped');panel.append(note,button);}}
function showRequest(value){
 if(active||request||!ready()){send('decline',{requestId:value.requestId});return;}
 // The host has received this request from Firebase under Owner-only Rules.
 // No student approval click; the indicator remains visible throughout sharing.
 request=value;authorization={requestId:value.requestId,nonce:crypto.randomUUID()};status('Giảng viên đang kết nối xem phòng thí nghiệm…',true);send('publisher-ready',authorization);
}
function stop(reason='stopped'){
 const previous=active;active=null;request=null;authorization=null;
 if(previous){clearInterval(previous.timer);clearTimeout(previous.timeout);previous.inbox.close();previous.pc.onicecandidate=null;previous.pc.onconnectionstatechange=null;previous.pc.ontrack=null;previous.pc.ondatachannel=null;previous.pc.close();counts.closed++;previous.stream.getTracks().forEach(track=>{track.onended=null;track.stop();counts.stoppedTracks++;});send('stopped',{requestId:previous.id,reason});}
 status('');
}
async function start(value){
 if(active||!request||!authorization||value.requestId!==authorization.requestId||value.nonce!==authorization.nonce||!ready())return;
 const pc=new RTCPeerConnection(ICE_CONFIG);counts.created++;
 let stream;try{stream=canvas.captureStream(18);}catch{pc.close();counts.closed++;send('stopped',{requestId:value.requestId,reason:'capture-failed'});request=null;authorization=null;status('Không lấy được hình ảnh phòng 3D. Bạn vẫn có thể thực hành.');return;}
 counts.captures++;const track=stream.getVideoTracks()[0];if(!track){pc.close();counts.closed++;stream.getTracks().forEach(item=>item.stop());return;}
 const current={id:value.requestId,pc,stream,inbox:new IceInbox(pc,()=>stop('ice-failed')),timer:0,timeout:0,sender:null,metrics:null};active=current;
 track.contentHint='motion';track.onended=()=>{if(active===current)stop('track-ended');};
 const sender=pc.addTransceiver(track,{direction:'sendonly',streams:[stream]}).sender;current.sender=sender;
 pc.ontrack=event=>{event.track.stop();if(active===current)stop('unexpected-inbound-media');};pc.ondatachannel=event=>event.channel.close();
 pc.onicecandidate=event=>{if(event.candidate&&active===current)send('ice',{requestId:current.id,candidate:event.candidate.toJSON()});};
 pc.onconnectionstatechange=()=>{if(active!==current)return;send('connection',{requestId:current.id,state:pc.connectionState});if(pc.connectionState==='connected'){clearTimeout(current.timeout);status('Đang chia sẻ hình ảnh phòng thí nghiệm',true);}if(['failed','closed','disconnected'].includes(pc.connectionState))stop('connection-lost');};
 current.timeout=setTimeout(()=>{if(active===current)stop('connection-timeout');},25_000);
 try{
  const parameters=sender.getParameters();if(parameters.encodings?.length){parameters.degradationPreference='maintain-resolution';parameters.encodings[0].maxBitrate=850_000;parameters.encodings[0].maxFramerate=18;parameters.encodings[0].scaleResolutionDownBy=Math.max(1,canvas.width/1280,canvas.height/720);try{await sender.setParameters(parameters);}catch{/* Older engines keep their negotiated defaults; adaptation retries below. */}}
  if(active!==current)return;
  const offer=await pc.createOffer();if(active!==current)return;await pc.setLocalDescription(offer);if(active!==current)return;
  send('offer',{requestId:current.id,sdp:pc.localDescription.sdp});
  current.timer=setInterval(async()=>{if(active!==current)return;try{const metrics=await mediaStats(pc);if(active!==current)return;const rendererFps=window.labvirtDiagnostics?.().fps||0,slow=rendererFps>0&&rendererFps<Math.min(22,baselineFps*.72)||metrics.rtt>.4;const parameters=sender.getParameters();if(parameters.encodings?.length){parameters.degradationPreference='maintain-resolution';parameters.encodings[0].maxBitrate=slow?400_000:850_000;parameters.encodings[0].maxFramerate=slow?12:18;parameters.encodings[0].scaleResolutionDownBy=Math.max(1,canvas.width/(slow?640:1280),canvas.height/(slow?360:720));await sender.setParameters(parameters);}if(active===current){const stats=await pc.getStats();let dimensions={};stats.forEach(row=>{if(row.type==='outbound-rtp'&&row.kind==='video')dimensions={width:row.frameWidth,height:row.frameHeight,qualityLimitationReason:row.qualityLimitationReason};});current.metrics={...metrics,...dimensions,rendererFps,baselineFps,targetFps:slow?12:18};send('metrics',{requestId:current.id,metrics:current.metrics});}}catch{/* Teardown and browser-specific encoder limits must not change the simulation. */}},4000);
 }catch{if(active===current)stop('offer-failed');}
}
async function command(event){
 const value=event.data;if(event.origin!==location.origin||event.source!==parent||parent===window||value?.type!=='labvirt:canvas-live'||value.version!==1)return;
 if(value.operation==='configure'){if(!isId(value.roomId))return;if(roomId!==value.roomId){stop('room-changed');roomId=value.roomId;}lastAvailableAt=0;return;}
 if(value.roomId!==roomId||!roomId)return;
 if(value.operation==='notice'){if(!active)status('Chưa kết nối được phiên quan sát. Bạn vẫn có thể thực hành.');return;}
 if(value.operation==='request'&&isId(value.requestId)){showRequest(value);return;}
 if(value.operation==='cancel'&&request?.requestId===value.requestId&&!active){request=null;authorization=null;status('');return;}
 if(value.operation==='stop'){if(!value.requestId||active?.id===value.requestId||request?.requestId===value.requestId)stop('host-stopped');return;}
 if(value.operation==='start'){await start(value);return;}
 const current=active;if(!current||current.id!==value.requestId)return;
 if(value.operation==='watching'){status('Giảng viên đang xem phòng thí nghiệm',true);return;}
 if(value.operation==='ice'&&validCandidate(value.candidate))current.inbox.add(value.candidate);
 if(value.operation==='answer'&&typeof value.sdp==='string'&&value.sdp.length<=30000&&!current.pc.remoteDescription){try{await current.pc.setRemoteDescription({type:'answer',sdp:value.sdp});if(active===current)current.inbox.flush();}catch{if(active===current)stop('answer-failed');}}
}
window.addEventListener('message',event=>{void command(event).catch(()=>stop('invalid-signal'));});
function availability(){if(disposed||!roomId)return;const available=ready();if(available&&!active){const fps=window.labvirtDiagnostics?.().fps||0;if(fps>0)baselineFps=baselineFps?baselineFps*.7+fps*.3:fps;}if(available!==wasReady||available&&Date.now()-lastAvailableAt>3000){wasReady=available;lastAvailableAt=Date.now();send('availability',{available});}if(!available&&(active||request)){const id=active?.id||request?.requestId;stop('room-unavailable');send('stopped',{requestId:id,reason:'room-unavailable'});}}
const watch=setInterval(availability,1000);
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop('tab-hidden');send('availability',{available:false});wasReady=false;}else lastAvailableAt=0;});
window.addEventListener('offline',()=>{stop('offline');send('availability',{available:false});wasReady=false;});
canvas?.addEventListener('webglcontextlost',()=>{lost=true;stop('webgl-context-lost');send('availability',{available:false});wasReady=false;});canvas?.addEventListener('webglcontextrestored',()=>{lost=false;lastAvailableAt=0;});
window.addEventListener('pagehide',()=>{disposed=true;clearInterval(watch);stop('page-closed');send('availability',{available:false});},{once:true});
// Read-only lifecycle/statistics evidence; no API to set measurements or remote-control the lab.
window.labvirtCanvasLiveDiagnostics=()=>({roomId,activeRequest:active?.id||null,pendingRequest:request?.requestId||null,tracks:active?.stream.getTracks().map(track=>({kind:track.kind,readyState:track.readyState}))||[],connectionState:active?.pc.connectionState||'closed',counts:{...counts},metrics:active?.metrics||null,canvasId:canvas?.id});
