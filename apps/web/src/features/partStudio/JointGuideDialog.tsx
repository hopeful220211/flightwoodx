import type { UserPartDTO } from '@fwx/parts-schema'
import { Modal } from '../../components/common/Modal'
import { JointDirectionMark, jointEntryLabel } from './JointDirectionMark'

/** Read back saved design annotations, not automatically matched sockets. */
export function JointGuideDialog({ part, onClose }: { part: UserPartDTO | null; onClose: () => void }) {
  const guides = part?.jointGuides ?? []
  const w = part?.geometry.bboxMm.w ?? 1
  const h = part?.geometry.bboxMm.h ?? 1
  const pad = Math.max(10, Math.max(w, h) * 0.08)
  return <Modal open={!!part} title="插槽位置与方向" onClose={onClose}>
    {part && <div className="space-y-3 text-sm text-slate-700">
      <p>{part.name} · 板厚 2 mm</p>
      <svg aria-label="已保存插槽位置图" className="max-h-72 w-full rounded-lg bg-sky-50" viewBox={`${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`}>
        <path d={[part.geometry.contour, ...part.geometry.holes].join(' ')} fill="#d9eaf8" fillRule="evenodd" stroke="#5489b5" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {guides.map((guide, index) => <g key={guide.id}><JointDirectionMark guide={guide} /><text x={guide.x - 3} y={guide.y - 3} fontSize={Math.max(w, h) / 25} fill="#8d1b1b">{index + 1}</text></g>)}
      </svg>
      <ol className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-sky-100 p-3">
        {guides.map((guide, index) => <li key={guide.id}>
          <p className="font-medium">{index + 1}. {guide.kind === 'edge-slot' ? '边缘插槽' : '板内插槽'} · {jointEntryLabel(guide)}</p>
          <p className="text-xs">X {guide.x} / Y {guide.y} mm · {guide.kind === 'edge-slot' ? '开口深度' : '槽长'} {guide.lengthMm} mm · 槽宽 2 mm</p>
        </li>)}
      </ol>
      <p className="text-xs leading-5">坐标从零件左上角计算，箭头标明插入方向。</p>
      <p className="text-xs text-slate-500">箭头和正反面标记为位置说明，不是切割线。</p>
    </div>}
  </Modal>
}
