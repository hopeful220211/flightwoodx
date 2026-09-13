import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { X, Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '../../../components/common/Button'
import { useToast } from '../../../components/common/Toast'
import { useAuthStore } from '../../../stores/authStore'
import { useUIStore } from '../../../stores/uiStore'

/**
 * 登录弹窗 —— 在当前页面上浮出的小卡片（天空蓝），由 <AppLayout> 统一挂载。
 * 登录走弹窗、注册走全屏页（/register）。点遮罩 / Esc / 关闭按钮均可关闭。
 */
export function LoginModal() {
  const open = useUIStore((s) => s.loginModalOpen)
  const close = useUIStore((s) => s.closeLoginModal)
  const navigate = useNavigate()
  const toast = useToast()
  const { login, enterGuestMode } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // 关闭并清空表单，下次打开是干净的（在事件回调里改状态，不在 effect 体内）
  const resetAndClose = useCallback(() => {
    setEmail('')
    setPassword('')
    setLoading(false)
    close()
  }, [close])

  // 打开时：Esc 关闭 + 锁定背景滚动
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resetAndClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, resetAndClose])

  if (!open) return null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.success) {
        toast.push('success', '登录成功！')
        resetAndClose()
      } else {
        toast.push('error', result.message)
      }
    } catch (err: unknown) {
      toast.push('error', err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const goRegister = () => {
    resetAndClose()
    navigate('/register')
  }

  const handleGuest = () => {
    enterGuestMode()
    resetAndClose()
    navigate('/dashboard')
  }

  const inputCls =
    'w-full rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm text-sky-900 placeholder:text-sky-400/70 transition focus:border-accent-spark focus:outline-none focus:ring-2 focus:ring-sky-200/70'
  const labelCls = 'mb-1.5 block text-sm font-semibold text-sky-800'

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
      {/* 遮罩：点击关闭 */}
      <button
        type="button"
        aria-label="关闭登录"
        className="absolute inset-0 bg-sky-950/40 backdrop-blur-sm"
        onClick={resetAndClose}
      />

      {/* 卡片 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="登录"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-7 shadow-[0_28px_70px_-24px_rgba(11,58,104,0.5)] ring-1 ring-sky-100 animate-[fadeInUp_180ms_ease-out]"
      >
        {/* 关闭按钮 */}
        <button
          type="button"
          aria-label="关闭"
          onClick={resetAndClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-sky-400 transition hover:bg-sky-50 hover:text-sky-700"
        >
          <X size={18} />
        </button>

        {/* 标题 */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 to-sky-200 ring-1 ring-sky-200/60">
            <img src="/web_logo.png" alt="FlightWoodX" className="h-8 w-8 object-contain" />
          </div>
          <h2 className="text-xl font-extrabold tracking-tight text-sky-900">登录</h2>
          <p className="mt-1 text-sm text-sky-600/90">登录后可查看和编辑账号中保存的作品。</p>
        </div>

        {/* 表单 */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="login-email" className={labelCls}>邮箱</label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              className={inputCls}
              placeholder="your@email.com"
              autoComplete="email"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="login-password" className={labelCls}>密码</label>
            <input
              id="login-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder="至少 6 个字符"
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="mt-2 w-full"
            loading={loading}
            disabled={loading || !email || !password}
          >
            登录
          </Button>
        </form>

        {/* 去注册 */}
        <div className="mt-5 text-center text-sm">
          <span className="text-sky-600/80">还没有账号？</span>
          <button
            type="button"
            onClick={goRegister}
            className="ml-1.5 font-semibold text-accent-spark transition hover:brightness-110"
          >
            注册账号
          </button>
        </div>

        {/* 分隔线 */}
        <div className="my-5 flex items-center gap-3">
          <hr className="flex-1 border-sky-100" />
          <span className="text-xs text-sky-400">或</span>
          <hr className="flex-1 border-sky-100" />
        </div>

        {/* 游客模式 */}
        <button
          type="button"
          onClick={handleGuest}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50/60 px-5 py-2.5 text-sm font-medium text-sky-700 transition hover:bg-sky-100 active:scale-[0.99]"
        >
          <Sparkles size={16} className="text-accent-spark" />
          <span>进入游客模式</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>,
    document.body,
  )
}
