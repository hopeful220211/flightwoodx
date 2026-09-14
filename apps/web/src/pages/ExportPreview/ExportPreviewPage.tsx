import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useDesignStore } from '../../stores/designStore'
import { ExportHeroSection } from './HeroSection'
import { FlightCheckReport } from './FlightCheckReport'
import { FlightStats } from './FlightStats'
import { PartsList } from './PartsList'
import { MaterialPreparation } from './MaterialPreparation'
import { ExportActions } from './ExportActions'
import { runAllChecks } from '../../utils/exportChecks'
import { calculateStats } from '../../utils/designStats'
import { estimateMaterial } from '../../utils/materialEstimate'

export function ExportPreviewPage() {
  const { designId } = useParams<{ designId: string }>()
  const navigate = useNavigate()
  const design = useDesignStore(s => s.designs.find(d => d.id === designId))
  const hasCustomParts = design?.parts.some(part => part.source) ?? false

  const checks = useMemo(() => design ? runAllChecks(design.parts) : [], [design])
  const stats = useMemo(() => design ? calculateStats(design.parts) : null, [design])
  const materialEst = useMemo(() => design ? estimateMaterial(design.parts) : null, [design])

  if (!design) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-sky-50">
        <p className="text-lg text-ink-600 mb-4">未找到该设计</p>
        <button
          onClick={() => navigate('/design')}
          className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700"
        >
          <ArrowLeft size={16} />
          返回设计工作台
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sky-50">
      {/* Top nav */}
      <div className="sticky top-0 z-20 bg-sky-50/90 backdrop-blur-[12px] border-b border-ink-200/30">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(`/design/${design.id}`)}
            className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900 transition-colors"
          >
            <ArrowLeft size={16} />
            返回工作台
          </button>
        </div>
      </div>

      {/* Section 1: Hero with 3D preview */}
      <ExportHeroSection design={design} />

      {/* Section 2: Flight check report */}
      {hasCustomParts ? <p className="mx-auto max-w-5xl px-4 py-8 text-ink-600">本设计含自由摆放、未连接的自制零件。返回工作台可导出位置和来源记录（JSON）。</p> : <FlightCheckReport checks={checks} />}

      {/* Section 3: Flight stats */}
      {!hasCustomParts && stats && <FlightStats stats={stats} />}

      {/* Section 4: Parts list */}
      <PartsList parts={design.parts} />

      {/* Section 5: Material preparation */}
      {!hasCustomParts && materialEst && <MaterialPreparation estimate={materialEst} />}

      {/* Section 6: Bottom CTA */}
      <ExportActions checks={checks} design={design} />
    </div>
  )
}
