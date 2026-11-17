import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/services/firebase/config';
import { useAuthStore } from '@/stores';

/**
 * Du lieu nay CHI xac dinh sinh vien dang mo trang web va xem noi dung nao.
 * Khong duoc coi la bang chung da lap mach hoac do dien trong phong Lab 3D.
 */
export type StudentActivity = 'BROWSING' | 'READING' | 'PREPARING' | 'LAB_PENDING';
export interface StudentPresence {
  uid: string;
  studentCode: string;
  mode: StudentActivity;
  online: boolean;
  path: string;
  updatedAt?: { toMillis?: () => number; toDate?: () => Date };
}

/** Cac nhan trang thai tuong ung dung voi route that, khong gan nhan da thuc hanh 3D. */
export function classifyStudentRoute(path: string): StudentActivity {
  if (path.startsWith('/lab/preparation/')) return 'LAB_PENDING';
  if (/^\/experiments\/[^/]+\/practicals\/[^/]+$/.test(path)) return 'PREPARING';
  if (path === '/experiments' || path.startsWith('/experiments/') || path === '/roadmap') return 'READING';
  return 'BROWSING';
}

/**
 * Firestore presence nhe: cap nhat toi da 1 lan/60 giay/nguoi khi tab hien.
 * Mat mang/dong tab dot ngot: Admin tu dong coi la khong online sau 150 giay.
 */
export function useStudentPresence(): void {
  const { pathname } = useLocation();
  const uid = useAuthStore(s => s.user?.uid);
  const studentCode = useAuthStore(s => s.profile?.studentCode);
  const accountType = useAuthStore(s => s.profile?.accountType);
  const enrollmentStatus = useAuthStore(s => s.profile?.enrollmentStatus);
  const isDemo = useAuthStore(s => s.isDemo);

  useEffect(() => {
    if (!uid || !studentCode || accountType !== 'student' || enrollmentStatus === 'withdrawn' || isDemo) return;
    const ref = doc(db, 'labPresence', uid);
    let stopped = false;
    const mode = classifyStudentRoute(pathname);
    const safePath = pathname.slice(0, 120);
    const update = (online: boolean) => {
      if (stopped) return;
      // Khong luu tru diem, mat khau hay noi dung bai lam o day.
      void setDoc(ref, { uid, studentCode, mode, online, path: safePath, updatedAt: serverTimestamp() })
        .catch(error => console.warn('Khong cap nhat duoc trang thai hoc vien:', error));
    };
    const announce = () => update(document.visibilityState === 'visible' && navigator.onLine);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) update(true);
    }, 60_000);
    document.addEventListener('visibilitychange', announce);
    window.addEventListener('online', announce);
    window.addEventListener('offline', announce);
    announce();
    return () => {
      // Khi chuyen route khong gui online=false: route moi se cap nhat ngay.
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', announce);
      window.removeEventListener('online', announce);
      window.removeEventListener('offline', announce);
    };
  }, [uid, studentCode, accountType, enrollmentStatus, isDemo, pathname]);
}

/** Admin chi nhan snapshot cua 46 trang thai, khong poll 46 tai khoan lien tuc. */
export function listenStudentPresence(
  callback: (byUid: Record<string, StudentPresence>) => void,
  onError: (message: string) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'labPresence'),{includeMetadataChanges:true},snapshot => {
    if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
    const records: Record<string, StudentPresence> = {};
    snapshot.docs.forEach(d => { records[d.id] = d.data() as StudentPresence; });
    callback(records);
  }, err => onError(`Khong doc duoc trang thai truy cap: ${err.message}`));
}

export const PRESENCE_TIMEOUT_MS = 150_000;
export function isOnlineNow(presence: StudentPresence | undefined, nowMs: number): boolean {
  const timestamp = presence?.updatedAt?.toMillis?.();
  return Boolean(presence?.online && typeof timestamp === 'number' && timestamp <= nowMs && nowMs - timestamp < PRESENCE_TIMEOUT_MS);
}
export function describePresence(presence: StudentPresence | undefined, nowMs: number): string {
  if (!presence?.updatedAt?.toMillis?.()) return 'Chưa ghi nhận truy cập';
  if (!isOnlineNow(presence, nowMs)) return 'Không trực tuyến';
  switch (presence.mode) {
    case 'PREPARING': return 'Đang chuẩn bị bài';
    case 'LAB_PENDING': return 'Đang xem phòng Lab (chưa có 3D)';
    case 'READING': return 'Đang xem giáo án';
    default: return 'Đang ở website';
  }
}
