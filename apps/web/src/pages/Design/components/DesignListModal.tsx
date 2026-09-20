import { X } from 'lucide-react'
import { STEP_INFO, BUILD_STEPS } from '@fwx/parts-schema'
import type { Design } from '../../../types/design'

interface DesignListModalProps {
  designs: Design[]
  onSelect: (id: string) => void
  onClose: () => void
}

export function DesignListModal({ designs, onSelect, onClose }: DesignListModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">我的设计</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {designs.length === 0 && (
            <p className="text-center text-gray-400 py-8">还没有设计</p>
          )}
          {designs.map(design => {
            const lastIdx = BUILD_STEPS.length - 1
            const mode = design.buildMode ?? 'free'
            const step = design.currentStep ?? 'HUB'
            const reached = design.stepReached ?? (mode === 'free' ? lastIdx : 0)
            // 完成 = 已到达最后一步（结构检查）。reached 是 0 基索引，展示时 +1 还原成人类步号。
            const isComplete = reached >= lastIdx
            const stepLabel = isComplete
              ? '已完成'
              : `${STEP_INFO[step]?.label ?? step}（${Math.min(reached + 1, BUILD_STEPS.length)}/${BUILD_STEPS.length}）`
            const date = new Date(design.updatedAt).toLocaleDateString('zh-CN')

            return (
              <button
                key={design.id}
                onClick={() => onSelect(design.id)}
                className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-sky-300 hover:bg-sky-50/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800 truncate">{design.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    isComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {stepLabel}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                  <span>{date}</span>
                  <span>{design.parts.length} 个零件</span>
                  <span className="capitalize">{mode === 'guided' ? '引导模式' : '自由模式'}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
