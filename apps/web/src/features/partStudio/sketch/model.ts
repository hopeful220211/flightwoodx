import paper from 'paper'
import { roundOuterCorners, validatePart, validatePolyline, type CornerRounding, type Part2D, type Point2D } from '@fwx/geometry'
import { curvePoints, type CurveHandle } from './curves'

export type { Point2D } from '@fwx/geometry'

/** Feature-local, editable sketch data. Coordinates and dimensions are mm. */
export interface SketchShape {
  id: string
  kind: 'rectangle' | 'ellipse' | 'polygon'
  operation: 'add' | 'cut'
  x: number
  y: number
  width: number
  height: number
  radius: number
  /** Explicit nominal 2mm slot intent; ordinary cuts never imply a joint. */
  joint?: { kind: 'edge-slot' | 'through-slot'; axis: 'x' | 'y'; entry: 'start' | 'end' | 'front' | 'back' }
  /** Polygon vertices are local normalized coordinates in [0, 1]. */
  points?: Point2D[]
  curveHandles?: CurveHandle[]
  /** Duplicate this shape across the reference width's vertical centre line. */
  mirror?: boolean
}

export interface SketchReference { width: number; height: number; shape?: 'rectangle' | 'ellipse' }
export interface SketchBounds { x: number; y: number; width: number; height: number }
/** Diagnostic metadata from the same validation that accepts the geometry.
 * Source ids are included only when the failing shape is known. */
export interface SketchIssue {
  code: 'no-solid' | 'outside-reference' | 'disconnected' | 'empty-result' | 'invalid-shape' | 'invalid-sketch'
  shapeIds: string[]
  componentCount?: number
}
export interface SketchCompilation {
  part: Part2D | null
  error: string | null
  bounds: SketchBounds | null
  issue?: SketchIssue
  rounding?: Omit<CornerRounding, 'part'>
}

class SketchValidationError extends RangeError {
  readonly issue: SketchIssue

  constructor(message: string, issue: SketchIssue) {
    super(message)
    this.issue = issue
  }
}

export const MAX_SKETCH_SHAPES = 32
export const MAX_POLYGON_POINTS = 128
export const MAX_SKETCH_POINTS = 2000
export const MAX_SKETCH_SIZE_MM = 2000
/** Circular/elliptic edges are inscribed straight chords, not Bezier handles.
 * The affine-circle sagitta bound is <= 0.005 mm before boolean operations;
 * rounding adds < 0.000001 mm, keeping total curve approximation < 0.05 mm.
 */
