import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { LayoutDashboard, Users, BookOpen, Boxes, ScrollText, Shield, LogOut } from 'lucide-react'
import { AdminGate } from './AdminGate'

// 导航项（forward-looking：等 /me 返回用户权限码后，可按 `code` 过滤显隐——
// 注意前端隐藏仅为体验，权限真源在后端中间件）。
const NAV = [
  { to: '/admin', label: '概览', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: '用户', icon: Users, end: false },
  { to: '/admin/courses', label: '课程', icon: BookOpen, end: false },
  { to: '/admin/parts', label: '零件', icon: Boxes, end: false },
  { to: '/admin/audit', label: '审计', icon: ScrollText, end: false },
]

export function AdminLayout() {
  const [verified, setVerified] = useState(() => !!sessionStorage.getItem('adminAccessKey'))

  if (!verified) {
    return <AdminGate onVerified={() => setVerified(true)} />
  }

  const exit = () => {
    sessionStorage.removeItem('adminAccessKey')
    setVerified(false)
  }

  const linkCls = (isActive: boolean) =>
    `flex items-center gap-3 rounded-pill px-4 py-2.5 text-sm font-medium transition ${
      isActive ? 'bg-sky-100 text-sky-700' : 'text-sky-700/70 hover:bg-sky-50 hover:text-sky-700'
    }`

  return (
    <div className="admin-shell flex min-h-screen bg-surface-white">
      {/* 侧栏（桌面） */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sky-100 bg-white md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sky-100 px-6">
          <Shield size={20} className="text-sky-600" />
          <span className="text-title-sm font-semibold text-sky-900">管理后台</span>
        </div>
        <nav className="flex-1 space-y-1.5 p-4">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => linkCls(isActive)}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={exit}
          className="m-4 flex items-center gap-2 rounded-pill px-4 py-2.5 text-sm text-sky-700/70 transition hover:bg-sky-50 hover:text-sky-700"
        >
          <LogOut size={16} />
          退出后台
        </button>
      </aside>

      {/* 内容区 */}
      <main className="min-w-0 flex-1">
        {/* 移动端顶部导航 */}
        <nav aria-label="后台移动导航" className="flex items-center gap-1.5 overflow-x-auto border-b border-sky-100 bg-white px-4 py-2.5 md:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-pill px-4 py-1.5 text-sm ${
                  isActive ? 'bg-sky-100 font-semibold text-sky-700' : 'text-sky-700/70'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <button type="button" onClick={exit} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-4 py-1.5 text-sm text-sky-700"><LogOut size={14} />退出后台</button>
        </nav>
        <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
