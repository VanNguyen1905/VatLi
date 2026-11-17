export const ICE_CONFIG:RTCConfiguration;
export const ROOM_LEASE_MS:number,VIEWER_LEASE_MS:number,REQUEST_WAIT_MS:number;
export function isId(value:unknown):value is string;
export function validCandidate(value:unknown):value is RTCIceCandidateInit;
export class IceInbox{constructor(pc:RTCPeerConnection,onError:()=>void);add(value:RTCIceCandidateInit):void;flush():void;close():void;}
export function mediaStats(pc:RTCPeerConnection):Promise<{sent:number;received:number;encoded:number;decoded:number;fps:number;rtt:number;candidateType:string}>;
