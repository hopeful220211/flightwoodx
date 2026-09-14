import { useEffect, useId, useState } from 'react'
import type { SketchShape } from '../sketch/model'
import { USER_PART_THICKNESS_MM } from '@fwx/parts-schema'
export type { SketchTool } from './sketchToolConfig'

/** Keep incomplete numeric input local. Only finite, bounded values change geometry. */
export function DimensionInput({ label, value, min = 0.1, max = 2000, disabled = false, compact = false, onChange, onEditingChange }: { label: string; value: number | undefined; min?: number; max?: number; disabled?: boolean; compact?: boolean; onChange: (value: number) => void; onEditingChange?: (id: string, blocked: boolean) => void }) {
  const inputId = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  useEffect(() => () => onEditingChange?.(inputId, false), [inputId, onEditingChange])
  const commit = (text: string) => {
    if (disabled || value === undefined) return
    const number = Number(text)
    if (!text.trim() || !Number.isFinite(number) || number < min || number > max) { setInvalid(true); onEditingChange?.(inputId, true); return }
    if (Math.round(number * 100) / 100 !== value) onChange(Math.round(number * 100) / 100)
    setDraft(null)
    setInvalid(false)
    onEditingChange?.(inputId, false)
  }
  return <label className={`flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs text-slate-600 ${compact ? 'justify-between' : ''}`}>
    {label}<input aria-label={`${label}（毫米）`} type="number" min={min} max={max} step="0.1" disabled={disabled} placeholder="—" value={draft ?? value ?? ''} aria-invalid={invalid}
      title={invalid ? `请输入${min}至${max}毫米` : `${label}，单位毫米`}
      className={`h-9 min-w-0 rounded-lg border bg-white px-2 text-sm text-sky-950 outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-slate-50 disabled:text-slate-400 ${compact ? 'w-16' : 'w-[72px]'} ${invalid ? 'border-red-500' : 'border-sky-200'}`}
      onChange={event => { setDraft(event.target.value); setInvalid(false); onEditingChange?.(inputId, true) }}
      onBlur={event => commit(event.currentTarget.value)}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(event.currentTarget.value) }; if (event.key === 'Escape') { setDraft(null); setInvalid(false); onEditingChange?.(inputId, false) } }} />
    {!compact && <span className="text-slate-400">mm</span>}
  </label>
}

export function ShapeParameters({ shape, onChange, onEditingChange }: { shape: SketchShape | undefined; onChange: (shape: SketchShape) => void; onEditingChange?: (id: string, blocked: boolean) => void }) {
  const mirror = <label className="flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap text-xs"><input type="checkbox" checked={!!shape?.mirror} onChange={event => shape && onChange({ ...shape, mirror: event.target.checked })} />左右镜像</label>
  return <fieldset aria-label="图形参数" disabled={!shape} className="grid min-w-0 grid-cols-2 items-center gap-2">
    <DimensionInput compact label="X" value={shape?.x} min={-2000} onEditingChange={onEditingChange} onChange={x => shape && onChange({ ...shape, x })} />
    <DimensionInput compact label="Y" value={shape?.y} min={-2000} onEditingChange={onEditingChange} onChange={y => shape && onChange({ ...shape, y })} />
    {shape?.joint ? <>
      <DimensionInput compact label="槽长" value={shape.joint.axis === 'x' ? shape.width : shape.height} min={USER_PART_THICKNESS_MM} onEditingChange={onEditingChange} onChange={length => onChange({ ...shape, ...(shape.joint!.axis === 'x' ? { width: length } : { height: length }) })} />
      <DimensionInput compact label="槽宽" value={USER_PART_THICKNESS_MM} disabled onChange={() => {}} />
      <div className="col-span-2 flex min-w-0 items-center gap-2">
        <label className="min-w-0 flex-1 text-xs"><span className="sr-only">插入方向</span><select aria-label="插入方向" className="h-9 w-full min-w-0 rounded-lg border border-sky-200 px-1.5" value={shape.joint.entry} onChange={event => onChange({ ...shape, joint: { ...shape.joint!, entry: event.target.value as NonNullable<SketchShape['joint']>['entry'] } })}>
          {shape.joint.kind === 'through-slot' ? <><option value="front">从正面插入</option><option value="back">从背面插入</option></> : <><option value="start">{shape.joint.axis === 'x' ? '从左向右' : '从上向下'}</option><option value="end">{shape.joint.axis === 'x' ? '从右向左' : '从下向上'}</option></>}
        </select></label>
        {mirror}
      </div>
    </> : <>
      <DimensionInput compact label="宽" value={shape?.width} onEditingChange={onEditingChange} onChange={width => shape && onChange({ ...shape, width, radius: Math.min(shape.radius, width / 2) })} />
      <DimensionInput compact label="高" value={shape?.height} onEditingChange={onEditingChange} onChange={height => shape && onChange({ ...shape, height, radius: Math.min(shape.radius, height / 2) })} />
      <DimensionInput compact label="圆角" value={shape?.kind === 'rectangle' ? shape.radius : undefined} disabled={shape?.kind !== 'rectangle'} onEditingChange={onEditingChange} min={0} max={shape ? Math.min(shape.width, shape.height) / 2 : 2000} onChange={radius => shape && onChange({ ...shape, radius })} />
      {mirror}
    </>}
  </fieldset>
}
