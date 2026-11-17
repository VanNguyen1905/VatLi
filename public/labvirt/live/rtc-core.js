// One-way canvas media only. STUN example: https://webrtc.org/getting-started/turn-server
export const ICE_CONFIG={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
export const ROOM_LEASE_MS=90_000;
export const VIEWER_LEASE_MS=45_000;
export const REQUEST_WAIT_MS=45_000;
export const isId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
export function validCandidate(value){return !!value&&typeof value.candidate==='string'&&value.candidate.length<=2048&&(value.sdpMid===null||typeof value.sdpMid==='string'&&value.sdpMid.length<=32)&&(value.sdpMLineIndex===null||Number.isInteger(value.sdpMLineIndex)&&value.sdpMLineIndex>=0&&value.sdpMLineIndex<16);}
/** Trickle ICE may precede the remote SDP. Serialize it, bound it and deduplicate. */
export class IceInbox{
 constructor(pc,onError){this.pc=pc;this.onError=onError;this.pending=[];this.seen=new Set();this.chain=Promise.resolve();this.closed=false;}
 add(candidate){if(this.closed||!validCandidate(candidate))return;const key=JSON.stringify(candidate);if(this.seen.has(key))return;if(this.seen.size>=128){this.onError();return;}this.seen.add(key);this.pending.push(candidate);this.flush();}
 flush(){if(this.closed||!this.pc.remoteDescription)return;for(const value of this.pending.splice(0))this.chain=this.chain.then(async()=>{if(!this.closed&&this.pc.signalingState!=='closed')await this.pc.addIceCandidate(value);}).catch(()=>{if(!this.closed)this.onError();});}
 close(){this.closed=true;this.pending=[];this.seen.clear();}
}
export async function mediaStats(pc){
 const reports=await pc.getStats();let sent=0,received=0,encoded=0,decoded=0,fps=0,rtt=0,candidateType='unknown';
 reports.forEach(row=>{if(row.type==='outbound-rtp'&&(row.kind==='video'||row.mediaType==='video')){sent+=row.bytesSent||0;encoded+=row.framesEncoded||0;fps=row.framesPerSecond||fps;}if(row.type==='inbound-rtp'&&(row.kind==='video'||row.mediaType==='video')){received+=row.bytesReceived||0;decoded+=row.framesDecoded||0;fps=row.framesPerSecond||fps;}if(row.type==='candidate-pair'&&row.state==='succeeded'&&row.nominated){rtt=row.currentRoundTripTime||0;candidateType=reports.get(row.remoteCandidateId)?.candidateType||candidateType;}});
 return {sent,received,encoded,decoded,fps,rtt,candidateType};
}
