import type { Point2D } from '@fwx/geometry'
import type { SketchShape } from './model'

/** Handle vectors are relative to their anchor; normalized by the shape box. */
export interface CurveHandle { in: Point2D; out: Point2D }
export const zeroHandle = (): CurveHandle => ({ in: [0, 0], out: [0, 0] })
const add = (a: Point2D, b: Point2D): Point2D => [a[0] + b[0], a[1] + b[1]]
const middle = (a: Point2D, b: Point2D): Point2D => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
const distance = (a: Point2D, b: Point2D) => Math.hypot(a[0] - b[0], a[1] - b[1])

function segmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return distance(p, [a[0] + t * dx, a[1] + t * dy])
}

function validate(points: Point2D[], handles: CurveHandle[]) {
  if (points.length < 3 || points.length > 128 || handles.length !== points.length
    || [...points, ...handles.flatMap(h => [h.in, h.out])].some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v) || Math.abs(v) > 10000))) {
    throw new RangeError('曲线需要 3 至 128 个有效节点')
  }
}

/** Adaptive subdivision; control hull distance bounds chord error to .005 mm.
 * Reject excess work rather than silently truncate a user's contour. */
function flatten(points: Point2D[], handles: CurveHandle[]): Point2D[] {
  validate(points, handles)
  const result: Point2D[] = [[...points[0]!]]
  const visit = (a: Point2D, b: Point2D, c: Point2D, d: Point2D, depth: number) => {
    if (result.length > 2000) throw new RangeError('曲线过于复杂，请减少节点')
    if (Math.max(segmentDistance(b, a, d), segmentDistance(c, a, d)) <= 0.005) { result.push(d); return }
    if (depth > 16) throw new RangeError('曲线过于复杂，请缩短控制柄')
    const ab = middle(a, b), bc = middle(b, c), cd = middle(c, d)
    const abc = middle(ab, bc), bcd = middle(bc, cd), mid = middle(abc, bcd)
    visit(a, ab, abc, mid, depth + 1); visit(mid, bcd, cd, d, depth + 1)
  }
  points.forEach((point, i) => {
    const next = (i + 1) % points.length
    visit(point, add(point, handles[i]!.out), add(points[next]!, handles[next]!.in), points[next]!, 0)
  })
  result.pop()
  return result.filter((p, i) => i === 0 || distance(p, result[i - 1]!) > 1e-7)
}

export function curveAnchors(shape: SketchShape): Point2D[] {
  return (shape.points ?? []).map(([x, y]) => [shape.x + x * shape.width, shape.y + y * shape.height])
}
export function absoluteHandles(shape: SketchShape): CurveHandle[] {
  return (shape.curveHandles ?? shape.points?.map(zeroHandle) ?? []).map(h => ({ in: [h.in[0] * shape.width, h.in[1] * shape.height], out: [h.out[0] * shape.width, h.out[1] * shape.height] }))
}
export function curvePoints(shape: SketchShape): Point2D[] {
  return flatten(curveAnchors(shape), absoluteHandles(shape))
}
export function curvePath(points: Point2D[], handles: CurveHandle[], closed = true): string {
  if (!points.length) return ''
  let d = `M ${points[0]![0]} ${points[0]![1]}`
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const j = (i + 1) % points.length
    const a = add(points[i]!, handles[i]?.out ?? [0, 0]), b = add(points[j]!, handles[j]?.in ?? [0, 0])
    d += ` C ${a[0]} ${a[1]} ${b[0]} ${b[1]} ${points[j]![0]} ${points[j]![1]}`
  }
  return d + (closed ? ' Z' : '')
}
export function curveShape(points: Point2D[], handles = points.map(zeroHandle), original?: SketchShape): SketchShape | null {
  const sampled = flatten(points, handles)
  const xs = sampled.map(p => p[0]), ys = sampled.map(p => p[1])
  const x = Math.min(...xs), y = Math.min(...ys), width = Math.max(...xs) - x, height = Math.max(...ys) - y
  if (width < 0.1 || height < 0.1) return null
  return { id: original?.id ?? crypto.randomUUID(), kind: 'polygon', operation: original?.operation ?? 'add', x, y, width, height, radius: 0, mirror: original?.mirror,
    points: points.map(p => [(p[0] - x) / width, (p[1] - y) / height]),
    curveHandles: handles.map(h => ({ in: [h.in[0] / width, h.in[1] / height], out: [h.out[0] / width, h.out[1] / height] })) }
}

function simplify(points: Point2D[], tolerance: number): Point2D[] {
  if (points.length < 3) return points
  let max = 0, index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = segmentDistance(points[i]!, points[0]!, points[points.length - 1]!)
    if (d > max) { max = d; index = i }
  }
  return max > tolerance ? [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)] : [points[0]!, points[points.length - 1]!]
}

export function smoothFreehand(raw: Point2D[]): SketchShape | null {
  if (raw.length < 3) return null
  if (raw.length > 2048 || raw.some(p => p.some(v => !Number.isFinite(v)))) throw new RangeError('手绘过于复杂，请分段设计')
  let points = raw.filter((p, i) => !i || distance(p, raw[i - 1]!) > 0.05)
  if (distance(points[0]!, points[points.length - 1]!) < 1) points = points.slice(0, -1)
  if (points.length < 3) return null
  // A small local low-pass removes input jitter; fitting does not snap to grid.
  points = points.map((p, i, all): Point2D => {
    const a = all[(i + all.length - 1) % all.length]!, b = all[(i + 1) % all.length]!
    return [(a[0] + 4 * p[0] + b[0]) / 6, (a[1] + 4 * p[1] + b[1]) / 6]
  })
  points = simplify([...points, points[0]!], 0.25).slice(0, -1)
  if (points.length < 3) return null
  const handles = points.map((_, i): CurveHandle => {
    const previous = points[(i + points.length - 1) % points.length]!, next = points[(i + 1) % points.length]!
    const out: Point2D = [(next[0] - previous[0]) / 6, (next[1] - previous[1]) / 6]
    return { in: [-out[0], -out[1]], out }
  })
  return curveShape(points, handles)
}
