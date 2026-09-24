import { Boxes, Cable, Scale, ScanLine } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PartInstance } from '../../types/design'
import { calculateStats } from '../../utils/designStats'
import { summarizeConnections } from '../../utils/exportChecks'

interface StructureSummaryProps {
  parts: PartInstance[]
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-md border border-sky-200 bg-sky-50 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm text-ink-600">{icon}<span>{label}</span></div>
      <p className="mt-3 break-words text-[26px] font-semibold leading-8 tabular-nums text-ink-900 sm:text-[30px]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-ink-600">{detail}</p>
    </div>
  )
}

export function StructureSummary({ parts }: StructureSummaryProps) {
  const stats = calculateStats(parts)
  const { connectedCount, detachedCount } = summarizeConnections(parts)
  const hasMainboard = parts.some(part => part.category === 'mainboard')
  const hasParts = parts.length > 0

  return (
    <section className="bg-white py-10 lg:py-14" aria-labelledby="structure-summary-heading">
      <div className="mx-auto max-w-5xl px-4">
        <h2 id="structure-summary-heading" className="text-[28px] font-semibold leading-8 tracking-[-.03em] text-ink-900 sm:text-[32px] sm:leading-9">结构数据</h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={<Boxes size={18} aria-hidden="true" />} label="零件总数" value={String(parts.length)} detail={hasParts ? `${new Set(parts.map(part => part.category)).size} 种类别` : '暂无零件'} />
          <Metric icon={<Cable size={18} aria-hidden="true" />} label="已连到主板" value={hasParts ? `${connectedCount} / ${parts.length}` : '—'} detail={!hasParts ? '暂无零件' : !hasMainboard ? '请先添加主板' : detachedCount ? `${detachedCount} 个零件未连接主板` : '连接记录完整'} />
          <Metric icon={<ScanLine size={18} aria-hidden="true" />} label="坐标镜像匹配率" value={hasParts ? `${stats.symmetryPercent}%` : '—'} detail={hasParts ? '同型号零件按 X=0 比较' : '暂无零件'} />
          <Metric icon={<Scale size={18} aria-hidden="true" />} label="目录质量小计" value={stats.weightKnownCount ? `${stats.totalWeightG.toFixed(1)} g` : '—'} detail={stats.weightMissingCount ? `${stats.weightMissingCount} 个零件缺少重量数据` : stats.weightKnownCount ? '按零件目录累计' : '暂无目录重量数据'} />
        </div>
        <details className="mt-5 text-sm text-ink-600">
          <summary className="w-fit cursor-pointer text-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">计算依据与待补数据</summary>
          <div className="mt-3 max-w-3xl space-y-2 leading-6">
            <p>连接关系逐件追溯到主板；镜像匹配比较同型号零件的装配坐标。质量仅累计目录中有记录的零件。</p>
            <p>重心需要全部零件的质量与位置；推重比需要电机、桨和电池组合的实测推力；续航需要可用电量与悬停功率，当前暂无这些数值。</p>
            <p>计算方法参考 <a className="text-sky-600 underline" href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/aircraft-center-of-gravity/" target="_blank" rel="noreferrer">NASA 重心说明</a>、<a className="text-sky-600 underline" href="https://docs.px4.io/main/en/config/actuators" target="_blank" rel="noreferrer">PX4 旋翼布局</a>和 <a className="text-sky-600 underline" href="https://ardupilot.org/copter/docs/motor-thrust-scaling.html" target="_blank" rel="noreferrer">ArduPilot 推力测量</a>。</p>
          </div>
        </details>
      </div>
    </section>
  )
}
