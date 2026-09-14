import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { register as apiRegister, login as apiLogin, getMe, type UserResponse } from '../utils/api'
import { clearDesignStore } from './designStore'
import { clearProgramStore } from './programStore'
import { useProfileStore } from './profileStore'
import { createGuestSession, getGuestSession, clearGuestSession } from '../utils/guestSession'
import { resetAnalyticsIdentity, trackEvent } from '../features/analytics/client'

export interface User {
  id: string
  username: string
  email?: string
  role: 'student' | 'teacher' | 'admin' | 'guest'
  isGuest?: boolean
  nickname?: string
  avatarUrl?: string
  lastLogin?: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; message: string }>
  logout: () => void
  setUser: (user: User) => void
  enterGuestMode: () => void
  exitGuestMode: () => void
  restoreSession: () => Promise<void>
}

function accountUser(u: UserResponse): User {
  return {
    id: u.id, username: u.username, email: u.email, role: u.role ?? 'student',
    nickname: u.profile?.displayName || u.nickname || u.username,
    avatarUrl: u.profile?.avatar || u.avatarUrl, lastLogin: u.lastLogin,
  }
}

// A sign-out or newer sign-in invalidates every earlier authentication request.
let sessionRequestVersion = 0

function trackAuthFailure(status?: number) {
  const reason = status === undefined ? 'network' : status === 401 || status === 403 ? 'unauthorized' : status >= 500 ? 'server' : status >= 400 ? 'validation' : 'unknown'
  trackEvent('operation_failed', { operation: 'auth', reason })
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      register: async (username, email, password) => {
        if (!username || username.length < 3) {
          return { success: false, message: '用户名至少需要3个字符' }
        }
        if (!email || !email.includes('@')) {
          return { success: false, message: '请输入有效的邮箱地址' }
        }
        if (!password || password.length < 6) {
          return { success: false, message: '密码至少需要6个字符' }
        }

        const requestVersion = ++sessionRequestVersion
        trackEvent('auth_started', { method: 'register' })
        const result = await apiRegister({ username, email, password })
        if (requestVersion !== sessionRequestVersion) return { success: false, message: '登录状态已变化，请重试' }

        if (result.success && result.data) {
          const user = accountUser(result.data.user)
          if (get().user?.id !== user.id) resetAnalyticsIdentity({ flushPending: true })
          if (get().user?.id !== user.id) useProfileStore.getState().clear()
          if (get().user && !get().user?.isGuest && get().user?.id !== user.id) {
            clearDesignStore()
            clearProgramStore()
          }
          clearGuestSession()
          set({ user, token: result.data.token, isAuthenticated: true })
          return { success: true, message: '注册成功' }
        } else {
          trackAuthFailure(result.status)
          return { success: false, message: result.error || '注册失败' }
        }
      },

      login: async (email, password) => {
        if (!email || !password) {
          return { success: false, message: '请输入邮箱和密码' }
        }

        const requestVersion = ++sessionRequestVersion
        trackEvent('auth_started', { method: 'login' })
        const result = await apiLogin({ email, password })
        if (requestVersion !== sessionRequestVersion) return { success: false, message: '登录状态已变化，请重试' }

        if (result.success && result.data) {
          const user = accountUser(result.data.user)
          if (get().user?.id !== user.id) resetAnalyticsIdentity({ flushPending: true })
          if (get().user?.id !== user.id) useProfileStore.getState().clear()
          if (get().user && !get().user?.isGuest && get().user?.id !== user.id) {
            clearDesignStore()
            clearProgramStore()
          }
          clearGuestSession()
          set({ user, token: result.data.token, isAuthenticated: true })
          return { success: true, message: '登录成功' }
        } else {
          trackAuthFailure(result.status)
          return { success: false, message: result.error || '登录失败' }
        }
      },

      logout: () => {
        sessionRequestVersion += 1
        resetAnalyticsIdentity()
        clearGuestSession()
        useProfileStore.getState().clear()
        sessionStorage.removeItem('adminAccessKey')
        set({ user: null, token: null, isAuthenticated: false })
        clearDesignStore()
        clearProgramStore()
      },

      setUser: (user) => set((state) => state.user?.id === user.id ? { user } : state),

      enterGuestMode: () => {
        sessionRequestVersion += 1
        resetAnalyticsIdentity()
        useProfileStore.getState().clear()
        if (get().user && !get().user?.isGuest) {
          clearDesignStore()
          clearProgramStore()
        }
        const session = createGuestSession()
        const guestUser: User = {
          id: session.guestId,
          username: session.nickname,
          role: 'guest',
          isGuest: true,
        }
        set({ user: guestUser, token: null, isAuthenticated: true })
      },

      exitGuestMode: () => {
        sessionRequestVersion += 1
        resetAnalyticsIdentity()
        clearGuestSession()
        useProfileStore.getState().clear()
        set({ user: null, token: null, isAuthenticated: false })
        clearDesignStore()
        clearProgramStore()
      },

      restoreSession: async () => {
        const state = get()
        const requestVersion = sessionRequestVersion
        if (state.token) {
          const result = await getMe()
          // A late restore must not overwrite a more recent sign-in or sign-out.
          if (get().token !== state.token || requestVersion !== sessionRequestVersion) return
          if (result.success && result.data) {
            if (get().user?.id !== result.data.id) resetAnalyticsIdentity()
            set({ user: accountUser(result.data), isAuthenticated: true })
          } else if (result.status === 401 || result.status === 403) {
            // Preserve the draft and account identity until reauthentication.
            resetAnalyticsIdentity()
            set({ token: null, isAuthenticated: false })
          }
          return
        }
        if (state.isAuthenticated && state.user?.isGuest) return

        // Try restoring guest session
        const guestSession = getGuestSession()
        if (guestSession) {
          if (state.user && !state.user.isGuest) resetAnalyticsIdentity()
          const guestUser: User = {
            id: guestSession.guestId,
            username: guestSession.nickname,
            role: 'guest',
            isGuest: true,
          }
          set({ user: guestUser, token: null, isAuthenticated: true })
        }
      },
    }),
    {
      name: 'auth-storage',
    },
  ),
)
