import { validatePart, type Part2D, type Point2D } from './index'

export interface ProtectedCornerRegion { x: number; y: number; width: number; height: number }
export interface CornerRounding { part: Part2D; rounded: number; limited: number; protected: number }
const distance = (a: Point2D, b: Point2D) => Math.hypot(a[0] - b[0], a[1] - b[1])
const tidy = (v: number) => Math.round(v * 1e9) / 1e9 || 0
function distanceToEdge(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return distance(p, [a[0] + t * dx, a[1] + t * dy])
}

/** Optional planar fillets, not a bevel across the board thickness.
 * Removes material only at convex exterior corners. Holes, concave corners
 * and protected joint regions remain exact. Geometric clearance is not a
 * material-strength or manufacturing-tolerance guarantee. */
export function roundOuterCorners(part: Part2D, radius: number, protectedRegions: readonly ProtectedCornerRegion[] = []): CornerRounding {
  if (!Number.isFinite(radius) || radius < 0 || radius > 2000) throw new RangeError('圆角半径需在 0 至 2000 mm 之间')
  const result: CornerRounding = { part, rounded: 0, limited: 0, protected: 0 }
  if (radius === 0) return result
  if (!validatePart(part).ok) throw new RangeError('请先完成有效轮廓，再处理圆角')
  let vertices = part.contour.points
  const area = vertices.reduce((sum, p, i) => { const n = vertices[(i + 1) % vertices.length]!; return sum + p[0] * n[1] - n[0] * p[1] }, 0)
  if (area < 0) vertices = [...vertices].reverse()
  const rings = [vertices, ...(part.holes ?? []).map(h => h.points)]
  const points = vertices.flatMap((b, i): Point2D[] => {
    const a = vertices[(i + vertices.length - 1) % vertices.length]!, c = vertices[(i + 1) % vertices.length]!
    const la = distance(a, b), lc = distance(c, b)
    const u: Point2D = [(a[0] - b[0]) / la, (a[1] - b[1]) / la]
    const v: Point2D = [(c[0] - b[0]) / lc, (c[1] - b[1]) / lc]
    const cross = -u[0] * v[1] + u[1] * v[0]
    const angle = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])))
    // Already-sampled smooth curves need no second rounding pass.
    if (cross <= 1e-8 || Math.PI - angle < Math.PI / 36) return [[...b]]
    let clearance = Infinity
    for (const region of protectedRegions) {
      const d = Math.hypot(Math.max(region.x - b[0], 0, b[0] - region.x - region.width), Math.max(region.y - b[1], 0, b[1] - region.y - region.height))
      if (d < 1e-6) { result.protected++; return [[...b]] }
      clearance = Math.min(clearance, d)
    }
    rings.forEach((ring, ringIndex) => ring.forEach((p, j) => {
      if (ringIndex === 0 && (j === i || (j + 1) % ring.length === i)) return
      clearance = Math.min(clearance, distanceToEdge(b, p, ring[(j + 1) % ring.length]!))
    }))
    const requestedSetback = radius / Math.tan(angle / 2)
    const setback = Math.min(requestedSetback, la * 0.45, lc * 0.45, clearance * 0.45)
    const actualRadius = setback * Math.tan(angle / 2)
    if (actualRadius < radius - 1e-7) result.limited++
    // Keep very small corners exact: storage uses 0.01 mm coordinates.
    if (actualRadius < 0.05 || setback < 0.05) return [[...b]]
    const start: Point2D = [b[0] + u[0] * setback, b[1] + u[1] * setback]
    const end: Point2D = [b[0] + v[0] * setback, b[1] + v[1] * setback]
    const bisectorLength = Math.hypot(u[0] + v[0], u[1] + v[1])
    const centerDistance = actualRadius / Math.sin(angle / 2)
    const center: Point2D = [b[0] + (u[0] + v[0]) / bisectorLength * centerDistance, b[1] + (u[1] + v[1]) / bisectorLength * centerDistance]
    const first = Math.atan2(start[1] - center[1], start[0] - center[0]), sweep = Math.PI - angle
    const count = Math.max(2, Math.ceil(sweep / (2 * Math.acos(Math.max(-1, 1 - 0.005 / actualRadius)))))
    result.rounded++
    return Array.from({ length: count + 1 }, (_, j): Point2D => j === 0 ? start.map(tidy) as Point2D : j === count ? end.map(tidy) as Point2D : [tidy(center[0] + actualRadius * Math.cos(first + sweep * j / count)), tidy(center[1] + actualRadius * Math.sin(first + sweep * j / count))])
  })
  if (points.length + (part.holes ?? []).reduce((sum, h) => sum + h.points.length, 0) > 2000) throw new RangeError('圆角后轮廓过于复杂，请减小半径或减少节点')
  const roundedPart = { ...part, contour: { points } }
  if (!validatePart(roundedPart).ok) throw new RangeError('此处无法生成圆角，请减小半径；原轮廓已保留')
  return { ...result, part: roundedPart }
}
