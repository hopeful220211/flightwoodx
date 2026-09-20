// src/pages/Design/components/DraggablePartCard.tsx
// 注意：此组件需要在 Canvas 外部使用，使用 HTML5 drag and drop
// 拖拽逻辑在 ThreeCanvas 的 DragHandler 中处理
import { useState } from 'react'
import type { Part } from '../../../types/design'

interface DraggablePartCardProps {
  part: Part
  onClick?: () => void
  onDragStart?: (e: React.DragEvent) => void
  onTouchDragStart?: (part: Part, x: number, y: number) => void
}

// 根据零件类别生成图标
function getCategoryIcon(category: string): string {
  const iconMap: Record<string, string> = {
    hub: '⚙️',     // 机身
    body: '🛡️',    // 保护板
    arm: '📏',
    joint: '🔗',
    decoration: '✨',
    landing: '🛬',
  }
  return iconMap[category] || '📦'
}

// 缩略图组件 - 优先使用静态图片，回退到图标
function PartThumb({ name, category, thumbnailUrl }: { name: string; category: string; thumbnailUrl?: string }) {
  const [imageError, setImageError] = useState(false)
  const icon = getCategoryIcon(category)

  // 如果有预渲染的缩略图且未加载失败，使用静态图片
  if (thumbnailUrl && !imageError) {
    return (
      <img
        src={thumbnailUrl}
        alt={name}
        className="w-full h-full object-contain bg-gradient-to-br from-sky-50 to-sky-100 dark:from-slate-800 dark:to-slate-900"
        draggable={false}
        onError={() => {
          console.warn(`Failed to load thumbnail: ${thumbnailUrl}`)
          setImageError(true)
        }}
      />
    )
  }

  // 回退方案：图标 + 文字
  return (
    <div className="w-full h-full bg-gradient-to-br from-sky-50 to-sky-100 dark:from-slate-700 dark:to-slate-800 flex flex-col items-center justify-center gap-1 p-2">
      <span className="text-3xl">{icon}</span>
      <span className="text-xs text-sky-700 dark:text-slate-400 text-center leading-tight">{name}</span>
    </div>
  )
}

export function DraggablePartCard({ part, onClick, onDragStart, onTouchDragStart }: DraggablePartCardProps) {
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (touch && onTouchDragStart) {
      const startX = touch.clientX
      const startY = touch.clientY

      const handleTouchMove = (moveEvent: TouchEvent) => {
        const moveTouch = moveEvent.touches[0]
        if (moveTouch) {
          const dx = Math.abs(moveTouch.clientX - startX)
          const dy = Math.abs(moveTouch.clientY - startY)
          // 移动超过 10px 才开始拖拽
          if (dx > 10 || dy > 10) {
            onTouchDragStart(part, moveTouch.clientX, moveTouch.clientY)
            document.removeEventListener('touchmove', handleTouchMove)
          }
        }
      }

      const handleTouchEnd = () => {
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)
      }

      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd)
    }
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', part.id)
        e.dataTransfer.effectAllowed = 'copy'
        onDragStart?.(e)
      }}
      onTouchStart={handleTouchStart}
      onClick={onClick}
      style={{ touchAction: 'none' }}
      className="flex flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing"
    >
      <div className="w-[100px] h-[100px] overflow-hidden rounded-lg ring-1 ring-black/5 transition-transform hover:scale-[1.03] hover:shadow-md dark:ring-white/10">
        <PartThumb name={part.name} category={part.category} thumbnailUrl={part.thumbnailUrl} />
      </div>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[100px] text-center">
        {part.name}
      </span>
    </div>
  )
}
