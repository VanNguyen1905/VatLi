import {useEffect,useState} from 'react';
import {collection,limit,onSnapshot,query,where} from 'firebase/firestore';
import {db} from '@/services/firebase/config';
/** Class/name references come from the same roster edited by Owner, never a copied class table. */
export function useRosterIdentity(uid:string){
  const [state,setState]=useState<{uid:string;identity?:{fullName:string;studentCode:string;className:string};error?:string}>();
  useEffect(()=>{
    if(!uid||uid==='guest')return;
    return onSnapshot(query(collection(db,'labRoster'),where('uid','==',uid),limit(2)),snapshot=>{
      if(snapshot.size>1){setState({uid,error:'UID được liên kết với nhiều hồ sơ; cần Admin đối soát.'});return;}
      const data=snapshot.docs[0]?.data();
      setState({uid,identity:data?{fullName:String(data.fullName||''),studentCode:String(data.studentCode||''),className:String(data.className||'')}:undefined});
    },()=>setState({uid,error:'Chưa xác minh được hồ sơ lớp từ Firebase.'}));
  },[uid]);
  return state?.uid===uid?state:undefined;
}
