import type { FlightReadiness } from '../../utils/flightReadiness'

/** Show actionable assembly issues; leave engineering-evidence status in the unchanged rule result. */
export function getAssemblyIssue(readiness: Pick<FlightReadiness, 'issues'>) {
  return readiness.issues.find(issue => issue.code !== 'EVIDENCE_MISSING')
}
