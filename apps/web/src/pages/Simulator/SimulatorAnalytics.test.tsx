// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RunResult } from '@fwx/shared'
import { SimulatorPage } from './SimulatorPage'

const mocks = vi.hoisted(() => ({ track: vi.fn(), execute: vi.fn(), compile: vi.fn(), stop: vi.fn(), toast: { push: vi.fn() }, collided: false, failure: null as null | string }))
const program = { version: '1.0', metadata: { name: 'Private program', author: 'child', createdAt: '' }, commands: [{ type: 'takeoff' }] }
vi.mock('../../features/analytics/client', () => ({ trackEvent: mocks.track }))
vi.mock('../../simulator/FlightScene', () => ({ FlightScene: () => null }))
vi.mock('../../components/common/Toast', () => ({ useToast: () => mocks.toast }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ token: null, user: null }) }))
vi.mock('../../stores/designStore', () => ({ useDesignStore: (select: (state: unknown) => unknown) => select({ designs: [] }) }))
vi.mock('../../stores/programStore', () => ({ useProgramStore: Object.assign((select: (state: unknown) => unknown) => select({ draftsByDesignId: { 'design-a': { blocklyXml: '<private/>', commandProgram: program } } }), { getState: () => ({ getDraft: () => ({ blocklyXml: '<private/>', commandProgram: program }) }) }) }))
vi.mock('../../utils/designProgram', () => ({ loadDesignProgram: vi.fn() }))
vi.mock('../../blockly/compileWorkspaceXml', () => ({ compileWorkspaceXml: mocks.compile }))
vi.mock('../../simulator/SimAdapter', () => ({ SimAdapter: class {
  execute = mocks.execute
  stop = mocks.stop
  hasCollided = () => mocks.collided
  getFailureReason = () => mocks.failure
  getState = () => ({ ledColor: [0, 0, 0] })
} }))
let root: Root
let container: HTMLDivElement
let finish: (result: RunResult) => void
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.track.mockClear(); mocks.stop.mockClear(); mocks.collided = false; mocks.failure = null
  mocks.compile.mockReturnValue(program)
  mocks.execute.mockReset().mockImplementation(async (_program, callbacks) => { finish = callbacks.onFinish })
  container = document.createElement('div'); root = createRoot(container)
  await act(async () => root.render(<MemoryRouter initialEntries={['/simulator/design-a']}><Routes><Route path="/simulator/:id" element={<SimulatorPage />} /></Routes></MemoryRouter>))
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals() })
async function click(text: string) { await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === text)!.click()) }

it.each(['success', 'collision', 'error', 'stopped'] as const)('observes the actual %s result with one stable run ID', async outcome => {
  expect(mocks.track).not.toHaveBeenCalled()
  await click('运行')
  mocks.collided = outcome === 'collision'; mocks.failure = outcome === 'error' ? 'private failure detail' : null
  await act(async () => finish({ success: outcome === 'success', events: ['private result log'] }))
  const first = mocks.track.mock.calls[0]!
  expect(first).toEqual(['simulation_run', { runId: expect.any(String), designId: 'design-a', phase: 'start' }])
  expect(mocks.track).toHaveBeenLastCalledWith('simulation_run', { runId: first[1].runId, designId: 'design-a', phase: 'finish', outcome, durationMs: expect.any(Number) })
  expect(mocks.track).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(/private|commands|blocklyXml/)
})

it('does not count a compilation refusal as an execution', async () => {
  mocks.compile.mockImplementation(() => { throw new Error('private invalid XML') })
  await click('运行')
  expect(mocks.track).not.toHaveBeenCalled()
  expect(mocks.execute).not.toHaveBeenCalled()
})

it('settles reset/unmount as stopped once and ignores stale successful callbacks', async () => {
  await click('运行')
  await click('重置')
  await act(async () => finish({ success: true, events: [] }))
  expect(mocks.track).toHaveBeenCalledTimes(2)
  expect(mocks.track).toHaveBeenLastCalledWith('simulation_run', expect.objectContaining({ phase: 'finish', outcome: 'stopped' }))
})
