import { Weight, Gauge, Scaling, Clock } from 'lucide-react'
import { ScrollReveal } from '../../components/common/ScrollReveal'
import type { DesignStats } from '../../utils/designStats'
import { getWeightLabel, getThrustLabel, getSymmetryLabel, getFlightTimeLabel } from '../../utils/designStats'

interface FlightStatsProps {
  stats: DesignStats
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  status: { text: string; ok: boolean }
  delay: number
}

function StatCard({ icon, label, value, status, delay }: StatCardProps) {
  return (
    <ScrollReveal delay={delay}>
      <div className="bg-sky-50 rounded-md p-6 lg:p-8 text-center">
        <div className="flex justify-center text-ink-400 mb-2">{icon}</div>
        <p className="font-display text-sm font-medium text-ink-600">{label}</p>
        <p className="font-display text-4xl lg:text-[48px] font-semibold text-ink-900 mt-2">{value}</p>
        <p className={`text-sm mt-2 ${status.ok ? 'text-accent-leaf' : 'text-accent-gold'}`}>
          {status.text} {status.ok ? '✓' : ''}
        </p>
      </div>
    </ScrollReveal>
  )
}

export function FlightStats({ stats }: FlightStatsProps) {
  return (
    <section className="py-12 lg:py-16">
      <div className="mx-auto max-w-5xl px-4">
        <ScrollReveal>
          <h2 className="font-display text-3xl lg:text-[40px] font-semibold text-ink-900">设计参数</h2>
          <p className="mt-3 text-sm text-ink-600">目录质量与设计坐标仅作结构参考；整机质量、动力和续航尚未经过实测验证。</p>
        </ScrollReveal>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            icon={<Weight size={20} />}
            label="目录质量小计（估算）"
            value={stats.weightKnownCount > 0 ? `${stats.totalWeightG.toFixed(1)}g` : '—'}
            status={getWeightLabel(stats.totalWeightG, stats.weightMissingCount)}
            delay={100}
          />
          <StatCard
            icon={<Gauge size={20} />}
            label="推重比"
            value={stats.thrustWeightRatio !== null ? `${stats.thrustWeightRatio} : 1` : '--'}
            status={getThrustLabel(stats.thrustWeightRatio)}
            delay={200}
          />
          <StatCard
            icon={<Scaling size={20} />}
            label="坐标镜像匹配率"
            value={`${stats.symmetryPercent}%`}
            status={getSymmetryLabel(stats.symmetryPercent)}
            delay={300}
          />
          <StatCard
            icon={<Clock size={20} />}
            label="续航数据"
            value={stats.estimatedFlightMinutes !== null ? `${stats.estimatedFlightMinutes} 分钟` : '--'}
            status={getFlightTimeLabel(stats.estimatedFlightMinutes)}
            delay={400}
          />
        </div>
      </div>
    </section>
  )
}
