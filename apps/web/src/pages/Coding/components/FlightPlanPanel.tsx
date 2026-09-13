/**
 * FlightPlanPanel —— 编程器右侧面板。
 *
 * 默认给孩子看「飞行计划」（大白话步骤）；右上角开关切到「开发者视图」，
 * 才显示原始指令协议 IR（JSON）。原始 IR 始终在后台照常生成，这里只是
 * 把它从孩子默认视图收起来。
 */
import { useState } from 'react'
import {
  PlaneTakeoff, PlaneLanding, MoveRight, RotateCw, Timer, Lightbulb,
  Split, CornerDownRight, Repeat, RefreshCw, Hourglass, Lock,
  ListChecks, Code2, AlertCircle, Eye,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { serializeProgram, type CommandProgram } from '@fwx/shared'
import { describeProgram, type PlanLineKind } from '../../../blockly/flightPlan'

const KIND_ICON: Record<PlanLineKind, LucideIcon> = {
  takeoff: PlaneTakeoff,
  land: PlaneLanding,
  move: MoveRight,
  rotate: RotateCw,
  hover: Timer,
  led: Lightbulb,
  if: Split,
  else: CornerDownRight,
  repeat: Repeat,
  while: RefreshCw,
  waitUntil: Hourglass,
  lockAxis: Lock,
}

interface FlightPlanPanelProps {
  ir: CommandProgram | null
  compileError: string | null
}

export function FlightPlanPanel({ ir, compileError }: FlightPlanPanelProps) {
  const [devView, setDevView] = useState(false)
  const lines = ir ? describeProgram(ir) : []

  return (
    <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-sky-100 bg-slate-50 flex flex-col min-h-0 max-h-[45vh] lg:max-h-none">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-sky-100 px-4 py-2.5">
        {devView ? <Code2 size={16} className="text-sky-500" /> : <ListChecks size={16} className="text-sky-500" />}
        <h3 className="text-sm font-semibold text-ink-700">{devView ? '程序指令数据（IR）' : '飞行计划'}</h3>
        {lines.length > 0 && (
          <span className="ml-auto text-xs text-ink-400">{lines.length} 步</span>
        )}
        <button
          type="button"
          onClick={() => setDevView(v => !v)}
          className={`${lines.length > 0 ? 'ml-2' : 'ml-auto'} inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition hover:bg-sky-100 ${devView ? 'text-sky-600' : 'text-ink-400'}`}
          title={devView ? '查看程序步骤' : '查看程序指令数据（IR）'}
        >
          {devView ? <Eye size={13} /> : <Code2 size={13} />}
          <span className="hidden sm:inline">{devView ? '飞行计划' : '开发者'}</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        {compileError ? (
          <div className="flex items-start gap-2 rounded-lg bg-error/10 p-3">
            <AlertCircle size={16} className="text-error mt-0.5 shrink-0" />
            <div className="text-sm text-error">{compileError}</div>
          </div>
        ) : devView ? (
          ir ? (
            <pre className="rounded-lg bg-white border border-sky-100 p-3 font-mono text-xs text-ink-600 whitespace-pre-wrap break-all">
              {serializeProgram(ir)}
            </pre>
          ) : (
            <p className="text-sm text-ink-400 text-center py-8">暂无可显示的程序指令数据</p>
          )
        ) : lines.length > 0 ? (
          <ol className="space-y-1.5">
            {lines.map((line, i) => {
              const Icon = KIND_ICON[line.kind]
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-white border border-sky-100/70 px-2.5 py-1.5 text-sm text-ink-700"
                  style={{ marginLeft: line.depth * 16 }}
                >
                  <Icon size={15} className="shrink-0 text-sky-500" />
                  <span className="flex-1">{line.text}</span>
                  {line.colorHex && (
                    <span
                      className="h-4 w-4 shrink-0 rounded border border-black/10"
                      style={{ backgroundColor: line.colorHex }}
                    />
                  )}
                </li>
              )
            })}
          </ol>
        ) : (
          <div className="text-center py-8">
            <ListChecks size={32} className="mx-auto text-sky-200 mb-2" />
            <p className="text-sm text-ink-400">连接积木后，这里按顺序显示程序步骤。</p>
            <p className="text-xs text-ink-400 mt-1">从工具箱拖入积木并设置参数。</p>
          </div>
        )}
      </div>
    </div>
  )
}
