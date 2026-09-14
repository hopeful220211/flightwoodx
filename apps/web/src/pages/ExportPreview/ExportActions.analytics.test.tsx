// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ExportActions } from './ExportActions'
import type { Design } from '../../types/design'

const mocked = vi.hoisted(() => ({ track: vi.fn(), download: vi.fn(), toast: vi.fn() }))
vi.mock('../../features/analytics/client', () => ({ trackEvent: mocked.track }))
vi.mock('../../utils/exportBundle', () => ({ downloadExportZip: mocked.download }))
vi.mock('../../components/common/Toast', () => ({ useToast: () => ({ push: mocked.toast }) }))
vi.mock('../../components/common/ScrollReveal', () => ({ ScrollReveal: ({ children }: { children: ReactNode }) => children }))
const design = { id: 'design-example', name: 'Private name', parts: [] } as unknown as Design
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); mocked.track.mockClear(); mocked.download.mockReset() })
afterEach(() => vi.unstubAllGlobals())

it('counts a prepared export only after packaging completes, without file names or content', async () => {
  let complete: (value: unknown) => void = () => {}
  mocked.download.mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
  const container = document.createElement('div'); const root = createRoot(container)
  try {
    await act(async () => root.render(<MemoryRouter><ExportActions design={design} checks={[]} /></MemoryRouter>))
    await act(async () => container.querySelectorAll('button')[1]!.click())
    expect(mocked.track).not.toHaveBeenCalled()
    await act(async () => complete({ fileName: 'Private name.zip', generatedParts: ['a'], pending2D: ['b', 'c'] }))
    expect(mocked.track).toHaveBeenCalledExactlyOnceWith('export_prepared', { designId: design.id, availableCount: 1, missingCount: 2 })
  } finally { await act(async () => root.unmount()) }
})

it('records a bounded failure code and never a successful export on failure', async () => {
  mocked.download.mockRejectedValueOnce(new Error('Private payload'))
  const container = document.createElement('div'); const root = createRoot(container)
  try {
    await act(async () => root.render(<MemoryRouter><ExportActions design={design} checks={[]} /></MemoryRouter>))
    await act(async () => container.querySelectorAll('button')[1]!.click())
    expect(mocked.track).toHaveBeenCalledExactlyOnceWith('operation_failed', { operation: 'export', reason: 'unknown' })
  } finally { await act(async () => root.unmount()) }
})
