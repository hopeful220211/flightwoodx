import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
import { EditorLayout } from './components/layout/EditorLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import RoleRoute from './components/layout/RoleRoute'

import { useAuthStore } from './stores/authStore'
import { LoginModal } from './pages/Auth/components/LoginModal'
import { useQueryClient } from '@tanstack/react-query'
import { AnalyticsRuntime } from './features/analytics/AnalyticsSettings'

/* ── Route-level code splitting ── */
const HomePage = lazy(() => import('./pages/Home/HomePage').then((m) => ({ default: m.HomePage })))
const AboutPage = lazy(() => import('./pages/About/AboutPage').then((m) => ({ default: m.AboutPage })))
const PrivacyPage = lazy(() => import('./pages/Privacy/PrivacyPage').then((m) => ({ default: m.PrivacyPage })))
const AuthPage = lazy(() => import('./pages/Auth/AuthPage').then((m) => ({ default: m.AuthPage })))
const LoginRedirect = lazy(() => import('./pages/Auth/LoginRedirect').then((m) => ({ default: m.LoginRedirect })))
const NotFoundPage = lazy(() => import('./pages/NotFound/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))
const DashboardPage = lazy(() => import('./pages/Dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ProjectsPage = lazy(() => import('./pages/Projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const ProjectDetailPage = lazy(() => import('./pages/Projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })))
const DesignPageRouter = lazy(() => import('./pages/Design/DesignPageRouter').then((m) => ({ default: m.DesignPageRouter })))
const CodingPage = lazy(() => import('./pages/Coding/CodingPage').then((m) => ({ default: m.CodingPage })))
const SimulatorPage = lazy(() => import('./pages/Simulator/SimulatorPage').then((m) => ({ default: m.SimulatorPage })))
const CommunityPage = lazy(() => import('./pages/Community/CommunityPage').then((m) => ({ default: m.CommunityPage })))
const CommunityPostPage = lazy(() => import('./pages/Community/CommunityPostPage').then((m) => ({ default: m.CommunityPostPage })))
const CollectionsPage = lazy(() => import('./pages/Collections/CollectionsPage').then((m) => ({ default: m.CollectionsPage })))
const CollectionDetailPage = lazy(() => import('./pages/Collections/CollectionDetailPage').then((m) => ({ default: m.CollectionDetailPage })))
const CommunityLeaderboardPage = lazy(() => import('./pages/Leaderboard/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })))
const AuthorPage = lazy(() => import('./pages/Author/AuthorPage').then((m) => ({ default: m.AuthorPage })))
const FollowingFeedPage = lazy(() => import('./pages/Feed/FollowingFeedPage').then((m) => ({ default: m.FollowingFeedPage })))
const PartStudioPage = lazy(() => import('./features/partStudio/PartStudioPage').then((m) => ({ default: m.PartStudioPage })))
const FlyPage = lazy(() => import('./pages/Fly/FlyPage').then((m) => ({ default: m.FlyPage })))
const MePage = lazy(() => import('./pages/Me/MePage').then((m) => ({ default: m.MePage })))
const ProfilePage = lazy(() => import('./pages/Profile/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const ExportPreviewPage = lazy(() => import('./pages/ExportPreview/ExportPreviewPage').then((m) => ({ default: m.ExportPreviewPage })))
const ARFlightPage = lazy(() => import('./pages/ARFlight/ARFlightPage').then((m) => ({ default: m.ARFlightPage })))
const AdminLayout = lazy(() => import('./pages/Admin/AdminLayout').then((m) => ({ default: m.AdminLayout })))
const AdminOverviewPage = lazy(() => import('./pages/Admin/pages/OverviewPage').then((m) => ({ default: m.AdminOverviewPage })))
const AdminUsersPage = lazy(() => import('./pages/Admin/pages/UsersPage').then((m) => ({ default: m.AdminUsersPage })))
const AdminCoursesPage = lazy(() => import('./pages/Admin/pages/ModulePlaceholder').then((m) => ({ default: m.AdminCoursesPage })))
const AdminPartsPage = lazy(() => import('./pages/Admin/pages/ModulePlaceholder').then((m) => ({ default: m.AdminPartsPage })))
const AdminAuditPage = lazy(() => import('./pages/Admin/pages/ModulePlaceholder').then((m) => ({ default: m.AdminAuditPage })))

function RouteLoadingFallback() {
  return <div role="status" className="flex min-h-dvh items-center justify-center gap-3 bg-slate-50 text-sm text-sky-800"><span className="h-5 w-5 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" aria-hidden="true" />正在加载页面…</div>
}

export default function App() {
  const queryClient = useQueryClient()
  const restoreSession = useAuthStore((s) => s.restoreSession)

  useEffect(() => { restoreSession() }, [restoreSession])
  useEffect(() => useAuthStore.subscribe((state, previous) => {
    if (state.user?.id !== previous.user?.id) {
      void queryClient.cancelQueries()
      queryClient.clear()
    }
  }), [queryClient])

  return (
    <>
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
      {/* ── Auth ── 登录走弹窗（回首页触发），注册保留全屏页 ── */}
      <Route path="/auth" element={<LoginRedirect />} />
      <Route path="/login" element={<LoginRedirect />} />
      <Route path="/register" element={<AuthPage />} />

      {/* ── Admin (role-gated) ── */}
      <Route element={<RoleRoute roles={['admin']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="courses" element={<AdminCoursesPage />} />
          <Route path="parts" element={<AdminPartsPage />} />
          <Route path="audit" element={<AdminAuditPage />} />
        </Route>
      </Route>

      {/* ── Editor Layout (full-screen, step switcher) ── */}
      <Route element={<ProtectedRoute />}>
      <Route element={<EditorLayout />}>
        <Route path="/design" element={<DesignPageRouter />} />
        <Route path="/design/:id" element={<DesignPageRouter />} />
        <Route path="/code" element={<CodingPage />} />
        <Route path="/code/:id" element={<CodingPage />} />
        <Route path="/simulator" element={<SimulatorPage />} />
        <Route path="/simulator/:id" element={<SimulatorPage />} />
      </Route>
      </Route>

      {/* ── Main App (Navbar layout) ── */}
      <Route element={<AppLayout />}>
        {/* Public */}
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<PrivacyPage documentSlug="terms" />} />
        <Route path="/privacy/:document" element={<PrivacyPage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="/community/leaderboard" element={<CommunityLeaderboardPage />} />
        <Route path="/community/:postId" element={<CommunityPostPage />} />
        <Route path="/u/:userId" element={<AuthorPage />} />
        <Route path="/collections/:id" element={<CollectionDetailPage />} />
        <Route path="/part-studio" element={<PartStudioPage />} />

        {/* Protected (guests allowed) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/feed" element={<FollowingFeedPage />} />
          <Route path="/fly/:id" element={<FlyPage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/design/export-preview/:designId" element={<ExportPreviewPage />} />
          <Route path="/design/review/:designId" element={<ExportPreviewPage />} />
          <Route path="/design/ar-flight/:designId" element={<ARFlightPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      </Routes>
    </Suspense>
    <LoginModal />
    <AnalyticsRuntime />
    </>
  )
}
