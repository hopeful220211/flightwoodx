import { useEffect, useId, useState } from 'react'
import type { SketchShape } from '../sketch/model'
import { controlClass } from './sketchToolConfig'
export type { SketchTool } from './sketchToolConfig'

/** Keep incomplete numeric input local. Only finite, bounded values change geometry. */
export function DimensionInput({ label, value, min = 0.1, max = 2000, disabled = false, onChange, onEditingChange }: { label: string; value: number | undefined; min?: number; max?: number; disabled?: boolean; onChange: (value: number) => void; onEditingChange?: (id: string, blocked: boolean) => void }) {
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
  return <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
    {label}<input aria-label={`${label}（毫米）`} type="number" min={min} max={max} step="0.1" disabled={disabled} placeholder="—" value={draft ?? value ?? ''} aria-invalid={invalid}
      title={invalid ? `请输入${min}至${max}毫米` : `${label}，单位毫米`}
      className={`h-9 w-[72px] min-w-0 rounded-lg border bg-white px-2 text-sm text-sky-950 outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-slate-50 disabled:text-slate-400 ${invalid ? 'border-red-500' : 'border-sky-200'}`}
      onChange={event => { setDraft(event.target.value); setInvalid(false); onEditingChange?.(inputId, true) }}
      onBlur={event => commit(event.currentTarget.value)}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(event.currentTarget.value) }; if (event.key === 'Escape') { setDraft(null); setInvalid(false); onEditingChange?.(inputId, false) } }} />
    <span className="text-slate-400">mm</span>
  </label>
}

export function ShapeParameters({ shape, onChange, onEditingChange }: { shape: SketchShape | undefined; onChange: (shape: SketchShape) => void; onEditingChange?: (id: string, blocked: boolean) => void }) {
  // Reserve the same controls even without a selection; pointer coordinates
  // must not change while the parameter panel updates.
  return <fieldset aria-label="图形参数" disabled={!shape} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
    <DimensionInput label="X" value={shape?.x} min={-2000} onEditingChange={onEditingChange} onChange={x => shape && onChange({ ...shape, x })} />
    <DimensionInput label="Y" value={shape?.y} min={-2000} onEditingChange={onEditingChange} onChange={y => shape && onChange({ ...shape, y })} />
    <DimensionInput label="宽" value={shape?.width} onEditingChange={onEditingChange} onChange={width => shape && onChange({ ...shape, width, radius: Math.min(shape.radius, width / 2) })} />
    <DimensionInput label="高" value={shape?.height} onEditingChange={onEditingChange} onChange={height => shape && onChange({ ...shape, height, radius: Math.min(shape.radius, height / 2) })} />
    <DimensionInput label="圆角" value={shape?.kind === 'rectangle' ? shape.radius : undefined} disabled={shape?.kind !== 'rectangle'} onEditingChange={onEditingChange} min={0} max={shape ? Math.min(shape.width, shape.height) / 2 : 2000} onChange={radius => shape && onChange({ ...shape, radius })} />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!shape?.mirror} onChange={event => shape && onChange({ ...shape, mirror: event.target.checked })} />左右镜像</label>
    <label className="flex items-center gap-2 text-xs">形状用途<select aria-label="形状用途" value={shape?.operation ?? 'add'} onChange={event => shape && onChange({ ...shape, operation: event.target.value as 'add' | 'cut' })} className={controlClass}><option value="add">实体</option><option value="cut">切除</option></select></label>
  </fieldset>
}
