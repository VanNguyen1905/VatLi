import { useState,type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore,useThemeStore } from '@/stores';
import { updateUserProfile, changePassword } from '@/services/firebase/auth-service';
import { Moon,Sun,UserRound,ShieldCheck } from 'lucide-react';
const field='w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground';
export function LabSettingsPage(){
  const {user,profile,refreshProfile,isDemo}=useAuthStore();
  const {theme,setTheme}=useThemeStore();
  const [name,setName]=useState(profile?.displayName||'');
  const [busy,setBusy]=useState(false);
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [passwordBusy,setPasswordBusy]=useState(false);
  const [themeBusy,setThemeBusy]=useState(false);
  async function saveTheme(){
    const next=theme==='dark'?'light':'dark';
    if(isDemo){setTheme(next);return;}
    if(!user)return;
    setThemeBusy(true);
    try{await updateUserProfile(user.uid,{theme:next});await refreshProfile();setTheme(next);toast.success('Đã lưu tùy chọn giao diện Firebase');}
    catch{toast.error('Chưa lưu được tùy chọn giao diện. Hãy kiểm tra kết nối.');}
    finally{setThemeBusy(false);}
  }
  async function save(e:FormEvent){e.preventDefault();if(!user||isDemo||profile?.studentCode)return;setBusy(true);try{
    await updateUserProfile(user.uid,{displayName:name.trim()});
    await refreshProfile();toast.success('Đã cập nhật tên hiển thị');
  }catch(err){toast.error(err instanceof Error?err.message:'Không lưu được')}finally{setBusy(false)}}
  async function savePassword(e:FormEvent){e.preventDefault();if(!user||isDemo)return;if(newPassword.length<10){toast.error('Mật khẩu mới phải có ít nhất 10 ký tự');return;}if(/^\d+$/.test(newPassword)){toast.error('Mật khẩu mới không được chỉ gồm chữ số');return;}if(newPassword!==confirmPassword){toast.error('Hai mật khẩu không giống nhau');return;}setPasswordBusy(true);try{await changePassword(newPassword);setNewPassword('');setConfirmPassword('');toast.success('Đổi mật khẩu thành công')}catch(err){toast.error(err instanceof Error?err.message:'Không đổi được mật khẩu. Có thể cần đăng nhập lại trước khi đổi.')}finally{setPasswordBusy(false)}}
  return <div className="max-w-2xl space-y-5"><h1 className="text-3xl font-bold">Hồ sơ phòng thí nghiệm</h1><div className="rounded-2xl border border-border bg-card p-5 space-y-4"><h2 className="flex items-center gap-2 font-semibold"><UserRound className="h-5 w-5 text-primary"/> Thông tin học viên</h2><p className="text-sm text-muted-foreground">UID tài khoản: {user?.uid||'Chưa đăng nhập'}</p><form onSubmit={e=>void save(e)} className="space-y-3"><label className="block text-sm">Họ và tên hiển thị<input className={field} value={profile?.studentCode?profile.displayName:name} disabled={!!profile?.studentCode} maxLength={100} onChange={e=>setName(e.target.value)}/></label><button disabled={busy||isDemo||!!profile?.studentCode||!name.trim()} className="rounded-xl bg-primary px-4 py-2 text-primary-foreground text-sm font-semibold disabled:opacity-50">Lưu hồ sơ</button></form>{profile?.studentCode&&<p className="text-xs text-primary">Mã sinh viên: {profile.studentCode} · Họ tên do giảng viên xác nhận, sinh viên không thể tự sửa.</p>}<p className="text-xs text-muted-foreground">Mã sinh viên và lớp được admin quản lý trong danh sách lớp, không tự cấp quyền hoặc tự sửa điểm.</p></div><div className="rounded-2xl border border-amber-500/30 bg-card p-5 space-y-3"><h2 className="font-semibold">Đổi mật khẩu tài khoản</h2><p className="text-xs text-amber-500">Nếu bạn đang dùng mật khẩu chung tạm thời của lớp, hãy đổi ngay. Không chia sẻ mật khẩu mới với bạn khác.</p><form onSubmit={e=>void savePassword(e)} className="space-y-3"><label className="block text-sm">Mật khẩu mới (ít nhất 10 ký tự)<input className={field} type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required /></label><label className="block text-sm">Nhập lại mật khẩu mới<input className={field} type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required /></label><button className="rounded-xl bg-primary px-4 py-2 text-primary-foreground text-sm font-semibold disabled:opacity-50" disabled={passwordBusy||isDemo}>Đổi mật khẩu</button></form></div><div className="rounded-2xl border border-border bg-card p-5 space-y-3"><h2 className="font-semibold">Giao diện</h2><button disabled={themeBusy} onClick={()=>void saveTheme()} className="inline-flex gap-2 items-center rounded-xl border border-border px-4 py-2 text-sm">{theme==='dark'?<Sun className="h-4 w-4"/>:<Moon className="h-4 w-4"/>} {theme==='dark'?'Dùng nền sáng':'Dùng nền tối'}</button></div><div className="rounded-2xl border border-border bg-card p-5 space-y-2"><h2 className="flex gap-2 items-center font-semibold"><ShieldCheck className="h-5 w-5 text-primary"/> Nguyên tắc dữ liệu</h2><p className="text-sm text-muted-foreground">Mọi kết quả phòng Lab phải được xác minh. Không có phép đo hay mô phỏng 3D thì trạng thái giữ ở Chưa thực hiện/Chưa xác minh.</p><Link className="text-primary text-sm underline" to="/lab-reports">Xem kết quả của tôi</Link></div></div>
}
