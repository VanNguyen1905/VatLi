import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import app from './config';

/** Chỉ kết nối Functions Emulator một lần, cả admin và trang sinh viên dùng chung. */
export const labFunctions = getFunctions(app, 'asia-southeast1');
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectFunctionsEmulator(labFunctions, '127.0.0.1', 5001);
}
