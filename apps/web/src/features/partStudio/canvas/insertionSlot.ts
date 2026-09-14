import type { Part2D, Point2D } from '@fwx/geometry'
import { USER_PART_THICKNESS_MM } from '@fwx/parts-schema'
import type { SketchShape } from '../sketch/model'

const round = (value: number) => Math.round(value * 100) / 100

/** Hit-test the real outer contour, excluding reference frames and inner holes. */
export function nearestOuterEdge(part: Part2D | null, point: Point2D, tolerance: number): Point2D | null {
  if (!part) return null
  let distance = tolerance
  let closest: Point2D | null = null
  part.contour.points.forEach((a, index, ring) => {
    const b = ring[(index + 1) % ring.length]!
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const lengthSquared = dx * dx + dy * dy
    if (!lengthSquared) return
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared))
    const candidate: Point2D = [a[0] + t * dx, a[1] + t * dy]
    const d = Math.hypot(candidate[0] - point[0], candidate[1] - point[1])
    if (d <= distance) { distance = d; closest = candidate }
  })
  return closest
}

function inside(point: Point2D, ring: Point2D[]): boolean {
  let result = false
  ring.forEach((a, index) => {
    const b = ring[(index + 1) % ring.length]!
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result
  })
  return result
}

/** Axis-aligned by design: the fixed board thickness is always the narrow axis.
 * Find both mouth corners on the actual contour so curved edges need no manual
 * cutter extension. Round a fractional mouth outward to serialization precision.
 */
export function createInsertionSlot(part: Part2D, anchor: Point2D, end: Point2D): SketchShape | null {
  if (!nearestOuterEdge(part, anchor, 0.011)) return null
  const axis = Math.abs(end[0] - anchor[0]) >= Math.abs(end[1] - anchor[1]) ? 0 : 1
  const cross = axis === 0 ? 1 : 0
  const sign = end[axis] >= anchor[axis] ? 1 : -1
  const center = round(anchor[cross])
  const bottom = round(end[axis])
  const half = USER_PART_THICKNESS_MM / 2
  const position = (long: number, transverse: number): Point2D => axis === 0 ? [long, transverse] : [transverse, long]
  const inMaterial = (point: Point2D) => inside(point, part.contour.points) && !(part.holes ?? []).some(hole => inside(point, hole.points))
  if (![center - half + 0.01, center, center + half - 0.01].every(side => inMaterial(position(bottom - sign * 0.01, side)))) return null
  const mouths = [center - half, center, center + half].map(side => {
    const hits: number[] = []
    part.contour.points.forEach((a, index, ring) => {
      const b = ring[(index + 1) % ring.length]!
      if (Math.abs(b[cross] - a[cross]) < 1e-9) return
      const t = (side - a[cross]) / (b[cross] - a[cross])
      if (t >= 0 && t <= 1) hits.push(a[axis] + t * (b[axis] - a[axis]))
    })
    return hits.sort((a, b) => Math.abs(a - anchor[axis]) - Math.abs(b - anchor[axis]))[0]
  })
  if (mouths.some(mouth => mouth === undefined || Math.abs(mouth - anchor[axis]) > 4 || sign * (bottom - mouth) < USER_PART_THICKNESS_MM)) return null
  const outward = sign === 1 ? Math.min(...mouths as number[]) : Math.max(...mouths as number[])
  const mouth = (sign === 1 ? Math.floor(outward * 100) : Math.ceil(outward * 100)) / 100
  const start = Math.min(mouth, bottom)
  const length = round(Math.abs(bottom - mouth))
  return { id: 'drag-preview', kind: 'rectangle', operation: 'cut', x: axis === 0 ? start : center - half, y: axis === 0 ? center - half : start,
    width: axis === 0 ? length : USER_PART_THICKNESS_MM, height: axis === 0 ? USER_PART_THICKNESS_MM : length, radius: 0,
    joint: { kind: 'edge-slot', axis: axis === 0 ? 'x' : 'y', entry: sign === 1 ? 'start' : 'end' } }
}
