import { useState } from 'react';
import { NavLink,Link,useLocation,useNavigate } from 'react-router-dom';
import { FlaskConical, LayoutDashboard, ClipboardList, ChartNoAxesCombined, ShieldCheck, ChevronLeft,ChevronRight, LogOut,Settings, Landmark, Cpu } from 'lucide-react';
import { useOwnerAccess } from '@/features/admin/hooks/use-owner-access';
import { useAuthStore } from '@/stores';
import { cn } from '@/lib/utils';

const items=[
  {title:'Tổng quan',href:'/',icon:LayoutDashboard},
  {title:'Thí nghiệm & Lộ trình',href:'/experiments',icon:FlaskConical},
  {title:'Thực hành của tôi',href:'/my-practices',icon:ClipboardList},
  {title:'Kết quả & Báo cáo',href:'/lab-reports',icon:ChartNoAxesCombined},
];
export function Sidebar({drawer=false,onNavigate}:{drawer?:boolean;onNavigate?:()=>void}){const [collapsed,setCollapsed]=useState(false);const {profile,user,logout}=useAuthStore();const navigate=useNavigate();const owner=useOwnerAccess();
  const location=useLocation();
  return <aside data-collapsed={collapsed&&!drawer} onClick={event=>{if((event.target as Element).closest('a'))onNavigate?.();}} className={cn(drawer?'premium-mobile-sidebar flex flex-col h-full':'vt-sidebar hidden lg:flex flex-col shrink-0 h-screen border-r border-border/70 bg-surface transition-all',!drawer&&(collapsed?'w-[76px]':'w-[260px]'))}>
    <div className="flex h-16 items-center justify-between gap-2 border-b border-white/15 bg-[#091d3a] px-3 text-white"><NavLink to="/" className="flex items-center gap-2 min-w-0"><img src="/utt-v5/utt-icon.webp" alt="Biểu tượng bộ môn" className="h-9 w-9 shrink-0 object-contain"/>{!collapsed&&<div className="min-w-0"><h1 className="font-bold text-sm truncate">LAB THỰC HÀNH</h1><p className="text-[9px] text-sky-100">BỘ MÔN VẬT LÝ CÔNG NGHỆ</p></div>}</NavLink><button hidden={drawer} aria-label="Thu gọn menu" onClick={()=>setCollapsed(v=>!v)}>{collapsed?<ChevronRight className="h-4 w-4"/>:<ChevronLeft className="h-4 w-4"/>}</button></div>
    <nav className="flex-1 space-y-1 p-3 overflow-y-auto">{items.map(item=>{const Icon=item.icon;return <NavLink key={item.href} end={item.href==='/'} to={item.href} title={item.title} className={({isActive})=>cn('flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',isActive?'bg-primary/15 text-primary':'text-muted-foreground hover:bg-surface-elevated hover:text-foreground')}><Icon className="h-5 w-5 shrink-0"/>{!collapsed&&<span>{item.title}</span>}</NavLink>})}
      {owner&&!collapsed&&<div className="mt-4 border-t border-border pt-4"><p className="px-3 text-[10px] tracking-widest text-cyan-400 mb-2">QUẢN TRỊ PHÒNG THÍ NGHIỆM</p>{([['overview','Tổng quan Admin'],['students','Danh sách lớp'],['monitor','Giám sát sinh viên'],['practice','Tiến độ đo Bài 1'],['reports','Kết quả & Báo cáo']] as const).map(([tab,label])=><Link key={tab} to={`/admin/lab?tab=${tab}`} className={cn('block rounded-xl px-3 py-3 text-xs border',location.pathname==='/admin/lab'&&(new URLSearchParams(location.search).get('tab')||'overview')===tab?'border-cyan-500 bg-cyan-500/15 text-cyan-100':'border-transparent text-muted-foreground hover:bg-surface-elevated')}>{label}</Link>)}</div>}
      <div data-utt-native-menu="true" className="mt-3 space-y-1 border-t border-border/70 pt-3">
        {!collapsed&&<p className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Thông tin UTT</p>}
        <a href="/utt-info/bo-mon.html" title="Lịch sử và thông tin bộ môn" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"><Landmark className="h-5 w-5 shrink-0 text-violet-400"/>{!collapsed&&<span>Thông tin bộ môn</span>}</a>
        <a href="/utt-info/nganh-vi-dien-tu.html" title="Kỹ thuật vi điện tử và Vật lý bán dẫn" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"><Cpu className="h-5 w-5 shrink-0 text-violet-400"/>{!collapsed&&<span>Thông tin ngành</span>}</a>
      </div></nav>
    <div className="space-y-1 border-t border-border p-3">{owner&&<NavLink to="/admin/lab" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-primary hover:bg-surface-elevated" title="Quản trị phòng Lab"><ShieldCheck className="h-5 w-5"/>{!collapsed&&'Quản trị phòng Lab'}</NavLink>}<NavLink to="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm" title="Cài đặt"><Settings className="h-5 w-5"/>{!collapsed&&'Cài đặt'}</NavLink><button onClick={()=>void logout().then(()=>navigate('/login'))} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground" title="Đăng xuất"><LogOut className="h-5 w-5"/>{!collapsed&&'Đăng xuất'}</button><p className="text-[10px] text-muted-foreground truncate px-3">{profile?.displayName||user?.displayName||'Sinh viên'}</p></div>
  </aside>;
}
