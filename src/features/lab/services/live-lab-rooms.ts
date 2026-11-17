import { collection, doc, getDoc, limit, onSnapshot, query, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/services/firebase/config';

/**
 * Ban ghi chi chua TRANG THAI CHUAN BI PHONG LAB. Khong phai video, mang noi day,
 * so do mach da duoc giai, hay bang chung do dien da duoc backend xac minh.
 * Moi UID = mot phong, duoc Firestore dong bo bang onSnapshot.
 */
export type PreviewInstrument = 'NONE' | 'DMM' | 'OSCILLOSCOPE' | 'DC_SUPPLY';
export type PreviewComponent = 'NONE' | 'RESISTOR' | 'CERAMIC_CAP' | 'ELECTROLYTIC_CAP' | 'INDUCTOR' | 'DIODE' | 'ZENER' | 'BJT' | 'JFET' | 'MOSFET' | 'SCR' | 'LDR' | 'LED';
export interface LiveLabRoom {
  uid: string;
  studentCode: string;
  sessionId: string;
  experimentId: string;
  practicalId: string;
  sceneMode: 'PREPARATION_ONLY';
  selectedInstrument: PreviewInstrument;
  selectedComponent: PreviewComponent;
  stepIndex: number;
  powerState: 'OFF';
  updatedAt?: {toDate?: () => Date; toMillis?: () => number};
}

export const INSTRUMENT_LABELS: Record<PreviewInstrument,string> = {
  NONE:'Chưa chọn', DMM:'Đồng hồ DMM', OSCILLOSCOPE:'Dao động ký', DC_SUPPLY:'Nguồn DC'
};
export const COMPONENT_LABELS: Record<PreviewComponent,string> = {
  NONE:'Chưa chọn', RESISTOR:'Điện trở', CERAMIC_CAP:'Tụ gốm', ELECTROLYTIC_CAP:'Tụ hóa',
  INDUCTOR:'Cuộn cảm', DIODE:'Diode', ZENER:'Diode Zener', BJT:'BJT', JFET:'JFET',
  MOSFET:'MOSFET', SCR:'SCR', LDR:'Quang trở LDR', LED:'LED'
};

/** Xac minh session do Firebase tao va thuoc dung sinh vien truoc khi gui trang thai. */
export async function prepareStudentRoom(uid: string, studentCode: string, sessionId: string): Promise<LiveLabRoom> {
  if (!uid || !/^76DCVV[0-9]{5}$/i.test(studentCode) || !sessionId || sessionId.includes('/')) {
    throw new Error('Tai khoan sinh vien hoac phien thuc hanh khong hop le.');
  }
  const snap=await getDoc(doc(db,'users',uid,'labSessions',sessionId));
  if(!snap.exists() || snap.data().uid!==uid) throw new Error('Khong tim thay phien thuc hanh cua ban.');
  const data=snap.data();
  const previous=await getDoc(doc(db,'labLiveRooms',uid));
  if(previous.exists()){
    const old=previous.data() as LiveLabRoom;
    if(old.uid===uid&&old.studentCode===studentCode.toUpperCase()&&old.experimentId===data.experimentId&&old.practicalId===data.practicalId&&old.sceneMode==='PREPARATION_ONLY'&&old.powerState==='OFF')return {...old,sessionId};
  }
  const state:LiveLabRoom = {
    uid,studentCode:studentCode.toUpperCase(),sessionId,
    experimentId:String(data.experimentId),practicalId:String(data.practicalId),
    sceneMode:'PREPARATION_ONLY', selectedInstrument:'NONE',selectedComponent:'NONE',stepIndex:0,powerState:'OFF'
  };
  await writeStudentRoom(state);
  return state;
}

/** Client khong bao gio duoc dat power ON, ket qua do, verified hoac score. */
export async function writeStudentRoom(state: LiveLabRoom):Promise<void> {
  const {updatedAt: _ignored, ...fields}=state;
  await setDoc(doc(db,'labLiveRooms',state.uid), {...fields,updatedAt:serverTimestamp()});
}

/** 1 listener cho toi da 100 phong, khong tao 46 ket noi rieng. */
export function listenLiveRooms(
  update:(rooms:Record<string,LiveLabRoom>)=>void,
  onError:(error:string)=>void,
):Unsubscribe {
  return onSnapshot(query(collection(db,'labLiveRooms'),limit(100)),snapshot=>{
    const rooms:Record<string,LiveLabRoom>={};
    snapshot.docs.forEach(s=>{rooms[s.id]=s.data() as LiveLabRoom});
    update(rooms);
  },error=>onError(`Khong dong bo duoc phong lab: ${error.message}`));
}

export function liveRoomLabel(room:LiveLabRoom|undefined,online:boolean,hasRoomRoute:boolean):string {
  if (!room) return 'Chua mo phong lab';
  if (!online || !hasRoomRoute) return 'Tam vang / xem trang khac';
  return 'Dang chuan bi trong phong';
}
