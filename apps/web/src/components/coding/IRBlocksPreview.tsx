/**
 * IRBlocksPreview — 把真实的 CommandProgram 渲染成「只读积木」外观。
 *
 * 不依赖 Blockly 引擎（轻量、无额外 WebGL/SVG workspace），
 * 直接遍历指令协议 IR，按积木的中文文案与配色画出来——
 * 文案/颜色与 src/blockly/blocks.ts 的真积木保持一致。
 */
import type { Command, Condition, Direction, Axis } from '@fwx/shared'

// 与 blocks.ts 一致的四组配色
const COLOR_ACTION = '#4AA3F0' // 飞行动作
const COLOR_SENSOR = '#3EB489' // 传感器
const COLOR_LOGIC = '#D4A74A' // 逻辑
const COLOR_LOOP = '#a67038' // 循环

const DIR_LABEL: Record<Direction, string> = {
  forward: '前', back: '后', left: '左', right: '右', up: '上', down: '下',
}
const AXIS_LABEL: Record<Axis, string> = { forward: '前后', lateral: '左右', vertical: '上下' }
const SENSOR_LABEL: Record<Condition['sensor'], string> = {
  frontDistanceCm: '前方距离', downDistanceCm: '下方距离', battery: '电池',
}

function condText(c: Condition): string {
  return `${SENSOR_LABEL[c.sensor]} ${c.op} ${c.value}`
}

interface BlockMeta {
  label: string
  color: string
  branches?: { title: string; body: Command[] }[]
}

function metaOf(cmd: Command): BlockMeta {
  switch (cmd.type) {
    case 'takeoff':
      return { label: `起飞到 ${cmd.params.altitudeCm} 厘米`, color: COLOR_ACTION }
    case 'land':
      return { label: '降落', color: COLOR_ACTION }
    case 'move':
      return { label: `移动 ${DIR_LABEL[cmd.params.direction]} ${cmd.params.distanceCm} 厘米`, color: COLOR_ACTION }
    case 'rotate':
      return { label: `旋转 ${cmd.params.degrees}°`, color: COLOR_ACTION }
    case 'hover':
      return { label: `悬停 ${cmd.params.durationMs} 毫秒`, color: COLOR_ACTION }
    case 'led':
      return { label: `LED 灯 ${cmd.params.r},${cmd.params.g},${cmd.params.b}`, color: COLOR_ACTION }
    case 'waitUntil':
      return { label: `等待直到 ${condText(cmd.params.condition)}`, color: COLOR_LOGIC }
    case 'lockAxis':
      return { label: `锁定轴 ${cmd.params.axes.map((a) => AXIS_LABEL[a]).join(' ')}`, color: COLOR_LOGIC }
    case 'ifElse':
      return {
        label: `如果 ${condText(cmd.params.condition)}`,
        color: COLOR_LOGIC,
        branches: [
          { title: '那么', body: cmd.params.then },
          ...(cmd.params.else ? [{ title: '否则', body: cmd.params.else }] : []),
        ],
      }
    case 'repeat':
      return { label: `重复 ${cmd.params.times} 次`, color: COLOR_LOOP, branches: [{ title: '执行', body: cmd.params.body }] }
    case 'while':
      return { label: `当 ${condText(cmd.params.condition)}`, color: COLOR_LOOP, branches: [{ title: '循环', body: cmd.params.body }] }
  }
}

function isSensorTinted(cmd: Command): boolean {
  // 传感器条件以独立小标签出现在父块标题里，这里仅给含条件的块加一抹传感器色点缀
  return cmd.type === 'waitUntil' || cmd.type === 'ifElse' || cmd.type === 'while'
}

function BlockRow({ cmd }: { cmd: Command }) {
  const meta = metaOf(cmd)
  return (
    <div className="flex flex-col">
      <div
        className="inline-flex w-fit items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-xs font-semibold leading-none text-white shadow-sm"
        style={{ backgroundColor: meta.color }}
      >
        {isSensorTinted(cmd) && (
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_SENSOR }} />
        )}
        {meta.label}
      </div>
      {meta.branches?.map((br, i) => (
        <div
          key={i}
          className="ml-2 mt-1 border-l-2 pl-2.5"
          style={{ borderColor: meta.color }}
        >
          <span className="text-xs font-medium text-ink-400">{br.title}</span>
          <div className="mt-1 flex flex-col gap-1">
            {br.body.length > 0 ? (
              br.body.map((c, j) => <BlockRow key={j} cmd={c} />)
            ) : (
              <span className="text-xs text-ink-300">（空）</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function IRBlocksPreview({ commands }: { commands: Command[] }) {
  return (
    <div className="pointer-events-none flex h-full w-full flex-col justify-center overflow-hidden p-4">
      <div className="flex flex-col gap-1">
        {commands.map((cmd, i) => (
          <BlockRow key={i} cmd={cmd} />
        ))}
      </div>
    </div>
  )
}
