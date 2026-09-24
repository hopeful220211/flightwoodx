import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useDesignStore } from '../../stores/designStore'
import { useMyDesigns } from '../../hooks/useMyDesigns'
import { ExportHeroSection } from './HeroSection'
import { FlightCheckReport } from './FlightCheckReport'
import { StructureSummary } from './StructureSummary'
import { PartsList } from './PartsList'
import { ExportActions } from './ExportActions'
import { runAllChecks } from '../../utils/exportChecks'
import { Button } from '../../components/common/Button'

export function ExportPreviewPage() {
  const { designId } = useParams<{ designId: string }>()
  const navigate = useNavigate()
  const { isLoading, isError, refetch } = useMyDesigns()
  const design = useDesignStore(s => s.designs.find(d => d.id === designId))

  const checks = useMemo(() => design ? runAllChecks(design.parts) : [], [design])

  if (!design) {
    return (
      <div className="flex min-h-[calc(100dvh-64px)] flex-col items-center justify-center bg-sky-50 px-4 text-center">
        <p role={isLoading ? 'status' : isError ? 'alert' : undefined} className="mb-4 text-base text-ink-700">{isLoading ? '正在加载作品…' : isError ? '作品加载失败，请重试。' : '未找到该设计'}</p>
        {isError && <Button variant="outline" onClick={() => void refetch()} className="mb-3">重新加载</Button>}
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
    <div className="min-h-[calc(100dvh-64px)] bg-sky-50">
      {/* Top nav */}
      <div className="sticky top-16 z-20 border-b border-sky-200 bg-white/95 backdrop-blur-[12px]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(`/design/${design.id}`)}
            className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900 transition-colors"
          >
            <ArrowLeft size={16} />
            返回工作台
          </button>
        </div>
      </div>

      {isError && <div role="status" className="mx-auto max-w-5xl px-4 py-3 text-sm text-ink-600">账号作品暂未同步，当前展示本机内容。<button onClick={() => void refetch()} className="ml-2 text-sky-600 underline">重试</button></div>}

      {/* Section 1: Hero with 3D preview */}
      <ExportHeroSection design={design} />

      {/* Section 2: Computable structure data and review */}
      <StructureSummary parts={design.parts} />
      <FlightCheckReport checks={checks} />

      {/* Section 3: Parts list */}
      <PartsList parts={design.parts} />

      {/* Section 4: Order and export actions */}
      <ExportActions checks={checks} design={design} />
    </div>
  )
}
