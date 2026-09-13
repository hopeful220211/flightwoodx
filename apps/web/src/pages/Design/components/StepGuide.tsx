import { STEP_INFO } from '@fwx/parts-schema'
import type { BuildStep } from '@fwx/parts-schema'

interface StepGuideProps {
  currentStep: BuildStep
  canAdvance: boolean
  advanceReason?: string
}

const STEP_HELP: Record<BuildStep, string> = {
  HUB: '主板用于连接其他零件。选择形状后，在三维视图中查看连接位置。',
  ARM: '本步骤安装起落架。选择零件后，检查其与主板的连接位置。',
  GUARD: '保护板有不同形状和连接方式。选择零件后，查看它与已装部件的位置关系。',
  DECO: '可添加装饰件或衔接件，并检查连接位置。本步骤可以跳过。',
  REVIEW: '核对已装零件、连接与位置对称性。检查结果不代表实物结构安全或真实飞行表现。',
}

export function StepGuide({ currentStep, canAdvance, advanceReason }: StepGuideProps) {
  const info = STEP_INFO[currentStep]
  const help = STEP_HELP[currentStep]

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-800">
          第 {info.number} 步 · {info.label}
        </h3>
        <p className="text-sm text-gray-600 mt-1">{info.description}</p>
      </div>

      <div className="bg-sky-50 border border-sky-100 rounded-lg p-3">
        <p className="text-xs text-sky-700">{help}</p>
      </div>

      {!canAdvance && advanceReason && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-700">{advanceReason}</p>
        </div>
      )}

      {canAdvance && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs text-green-700">本步骤已满足继续条件。</p>
        </div>
      )}
    </div>
  )
}
