import { collection, doc, getDocs, limit, orderBy, onSnapshot, query, runTransaction, serverTimestamp, Timestamp, where, writeBatch, type Unsubscribe } from 'firebase/firestore';
import {commitAdminRecord} from './admin-persistence';
import { db } from '@/services/firebase/config';
import { httpsCallable } from 'firebase/functions';
import { labFunctions } from '@/services/firebase/functions';
import type { Experiment, LabEvidence, LabSession, RosterStudent } from '../lab-model';
import { OFFICIAL_CURRICULUM, validateCurriculum } from '../data/official-curriculum';
import { EQUIPMENT_CATALOG, type EquipmentAssetRecord } from '../data/equipment-catalog';
import {validateRosterInput} from '../roster-validation';

function fail(err: unknown): string { return err instanceof Error ? err.message : 'Không truy xuất được dữ liệu'; }
export function listenExperiments(owner: boolean, update: (items: Experiment[]) => void, error: (msg: string) => void): Unsubscribe {
  const root = collection(db, 'labExperiments');
  const q = owner ? query(root, limit(150)) : query(root, where('published', '==', true), limit(150));
  return onSnapshot(q, snapshot => {
    const docs = snapshot.docs.map(d => ({...d.data(), id: d.id} as Experiment));
    update(docs.sort((a,b) => a.order - b.order || a.code.localeCompare(b.code)));
  }, err => error(fail(err)));
}
export async function saveExperiment(experiment: Experiment): Promise<void> {
  const {id, updatedAt, revision, ...rest} = experiment;
  await commitAdminRecord('labExperiments',id,updatedAt ? {updatedAt,revision}:null,rest);
}
export async function archiveExperiment(experiment:Experiment,archived:boolean):Promise<void>{
  await commitAdminRecord('labExperiments',experiment.id,experiment,{archived,...(archived?{published:false}:{})});
}
export async function updateRosterStudent(original:RosterStudent,changes:Pick<RosterStudent,'fullName'|'className'|'enrollmentStatus'>):Promise<void>{
  if(!changes.fullName.trim()||changes.fullName.length>100||changes.className.length>80)throw Error('Tên hoặc lớp không hợp lệ');
  await commitAdminRecord('labRoster',original.id,original,{...changes,fullName:changes.fullName.trim(),className:changes.className.trim()});
}
export async function saveEquipment(original:EquipmentAssetRecord,changes:Pick<EquipmentAssetRecord,'name'|'quantity'|'specification'>):Promise<void>{
  if(!changes.name.trim()||!Number.isInteger(changes.quantity)||changes.quantity<1||changes.quantity>100)throw Error('Tên thiết bị hoặc số lượng không hợp lệ');
  await commitAdminRecord('labEquipment',original.id,original,changes);
}
export function listenStudentSessions(uid: string, callback: (rows: LabSession[]) => void, error: (msg: string)=>void): Unsubscribe {
  return onSnapshot(query(collection(db, 'users', uid, 'labSessions'), limit(200)), snapshot => {
    callback(snapshot.docs.map(d => ({...d.data(), id:d.id} as LabSession)));
  }, err => error(fail(err)));
}
export async function startPreparation(uid: string, experimentId: string, practicalId: string): Promise<string> {
  const ref = doc(collection(db, 'users', uid, 'labSessions'));
  const evidenceRef=doc(collection(db, 'users', uid, 'labSessions', ref.id, 'labEvidence'));
  const batch=writeBatch(db);
  batch.set(ref, {id:ref.id, uid, experimentId, practicalId, startedAt:Timestamp.now(), status:'PREPARATION'});
  // Ghi nguyên tử: không để phiên tạo thành công nhưng thiếu sự kiện chuẩn bị.
  batch.set(evidenceRef, {
    kind:'WEB_PREPARATION', source:'WEB', verified:false, sessionId:ref.id, recordedAt:Timestamp.now(),
    detail:'Người học mở trang chuẩn bị bài thực hành; phòng lab 3D chưa được tích hợp.'
  } satisfies LabEvidence);
  await batch.commit();
  return ref.id;
}
export async function listSessionEvidence(uid:string, sessionId:string):Promise<LabEvidence[]> {
  const snap = await getDocs(query(collection(db, 'users',uid,'labSessions',sessionId,'labEvidence'), limit(400)));
  return snap.docs.map(doc => doc.data() as LabEvidence);
}
export async function reviewSession(uid:string, sessionId:string, result:'PASSED'|'FAILED',score:number,note:string,_reviewerUid:string,expectedRevision=0):Promise<void> {
  if(!Number.isInteger(score) || score<0 || score>100) throw new Error('Điểm phải là số nguyên 0–100');
  const callable=httpsCallable(labFunctions,'reviewLabSession');
  const capability=await callable({operation:'capabilities'});
  if((capability.data as {reviewSchemaVersion?:number})?.reviewSchemaVersion!==2)throw Error('Backend đánh giá chưa hỗ trợ chống xung đột. Cần Owner duyệt phiên bản Functions trước khi lưu.');
  await callable({uid,sessionId,result,score,note:note.trim().slice(0,2000),expectedRevision});
}
export function listenRoster(callback:(rows:RosterStudent[])=>void,onError:(msg:string)=>void):Unsubscribe {
  return onSnapshot(query(collection(db,'labRoster'),limit(200)),{includeMetadataChanges:true},snap => {
    if(snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
    callback(snap.docs.map(d=>({...d.data(),id:d.id} as RosterStudent)).sort((a,b)=>a.studentCode.localeCompare(b.studentCode)));
  },err=>onError(fail(err)));
}
export async function saveRosterEntries(entries:Omit<RosterStudent,'id'>[],approvedClasses:string[]=[]):Promise<void> {
  const roster=await getDocs(query(collection(db,'labRoster'),limit(201)));
  if(roster.size>200)throw new Error('Danh sách vượt giới hạn đối soát; cần công cụ nhập server');
  const known=new Set(roster.docs.map(row=>String(row.data().className||'')));
  approvedClasses.forEach(className=>known.add(className));
  const data=validateRosterInput(entries,known);
  const refs=data.map(entry=>doc(db,'labRoster',entry.studentCode.toLowerCase()));
  await runTransaction(db,async tx=>{
    const snapshots=await Promise.all(refs.map(ref=>tx.get(ref)));
    const accounts=await Promise.all(data.map(entry=>entry.uid?tx.get(doc(db,'users',entry.uid)):Promise.resolve(null)));
    data.forEach((entry,i)=>{
      if(snapshots[i].exists()||roster.docs.some(row=>String(row.data().studentCode).toUpperCase()===entry.studentCode))throw new Error(`Mã ${entry.studentCode} đã tồn tại; giữ nguyên hồ sơ cũ`);
      const account=accounts[i];
      if(entry.uid&&(!account?.exists()||account.data()?.studentCode!==entry.studentCode))throw new Error(`UID không khớp mã ${entry.studentCode}; để trống UID nếu chưa liên kết`);
    });
    data.forEach((entry,i)=>tx.set(refs[i],{...entry,createdAt:serverTimestamp()}));
  });
}
export async function listStudentSessions(uid:string):Promise<LabSession[]> {
  const docs=await getDocs(query(collection(db,'users',uid,'labSessions'),limit(200)));
  return docs.docs.map(d=>({...d.data(),id:d.id} as LabSession));
}

/** Lịch sử trao đổi do backend đã xác thực lưu, chỉ owner/giảng viên được phân quyền đọc. */
export interface LabTutorRecord {
  id: string;
  question: string;
  reply: string;
  engine: string;
  experimentId?: string | null;
  practicalId?: string | null;
  sessionId?: string | null;
  createdAt?: {toDate?: () => Date} | null;
}
export async function listStudentTutorChats(uid:string):Promise<LabTutorRecord[]> {
  const snapshot=await getDocs(query(collection(db,'users',uid,'tutorChats'),orderBy('createdAt','desc'),limit(100)));
  return snapshot.docs.map(d=>({...d.data(),id:d.id} as LabTutorRecord));
}

/** Chỉ dành cho admin (Security Rules quyết định quyền thật); không đè dữ liệu đã chỉnh sửa. */
export async function importOfficialCurriculum(): Promise<{created:number; skipped:number;assetsCreated:number;assetsSkipped:number}> {
  const issues = validateCurriculum(OFFICIAL_CURRICULUM);
  if (issues.length) throw new Error(issues.join('; '));
  const refs = OFFICIAL_CURRICULUM.map(e => doc(db,'labExperiments',e.id));
  const assetRefs = EQUIPMENT_CATALOG.map(a => doc(db,'labEquipment',a.id));
  return runTransaction(db,async tx => {
    // Firestore yêu cầu tất cả reads xảy ra trước writes trong transaction.
    const snapshots = await Promise.all(refs.map(ref=>tx.get(ref)));
    const assetSnapshots = await Promise.all(assetRefs.map(ref=>tx.get(ref)));
    let created=0;let skipped=0;let assetsCreated=0;let assetsSkipped=0;
    for (let i=0;i<refs.length;i++) {
      if (snapshots[i].exists()) { skipped++; continue; }
      const {id: _id, ...data} = OFFICIAL_CURRICULUM[i];
      tx.set(refs[i],{...data,updatedAt:Timestamp.now()});
      created++;
    }
    for (let i=0;i<assetRefs.length;i++) {
      if (assetSnapshots[i].exists()) { assetsSkipped++; continue; }
      const {id: _id, ...data} = EQUIPMENT_CATALOG[i];
      tx.set(assetRefs[i], {...data,updatedAt:Timestamp.now()});
      assetsCreated++;
    }
    return {created,skipped,assetsCreated,assetsSkipped};
  });
}
export function listenEquipment(callback:(assets:EquipmentAssetRecord[])=>void,onError:(message:string)=>void):Unsubscribe {
  return onSnapshot(query(collection(db,'labEquipment'),limit(200)),snap =>
    callback(snap.docs.map(row=>({...row.data(),id:row.id} as EquipmentAssetRecord)).sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name))),
    error=>onError(fail(error)));
}

