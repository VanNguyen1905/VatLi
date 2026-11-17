import { create } from 'zustand';
import type { User } from 'firebase/auth';
import type { UserProfile, ThemeMode } from '@/types';
import { safeStorage } from '@/lib/storage';
import {connectAuthStartup} from './auth-startup';
import {
  onAuthChange,
  getUserProfile,
  loginWithUsername,
  registerWithUsername,
  signOut as firebaseSignOut,
  signInWithGoogle,
  type RegisterData,
  startDemoSession,
  isDemoSession,
} from '@/services/firebase';

// ============================================
// AUTH STORE
// ============================================

let validatingSignIn=false;

interface AuthState {
  // State
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  isDemo: boolean;

  // Actions
  initialize: () => () => void;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithDemo: () => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  error: null,
  isDemo: false,

  // Initialize auth listener
  initialize: () => {
    return connectAuthStartup<User,UserProfile>({listen:onAuthChange,readProfile:getUserProfile,isDemo:isDemoSession,publish:state=>{if(validatingSignIn&&state.user)return;set({...state,error:null});}});
  },

  // Login with username and password
  login: async (username, password, rememberMe = true) => {
    validatingSignIn=true;
    set({ isLoading: true, error: null });
    try {
      const signedInUser = await loginWithUsername(username, password, rememberMe);
      const profile = await getUserProfile(signedInUser.uid);
      // Mã lớp phải có một hồ sơ CHÍNH THỨC do Admin SDK cấp sẵn.
      // Không cấp quyền chỉ bằng việc người dùng nhập một mã hợp lệ trên trình duyệt.
      const code = username.trim().toLowerCase();
      const studentLogin = /^76dcvv[0-9]{5}$/.test(code);
      const validStudentProfile =
        profile?.accountType === 'student' &&
        profile.uid === signedInUser.uid &&
        profile.username === code &&
        profile.studentCode?.toLowerCase() === code &&
        Boolean(profile.displayName?.trim());

      if (studentLogin && !validStudentProfile) {
        await firebaseSignOut();
        throw new Error('Mã sinh viên chưa được kích hoạt trong danh sách lớp. Hãy liên hệ giảng viên.');
      }
      if (!profile && code !== 'admin') {
        await firebaseSignOut();
        throw new Error('Tài khoản chưa có hồ sơ trong Firebase. Hãy liên hệ giảng viên.');
      }
      set({ user: signedInUser, profile, isLoading: false, isInitialized: true, isDemo: false });
    } catch (error) {
      const message = getFirebaseErrorMessage(error);
      set({ isLoading: false, error: message });
      throw error;
    } finally {validatingSignIn=false;}
  },

  // Register a new account
  register: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await registerWithUsername(data);
    } catch (error) {
      const message = getFirebaseErrorMessage(error);
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // Đăng nhập Google: chỉ báo thành công khi đã có hồ sơ Firestore.
  // Hồ sơ mới sẽ được tạo an toàn trong signInWithGoogle().
  loginWithGoogle: async () => {
    validatingSignIn=true;
    set({ isLoading: true, error: null });
    try {
      const signedInUser = await signInWithGoogle();
      const profile = await getUserProfile(signedInUser.uid);
      if (!profile) {
        throw new Error('Đăng nhập Google đã xác thực nhưng chưa có hồ sơ người dùng trong Firestore.');
      }
      set({
        user: signedInUser,
        profile,
        isLoading: false,
        isInitialized: true,
        isDemo: false,
        error: null,
      });
    } catch (error) {
      const message = getFirebaseErrorMessage(error);
      set({ isLoading: false, error: message });
      throw error;
    } finally {validatingSignIn=false;}
  },

  // Demo Login (for preview and evaluation without Firebase credentials)
  loginWithDemo: () => {
    set({ isLoading: true, error: null });
    const user = startDemoSession();
    getUserProfile(user.uid).then((profile) => {
      set({
        user,
        profile,
        isDemo: true,
        isLoading: false,
        error: null,
      });
    });
  },

  // Logout
  logout: async () => {
    set({ isLoading: true });
    try {
      await firebaseSignOut();
      set({
        user: null,
        profile: null,
        isDemo: false,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const profile = await getUserProfile(user.uid);
    set({ profile });
  },

  clearError: () => set({ error: null }),
}));

// ============================================
// THEME STORE
// ============================================

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: ThemeMode) => void;
}

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: ThemeMode): 'dark' | 'light' {
  if (theme === 'system') return getSystemTheme();
  return theme;
}

function applyTheme(resolved: 'dark' | 'light') {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(resolved);
}

export const useThemeStore = create<ThemeState>((set) => {
  const saved = (safeStorage.getItem('virtual-lab-theme') as ThemeMode) || 'dark';
  const resolved = resolveTheme(saved);

  if (typeof document !== 'undefined') {
    applyTheme(resolved);
  }

  return {
    theme: saved,
    resolvedTheme: resolved,
    setTheme: (theme) => {
      const resolved = resolveTheme(theme);
      safeStorage.setItem('virtual-lab-theme', theme);
      applyTheme(resolved);
      set({ theme, resolvedTheme: resolved });
    },
  };
});

// ============================================
// USER-FRIENDLY ERROR MESSAGES
// ============================================

function getFirebaseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes('chưa kết nối Firebase') || msg.includes('chưa được liên kết Firebase')) {
      return msg;
    }
    if (msg.includes('Tên đăng nhập đã được sử dụng')) return msg;
    if (msg.includes('Tên đăng nhập phải có ít nhất')) return msg;
    if (msg.includes('Mật khẩu phải có ít nhất')) return msg;

    const code = (error as { code?: string }).code;
    switch (code) {
      case 'auth/email-already-in-use':
        return 'Tên đăng nhập này đã có người sử dụng. Hãy chọn tên khác.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Tên đăng nhập hoặc mật khẩu không chính xác.';
      case 'auth/too-many-requests':
        return 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau vài phút.';
      case 'auth/weak-password':
        return 'Mật khẩu quá ngắn hoặc yếu. Sử dụng tối thiểu 6 ký tự.';
      case 'auth/network-request-failed':
        return 'Lỗi kết nối mạng. Vui lòng kiểm tra lại đường truyền internet.';
      case 'auth/popup-closed-by-user':
        return 'Cửa sổ xác thực đã bị đóng trước khi hoàn tất.';
      case 'auth/popup-blocked':
        return 'Trình duyệt đang chặn cửa sổ Google. Hãy cho phép cửa sổ bật lên cho localhost rồi thử lại.';
      case 'auth/unauthorized-domain':
        return 'Chưa cho phép tên miền đăng nhập. Mở Firebase Authentication > Settings > Authorized domains và thêm localhost.';
      case 'auth/operation-not-allowed':
        return 'Đăng nhập Google chưa được bật. Mở Firebase Authentication > Sign-in method > Google > Enable.';
      case 'permission-denied':
        return 'Firestore từ chối tạo hoặc đọc hồ sơ Google. Hãy kiểm tra Firestore Security Rules của project hiện tại.';
      default:
        return msg || 'Đã xảy ra lỗi trong quá trình xác thực.';
    }
  }
  return 'Lỗi xác thực không xác định.';
}
