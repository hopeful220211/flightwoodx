import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { ScrollReveal } from '../../components/common/ScrollReveal'
import type { CheckResult } from '../../utils/exportChecks'

interface FlightCheckReportProps {
  checks: CheckResult[]
}

const LEVEL_ICON = {
  pass: <CheckCircle2 size={18} className="text-accent-leaf shrink-0" />,
  warning: <AlertTriangle size={18} className="text-accent-gold shrink-0" />,
  error: <XCircle size={18} className="text-[#E04545] shrink-0" />,
}

const LEVEL_BG = {
  pass: 'bg-accent-leaf/10',
  warning: 'bg-accent-gold/10',
  error: 'bg-[#E04545]/10',
}

function CheckItem({ check }: { check: CheckResult }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-md ${LEVEL_BG[check.level]}`}>
      {LEVEL_ICON[check.level]}
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-900">{check.title}</p>
        {check.detail && <p className="text-xs text-ink-600 mt-0.5">{check.detail}</p>}
        {check.fixHint && check.level !== 'pass' && (
          <p className="text-xs text-ink-600 mt-1">{check.fixHint}</p>
        )}
      </div>
    </div>
  )
}

function needsAction(check: CheckResult): boolean {
  return check.level === 'error' || (check.level === 'warning' && Boolean(check.fixHint))
}

export function FlightCheckReport({ checks }: FlightCheckReportProps) {
  const issues = checks.filter(needsAction)
  const otherResults = checks.filter(check => !needsAction(check))

  return (
    <section className="py-12 lg:py-16 bg-white">
      <div className="mx-auto max-w-5xl px-4">
        <ScrollReveal>
          <h2 className="text-[28px] font-semibold leading-8 tracking-[-.03em] text-ink-900 sm:text-[32px] sm:leading-9">设计检查</h2>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <p className="mt-3 text-sm text-ink-600">{issues.length ? `${issues.length} 项需要处理` : '当前没有待修改项目'}</p>
        </ScrollReveal>

        {/* Check list */}
        <ScrollReveal delay={200}>
          <div className="mt-6 space-y-2">
            {issues.map(check => <CheckItem key={check.id} check={check} />)}
            {otherResults.length > 0 && (
              <details className="rounded-md border border-sky-100">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
                  查看 {otherResults.length} 项其他检查结果
                </summary>
                <div className="space-y-2 px-3 pb-3">
                  {otherResults.map(check => <CheckItem key={check.id} check={check} />)}
                </div>
              </details>
            )}
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
