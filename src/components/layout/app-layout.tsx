import { Outlet, useLocation } from 'react-router-dom';
import {useEffect,useState} from 'react';
import {useAuthStore,useThemeStore} from '@/stores';
import { Sidebar } from './sidebar';
import { BottomNav } from './bottom-nav';
import { Toaster } from '@/components/ui/sonner';
import { BiscotRoomGateway } from '@/features/ai-tutor/live/biscot-room-gateway';
import { LabTutorChat } from '@/features/ai-tutor/components/lab-tutor-chat';
import { useStudentPresence } from '@/features/lab/services/student-presence';
import {WorkspaceHeader} from './workspace-header';
import {GestureDrawer} from './gesture-drawer';
import {PracticeAccountProvider} from '@/features/lab/services/practice-account-context';
import {PracticeInfoPanel} from '@/features/lab/components/premium-overview';
import {CanvasLiveStudentBridge} from '@/features/lab-live/student-bridge';
import './premium-workspace.css';

export function AppLayout(){return <PracticeAccountProvider><Workspace/></PracticeAccountProvider>;}
function Workspace() {
  const theme=useAuthStore(state=>state.profile?.theme),setTheme=useThemeStore(state=>state.setTheme);
  useEffect(()=>{if(theme)setTheme(theme);},[theme,setTheme]);
  useStudentPresence();
  const { pathname } = useLocation();
  const isStudio = ['/roadmap', '/experiments', '/my-practices', '/lab-reports'].includes(pathname);
  const uid=useAuthStore(state=>state.user?.uid);
  const [drawer,setDrawer]=useState<'menu'|'info'|null>(null),[lab,setLab]=useState<{uid:string|undefined;active:boolean}>();
  const roomActive=lab?.uid===uid&&lab?.active===true&&isStudio;
  useEffect(()=>{
    const message=(event:MessageEvent)=>{const frame=document.querySelector<HTMLIFrameElement>('.labvirt-portal-frame');if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;if(event.data?.type==='labvirt:lab-entering')setLab({uid,active:true});if(['labvirt:lab-exited','labvirt:studio-ready'].includes(event.data?.type))setLab({uid,active:false});};
    window.addEventListener('message',message);return()=>window.removeEventListener('message',message);
  },[uid]);
  useEffect(()=>{const media=matchMedia('(min-width:1200px)'),close=()=>{if(media.matches)setDrawer(value=>value==='menu'?null:value);};media.addEventListener('change',close);return()=>media.removeEventListener('change',close);},[]);
  return (
    <div className="vt-app-shell premium-shell" data-labvirt-premium="workspace">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="premium-workspace"><WorkspaceHeader openMenu={()=>setDrawer('menu')} openInfo={()=>setDrawer('info')}/>
      <main className="vt-app-main premium-main">
        <div className={`premium-page-content ${isStudio?'is-studio':''}`}>
          <Outlet />
        </div>
      </main></div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
      <GestureDrawer open={drawer==='menu'} onOpenChange={open=>setDrawer(current=>open?'menu':current==='menu'?null:current)} side="left" title="Điều hướng phòng Lab" disabled={roomActive}><Sidebar drawer onNavigate={()=>setDrawer(null)}/></GestureDrawer>
      <GestureDrawer open={drawer==='info'} onOpenChange={open=>setDrawer(current=>open?'info':current==='info'?null:current)} side="right" title="Thông tin & tiến độ" edge disabled={roomActive}><PracticeInfoPanel/></GestureDrawer>


      {!isStudio && <LabTutorChat />}

      {/* Toast Notification Container */}
      <BiscotRoomGateway />
      <CanvasLiveStudentBridge />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
