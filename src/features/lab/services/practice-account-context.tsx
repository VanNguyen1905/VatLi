import {useEffect,useState,type ReactNode} from 'react';
import {useAuthStore} from '@/stores';
import {connectLessonSteps,practiceStepDefinition} from './lesson-progress';
import {listenPracticeCases,readLocalPractice,storeLocalPractice,progressSyncEnabled} from './practice-progress';
import {PracticeContext,emptyPractice as empty,type AccountPractice} from './practice-account-state';
export function PracticeAccountProvider({children}:{children:ReactNode}){
 const uid=useAuthStore(state=>state.user?.uid||''),demo=useAuthStore(state=>state.isDemo);
 const [state,setState]=useState<AccountPractice>(empty);
 useEffect(()=>{
  if(!uid||demo)return;
  let active=true,steps:ReturnType<typeof connectLessonSteps>|undefined;
  async function local(){try{const data=await readLocalPractice(uid);if(active)setState(old=>({...((old.uid===uid)?old:{...empty,uid}),records:data.records,localWarning:data.localWarning??''}));}catch{if(active)setState(old=>({...old,uid,error:'Không đọc được bản dự phòng trên thiết bị.'}));}}
  const stop=listenPracticeCases(uid,summary=>{void storeLocalPractice(uid,summary.records??[],{},true).then(data=>{if(active)setState(old=>({...((old.uid===uid)?old:{...empty,uid}),ready:true,cloud:summary,records:data.records,error:'',localWarning:data.localWarning??''}));}).catch(()=>{if(active)setState(old=>({...old,uid,error:'Không khôi phục được kết quả tài khoản.'}));});},error=>{if(active)setState(old=>({...old,uid,error}));});
  void local();
  void practiceStepDefinition().then(definition=>{if(active)steps=connectLessonSteps(uid,definition,value=>{if(active)setState(old=>({...((old.uid===uid)?old:{...empty,uid}),steps:value}));});}).catch(()=>{if(active)setState(old=>({...old,uid,error:'Không tải được các bước thực hành.'}));});
  const updated=(event:Event)=>{if((event as CustomEvent<{uid:string}>).detail?.uid===uid)void local();};
  window.addEventListener('labvirt:practice-updated',updated);
  return()=>{active=false;stop();steps?.stop();window.removeEventListener('labvirt:practice-updated',updated);};
 },[uid,demo]);
 const current=state.uid===uid?state:{...empty,uid};
 return <PracticeContext.Provider value={{...current,ready:current.ready||!progressSyncEnabled||demo}}>{children}</PracticeContext.Provider>;
}
