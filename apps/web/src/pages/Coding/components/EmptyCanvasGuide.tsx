/**
 * EmptyCanvasGuide —— 空画布友好引导覆盖层。
 *
 * 孩子第一次打开编程器是「0 条指令」的空白，容易不知从何下手。
 * 这层叠在 Blockly 画布上，给一句鼓励 +「从示例开始」按钮。
 *
 * 关键：容器 pointer-events-none，不挡住把积木拖进画布 / 缩放 / 工具箱 flyout；
 * 只有中间这张卡片 pointer-events-auto，让按钮可点。
 */
import { Blocks, Wand2 } from 'lucide-react'
import { Button } from '../../../components/common/Button'

interface EmptyCanvasGuideProps {
  onLoadExample: () => void
}

export function EmptyCanvasGuide({ onLoadExample }: EmptyCanvasGuideProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      {/* 卡片本身不拦事件，孩子仍能把积木拖到画布中央；只有按钮可点 */}
      <div className="max-w-xs rounded-2xl bg-white/90 backdrop-blur border border-sky-100 px-6 py-7 text-center shadow-soft">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50">
          <Blocks size={28} className="text-sky-400" />
        </div>
        <h3 className="text-base font-semibold text-ink-700">编写飞行程序</h3>
        <p className="mt-1.5 text-sm text-ink-500">
          将工具箱中的积木拖入画布并依次连接，设置动作和参数。
        </p>
        <Button size="sm" className="pointer-events-auto mt-4 w-full" onClick={onLoadExample} leftIcon={<Wand2 size={15} />}>
          从示例开始
        </Button>
        <p className="mt-2 text-xs text-ink-400">运行后在模拟场景中查看指令执行过程。</p>
      </div>
    </div>
  )
}
