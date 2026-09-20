import { useState } from 'react'
import { Button } from '../../common/Button'
import { Modal } from '../../common/Modal'
import { useAuthStore } from '../../../stores/authStore'
import { useToast } from '../../common/Toast'

interface AuthModalProps {
  open: boolean
  onClose: () => void
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, register } = useAuthStore()
  const toast = useToast()

  const [mode, setMode] = useState<'login' | 'register'>('login')

  // 登录表单
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // 注册表单
  const [registerUsername, setRegisterUsername] = useState('')
  const [registerNickname, setRegisterNickname] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('')

  const handleLogin = async () => {
    const result = await login(loginUsername, loginPassword)
    toast.push(result.success ? 'success' : 'error', result.message)
    if (result.success) {
      onClose()
      setLoginUsername('')
      setLoginPassword('')
    }
  }

  const handleRegister = async () => {
    if (registerPassword !== registerPasswordConfirm) {
      toast.push('error', '两次输入的密码不一致')
      return
    }

    const result = await register(registerUsername, registerNickname, registerPassword)
    toast.push(result.success ? 'success' : 'error', result.message)
    if (result.success) {
      onClose()
      setRegisterUsername('')
      setRegisterNickname('')
      setRegisterPassword('')
      setRegisterPasswordConfirm('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      action()
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === 'login' ? '登录' : '注册'}>
      {/* 标签页切换 */}
      <div className="mb-6 flex gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${
            mode === 'login'
              ? 'bg-white text-wood-600 shadow-sm dark:bg-slate-900 dark:text-wood-400'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          登录
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${
            mode === 'register'
              ? 'bg-white text-wood-600 shadow-sm dark:bg-slate-900 dark:text-wood-400'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          注册
        </button>
      </div>

      {/* 登录表单 */}
      {mode === 'login' && (
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              邮箱
            </label>
            <input
              type="text"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value.trim())}
              onKeyPress={(e) => handleKeyPress(e, handleLogin)}
              placeholder="请输入注册邮箱"
              className="site-form-control w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              密码
            </label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, handleLogin)}
              placeholder="请输入密码"
              className="site-form-control w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <Button
            className="w-full"
            onClick={handleLogin}
            disabled={!loginUsername || !loginPassword}
          >
            登录
          </Button>
        </div>
      )}

      {/* 注册表单 */}
      {mode === 'register' && (
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              用户名
            </label>
            <input
              type="text"
              value={registerUsername}
              onChange={(e) => setRegisterUsername(e.target.value.trim())}
              onKeyPress={(e) => handleKeyPress(e, handleRegister)}
              placeholder="至少3个字符"
              className="site-form-control w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              邮箱
            </label>
            <input
              type="text"
              value={registerNickname}
              onChange={(e) => setRegisterNickname(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, handleRegister)}
              placeholder="请输入邮箱地址"
              className="site-form-control w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              密码
            </label>
            <input
              type="password"
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, handleRegister)}
              placeholder="至少6个字符"
              className="site-form-control w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              确认密码
            </label>
            <input
              type="password"
              value={registerPasswordConfirm}
              onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, handleRegister)}
              placeholder="再次输入密码"
              className="site-form-control w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <Button
            className="w-full"
            onClick={handleRegister}
            disabled={
              !registerUsername ||
              !registerNickname ||
              !registerPassword ||
              !registerPasswordConfirm
            }
          >
            注册
          </Button>
        </div>
      )}
    </Modal>
  )
}
