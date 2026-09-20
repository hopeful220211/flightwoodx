import { create } from 'zustand'

/**
 * 全局界面开关。当前只承载「登录弹窗」的开合：
 * Navbar 的「登录」按钮、需登录页面的拦截、旧 /auth · /login 入口都置位这里，
 * 由布局层 <LoginModal /> 统一监听渲染——这样弹窗能从任意页面被唤起。
 */
interface UIState {
  loginModalOpen: boolean
  loginReturnTo: string | null
  loginIntentId: number
  openLoginModal: (returnTo?: string | null) => void
  closeLoginModal: () => void
  completeLogin: (intentId: number) => string | null
}

export function safeLoginTarget(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\s]|%2f|%5c/i.test(value)) return null
  return /^\/(design|code|simulator|dashboard|projects|collections|feed|fly|me|profile|part-studio)(?:\/|\?|#|$)/.test(value) ? value : null
}

export const useUIStore = create<UIState>((set, get) => ({
  loginModalOpen: false,
  loginReturnTo: null,
  loginIntentId: 0,
  openLoginModal: returnTo => set(state => ({ loginModalOpen: true, loginReturnTo: safeLoginTarget(returnTo), loginIntentId: state.loginIntentId + 1 })),
  closeLoginModal: () => set(state => ({ loginModalOpen: false, loginReturnTo: null, loginIntentId: state.loginIntentId + 1 })),
  completeLogin: intentId => {
    const state = get()
    if (!state.loginModalOpen || intentId !== state.loginIntentId) return null
    const target = state.loginReturnTo
    state.closeLoginModal()
    return target
  },
}))
