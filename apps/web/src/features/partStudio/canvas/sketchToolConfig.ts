import { MousePointer2, Square, Circle, Pentagon, Pencil, PenTool, CircleDot, RectangleHorizontal, createLucideIcon, type LucideIcon } from 'lucide-react'

const InsertSlotIcon = createLucideIcon('InsertSlot', [
  ['path', { d: 'M3 5h5v14h8V5h5', key: 'open-notch' }],
  ['circle', { cx: '12', cy: '19', r: '1.5', fill: 'currentColor', key: 'bottom' }],
])

export type SketchTool = 'select' | 'rectangle' | 'ellipse' | 'polygon' | 'pen' | 'freehand' | 'circle-hole' | 'slot' | 'insert-slot'
export const TOOL_ITEMS: { key: SketchTool; label: string; icon: LucideIcon }[] = [
  { key: 'select', label: '选择', icon: MousePointer2 },
  { key: 'rectangle', label: '矩形', icon: Square },
  { key: 'ellipse', label: '圆形', icon: Circle },
  { key: 'polygon', label: '多边形', icon: Pentagon },
  { key: 'pen', label: '钢笔', icon: PenTool },
  { key: 'freehand', label: '自由画', icon: Pencil },
  { key: 'circle-hole', label: '圆孔', icon: CircleDot },
  { key: 'slot', label: '孔 / 开口', icon: RectangleHorizontal },
  { key: 'insert-slot', label: '插接口', icon: InsertSlotIcon },
]
export const controlClass = 'min-h-10 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-sky-900 outline-none transition hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-40'
