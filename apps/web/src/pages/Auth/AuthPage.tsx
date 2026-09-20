import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useToast } from '../../components/common/Toast'
import { useAuthStore } from '../../stores/authStore'
import { safeLoginTarget, useUIStore } from '../../stores/uiStore'
import { CloudLayer } from '../Home/components/CloudLayer'
import { Sparkles } from 'lucide-react'

// 全屏注册页：登录已改走弹窗，这里只负责「注册」。
// 视觉向登录弹窗看齐——白底产品界面，天空蓝只做极淡环境光，控件克制不糖果化。
export function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = safeLoginTarget(location.state?.returnTo)
  const toast = useToast()
  const { register, enterGuestMode } = useAuthStore()
  const openLoginModal = useUIStore((s) => s.openLoginModal)

  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [form, setForm] = useState({ username: '', email: '', password: '' })

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed) {
      toast.push('error', '请先阅读并同意用户使用协议和隐私政策')
      return
    }
    if (loading) return
    setLoading(true)

    try {
      const result = await register(form.username, form.email, form.password)

      if (result.success) {
        toast.push('success', '注册成功！')
        navigate(returnTo || '/dashboard', { replace: true })
      } else {
        toast.push('error', result.message)
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '注册失败'
      toast.push('error', msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGuestMode = () => {
    enterGuestMode()
    navigate(returnTo || '/dashboard', { replace: true })
  }

  // 已有账号：回首页并弹出登录弹窗（登录走弹窗，不再有全屏登录页）
  const goLogin = () => {
    openLoginModal(returnTo)
    navigate('/')
  }

  const inputCls =
    'w-full rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm text-[#303233] placeholder:text-sky-400/70 transition focus:border-[#0070d5] focus:outline-none focus:ring-2 focus:ring-[#0070d5]/15'
  const labelCls = 'mb-1.5 block text-sm font-semibold text-[#303233]/85'
  const agreementLinkCls = 'text-[#0070d5] underline underline-offset-2 hover:text-[#005eae] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070d5]'

  return (
    <div className="auth-page relative min-h-dvh overflow-hidden">
      {/* 品牌氛围：极淡的天空蓝环境光 + 缓慢漂移的云（压低透明度，
          只做白色产品界面上的一抹品牌底色，不喧宾夺主） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[36vh] bg-gradient-to-b from-sky-100/40 via-sky-50/20 to-transparent"
      />
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <CloudLayer />
      </div>

      <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-[0_24px_64px_-28px_rgba(11,58,104,0.45)] ring-1 ring-sky-100 sm:p-7">
          {/* Logo 和标题 */}
          <div className="mb-6 text-center">
            <div className="auth-brand mb-6 flex items-center justify-center gap-2.5">
              <img
                src="/web_logo.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 object-contain"
              />
              <span className="text-lg font-semibold leading-7 tracking-normal text-[#303233]">FlightWoodX 账号</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#303233]">创建账号</h1>
            <p className="mt-1.5 text-sm text-sky-700/75">
              注册后可保存无人机设计和程序，<br />
              并在其他设备登录查看。
            </p>
          </div>

          {/* 注册表单 */}
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="register-username" className={labelCls}>用户名</label>
              <input
                id="register-username"
                type="text"
                required
                minLength={3}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.trim() })}
                className={"site-form-control " + (inputCls)}
                placeholder="至少 3 个字符"
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="register-email" className={labelCls}>邮箱</label>
              <input
                id="register-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value.trim() })}
                className={"site-form-control " + (inputCls)}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="register-password" className={labelCls}>密码</label>
              <input
                id="register-password"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={"site-form-control " + (inputCls)}
                placeholder="至少 6 个字符"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="register-agreement" className="flex min-h-11 cursor-pointer items-start gap-2.5 py-2 text-xs leading-6 text-slate-600">
                <input
                  id="register-agreement"
                  type="checkbox"
                  required
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#0070d5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070d5]"
                />
                <span>我已阅读并同意<Link to="/terms" target="_blank" rel="noopener noreferrer" className={agreementLinkCls}>《用户使用协议》</Link>和<Link to="/privacy/policy" target="_blank" rel="noopener noreferrer" className={agreementLinkCls}>《隐私政策》</Link></span>
              </label>
              <p className="text-xs leading-5 text-slate-500">未满14周岁，请由监护人阅读<Link to="/privacy/children" target="_blank" rel="noopener noreferrer" className={agreementLinkCls}>儿童个人信息保护规则</Link>。注册不会开启使用统计。</p>
            </div>

            <button
              type="submit"
              disabled={loading || !agreed || !form.username || !form.email || !form.password}
              className="mt-2 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#0070d5] px-5 text-sm font-semibold text-white transition hover:bg-[#005eae] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#0070d5]"
            >
              {loading ? '注册中…' : '创建账号'}
            </button>
          </form>

          {/* 去登录 —— 关键链接用主蓝 */}
          <div className="mt-5 text-center text-sm">
            <span className="text-sky-600/80">已有账号？</span>
            <button
              type="button"
              onClick={goLogin}
              className="ml-1.5 font-semibold text-[#0070d5] transition hover:brightness-110"
            >
              去登录
            </button>
          </div>

          {/* 游客入口 —— 弱化为轻量文字链接，不再做成第二个大按钮 */}
          <div className="mt-5 border-t border-sky-100 pt-5 text-center">
            <button
              type="button"
              onClick={handleGuestMode}
              className="inline-flex items-center justify-center gap-1.5 text-sm text-sky-600 transition hover:text-[#0070d5]"
            >
              <Sparkles size={14} />
              <span>进入游客模式</span>
            </button>
          </div>

          {/* 返回首页 —— 最弱层级 */}
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs text-sky-500/75 transition hover:text-sky-700"
            >
              返回首页
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
