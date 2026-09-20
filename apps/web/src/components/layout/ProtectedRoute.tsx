import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const openLoginModal = useUIStore((s) => s.openLoginModal)
  const { pathname, search, hash } = useLocation()

  // 未登录：回首页并弹出登录弹窗，而不是甩到已弃用的全屏登录页
  useEffect(() => {
    if (!isAuthenticated) openLoginModal(pathname + search + hash)
  }, [isAuthenticated, openLoginModal, pathname, search, hash])

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
