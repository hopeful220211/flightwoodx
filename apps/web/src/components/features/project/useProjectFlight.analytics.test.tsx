// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CommandProgram, RunResult } from '@fwx/shared'
import { useProjectFlight } from './useProjectFlight'

const mocked = vi.hoisted(() => ({ track: vi.fn(), execute: vi.fn(), stop: vi.fn(), collided: false, failure: null as string | null }))
vi.mock('../../../features/analytics/client', () => ({ trackEvent: mocked.track }))
vi.mock('../../../simulator/SimAdapter', () => ({ SimAdapter: class {
  execute = mocked.execute
  stop = mocked.stop
  hasCollided = () => mocked.collided
  getFailureReason = () => mocked.failure
} }))
let flight: ReturnType<typeof useProjectFlight>
const program = { version: '1.0', metadata: { name: 'Private program', author: 'Private child', createdAt: '2026-09-14' }, commands: [] } as CommandProgram
let finish: (result: RunResult) => void
let telemetry: (value: unknown) => void
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocked.track.mockClear(); mocked.stop.mockClear(); mocked.collided = false; mocked.failure = null
  mocked.execute.mockImplementation(async (_program, callbacks) => { finish = callbacks.onFinish; telemetry = callbacks.onTelemetry })
})
afterEach(() => vi.unstubAllGlobals())
async function mount() {
  const div = document.createElement('div')
  const root = createRoot(div)
  function Harness() { flight = useProjectFlight(); return null }
  await act(async () => root.render(<Harness />))
  return async () => act(async () => root.unmount())
}

it('records one real start and one finish, never command telemetry or program content', async () => {
  const close = await mount()
  try {
    await act(async () => flight.run(program))
    expect(mocked.track).toHaveBeenCalledWith('simulation_run', { runId: expect.any(String), phase: 'start' })
    await act(async () => telemetry({ posCm: [1, 2, 3] }))
    expect(mocked.track).toHaveBeenCalledTimes(1)
    await act(async () => finish({ success: true } as RunResult))
    await act(async () => finish({ success: true } as RunResult))
    const calls = mocked.track.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(['simulation_run', { runId: calls[0]![1].runId, phase: 'finish', outcome: 'success', durationMs: expect.any(Number) }])
    expect(JSON.stringify(calls)).not.toMatch(/Private|posCm|commands/)
  } finally { await close() }
})

it('settles stopped runs once even when the adapter has no finish callback', async () => {
  const close = await mount()
  try {
    await act(async () => flight.run(program))
    await act(async () => flight.stop())
    await act(async () => flight.reset())
    expect(mocked.track.mock.calls.filter(call => call[1].phase === 'finish')).toEqual([
      ['simulation_run', { runId: expect.any(String), phase: 'finish', outcome: 'stopped', durationMs: expect.any(Number) }],
    ])
  } finally { await close() }
})

it('classifies an unsuccessful adapter result as error without inspecting private adapter details', async () => {
  const close = await mount()
  try {
    await act(async () => flight.run(program))
    await act(async () => finish({ success: false } as RunResult))
    expect(mocked.track).toHaveBeenLastCalledWith('simulation_run', expect.objectContaining({ phase: 'finish', outcome: 'error' }))
  } finally { await close() }
})
