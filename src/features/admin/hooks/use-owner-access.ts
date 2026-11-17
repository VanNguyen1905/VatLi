import { useEffect, useState } from 'react';
import { getIdTokenResult } from 'firebase/auth';
import { useAuthStore } from '@/stores';

/** Chỉ điều khiển hiển thị nút menu; Firestore Rules luôn là lớp phân quyền thật. */
export function useOwnerAccess(): boolean {
  const user = useAuthStore(s => s.user);
  const isDemo = useAuthStore(s => s.isDemo);
  const [access, setAccess] = useState<{user: typeof user; allowed: boolean} | null>(null);
  useEffect(() => {
    let alive = true;
    if (user && !isDemo) {
      void getIdTokenResult(user).then(token => {
        if (alive) setAccess({user,allowed:token.claims.admin === true && token.claims.owner === true});
      }).catch(() => { if (alive) setAccess({user,allowed:false}); });
    }
    return () => { alive = false; };
  }, [user, isDemo]);
  return !isDemo && !!user && access?.user === user && access.allowed;
}
