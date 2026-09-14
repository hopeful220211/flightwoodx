import { ArrowRight, Rocket, CheckCircle2 } from 'lucide-react'
import type { BuildStep } from '@fwx/parts-schema'
import { getNextStep } from '@fwx/parts-schema'

export interface FlightSummary {
  passedCount: number
  totalChecks: number
  canTakeoff: boolean
  primaryFix: string | null
}

interface StepActionsProps {
  currentStep: BuildStep
  canAdvance: boolean
  onAdvance: () => void
  onGoBack: () => void
  onReset: () => void
  onSave?: () => void
  onExportList?: () => void
  onContinueCoding?: () => void
  /** AR 试飞入口已从界面收起（路由 /design/ar-flight 与页面保留）；恢复时重新解构并渲染按钮。 */
  onArFlight?: () => void
  /** 最后一步的结构与证据检查。 */
  onRunFlightTest?: () => void
  /** 是否已通过带工程证据的完整检查（决定是否展示成功动作区）。 */
  flightPassed?: boolean
  flightSummary?: FlightSummary
}

export function StepActions({
  currentStep,
  canAdvance,
  onAdvance,
  onGoBack,
  onReset,
  onSave,
  onExportList,
  onContinueCoding,
  onRunFlightTest,
  flightPassed,
  flightSummary,
}: StepActionsProps) {
  const isFirstStep = currentStep === 'HUB'
  // RFC-022：最后一步用 getNextStep === null 判定，不再硬编码 'REVIEW'
  const isLastStep = getNextStep(currentStep) === null

  if (!isLastStep) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
        <button
          onClick={onGoBack}
          disabled={isFirstStep}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← 上一步
        </button>
        <button
          onClick={onReset}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-red-500 border border-gray-200 rounded-md hover:border-red-200"
        >
          重置本步
        </button>
        <button
          onClick={onAdvance}
          disabled={!canAdvance}
          className="px-5 py-2 text-sm font-medium text-white bg-sky-500 rounded-md hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          下一步 →
        </button>
      </div>
    )
  }

  // ── 最后一步：结构与证据检查 ──
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-3 bg-white border-t border-gray-100">
      {/* 左：返回修改 */}
      <button
        onClick={onGoBack}
        className="shrink-0 px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
      >
        ← 返回修改
      </button>

      {/* 中：状态摘要 / 阻塞提示 / 成功语 */}
      <div className="order-first w-full min-w-0 text-center md:order-none md:w-auto md:flex-1">
        {flightPassed ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-600">
            <CheckCircle2 size={16} /> 检查通过
          </span>
        ) : flightSummary ? (
          <div className="text-sm">
            <span className="text-ink-900 font-medium">
              已通过 {flightSummary.passedCount}/{flightSummary.totalChecks} 项检查
            </span>
          </div>
        ) : null}
      </div>

      {/* 右：主 + 次 动作 */}
      {flightPassed ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={onExportList}
            className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
          >
            导出清单
          </button>
          <button
            onClick={onSave}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-green-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-600"
          >
            完成 <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={onSave}
            className="whitespace-nowrap rounded-full border border-sky-500 bg-white px-5 py-2 text-sm font-medium text-sky-600 hover:bg-sky-50"
          >
            保存草稿
          </button>
          <button
            onClick={onRunFlightTest}
            className="inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-full bg-sky-500 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-600"
          >
            <Rocket size={18} /> 结构检查
          </button>
        </div>
      )}
      <button type="button" onClick={onContinueCoding} className="inline-flex items-center justify-center gap-1 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
        继续积木编程 <ArrowRight size={16} />
      </button>
    </div>
  )
}
