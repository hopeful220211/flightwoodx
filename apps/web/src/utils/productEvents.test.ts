import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { beginSimulationObservation, trackOperationFailure } from './productEvents'

const mocks = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('../features/analytics/client', () => ({ trackEvent: mocks.track }))
beforeEach(() => mocks.track.mockClear())
afterEach(() => vi.restoreAllMocks())

it.each([[0, 'network'], [401, 'unauthorized'], [403, 'unauthorized'], [400, 'validation'], [422, 'validation'], [503, 'server'], [undefined, 'unknown']] as const)('classifies status %s without transmitting response content', (status, reason) => {
  trackOperationFailure('publish', status)
  expect(mocks.track).toHaveBeenCalledExactlyOnceWith('operation_failed', { operation: 'publish', reason })
})

it('does not interrupt simulation when the analytics UUID source is unavailable', () => {
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('UUID unavailable') })
  expect(() => beginSimulationObservation('design-a')('success')).not.toThrow()
  expect(mocks.track).not.toHaveBeenCalled()
})

it('does not interrupt completion when the monotonic clock fails', () => {
  const finish = beginSimulationObservation('design-a')
  vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('Clock unavailable') })
  expect(() => finish('success')).not.toThrow()
  expect(mocks.track).toHaveBeenCalledTimes(1)
})
