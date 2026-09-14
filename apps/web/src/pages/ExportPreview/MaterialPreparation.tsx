import { useState } from 'react'
import { Package, ChevronDown } from 'lucide-react'
import { ScrollReveal } from '../../components/common/ScrollReveal'
import type { MaterialEstimate } from '../../utils/materialEstimate'

interface MaterialPreparationProps {
  estimate: MaterialEstimate
}

export function MaterialPreparation({ estimate }: MaterialPreparationProps) {
  const [expanded, setExpanded] = useState(estimate.dxfFiles.length <= 5)
  const totalDxfCount = estimate.dxfFiles.reduce((s, f) => s + f.count, 0)
  const visibleFiles = expanded ? estimate.dxfFiles : estimate.dxfFiles.slice(0, 5)

  return (
    <section className="py-12 lg:py-16">
      <div className="mx-auto max-w-5xl px-4">
        <ScrollReveal>
          <h2 className="font-display text-3xl lg:text-[40px] font-semibold text-ink-900">导出内容</h2>
          <p className="mt-2 text-sm text-ink-600">下载设计记录和零件清单。本次不含切割图，缺少二维轮廓的零件如下。</p>
        </ScrollReveal>

        {/* DXF file list */}
        <ScrollReveal delay={100}>
          <div className="mt-8 bg-sky-50 rounded-md p-6">
            <div className="flex items-center gap-2 text-ink-900 font-medium mb-4">
              <Package size={18} />
              缺少二维轮廓的零件（共 {totalDxfCount} 个）
            </div>
            <div className="bg-white rounded-md p-4 font-mono text-sm text-ink-700 space-y-1">
              {visibleFiles.map(f => (
                <p key={f.name}>
                  {f.name}{f.count > 1 ? ` × ${f.count} 个` : ''}
                </p>
              ))}
            </div>
            {!expanded && estimate.dxfFiles.length > 5 && (
              <button
                onClick={() => setExpanded(true)}
                className="mt-2 inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700"
              >
                展开全部（{estimate.dxfFiles.length} 项）
                <ChevronDown size={14} />
              </button>
            )}
          </div>
        </ScrollReveal>

      </div>
    </section>
  )
}
