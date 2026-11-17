import type { Timestamp } from 'firebase/firestore';

export type ThemeMode = 'dark' | 'light' | 'system';

/** Hồ sơ dùng chung cho xác thực, giao diện và quản lý học viên. */
export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  studentCode?: string;
  className?: string;
  accountType?: 'student' | 'personal';
  enrollmentStatus?: 'active' | 'withdrawn';
  avatarUrl?: string;
  timezone: string;
  locale: string;
  theme: ThemeMode;
  linkedProviders: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  schemaVersion: number;
}
