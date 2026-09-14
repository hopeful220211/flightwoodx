// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { useForkPost } from './useFork'

const mocks = vi.hoisted(() => ({ track: vi.fn(), api: vi.fn() }))
vi.mock('../features/analytics/client', () => ({ trackEvent: mocks.track }))
vi.mock('../utils/api', () => ({ apiFetch: mocks.api }))
it('records rejected remix attempts only; server success is authoritative', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const root = createRoot(document.createElement('div')); const qc = new QueryClient()
  let hook!: ReturnType<typeof useForkPost>
  function Probe() { hook = useForkPost(); return null }
  try {
    await act(async () => root.render(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>))
    mocks.api.mockResolvedValue({ success: false, status: 403, error: 'private detail' })
    await act(async () => { await expect(hook.mutateAsync('post-a')).rejects.toThrow('private detail') })
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('operation_failed', { operation: 'remix', reason: 'unauthorized' })
    mocks.track.mockClear(); mocks.api.mockResolvedValue({ success: true, data: { projectId: 'remix-a' } })
    await act(async () => { expect(await hook.mutateAsync('post-a')).toEqual({ projectId: 'remix-a' }) })
    expect(mocks.track).not.toHaveBeenCalled()
  } finally { await act(async () => root.unmount()); qc.clear(); vi.unstubAllGlobals() }
})
