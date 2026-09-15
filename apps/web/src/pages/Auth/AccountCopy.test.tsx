// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/common/Toast'
import { useUIStore } from '../../stores/uiStore'
import { AuthPage } from './AuthPage'
import { LoginModal } from './components/LoginModal'
import { MePage } from '../Me/MePage'
import { AdminCoursesPage, AdminPartsPage } from '../Admin/pages/ModulePlaceholder'
import { AuthModal } from '../../components/features/auth/AuthModal'

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  useUIStore.getState().closeLoginModal()
  container.remove()
  vi.unstubAllGlobals()
})
async function render(page: React.ReactNode) {
  await act(async () => root.render(<MemoryRouter><ToastProvider>{page}</ToastProvider></MemoryRouter>))
}

it('explains what an account saves without making flight claims', async () => {
  await render(<AuthPage />)
  expect(container.textContent).toContain('注册后可保存无人机设计和程序，并在其他设备登录查看。')
  const intro = container.querySelector('h1 + p')!
  const lineBreak = intro.querySelector('br')
  expect(lineBreak).not.toBeNull()
  expect(lineBreak?.previousSibling?.textContent).toBe('注册后可保存无人机设计和程序，')
  expect(lineBreak?.nextSibling?.textContent).toBe('并在其他设备登录查看。')
  expect(container.textContent).toContain('进入游客模式')
  expect(container.textContent).not.toContain('一架会飞的无人机')
})

it('describes login as access to saved work', async () => {
  useUIStore.getState().openLoginModal()
  await render(<LoginModal />)
  const dialog = document.querySelector('[role="dialog"]')
  expect(dialog?.textContent).toContain('登录后可查看和编辑账号中保存的作品。')
  expect(dialog?.textContent).not.toContain('飞行之旅')
})

it('labels unavailable account features instead of implying empty real records', async () => {
  await render(<MePage />)
  expect(container.textContent).toContain('我的奖项暂未开放')
  expect(container.textContent).toContain('动态记录暂未开放')
  expect(container.textContent).not.toContain('开始设计你的第一架无人机吧')
})

it('states which administration actions are currently unavailable', async () => {
  await render(<><AdminCoursesPage /><AdminPartsPage /></>)
  expect(container.textContent).toContain('课程管理暂未开放')
  expect(container.textContent).toContain('当前不能新增、编辑或发布课程。')
  expect(container.textContent).toContain('后台零件审核、发布和采购清单管理暂未开放。')
})

it('labels the legacy login and registration fields to match their email API parameters', async () => {
  await render(<AuthModal open onClose={vi.fn()} />)
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.querySelector('input')?.getAttribute('placeholder')).toBe('请输入注册邮箱')
  const registerTab = [...dialog.querySelectorAll('button')].find(button => button.textContent === '注册')!
  await act(async () => registerTab.click())
  expect([...dialog.querySelectorAll('label')].map(label => label.textContent?.trim())).toEqual(['用户名', '邮箱', '密码', '确认密码'])
  expect(dialog.querySelector('input[placeholder="请输入邮箱地址"]')).not.toBeNull()
})
