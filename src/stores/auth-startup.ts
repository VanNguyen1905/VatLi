/** Firebase Auth establishes identity. Fetching the optional profile must not
 * block the router, and an old profile must never follow an account switch. */
export function connectAuthStartup<U extends {uid:string}, P>({listen,readProfile,isDemo,publish}:{
  listen:(callback:(user:U|null)=>void)=>()=>void;
  readProfile:(uid:string)=>Promise<P|null>;
  isDemo:()=>boolean;
  publish:(state:{user:U|null;profile:P|null;isDemo:boolean;isLoading:false;isInitialized:true})=>void;
}){
  let active=true,generation=0;
  const unsubscribe=listen(user=>{
    if(!active)return;
    const current=++generation,demo=!!user&&isDemo();
    publish({user,profile:null,isDemo:demo,isLoading:false,isInitialized:true});
    if(!user)return;
    void readProfile(user.uid).then(profile=>{
      if(active&&generation===current)publish({user,profile,isDemo:demo,isLoading:false,isInitialized:true});
    }).catch(()=>{/* Identity remains authenticated; server rules still enforce access. */});
  });
  return()=>{active=false;generation++;unsubscribe();};
}
