import {useEffect,useState} from 'react';
import {bai1IdentityConflicts,type Bai1Student} from '../bai1-dashboard';
import {TRANSISTOR_PARTS,type TransistorSnapshot} from '../transistor-dashboard';
import {listenTransistorAdminProgress} from '../services/transistor-admin-progress';
export function useTransistorDashboard(students:Bai1Student[],course:number){
 const [state,setState]=useState<{course:number;snapshots:Record<string,TransistorSnapshot>}>({course,snapshots:{}});
 useEffect(()=>{let active=true;const conflicts=bai1IdentityConflicts(students),stops:(()=>void)[]=[];for(const uid of new Set(students.filter(s=>s.enrollmentStatus!=='withdrawn'&&s.uid&&!conflicts.has(s.uid)).map(s=>s.uid)))for(const p of TRANSISTOR_PARTS.filter(p=>p.course===course))stops.push(listenTransistorAdminProgress(uid,p.id,snapshot=>{if(active)setState(old=>({course,snapshots:{...(old.course===course?old.snapshots:{}),[uid+':'+p.id]:snapshot}}));}));return()=>{active=false;stops.forEach(stop=>stop());};},[students,course]);
 return state.course===course?state.snapshots:{};
}
