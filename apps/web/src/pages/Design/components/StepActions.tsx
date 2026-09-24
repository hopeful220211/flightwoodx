import { ArrowRight, Blocks, ClipboardCheck } from 'lucide-react'
import type { BuildStep } from '@fwx/parts-schema'
import { getNextStep } from '@fwx/parts-schema'
import { Button } from '../../../components/common/Button'

interface StepActionsProps {
  currentStep: BuildStep
  canAdvance: boolean
  onAdvance: () => void
  onGoBack: () => void
  onReset: () => void
  onReview: () => void
  onContinueCoding: () => void
}

export function StepActions({
  currentStep,
  canAdvance,
  onAdvance,
  onGoBack,
  onReset,
  onReview,
  onContinueCoding,
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-white px-3 py-2 md:px-4 md:py-3">
      <button
        type="button"
        onClick={onGoBack}
        className="min-h-11 shrink-0 px-4 text-sm text-gray-600 hover:text-gray-800"
      >
        ← 返回修改
      </button>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <Button
          data-review-action="structure"
          variant="primary"
          size="md"
          onClick={onReview}
          leftIcon={<ClipboardCheck aria-hidden="true" size={18} />}
          className="w-full font-semibold sm:w-auto"
        >
          检查结构
        </Button>
        <Button
          data-review-action="coding"
          variant="outline"
          size="md"
          onClick={onContinueCoding}
          leftIcon={<Blocks aria-hidden="true" size={18} />}
          rightIcon={<ArrowRight aria-hidden="true" size={16} />}
          className="w-full border-sky-500 font-semibold text-sky-600 sm:w-auto"
        >
          继续积木编程
        </Button>
      </div>
    </div>
  )
}