export const SKETCH_CHORD_ERROR_MM = 0.005
const MAX_INPUT_POINTS = 8000
const EPSILON = 1e-7

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label}必须是有限数值`)
}

function dimension(value: number, label: string): void {
  finite(value, label)
  if (value <= 0 || value > MAX_SKETCH_SIZE_MM) {
    throw new RangeError(`${label}必须大于 0 且不超过 ${MAX_SKETCH_SIZE_MM} 毫米`)
  }
}

function rounded(value: number): number {
  const result = Math.round(value * 1e9) / 1e9
  return Object.is(result, -0) ? 0 : result
}

function equalPoint(a: Point2D, b: Point2D): boolean {
  return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON
}

function area(points: Point2D[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2
}

function quarterSegments(radius: number): number {
  // Round to full quadrants so every shape retains its exact cardinal bounds.
  const angle = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - SKETCH_CHORD_ERROR_MM / radius)))
  return Math.max(2, Math.ceil((Math.PI / 2) / angle))
}

/** Returns an implicitly closed polyline; it never repeats the first point.
 * Invalid dimensions/vertices throw; compileSketch turns these into UI errors.
 * Mirroring is applied only by compileSketch because it needs the reference.
 */
export function shapePoints(shape: SketchShape): Point2D[] {
  if (!shape || !['rectangle', 'ellipse', 'polygon'].includes(shape.kind)) {
    throw new RangeError('请选择有效的绘制形状')
  }
  finite(shape.x, '横坐标')
  finite(shape.y, '纵坐标')
  if (Math.abs(shape.x) > MAX_SKETCH_SIZE_MM || Math.abs(shape.y) > MAX_SKETCH_SIZE_MM) {
    throw new RangeError(`坐标不能超过正负 ${MAX_SKETCH_SIZE_MM} 毫米`)
  }
  dimension(shape.width, '宽度')
  dimension(shape.height, '高度')
  finite(shape.radius, '圆角半径')
  if (shape.radius < 0 || shape.radius > Math.min(shape.width, shape.height) / 2) {
    throw new RangeError('圆角半径需在 0 与短边长度的一半之间')
  }
  const { x, y, width, height, radius } = shape
  let points: Point2D[]
  if (shape.kind === 'polygon') {
    if (!Array.isArray(shape.points) || shape.points.length < 3 || shape.points.length > MAX_POLYGON_POINTS) {
      throw new RangeError(`多边形需要 3 至 ${MAX_POLYGON_POINTS} 个顶点`)
    }
    points = shape.points.map(point => {
      if (!Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
        throw new RangeError('多边形局部坐标必须在 0 至 1 之间')
      }
      return [x + point[0] * width, y + point[1] * height]
    })
    if (equalPoint(points[0]!, points[points.length - 1]!)) points.pop()
    if (shape.curveHandles) points = curvePoints(shape)
  } else if (shape.kind === 'ellipse') {
    const count = quarterSegments(Math.max(width, height) / 2) * 4
    points = Array.from({ length: count }, (_, index) => {
      const angle = index * Math.PI * 2 / count
      return [rounded(x + width / 2 + Math.cos(angle) * width / 2), rounded(y + height / 2 + Math.sin(angle) * height / 2)]
    })
  } else if (radius === 0) {
    points = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]
  } else {
    const count = quarterSegments(radius)
    const corners = [[x + width - radius, y + radius], [x + width - radius, y + height - radius], [x + radius, y + height - radius], [x + radius, y + radius]]
    points = corners.flatMap(([cx, cy], quarter) => Array.from({ length: count + 1 }, (_, index): Point2D => {
      const angle = -Math.PI / 2 + quarter * Math.PI / 2 + index / count * Math.PI / 2
      return [rounded(cx! + radius * Math.cos(angle)), rounded(cy! + radius * Math.sin(angle))]
    }))
    // A maximum-radius capsule has coincident adjacent arc endpoints.
    points = points.filter((point, index) => !equalPoint(point, points[(index + points.length - 1) % points.length]!))
  }
  const validation = validatePolyline({ points })
  if (!validation.ok) throw new RangeError(validation.reason ?? '形状轮廓无效')
  return points
}

function pointInside(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!
    const b = polygon[previous]!
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

function withinReference([x, y]: Point2D, reference: SketchReference): boolean {
  if (reference.shape === 'ellipse') {
    const rx = reference.width / 2
    const ry = reference.height / 2
    return Math.hypot((x - rx) / rx, (y - ry) / ry) <= 1 + EPSILON / Math.max(1, Math.min(rx, ry))
  }
  return x >= -EPSILON && y >= -EPSILON && x <= reference.width + EPSILON && y <= reference.height + EPSILON
}

/** All add shapes are united first, then all cuts are subtracted, independent
 * of drawing order. No source shape is edited or discarded on a failed result.
 * Only one connected solid is accepted; interior rings become holes and cuts
 * intersecting an outer edge become real openings in that contour.
 */
export function compileSketch(shapes: SketchShape[], reference: SketchReference, constrain: boolean, cornerRadius = 0): SketchCompilation {
  let scope: paper.PaperScope | null = null
  const items = new Set<paper.Item>()
  try {
    dimension(reference?.width, '参考范围宽度')
    dimension(reference?.height, '参考范围高度')
    if (reference.shape !== undefined && !['rectangle', 'ellipse'].includes(reference.shape)) throw new RangeError('参考范围形状无效')
    if (!Array.isArray(shapes) || shapes.length === 0 || !shapes.some(shape => shape?.operation === 'add')) {
      throw new SketchValidationError('请先添加至少一个实体形状', { code: 'no-solid', shapeIds: [] })
    }
    if (shapes.length > MAX_SKETCH_SHAPES) throw new RangeError(`形状不能超过 ${MAX_SKETCH_SHAPES} 个`)
    const ids = new Set<string>()
    let inputPoints = 0
    const expanded = shapes.flatMap(shape => {
      if (!shape || typeof shape.id !== 'string' || !shape.id.trim() || ids.has(shape.id)) throw new RangeError('形状标识缺失或重复')
      ids.add(shape.id)
      if (!['add', 'cut'].includes(shape.operation) || (shape.mirror !== undefined && typeof shape.mirror !== 'boolean')) throw new RangeError('形状操作或对称设置无效')
      let points: Point2D[]
      try {
        points = shapePoints(shape)
      } catch (error) {
        if (error instanceof RangeError) throw new SketchValidationError(error.message, { code: 'invalid-shape', shapeIds: [shape.id] })
        throw error
      }
      const copies = [points]
      if (shape.mirror) copies.push(points.map(([x, y]): Point2D => [reference.width - x, y]).reverse())
      return copies.map(vertices => {
        inputPoints += vertices.length
        if (inputPoints > MAX_INPUT_POINTS) throw new RangeError('草图过于复杂，请减少形状或顶点')
        // A cutting tool may cross the reference edge to create an open slot.
        // Only actual material is constrained, never the outside part of a cut.
        if (constrain && shape.operation === 'add' && vertices.some(point => !withinReference(point, reference))) {
          throw new SketchValidationError(reference.shape === 'ellipse' ? '实体超出圆形或椭圆参考范围，请调整尺寸或位置' : '实体超出参考范围，请调整尺寸或位置', { code: 'outside-reference', shapeIds: [shape.id] })
        }
        return { points: vertices, operation: shape.operation }
      })
    })
    scope = new paper.PaperScope()
    scope.setup(new scope.Size(1, 1))
    const own = <T extends paper.Item>(item: T): T => { items.add(item); return item }
    const solids: paper.Path[] = []
    const cuts: paper.Path[] = []
    for (const shape of expanded) {
      const path = own(new scope.Path({ segments: shape.points, closed: true, insert: false }))
      ;(shape.operation === 'add' ? solids : cuts).push(path)
    }
    let solid: paper.PathItem = solids[0]!
    for (const next of solids.slice(1)) solid = own(solid.unite(next, { insert: false }))
    let result = solid
    for (const cut of cuts) {
      // A cutting tool outside the material (including edge-only contact) has
      // no effect. Keep the source shape editable, but do not reject the board.
      // Check the original solid so overlapping/duplicate cuts remain valid.
      const overlap = own(solid.intersect(cut, { insert: false }))
      if ((overlap as paper.Path | paper.CompoundPath).area === 0) continue
      result = own(result.subtract(cut, { insert: false }))
    }
    const paths = result.className === 'CompoundPath' ? (result as paper.CompoundPath).children as paper.Path[] : [result as paper.Path]
    const rings = paths.filter(path => path.segments.length > 0).map(path => {
      if (path.segments.some(segment => segment.hasHandles())) throw new Error('轮廓含未离散曲线，无法生成零件')
      return path.segments.map((segment): Point2D => [rounded(segment.point.x), rounded(segment.point.y)])
    })
    if (rings.length === 0 || Math.abs((result as paper.Path | paper.CompoundPath).area) < 1e-6) throw new SketchValidationError('切除后没有剩余实体，请减小切除范围', { code: 'empty-result', shapeIds: [] })
    if (rings.reduce((sum, points) => sum + points.length, 0) > MAX_SKETCH_POINTS) {
      throw new RangeError(`轮廓过于复杂，最终顶点不能超过 ${MAX_SKETCH_POINTS} 个`)
    }
    const outer: Point2D[][] = []
    const holes: Point2D[][] = []
    rings.forEach((ring, index) => {
      const depth = rings.filter((other, otherIndex) => index !== otherIndex && pointInside(ring[0]!, other)).length
      ;(depth % 2 === 0 ? outer : holes).push(ring)
    })
    if (outer.length !== 1) throw new SketchValidationError('存在多个不相连的实体，请连接形状后再生成一个零件', { code: 'disconnected', shapeIds: [], componentCount: outer.length })
    let contour = outer[0]!
    let part: Part2D = {
      contour: { points: area(contour) > 0 ? contour : [...contour].reverse() },
      ...(holes.length ? { holes: holes.map(points => ({ points: area(points) < 0 ? points : [...points].reverse() })) } : {}),
    }
    const validation = validatePart(part)
    if (!validation.ok) throw new RangeError(validation.reason ?? '组合后的零件几何无效')
    let rounding: SketchCompilation['rounding']
    if (cornerRadius !== 0) {
      const protectedRegions = shapes.filter(shape => shape.joint).flatMap(shape => [shape, ...(shape.mirror ? [{ ...shape, x: reference.width - shape.x - shape.width }] : [])])
      const result = roundOuterCorners(part, cornerRadius, protectedRegions)
      part = result.part; contour = part.contour.points
      rounding = { rounded: result.rounded, limited: result.limited, protected: result.protected }
    }
    if (constrain && contour.some(point => !withinReference(point, reference))) throw new SketchValidationError('组合后的零件超出参考范围，请调整尺寸或位置', { code: 'outside-reference', shapeIds: [] })
    const xs = contour.map(point => point[0])
    const ys = contour.map(point => point[1])
    const bounds = { x: Math.min(...xs), y: Math.min(...ys), width: rounded(Math.max(...xs) - Math.min(...xs)), height: rounded(Math.max(...ys) - Math.min(...ys)) }
    if (bounds.width > MAX_SKETCH_SIZE_MM || bounds.height > MAX_SKETCH_SIZE_MM) throw new RangeError(`零件范围不能超过 ${MAX_SKETCH_SIZE_MM} 毫米`)
    return { part, error: null, bounds, ...(rounding ? { rounding } : {}) }
  } catch (error) {
    return { part: null, error: error instanceof RangeError ? error.message : '几何运算失败，请调整形状后重试', bounds: null,
      issue: error instanceof SketchValidationError ? error.issue : { code: 'invalid-sketch', shapeIds: [] } }
  } finally {
    for (const item of items) item.remove()
    // Paper 0.12.18 implements remove() to clear projects and deregister the
    // scope, although its bundled .d.ts only lists clear(). Regression-tested.
    if (scope) (scope as paper.PaperScope & { remove(): void }).remove()
  }
}

export function snapCoordinate(value: number, enabled: boolean, step = 1): number {
  finite(value, '坐标')
  finite(step, '网格间距')
  if (step <= 0) throw new RangeError('网格间距必须大于 0')
  return enabled ? rounded(Math.round(value / step) * step) : value
}
