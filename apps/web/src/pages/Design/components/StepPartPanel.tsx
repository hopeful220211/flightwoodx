import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { Pencil } from 'lucide-react'
import { STEP_CATEGORIES, STEP_INFO } from '@fwx/parts-schema'
import type { BuildStep, PartCategory } from '@fwx/parts-schema'
import { partsData } from '../../../data/parts'
import { useDesignStore } from '../../../stores/designStore'
import { prefetchAndExtractConnectors } from '../../../hooks/usePartConnectors'
import type { Part } from '../../../types/design'

interface StepPartPanelProps {
  currentStep: BuildStep
  onPartClick: (part: Part) => void
  onPartDragStart: (partId: string) => void
  pendingPartId?: string | null
}

export function StepPartPanel({ currentStep, onPartClick, onPartDragStart, pendingPartId }: StepPartPanelProps) {
  const navigate = useNavigate()
  const info = STEP_INFO[currentStep]
  const categories = STEP_CATEGORIES[currentStep]

  const filteredParts = useMemo(() => {
    if (currentStep === 'REVIEW') return []
    return partsData.filter(p => categories.includes(p.category as PartCategory))
  }, [currentStep, categories])

  if (currentStep === 'REVIEW') {
    return (
      <div className="p-4">
        <h3 className="text-sm font-bold text-gray-700 mb-2">第 {info.number} 步 · {info.label}</h3>
        <p className="text-xs text-gray-500">核对零件、连接和左右位置。</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-700">
          第 {info.number} 步 · {info.label}
          {(info as { optional?: boolean }).optional && (
            <span className="ml-1 text-xs font-normal text-ink-400">（可跳过）</span>
          )}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">{info.description}</p>
      </div>

      {filteredParts.length > 0 && (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 md:grid-cols-2 gap-2">
            {/* 自己画一个 —— 现成零件不合意时，就地跳去绘制工坊（RFC-021） */}
            <button
              type="button"
              onClick={() => navigate('/part-studio')}
              className="group flex flex-col rounded-xl border border-dashed border-sky-300 bg-sky-50/40 p-2 transition hover:-translate-y-0.5 hover:border-sky-400 hover:bg-sky-50"
            >
              <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-white text-sky-500 transition group-hover:scale-105">
                <Pencil size={22} />
              </div>
              <p className="mt-1.5 truncate text-center text-xs font-medium text-sky-600">绘制零件</p>
            </button>
            {filteredParts.map(part => (
              <button
                type="button"
                key={part.id}
                onClick={() => onPartClick(part)}
                disabled={!!pendingPartId}
                aria-label={`添加${part.name}`}
                aria-busy={pendingPartId === part.id}
                className="group rounded-xl bg-white ring-1 ring-gray-100 p-2 cursor-pointer transition-all duration-200 hover:ring-sky-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                {part.thumbnailUrl ? (
                  <img
                    src={part.thumbnailUrl}
                    alt={part.name}
                    className="w-full aspect-square object-contain bg-gray-50 rounded-lg"
                    loading="lazy"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', part.id)
                      e.dataTransfer.effectAllowed = 'move'
                      void prefetchAndExtractConnectors(part.modelUrl)
                      onPartDragStart(part.id)
                    }}
                    onDragEnd={() => useDesignStore.getState().setDraggingPartId(null)}
                  />
                ) : (
                  <div
                    className="w-full aspect-square bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', part.id)
                      e.dataTransfer.effectAllowed = 'move'
                      void prefetchAndExtractConnectors(part.modelUrl)
                      onPartDragStart(part.id)
                    }}
                    onDragEnd={() => useDesignStore.getState().setDraggingPartId(null)}
                  >
                    3D
                  </div>
                )}
                <p className="text-xs text-gray-600 mt-1.5 truncate text-center group-hover:text-sky-700">{pendingPartId === part.id ? '正在添加…' : part.name}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {filteredParts.length === 0 && (
        <div className="p-4 text-center text-xs text-gray-400">此步骤暂无可选零件</div>
      )}
    </div>
  )
}
