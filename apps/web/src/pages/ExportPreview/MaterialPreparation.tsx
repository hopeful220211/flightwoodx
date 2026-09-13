import { useState } from 'react'
import { Package, Ruler, Lightbulb, ChevronDown } from 'lucide-react'
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
          <h2 className="font-display text-3xl lg:text-[40px] font-semibold text-ink-900">图纸与材料说明</h2>
          <p className="mt-2 text-sm text-ink-600">当前入口可下载设计记录与零件清单，暂不提供切割图。下方列出缺少二维轮廓的零件。</p>
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

        {/* Material estimate */}
        <ScrollReveal delay={200}>
          <div className="mt-6 bg-sky-50 rounded-md p-6">
            <div className="flex items-center gap-2 text-ink-900 font-medium mb-4">
              <Ruler size={18} />
              材料与加工信息
            </div>
            <ul className="space-y-2 text-sm text-ink-700">
              <li>• 切割长度：缺少完整二维轮廓，暂无法计算</li>
              <li>• 板材数量：需根据零件尺寸和排版确认</li>
              <li>• 加工时间：需根据材料及设备参数确认</li>
            </ul>
          </div>
        </ScrollReveal>

        {/* How to use */}
        <ScrollReveal delay={300}>
          <div className="mt-6 bg-accent-sky/10 rounded-md p-6">
            <div className="flex items-center gap-2 text-ink-900 font-medium mb-2">
              <Lightbulb size={18} className="text-accent-gold" />
              加工前需要确认的内容
            </div>
            <p className="text-sm text-ink-600 leading-relaxed">
              当前导出不含切割图，不能直接交给设备加工。
              制作前需准备二维图纸，核对板厚、排版和设备参数；尺寸、公差、材料及连接强度需由教师或制作人员另行确认。
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
