import { USER_PART_THICKNESS_MM, type JointGuide } from '@fwx/parts-schema'

export function jointEntryLabel(guide: Pick<JointGuide, 'kind' | 'axis' | 'entry'>): string {
  if (guide.kind === 'through-slot') return guide.entry === 'front' ? '从正面插入' : '从背面插入'
  return guide.axis === 'x' ? guide.entry === 'start' ? '从左向右插入' : '从右向左插入' : guide.entry === 'start' ? '从上向下插入' : '从下向上插入'
}

/** Annotation only: this arrow is not a cut line or an assembly connector. */
export function JointDirectionMark({ guide }: { guide: JointGuide }) {
  const t = USER_PART_THICKNESS_MM
  const cx = guide.x + (guide.axis === 'x' ? guide.lengthMm : t) / 2
  const cy = guide.y + (guide.axis === 'y' ? guide.lengthMm : t) / 2
  if (guide.kind === 'through-slot') return <g data-testid="joint-direction" aria-label={jointEntryLabel(guide)} pointerEvents="none" fill="none" stroke="#b91c1c" strokeWidth={1.5}>
    <circle cx={cx} cy={cy} r={3} fill="white" vectorEffect="non-scaling-stroke" />
    {guide.entry === 'back' ? <circle cx={cx} cy={cy} r={0.7} fill="#b91c1c" stroke="none" /> : <path d={`M ${cx - 1.2} ${cy - 1.2} l 2.4 2.4 M ${cx - 1.2} ${cy + 1.2} l 2.4 -2.4`} vectorEffect="non-scaling-stroke" />}
  </g>
  const sign = guide.entry === 'start' ? 1 : -1
  const mouth = (guide.axis === 'x' ? guide.x : guide.y) + (sign === -1 ? guide.lengthMm : 0)
  const a = mouth - sign * 7
  const b = mouth + sign * Math.min(guide.lengthMm / 2, 4)
  const d = guide.axis === 'x' ? `M ${a} ${cy} H ${b} m ${-sign * 2} -2 l ${sign * 2} 2 l ${-sign * 2} 2` : `M ${cx} ${a} V ${b} m -2 ${-sign * 2} l 2 ${sign * 2} l 2 ${-sign * 2}`
  return <path data-testid="joint-direction" aria-label={jointEntryLabel(guide)} d={d} pointerEvents="none" fill="none" stroke="#b91c1c" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
}
