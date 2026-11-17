import { getIdTokenResult } from 'firebase/auth';
import { auth } from './config';

/**
 * Kiểm tra quyền để hiển thị giao diện quản trị.
 * Firestore Rules và Cloud Functions quyết định quyền truy cập thực tế.
 */
export async function verifyOwner(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  const token = await getIdTokenResult(user, true);
  return token.claims.admin === true && token.claims.owner === true;
}
