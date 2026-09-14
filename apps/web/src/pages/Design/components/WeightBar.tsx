import { useMemo } from 'react'
import { useDesignStore } from '../../../stores/designStore'
import { summarizeCatalogueWeight, getWeightColor, getWeightTextColor } from '../../../utils/realtimeChecks'

/** Catalogue estimate and data coverage; the bar is not a physical mass or flight limit. */
export function WeightBar() {
  const activeDesign = useDesignStore(s => s.getActiveDesign())
  const parts = activeDesign?.parts

  const estimate = useMemo(() => summarizeCatalogueWeight(parts ?? []), [parts])
  const count = parts?.length ?? 0
  const pct = count > 0 ? estimate.knownCount / count * 100 : 0
  const barColor = getWeightColor(estimate.knownWeightG)
  const textColor = getWeightTextColor(estimate.knownWeightG)

  return (
    <div className="px-4 py-2 bg-white border-b border-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs mb-1">
        <span className="text-ink-600">
          目录质量估算：<span className={`font-semibold ${textColor}`}>{estimate.knownCount > 0 ? `${estimate.knownWeightG.toFixed(1)}g` : '—'}</span>
        </span>
        <span className={`font-semibold ${textColor}`}>
          {estimate.knownCount}/{count} 个零件有目录数据
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {estimate.missingCount > 0 && <p className="mt-1 text-xs text-gray-500">{estimate.missingCount} 个零件缺少质量数据</p>}
    </div>
  )
}
