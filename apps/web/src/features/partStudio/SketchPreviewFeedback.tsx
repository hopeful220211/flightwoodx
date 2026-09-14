import { AlertCircle, ArrowLeft } from 'lucide-react'
import type { SketchIssue, SketchShape } from './sketch/model'

interface Props {
  error: string | null
  issue?: SketchIssue
  shapes: readonly SketchShape[]
  pending: boolean
  disabled: boolean
  onEdit: (shapeId?: string) => void
}

function describeIssue(issue?: SketchIssue) {
  switch (issue?.code) {
    case 'no-solid': return { title: '还没有木板实体', advice: '先画矩形、圆形或多边形，再开孔。' }
    case 'outside-reference': return { title: '图形超出参考范围', advice: '移回橙色参考框内，或增大参考尺寸。' }
    case 'disconnected': return { title: '图形没有连成一块', advice: '移动实体使其重叠，或调整切孔保留连接。' }
    case 'empty-result': return { title: '木板已被全部切除', advice: '缩小或移开切孔，也可以撤销。' }
    case 'invalid-shape': return { title: '图形轮廓需要修改', advice: '修正尺寸或交叉的轮廓线，也可以撤销。' }
    default: return { title: '当前轮廓无法生成预览', advice: '调整轮廓后重试，或撤销刚才的操作。' }
  }
}

/** One concise, actionable message from the compiler's diagnosis. */
export function SketchPreviewFeedback({ error, issue, shapes, pending, disabled, onEdit }: Props) {
  const invalid = !pending && shapes.length > 0 && !!error
  if (!invalid) return null
  const description = describeIssue(issue)
  const affected = (issue?.shapeIds ?? []).flatMap(id => {
    const index = shapes.findIndex(shape => shape.id === id)
    return index < 0 ? [] : [{ id, number: index + 1 }]
  })
  const detail = issue?.code === 'disconnected' && (issue.componentCount ?? 0) > 1
    ? `${issue.componentCount} 个不相连的部分。${description.advice}`
    : issue?.code === 'invalid-sketch' || !issue ? `${error}。${description.advice}` : description.advice
  return <section aria-label="预览提示" data-state="error" className="m-4 flex items-start gap-3 rounded-lg border-l-2 border-amber-500 bg-white p-4 sm:m-5">
    <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
    <div className="min-w-0">
      <div role={disabled ? undefined : 'alert'} aria-atomic="true">
        <h3 className="text-sm font-semibold leading-5 text-ink-900">{description.title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {affected.length ? affected.map(shape => <button key={shape.id} type="button" aria-label={`选择图形 ${shape.number}`} disabled={disabled} onClick={() => onEdit(shape.id)} className="min-h-11 rounded-lg px-2 text-sm font-medium text-sky-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-40">选择图形 {shape.number}<span aria-hidden="true"> →</span></button>)
          : <button type="button" disabled={disabled} onClick={() => onEdit()} className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-sky-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-40"><ArrowLeft size={14} aria-hidden="true" />返回二维修改</button>}
      </div>
    </div>
  </section>
}
