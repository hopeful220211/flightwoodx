// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HeroSection } from './sections/HeroSection'
import { FinalCTASection } from './sections/FinalCTASection'
import { ForWhoSection } from './sections/ForWhoSection'
import { ProductDemoSection } from './sections/ProductDemoSection'

const mocked = vi.hoisted(() => ({ track: vi.fn(), authenticated: false }))
vi.mock('../../features/analytics/client', () => ({ trackEvent: mocked.track }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (select: (state: { isAuthenticated: boolean }) => unknown) => select({ isAuthenticated: mocked.authenticated }) }))
vi.mock('../../components/common/ScrollReveal', () => ({ ScrollReveal: ({ children }: { children: ReactNode }) => children }))
vi.mock('./components/WorkbenchAnimation', () => ({ WorkbenchAnimation: () => null }))
// Analytics tests exercise clicks, not browser viewport observers. The actual
// three-aircraft animation is covered by hero-hover.spec.ts in real browsers.
vi.mock('./sections/hero/HeroDrone3D', () => ({ HeroDrone3D: () => null }))
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); mocked.track.mockClear(); mocked.authenticated = false })
afterEach(() => vi.unstubAllGlobals())

it.each([
  ['hero', () => <HeroSection onWatchVideo={() => {}} />, 'design'],
  ['demo', () => <ProductDemoSection />, 'login'],
  ['final', () => <FinalCTASection />, 'login'],
  ['audience', () => <ForWhoSection />, 'login'],
] as const)('records %s entry intent only on a click', async (placement, page, destination) => {
  const container = document.createElement('div'); const root = createRoot(container)
  try {
    await act(async () => root.render(<MemoryRouter>{page()}</MemoryRouter>))
    expect(mocked.track).not.toHaveBeenCalled()
    await act(async () => container.querySelector('button')!.click())
    expect(mocked.track).toHaveBeenCalledExactlyOnceWith('home_cta_clicked', { placement, destination })
  } finally { await act(async () => root.unmount()) }
})
