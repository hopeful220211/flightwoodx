import { NavLink, useLocation } from 'react-router'
import { Menu, X, User, LogOut, LayoutDashboard, Users2, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'

/* ── 公共导航（未登录也可见） ── */
const publicItems = [
  { to: '/', label: '首页', exact: true },
  { to: '/community', label: '社区' },
] as const

/* ── 登录后主导航 ── */
const authedItems = [
  { to: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { to: '/community', label: '社区', icon: Users2 },
] as const

export function Navbar() {
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const [scrolledOnHome, setScrolledOnHome] = useState(false)

  const { isAuthenticated, user, logout } = useAuthStore()
  const openLoginModal = useUIStore((s) => s.openLoginModal)
  const isHomePage = pathname === '/'
  const isGuest = user?.isGuest === true

  // 非首页：导航栏始终为实底；首页：滚动超过 60px 后切换为毛玻璃。
  // scrolled 由渲染推导，避免在 effect 内同步 setState。
  const scrolled = !isHomePage || scrolledOnHome

  // Glass-effect on scroll (homepage starts transparent)
  useEffect(() => {
    if (!isHomePage) return
    const onScroll = () => setScrolledOnHome(window.scrollY > 60)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isHomePage])

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  const handleLogout = () => { logout(); setUserMenuOpen(false); setMobileOpen(false) }


  const navItems = isAuthenticated ? authedItems : publicItems

  return (
    <>
      <header
        data-scrolled={scrolled}
        className={`site-nav fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-sky-100/60 bg-white/85 backdrop-blur-xl shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="site-nav-inner flex items-center justify-between">
          {/* ── Logo ── */}
          <NavLink
            to="/"
            className="site-nav-brand"
            onClick={() => setMobileOpen(false)}
          >
            <span className="inline-flex h-9 w-9 items-center justify-center">
              <img src="/web_logo.png" alt="FlightWoodX" className="h-full w-full object-contain" />
            </span>
            <span className="hidden sm:inline">FlightWoodX</span>
          </NavLink>

          {/* ── Desktop Nav ── */}
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={'exact' in item && item.exact}
                className="site-nav-link"
              >
                {'icon' in item && <item.icon size={16} />}
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* ── Right Actions ── */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="site-nav-user inline-flex items-center gap-2 border bg-white px-3 py-1.5 text-sm transition hover:bg-sky-50"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                    {isGuest ? (
                      <span className="text-xs">G</span>
                    ) : user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.nickname} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <User size={14} />
                    )}
                  </div>
                  <span className="hidden md:inline max-w-[100px] truncate">{user?.username || user?.nickname || '用户'}</span>
                  <ChevronDown size={14} className={`transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-sky-100 bg-white py-1 shadow-lift animate-[fadeInUp_150ms_ease-out]">
                    {!isGuest && (
                      <>
                        <NavLink to="/me" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-sky-50 transition" onClick={() => setUserMenuOpen(false)}>
                          个人中心
                        </NavLink>
                        <NavLink to="/feed" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-sky-50 transition" onClick={() => setUserMenuOpen(false)}>
                          我的关注
                        </NavLink>
                        <NavLink to="/collections" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-sky-50 transition" onClick={() => setUserMenuOpen(false)}>
                          我的收藏
                        </NavLink>
                        <NavLink to="/design" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-sky-50 transition" onClick={() => setUserMenuOpen(false)}>
                          设计工作台
                        </NavLink>
                        {user?.role === 'admin' && (
                          <NavLink to="/admin" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-sky-50 transition" onClick={() => setUserMenuOpen(false)}>
                            管理后台
                          </NavLink>
                        )}
                        <hr className="my-1 border-sky-100" />
                      </>
                    )}
                    {isGuest && (
                      <NavLink to="/register" className="block px-4 py-2.5 text-sm font-medium text-sky-600 hover:bg-sky-50 transition" onClick={() => setUserMenuOpen(false)}>
                        注册账号
                      </NavLink>
                    )}
                    <NavLink to="/privacy/settings" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-sky-50 transition" onClick={() => setUserMenuOpen(false)}>
                      隐私设置
                    </NavLink>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink-600 hover:bg-sky-50 transition"
                    >
                      <LogOut size={14} />
                      {isGuest ? '退出游客模式' : '退出登录'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="hidden items-center gap-4 md:flex">
                  <NavLink
                    to="/register"
                    className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-sky-700 transition hover:text-sky-900"
                  >
                    注册
                  </NavLink>
                  <button
                    type="button"
                    onClick={openLoginModal}
                    className="site-nav-login"
                  >
                    登录
                  </button>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg border border-sky-200 bg-white p-2.5 text-ink-700 transition hover:bg-sky-50 md:hidden"
                  aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
                  onClick={() => setMobileOpen(v => !v)}
                >
                  {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              </>
            )}

            {/* Mobile hamburger (authed) */}
            {isAuthenticated && (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-sky-200 bg-white p-2.5 text-ink-700 transition hover:bg-sky-50 md:hidden"
                aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
                onClick={() => setMobileOpen(v => !v)}
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            )}
          </div>
        </div>

        {/* ── Mobile Menu ── */}
        {mobileOpen && (
          <div className="border-t border-sky-100 bg-white md:hidden animate-[fadeInUp_200ms_ease-out]">
            <div className="mx-auto max-w-7xl space-y-1 px-4 py-3">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'exact' in item && item.exact}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${
                      isActive ? 'bg-sky-100 text-sky-700' : 'text-ink-600 hover:bg-sky-50'
                    }`
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  {'icon' in item && <item.icon size={16} />}
                  {item.label}
                </NavLink>
              ))}
              {!isAuthenticated && (
                <>
                  <button
                    type="button"
                    onClick={() => { openLoginModal(); setMobileOpen(false) }}
                    className="mt-2 inline-flex min-h-[46px] w-full items-center justify-center rounded-xl border border-sky-100 bg-white text-[15px] font-bold text-sky-600 shadow-sm transition hover:bg-sky-50"
                  >
                    登录
                  </button>
                  <NavLink
                    to="/register"
                    onClick={() => setMobileOpen(false)}
                    className="mt-2 flex min-h-[44px] items-center justify-center text-sm font-semibold text-sky-700 transition hover:text-sky-900"
                  >
                    注册
                  </NavLink>
                </>
              )}
            </div>
          </div>
        )}
      </header>
    </>
  )
}
