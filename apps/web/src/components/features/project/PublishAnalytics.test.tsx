// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { PublishModal } from './PublishModal'
import { PublishWorkModal } from '../../../pages/Dashboard/components/PublishWorkModal'
import type { Design } from '../../../types/design'

const mocks = vi.hoisted(() => ({ track: vi.fn(), create: vi.fn(), update: vi.fn(), put: vi.fn(), toast: { push: vi.fn() } }))
vi.mock('../../../features/analytics/client', () => ({ trackEvent: mocks.track }))
vi.mock('../../../utils/api', () => ({ createCommunityPost: mocks.create, updateProject: mocks.update, updateDroneDesign: mocks.update, putDroneDesign: mocks.put }))
vi.mock('../../../components/common/Toast', () => ({ useToast: () => mocks.toast }))
vi.mock('../../../hooks/useMyDesigns', () => ({ MY_DESIGNS_KEY: ['mine'] }))
beforeEach(() => { mocks.track.mockClear(); mocks.update.mockResolvedValue({ success: true }); mocks.create.mockReset() })

it.each(['legacy', 'work'] as const)('%s publishing reports rejected writes, without counting duplicate or new posts on the client', async kind => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const root = createRoot(document.createElement('div'))
  const qc = new QueryClient()
  try {
    const modal = kind === 'legacy' ? <PublishModal open onClose={() => {}} projectId="project-a" /> : <PublishWorkModal open onClose={() => {}} serverId="server-a" design={{ id: 'design-a', name: 'Private design', parts: [] } as unknown as Design} />
    await act(async () => root.render(<QueryClientProvider client={qc}><MemoryRouter>{modal}</MemoryRouter></QueryClientProvider>))
    mocks.create.mockResolvedValue({ success: false, status: 503, error: 'private detail' })
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === '发布')!.click())
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('operation_failed', { operation: 'publish', reason: 'server' })
    mocks.track.mockClear()
    mocks.create.mockResolvedValue({ success: true, data: { alreadyPublished: true, post: { id: 'post-a' } } })
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === '发布')!.click())
    expect(mocks.track).not.toHaveBeenCalled()
  } finally { await act(async () => root.unmount()); qc.clear(); vi.unstubAllGlobals() }
})
