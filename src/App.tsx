import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { useAuthStore } from './stores';

/** Xác thực được khởi tạo đúng một lần; dữ liệu phòng lab lấy theo từng trang. */
export function App() {
  const initialize = useAuthStore(s=>s.initialize);
  useEffect(()=>initialize(),[initialize]);
  return <RouterProvider router={router}/>;
}
export default App;
