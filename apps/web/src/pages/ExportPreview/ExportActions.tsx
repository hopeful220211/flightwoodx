import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, XCircle } from 'lucide-react'
import { ScrollReveal } from '../../components/common/ScrollReveal'
import { useToast } from '../../components/common/Toast'
import { downloadExportZip } from '../../utils/exportBundle'
import type { CheckResult } from '../../utils/exportChecks'
import type { Design } from '../../types/design'
import { trackEvent } from '../../features/analytics/client'

interface ExportActionsProps {
  checks: CheckResult[]
  design: Design
}

export function ExportActions({ checks, design }: ExportActionsProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const hasBlockingErrors = checks.some(c => c.level === 'error')
  const errorCount = checks.filter(c => c.level === 'error').length
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)

  const handleExport = async () => {
    if (hasBlockingErrors || exporting) return
    setExporting(true)

    try {
      // 前端生成设计导出包（DXF/SVG + BOM + 装配说明 + manifest）并下载，无需服务端。
      const { generatedParts, pending2D } = await downloadExportZip(design)
      trackEvent('export_prepared', { designId: design.id, availableCount: generatedParts.length, missingCount: pending2D.length })
      const msg =
        pending2D.length > 0
          ? `设计记录与零件清单已下载（切割图：${generatedParts.length} 种；缺少二维轮廓：${pending2D.length} 种零件）`
          : '设计记录与零件清单已下载，当前入口不提供切割图'
      toast.push('success', msg)
      setExported(true)
      setTimeout(() => setExported(false), 3000)
    } catch (e) {
      trackEvent('operation_failed', { operation: 'export', reason: 'unknown' })
      toast.push('error', e instanceof Error ? e.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="py-12 lg:py-16 bg-white">
      <div className="mx-auto max-w-5xl px-4">
        <ScrollReveal>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate(`/design/${design.id}`)}
              className="inline-flex w-fit items-center whitespace-nowrap px-6 py-3 text-sm font-medium text-ink-900 border border-ink-200 rounded-md hover:bg-sky-50 transition-colors"
            >
              返回继续修改
            </button>
            <button
              onClick={handleExport}
              disabled={hasBlockingErrors || exporting}
              className="group inline-flex w-fit items-center gap-2 whitespace-nowrap px-6 py-3 text-sm font-medium text-white bg-sky-500 rounded-md hover:brightness-[0.92] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {exported ? '✓ 已下载' : exporting ? '正在打包...' : hasBlockingErrors ? '请先处理检查错误' : '导出设计记录'}
              {!exporting && !exported && !hasBlockingErrors && (
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              )}
            </button>
          </div>

          {hasBlockingErrors && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[#E04545]">
              <XCircle size={16} />
              请先处理 {errorCount} 项检查错误
            </div>
          )}
        </ScrollReveal>
      </div>
    </section>
  )
}
