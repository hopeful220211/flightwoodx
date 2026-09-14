import { trackEvent } from '../features/analytics/client'

export type SimulationOutcome = 'success' | 'collision' | 'error' | 'stopped'

/** Never forward raw server messages, program text or exception objects. */
export function trackOperationFailure(operation: 'auth' | 'design_save' | 'part_save' | 'program_save' | 'publish' | 'remix' | 'export' | 'editor_load', status?: number) {
  const reason = status === 0 ? 'network' : status === 401 || status === 403 ? 'unauthorized'
    : status && status >= 400 && status < 500 ? 'validation' : status && status >= 500 ? 'server' : 'unknown'
  trackEvent('operation_failed', { operation, reason })
}

/** One actual execution, independent of renderer ticks. Stop/reset/unmount
 * may race with onFinish; the first observed ending settles it exactly once. */
export function beginSimulationObservation(designId?: string) {
  try {
    const runId = crypto.randomUUID()
    const startedAt = performance.now()
    const context = { runId, ...(designId ? { designId } : {}) }
    let finished = false
    trackEvent('simulation_run', { ...context, phase: 'start' })
    return (outcome: SimulationOutcome) => {
      if (finished) return
      finished = true
      try {
        trackEvent('simulation_run', { ...context, phase: 'finish', outcome, durationMs: Math.max(0, Math.round(performance.now() - startedAt)) })
      } catch { /* Optional measurement never interrupts a finished execution. */ }
    }
  } catch {
    return (_outcome: SimulationOutcome) => { /* Optional measurement is unavailable. */ }
  }
}
