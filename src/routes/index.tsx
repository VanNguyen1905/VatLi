import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { AuthLayout } from '@/components/layout/auth-layout';
import { ProtectedRoute } from '@/components/layout/protected-route';

import { LoginPage } from '@/features/auth/components/login-page';
import { RegisterPage } from '@/features/auth/components/register-page';

import { NotFoundPage } from './not-found-page';
import { LabvirtAcademyPage } from '@/features/labvirt-portal/labvirt-academy-page';


import { LabOverviewPage, LabRoomPendingPage } from '@/features/lab/components/lab-pages';
import { LabAdminPage } from '@/features/lab-admin/components/lab-admin-page';
import { LabSettingsPage } from '@/features/lab/components/lab-settings-page';

export const router = createBrowserRouter([
  // Mot man hinh dang nhap chung; Admin vao trang hoc truoc.
  { path: '/admin/login', element: <Navigate to="/login" replace /> },
  { path: '/admin', element: <Navigate to="/admin/lab" replace /> },
  { element: <AuthLayout />, children: [
    { path: '/login', element: <LoginPage /> },
    { path: '/register', element: <RegisterPage /> },
  ] },
  { element: <ProtectedRoute />, children: [{element: <AppLayout />, children: [
    { path: '/', element: <LabOverviewPage /> },
    { path: '/experiments', element: <LabvirtAcademyPage view="catalog" /> },
    { path: '/experiments/:experimentId', element: <Navigate to="/experiments" replace /> },
    { path: '/experiments/:experimentId/practicals/:practicalId', element: <Navigate to="/experiments" replace /> },
    { path: '/lab/preparation/:sessionId', element: <LabRoomPendingPage /> },
    { path: '/my-practices', element: <LabvirtAcademyPage view="mine" /> },
    { path: '/lab-reports', element: <LabvirtAcademyPage view="report" /> },
    { path: '/roadmap', element: <Navigate to="/experiments" replace /> },
    { path: '/module-1', element: <Navigate to="/experiments" replace /> },
    { path: '/settings', element: <LabSettingsPage /> },
    // Admin dung cung layout voi hoc vien, co nut quay ve trang hoc.
    // LabAdminPage va Firestore Rules xac minh custom claims admin + owner.
    { path: '/admin/lab', element: <LabAdminPage /> },
  ] }] },
  { path: '*', element: <NotFoundPage /> },
]);
