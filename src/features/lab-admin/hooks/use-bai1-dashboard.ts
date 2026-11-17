import {useEffect,useMemo,useState} from 'react';
import {BAI1_PARTS,bai1IdentityConflicts,type Bai1Snapshot,type Bai1Student} from '../bai1-dashboard';
import {listenBai1AdminProgress} from '../services/bai1-admin-progress';
export function useBai1Dashboard(students:Bai1Student[]){
 const scope=useMemo(()=>[...new Set(students.filter(s=>s.uid&&s.enrollmentStatus!=='withdrawn').map(s=>s.uid))].sort().join('|'),[students]);
 const [result,setResult]=useState<{scope:string;snapshots:Record<string,Bai1Snapshot>}>({scope:'',snapshots:{}}),[online,setOnline]=useState(()=>navigator.onLine);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 useEffect(()=>{let active=true;const stops=(scope?scope.split('|'):[]).flatMap(uid=>BAI1_PARTS.map(part=>listenBai1AdminProgress(uid,part.id,value=>{if(active)setResult(old=>({scope,snapshots:{...(old.scope===scope?old.snapshots:{}),[uid+':'+part.id]:value}}));})));return()=>{active=false;stops.forEach(stop=>stop());};},[scope]);
 const snapshots={...(result.scope===scope?result.snapshots:{})};for(const uid of bai1IdentityConflicts(students))for(const part of BAI1_PARTS)snapshots[uid+':'+part.id]={status:'error',hasConfirmed:false,rows:[],invalidCount:0,error:'Một UID đang gắn với nhiều hồ sơ roster. Chưa thể quy kết kết quả; cần Owner đối chiếu hồ sơ.'};
 return {snapshots,online};
}
