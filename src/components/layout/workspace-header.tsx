import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {Menu,ChevronDown,FlaskConical,House,ClipboardList,ChartNoAxesCombined,Settings,LogOut,PanelRight} from 'lucide-react';
import {useAuthStore} from '@/stores';
import {useOwnerAccess} from '@/features/admin/hooks/use-owner-access';
import {useRosterIdentity} from '@/features/lab/services/use-roster-identity';
const screens:Record<string,[string,typeof House]>={'/':['Tổng quan',House],'/experiments':['Thí nghiệm & Lộ trình',FlaskConical],'/my-practices':['Thực hành của tôi',ClipboardList],'/lab-reports':['Kết quả & Báo cáo',ChartNoAxesCombined],'/roadmap':['Thí nghiệm & Lộ trình',FlaskConical],'/settings':['Cài đặt',Settings]};
export function WorkspaceHeader({openMenu,openInfo}:{openMenu:()=>void;openInfo:()=>void}){
 const {pathname,search}=useLocation(),navigate=useNavigate(),owner=useOwnerAccess();
 const {user,profile,logout}=useAuthStore(),identity=useRosterIdentity(user?.uid||'guest');
 const [menu,setMenu]=useState(false),root=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
 const touch=useRef<{id:number;x:number;y:number}|null>(null);
 // Opening is idempotent. Accept a stationary primary touch release even when a
 // preceding swipe suppresses the browser's compatibility click.
 const touchDown=(event:ReactPointerEvent<HTMLButtonElement>)=>{touch.current=event.pointerType==='touch'?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;};
 const touchUp=(event:ReactPointerEvent<HTMLButtonElement>,activate:()=>void)=>{const start=touch.current;touch.current=null;if(start&&start.id===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<8)activate();};
 const adminTitles:Record<string,string>={overview:'Tổng quan Admin',students:'Danh sách lớp',monitor:'Giám sát sinh viên',practice:'Tiến độ đo Bài 1',reports:'Kết quả & Báo cáo Admin',experiments:'Chương trình thí nghiệm',equipment:'Danh mục thiết bị',tutor:'Lịch sử trợ giảng'};
 const [title,Icon]=pathname==='/admin/lab'?[adminTitles[new URLSearchParams(search).get('tab')||'overview']||'Quản trị phòng Lab',FlaskConical]:screens[pathname]??['Phòng thực hành',FlaskConical];
 const name=identity?.identity?.fullName||profile?.displayName||user?.displayName||'Tài khoản';
 const code=identity?.identity?.studentCode||profile?.studentCode;
 const initials=name.trim().split(/\s+/).slice(-2).map(part=>part[0]).join('').toLocaleUpperCase('vi');
 useEffect(()=>{if(!menu)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setMenu(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[menu]);
 return <header className="premium-workspace-header"><button className="premium-menu-trigger" aria-label="Mở menu điều hướng" onPointerDown={touchDown} onPointerCancel={()=>{touch.current=null;}} onPointerUp={event=>touchUp(event,openMenu)} onClick={openMenu}><Menu/></button><div className="premium-header-title"><Icon aria-hidden="true"/><div><small>VIRTUAL LAB ACADEMY · LABVIRT STUDIO</small><strong>{title}</strong></div></div>
  <div className="premium-account-actions"><button className="premium-info-trigger" aria-label="Mở thông tin và tiến độ" onPointerDown={touchDown} onPointerCancel={()=>{touch.current=null;}} onPointerUp={event=>touchUp(event,openInfo)} onClick={openInfo}><PanelRight/></button><div ref={root} className="premium-account" onKeyDown={event=>{if(event.key==='Escape'){setMenu(false);button.current?.focus();}}}><button ref={button} className="premium-account-trigger" aria-expanded={menu} aria-haspopup="menu" onClick={()=>setMenu(value=>!value)}><span className="premium-avatar" aria-hidden="true">{initials}</span><span><strong>{name}</strong><small>{code?`MSSV: ${code}`:owner?'Owner · Quản trị phòng Lab':'Tài khoản LABVIRT'}</small></span><ChevronDown size={17}/></button>{menu&&<div className="premium-account-menu" role="menu"><p>{owner?'Owner / giảng viên được cấp quyền':'Sinh viên'}</p><Link role="menuitem" to="/settings" onClick={()=>setMenu(false)}><Settings size={16}/> Cài đặt tài khoản</Link><button role="menuitem" onClick={()=>void logout().then(()=>navigate('/login'))}><LogOut size={16}/> Đăng xuất</button></div>}</div></div>
 </header>;
}
