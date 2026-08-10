import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/ProtectedRoute'
import BrandingProvider from './features/branding/BrandingProvider'
import { basePath } from './lib/paths'

import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import AdminDashboard from './pages/admin/AdminDashboard'
import DeputyAdminDashboard from './pages/DeputyAdministrator/DeputyAdminDashboard'
import BursarDashboard from './pages/Bursar/BursarDashboard'
import RegistrarDashboard from './pages/Registrar/RegistrarDashboard'
import HODDashboard from './pages/HOD/HODDashboard'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import ClassTeacherDashboard from './pages/ClassTeacher/ClassTeacherDashboard'
import StudentPortal from './pages/student/StudentPortal'
import ParentPortal from './pages/parent/ParentPortal'
import SuperadminDashboard from './pages/superadmin/SuperadminDashboard'
import LibrarianDashboard from './pages/library/LibrarianDashboard'

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    init()
  }, [])

  return (
    <BrowserRouter basename={basePath()}>
      <BrandingProvider>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected routes — each locked to specific role(s) */}
        <Route path="/superadmin" element={
          <ProtectedRoute allowedRoles={['superadmin']}>
            <SuperadminDashboard />
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        <Route path="/deputy-admin" element={
          <ProtectedRoute allowedRoles={['deputy_administrator']}>
            <DeputyAdminDashboard />
          </ProtectedRoute>
        } />
        <Route path="/bursar" element={
          <ProtectedRoute allowedRoles={['bursar']}>
            <BursarDashboard />
          </ProtectedRoute>
        } />
        <Route path="/registrar" element={
          <ProtectedRoute allowedRoles={['registrar']}>
            <RegistrarDashboard />
          </ProtectedRoute>
        } />
        <Route path="/hod" element={
          <ProtectedRoute allowedRoles={['hod']}>
            <HODDashboard />
          </ProtectedRoute>
        } />
        <Route path="/teacher" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <TeacherDashboard />
          </ProtectedRoute>
        } />
        <Route path="/class-teacher" element={
          <ProtectedRoute allowedRoles={['class_teacher']}>
            <ClassTeacherDashboard />
          </ProtectedRoute>
        } />
        <Route path="/parent" element={
          <ProtectedRoute allowedRoles={['parent']}>
            <ParentPortal />
          </ProtectedRoute>
        } />
        <Route path="/student" element={
          <ProtectedRoute allowedRoles={['student']}>
            <StudentPortal />
          </ProtectedRoute>
        } />
        <Route path="/library" element={
          <ProtectedRoute allowedRoles={['librarian']}>
            <LibrarianDashboard />
          </ProtectedRoute>
        } />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </BrandingProvider>
    </BrowserRouter>
  )
}