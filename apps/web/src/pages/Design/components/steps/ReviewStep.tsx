import { useMemo } from 'react'
import { Weight, Gauge, Scaling, Clock, CheckCircle2, AlertCircle, Rocket } from 'lucide-react'
import { useDesignStore } from '../../../../stores/designStore'
import {
  calculateStats,
  getWeightLabel,
  getThrustLabel,
  getSymmetryLabel,
  getFlightTimeLabel,
} from '../../../../utils/designStats'
import { flightReadiness } from '../../../../utils/flightReadiness'
import { getAssemblyIssue } from '../../assemblyFeedback'

const CORAL = '#E0653B' // 失败用珊瑚红，不用金黄/琥珀（RFC-022 §3）

/** 单项体检卡：图标 + 儿童词（科学词小字）+ 读数 + 彩色仪表 + 大白话结论。 */
function MetricCard({
  icon,
  name,
  sci,
  value,
  fillPct,
  label,
  ok,
}: {
  icon: React.ReactNode
  name: string
  sci?: string
  value: string
  fillPct?: number
  label: string
  ok: boolean
}) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-gray-100 p-3">
      <div className="flex items-center gap-2">
        <span className="text-sky-400">{icon}</span>
        <span className="text-xs font-medium text-gray-600">{name}</span>
        {sci && <span className="text-xs text-gray-400">{sci}</span>}
        <span className="ml-auto text-sm font-semibold text-ink-900 tabular-nums">{value}</span>
      </div>
      {fillPct !== undefined && <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.max(4, Math.min(100, fillPct))}%`,
            backgroundColor: ok ? '#22C55E' : CORAL,
          }}
        />
      </div>}
      <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
        {label}
      </p>
    </div>
  )
}

/**
 * 第 5 步结构检查报告。真实飞行结论必须另外传入已验证的硬件证据。
 * 儿童词在前、科学词小字在后；总判定接 flightReadiness；失败用蓝/珊瑚红、不用金黄；
 * 空设计显占位 + 下一步动作提示。
 */
export function ReviewStep() {
  const parts = useDesignStore((s) => s.getActiveDesign()?.parts)

  const { stats, weight, symmetry, flight, readiness, isEmpty } = useMemo(() => {
    const p = parts ?? []
    const stats = calculateStats(p)
    return {
      stats,
      weight: getWeightLabel(stats.totalWeightG, stats.weightMissingCount),
      symmetry: getSymmetryLabel(stats.symmetryPercent),
      flight: getFlightTimeLabel(stats.estimatedFlightMinutes),
      readiness: flightReadiness(p),
      isEmpty: p.length === 0,
    }
  }, [parts])

  if (isEmpty) {
    return (
      <div className="p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 text-sky-400">
          <Rocket size={26} />
        </div>
        <p className="text-sm font-semibold text-ink-900">暂无可检查的零件</p>
        <p className="mt-1.5 text-xs text-gray-500">请先完成前面的零件选择与拼装步骤。</p>
      </div>
    )
  }

  const ratio = stats.thrustWeightRatio
  const power = getThrustLabel(ratio)
  const assemblyIssue = getAssemblyIssue(readiness)

  return (
    <div className="p-4 space-y-3">
      {/* 总判定（接 flightReadiness） */}
      <div
        className={`rounded-2xl p-4 text-center ring-1 ${
          readiness.canTakeoff ? 'bg-green-50 ring-green-200' : 'bg-sky-50 ring-sky-200'
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          {readiness.canTakeoff ? (
            <CheckCircle2 size={22} className="text-green-500" />
          ) : (
            <AlertCircle size={22} className="text-sky-500" />
          )}
          <span
            className={`text-lg font-semibold ${
              readiness.canTakeoff ? 'text-green-600' : 'text-sky-700'
            }`}
          >
            {readiness.canTakeoff ? '检查通过' : '装配检查'}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          已通过 {readiness.passedCount}/{readiness.totalChecks} 项检查
        </p>
        {!readiness.canTakeoff && assemblyIssue && <p className="mt-2 text-sm leading-relaxed text-slate-700">{assemblyIssue.message}</p>}
      </div>

      {/* 四项体检（儿童词在前） */}
      <div className="space-y-2.5">
        <MetricCard
          icon={<Weight size={15} />}
          name="重量小计"
          sci="估算"
          value={stats.weightKnownCount > 0 ? `${stats.totalWeightG.toFixed(1)}g` : '—'}
          label={weight.text}
          ok={weight.ok}
        />
        <MetricCard
          icon={<Gauge size={15} />}
          name="动力数据"
          sci="实测推重比"
          value={ratio !== null ? `${ratio}` : '—'}
          label={power.text}
          ok={power.ok}
        />
        <MetricCard
          icon={<Scaling size={15} />}
          name="左右位置匹配率"
          value={`${stats.symmetryPercent}%`}
          fillPct={stats.symmetryPercent}
          label={symmetry.text}
          ok={symmetry.ok}
        />
        <MetricCard
          icon={<Clock size={15} />}
          name="续航数据"
          sci="实测续航"
          value={stats.estimatedFlightMinutes !== null ? `${stats.estimatedFlightMinutes} 分钟` : '—'}
          label={flight.text}
          ok={flight.ok && stats.estimatedFlightMinutes !== null}
        />
      </div>

    </div>
  )
}
