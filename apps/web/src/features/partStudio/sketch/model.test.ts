import { afterAll, describe, expect, it, vi } from 'vitest'
import { validatePart, type Part2D, type Point2D } from '@fwx/geometry'

// Use Paper's supported geometry-only, no-DOM environment. Its actual boolean
// implementation is exercised; no canvas or geometric operation is mocked.
vi.hoisted(() => vi.stubGlobal('self', { navigator: { userAgent: 'Node.js' } }))
import paper from 'paper'
import { compileSketch, shapePoints, snapCoordinate, type SketchShape } from './model'

afterAll(() => vi.unstubAllGlobals())

const reference = { width: 200, height: 160 }
const rectangle = (patch: Partial<SketchShape> = {}): SketchShape => ({
  id: 'base', kind: 'rectangle', operation: 'add', x: 20, y: 20,
  width: 100, height: 80, radius: 0, ...patch,
})
function area(points: Point2D[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2
}
function partArea(part: Part2D): number {
  return Math.abs(area(part.contour.points)) - (part.holes ?? []).reduce((sum, hole) => sum + Math.abs(area(hole.points)), 0)
}
function expectValid(shapes: SketchShape[]) {
  const result = compileSketch(shapes, reference, true)
  expect(result.error).toBeNull()
  expect(result.part).not.toBeNull()
  expect(validatePart(result.part!).ok).toBe(true)
  return result
}

describe('millimetre sketch geometry', () => {
  it('produces exact rectangle dimensions without a repeated closing point', () => {
    const points = shapePoints(rectangle())
    expect(points).toHaveLength(4)
    expect(points).toEqual([[20, 20], [120, 20], [120, 100], [20, 100]])
    expect(expectValid([rectangle()]).bounds).toEqual({ x: 20, y: 20, width: 100, height: 80 })
  })

  it('maps normalized polygon points to the supplied position and dimensions', () => {
    const polygon = rectangle({ kind: 'polygon', points: [[0, 0], [1, 0], [0.5, 1]] })
    expect(shapePoints(polygon)).toEqual([[20, 20], [120, 20], [70, 100]])
    expectValid([polygon])
  })

  it('approximates the circle with a chord error no greater than 0.05 mm', () => {
    const points = shapePoints(rectangle({ kind: 'ellipse', x: 0, y: 0, width: 200, height: 200 }))
    for (const [index, point] of points.entries()) {
      const next = points[(index + 1) % points.length]!
      const distance = Math.hypot((point[0] + next[0]) / 2 - 100, (point[1] + next[1]) / 2 - 100)
      expect(100 - distance).toBeLessThanOrEqual(0.05)
      expect(Math.hypot(point[0] - 100, point[1] - 100)).toBeCloseTo(100, 8)
    }
    expect(Math.max(...points.map(point => point[0]))).toBe(200)
    expect(Math.max(...points.map(point => point[1]))).toBe(200)
  })

  it('generates an ellipse with exact bounds and a rounded rectangle with valid corners', () => {
    expect(expectValid([rectangle({ kind: 'ellipse' })]).bounds).toEqual({ x: 20, y: 20, width: 100, height: 80 })
    const rounded = expectValid([rectangle({ radius: 12 })])
    expect(rounded.part!.contour.points.length).toBeGreaterThan(12)
    expect(rounded.bounds).toEqual({ x: 20, y: 20, width: 100, height: 80 })
    expect(partArea(rounded.part!)).toBeCloseTo(8000 - (4 - Math.PI) * 144, 0)
  })

  it('unites overlapping solids independently of drawing order', () => {
    const a = rectangle({ id: 'a', width: 60, height: 40 })
    const b = rectangle({ id: 'b', x: 60, width: 60, height: 40 })
    expect(partArea(expectValid([a, b]).part!)).toBe(4000)
    expect(partArea(expectValid([b, a]).part!)).toBe(4000)
  })

  it('unites solids that share an edge', () => {
    const a = rectangle({ id: 'a', width: 40, height: 40 })
    const b = rectangle({ id: 'b', x: 60, width: 40, height: 40 })
    expect(partArea(expectValid([a, b]).part!)).toBe(3200)
  })

  it('subtracts an inner hole and preserves opposing winding', () => {
    const cut = rectangle({ id: 'hole', operation: 'cut', x: 40, y: 40, width: 20, height: 20 })
    const result = expectValid([cut, rectangle()])
    expect(result.part!.holes).toHaveLength(1)
    expect(partArea(result.part!)).toBe(7600)
    expect(area(result.part!.contour.points) * area(result.part!.holes![0]!.points)).toBeLessThan(0)
  })

  it('subtracts an edge opening into the outer contour instead of an invalid hole', () => {
    const cut = rectangle({ id: 'slot', operation: 'cut', x: 50, y: 10, width: 2, height: 30 })
    const result = expectValid([rectangle(), cut])
    expect(result.part!.holes ?? []).toHaveLength(0)
    expect(partArea(result.part!)).toBe(7960)
    expect(result.part!.contour.points).toContainEqual([50, 40])
    expect(result.part!.contour.points).toContainEqual([52, 40])
  })

  it('combines overlapping cuts into one hole rather than overlapping rings', () => {
    const a = rectangle({ id: 'a', operation: 'cut', x: 40, y: 40, width: 20, height: 20 })
    const b = rectangle({ id: 'b', operation: 'cut', x: 50, y: 40, width: 20, height: 20 })
    const result = expectValid([rectangle(), a, b])
    expect(result.part!.holes).toHaveLength(1)
    expect(partArea(result.part!)).toBe(7400)
  })

  it('mirrors cuts around the reference centre while leaving the source untouched', () => {
    const body = rectangle({ x: 10, width: 180 })
    const cut = rectangle({ id: 'hole', operation: 'cut', x: 30, y: 40, width: 10, height: 10, mirror: true })
    const before = JSON.stringify([body, cut])
    const result = expectValid([body, cut])
    expect(result.part!.holes).toHaveLength(2)
    expect(result.part!.holes!.flatMap(hole => hole.points.map(point => point[0]))).toEqual(expect.arrayContaining([30, 40, 160, 170]))
    expect(JSON.stringify([body, cut])).toBe(before)
  })

  it('mirrors and unites touching solids without duplicating their shared edge', () => {
    const result = expectValid([rectangle({ x: 60, width: 40, mirror: true })])
    expect(result.bounds).toEqual({ x: 60, y: 20, width: 80, height: 80 })
  })

  it('rejects disconnected solids and point-only contact', () => {
    expect(compileSketch([rectangle({ width: 20 }), rectangle({ id: 'other', x: 150, width: 20 })], reference, true).error).toMatch(/不相连|多个|连续/)
    expect(compileSketch([rectangle({ width: 20, height: 20 }), rectangle({ id: 'other', x: 40, y: 40, width: 20, height: 20 })], reference, true).error).toMatch(/不相连|多个|自交|连续/)
  })

  it('rejects a cut that splits a part in two or removes it entirely', () => {
    expect(compileSketch([rectangle(), rectangle({ id: 'cut', operation: 'cut', x: 40, y: 10, width: 10, height: 100 })], reference, true).error).toMatch(/不相连|多个|连续/)
    expect(compileSketch([rectangle(), rectangle({ id: 'cut', operation: 'cut' })], reference, true).error).toMatch(/空|全部|剩余/)
  })

  it('rejects missing solids even when the sketch contains cutting tools', () => {
    expect(compileSketch([], reference, true).error).toMatch(/实体/)
    expect(compileSketch([rectangle({ operation: 'cut' })], reference, true).error).toMatch(/实体/)
  })

  it('reports a missing solid separately from other invalid sketches', () => {
    for (const shapes of [[], [rectangle({ operation: 'cut' })]]) {
      expect(compileSketch(shapes, reference, true).issue).toEqual({ code: 'no-solid', shapeIds: [] })
    }
    expect(compileSketch([rectangle()], { width: 0, height: 160 }, true).issue).toEqual({ code: 'invalid-sketch', shapeIds: [] })
  })

  it('identifies the source solid outside a rectangular or elliptical reference', () => {
    const outside = rectangle({ id: 'outside-solid', x: -2, mirror: true })
    expect(compileSketch([rectangle(), outside], reference, true).issue).toEqual({ code: 'outside-reference', shapeIds: ['outside-solid'] })
    const corner = rectangle({ id: 'corner-solid', x: 0, y: 0, width: 10, height: 10, mirror: true })
    expect(compileSketch([corner], { ...reference, shape: 'ellipse' }, true).issue).toEqual({ code: 'outside-reference', shapeIds: ['corner-solid'] })
    expect(compileSketch([{ ...outside, mirror: false }], reference, false).issue).toBeUndefined()
  })

  it('identifies an invalid source shape without changing its validation message', () => {
    const invalid = rectangle({ id: 'invalid-radius', radius: 41 })
    const result = compileSketch([invalid], reference, true)
    expect(result.issue).toEqual({ code: 'invalid-shape', shapeIds: ['invalid-radius'] })
    expect(result.error).toBe('圆角半径需在 0 与短边长度的一半之间')
    expect(result.part).toBeNull()
  })

  it('reports final disconnected components without guessing which source caused them', () => {
    const detached = [rectangle({ width: 20 }), rectangle({ id: 'other', x: 150, width: 20 })]
    const split = [rectangle(), rectangle({ id: 'cut', operation: 'cut', x: 40, y: 10, width: 10, height: 100 })]
    for (const shapes of [detached, split]) {
      const result = compileSketch(shapes, reference, true)
      expect(result.issue).toEqual({ code: 'disconnected', shapeIds: [], componentCount: 2 })
      expect(result.error).toBe('存在多个不相连的实体，请连接形状后再生成一个零件')
    }
  })

  it('reports complete removal without marking an unrelated cutting tool as invalid', () => {
    const removeAll = rectangle({ id: 'remove-all', operation: 'cut' })
    const result = compileSketch([rectangle(), removeAll], reference, true)
    expect(result.issue).toEqual({ code: 'empty-result', shapeIds: [] })
    expect(result.error).toBe('切除后没有剩余实体，请减小切除范围')
    const inactive = rectangle({ id: 'inactive', operation: 'cut', x: -30, width: 10 })
    const valid = compileSketch([rectangle(), inactive], reference, true)
    expect(valid.part).not.toBeNull()
    expect(valid.issue).toBeUndefined()
  })

  it.each([
    { kind: 'rectangle' as const, width: 20, height: 20 },
    { kind: 'rectangle' as const, width: 2, height: 30, radius: 1 },
    { kind: 'ellipse' as const, width: 20, height: 20 },
    { kind: 'polygon' as const, width: 20, height: 20, points: [[0, 0], [1, 0], [0.5, 1]] as Point2D[] },
  ])('preserves the board and editable $kind cut when it misses the material', patch => {
    const body = rectangle()
    const cut = rectangle({ id: 'outside', operation: 'cut', x: 150, y: 40, ...patch })
    const shapes = [body, cut]
    const before = JSON.stringify(shapes)
    expect(compileSketch(shapes, reference, true)).toEqual(compileSketch([body], reference, true))
    expect(JSON.stringify(shapes)).toBe(before)
  })

  it.each([
    { x: 120, y: 40 },
    { x: 120, y: 100 },
    { kind: 'ellipse' as const, x: 120, y: 40 },
  ])('leaves the board unchanged for zero-area edge or point contact: %o', patch => {
    const body = rectangle()
    const cut = rectangle({ id: 'tangent', operation: 'cut', width: 20, height: 20, ...patch })
    expect(compileSketch([body, cut], reference, true)).toEqual(compileSketch([body], reference, true))
  })

  it('uses actual material rather than overlapping bounding boxes to identify an inactive cut', () => {
    const body = rectangle({ kind: 'ellipse' })
    const cut = rectangle({ id: 'corner', operation: 'cut', width: 2, height: 2 })
    expect(compileSketch([body, cut], reference, true)).toEqual(compileSketch([body], reference, true))
  })

  it('keeps applying real cuts before and after inactive cuts without changing the result', () => {
    const body = rectangle()
    const hole = rectangle({ id: 'hole', operation: 'cut', x: 40, y: 40, width: 20, height: 20 })
    const slot = rectangle({ id: 'slot', operation: 'cut', x: 50, y: 10, width: 2, height: 20 })
    const outside = rectangle({ id: 'outside', operation: 'cut', x: 150, width: 10 })
    const expected = expectValid([body, hole, slot])
    expect(compileSketch([outside, slot, body, hole], reference, true)).toEqual(expected)
    expect(compileSketch([body, hole, outside, slot], reference, true)).toEqual(expected)
    expect(partArea(expected.part!)).toBe(7580)
  })

  it('preserves an existing hole when an additional cut is fully inside already removed material', () => {
    const body = rectangle()
    const hole = rectangle({ id: 'hole', operation: 'cut', x: 40, y: 40, width: 20, height: 20 })
    const duplicate = { ...hole, id: 'duplicate' }
    const nested = rectangle({ id: 'nested', operation: 'cut', x: 45, y: 45, width: 5, height: 5 })
    const expected = expectValid([body, hole])
    expect(compileSketch([body, hole, duplicate, nested], reference, true)).toEqual(expected)
  })

  it('subtracts only the contacting mirrored copy and preserves the editable mirror setting', () => {
    const body = rectangle()
    const cut = rectangle({ id: 'mirror', operation: 'cut', x: 30, y: 40, width: 10, height: 10, mirror: true })
    const before = JSON.stringify(cut)
    const result = expectValid([body, cut])
    expect(result.part!.holes).toHaveLength(1)
    expect(partArea(result.part!)).toBe(7900)
    expect(JSON.stringify(cut)).toBe(before)
    expect(compileSketch([body, { ...cut, y: 130 }], reference, true)).toEqual(compileSketch([body], reference, true))
  })

  it('allows inactive cuts outside the reference while still enforcing the material boundary', () => {
    const body = rectangle()
    const outside = rectangle({ id: 'outside', operation: 'cut', x: -30, width: 10, mirror: true })
    expect(compileSketch([body, outside], reference, true)).toEqual(compileSketch([body], reference, true))
    const roundReference = { width: 200, height: 160, shape: 'ellipse' as const }
    const fittedBody = rectangle({ x: 60, y: 50, width: 80, height: 60 })
    const roundBoard = compileSketch([fittedBody], roundReference, true)
    expect(roundBoard.error).toBeNull()
    expect(compileSketch([fittedBody, outside], roundReference, true)).toEqual(roundBoard)
    expect(compileSketch([rectangle({ x: -2 }), outside], reference, true).error).toMatch(/范围/)
  })

  it('does not let inactive cuts bypass self-intersection, disconnectedness or full-removal errors', () => {
    const outside = rectangle({ id: 'outside', operation: 'cut', x: 150, width: 10 })
    const selfIntersecting = { ...outside, kind: 'polygon' as const, points: [[0, 0], [1, 1], [0, 1], [1, 0]] as Point2D[] }
    expect(compileSketch([rectangle(), selfIntersecting], reference, true).part).toBeNull()
    expect(compileSketch([rectangle({ width: 20 }), rectangle({ id: 'other', x: 150, width: 20 }), outside], reference, true).error).toMatch(/不相连|多个|连续/)
    const removeAll = rectangle({ id: 'all', operation: 'cut' })
    expect(compileSketch([rectangle(), outside, removeAll], reference, true).error).toMatch(/空|全部|剩余/)
    expect(compileSketch([rectangle(), removeAll, outside], reference, true).error).toMatch(/空|全部|剩余/)
  })

  it('enforces the selected drawing bounds, including mirrored geometry, without clipping', () => {
    const out = rectangle({ x: -2 })
    expect(compileSketch([out], reference, true).error).toMatch(/范围/)
    expect(compileSketch([out], reference, false).part).not.toBeNull()
    expect(compileSketch([rectangle({ x: -2, mirror: true })], reference, true).part).toBeNull()
  })

  it('enforces circular and elliptical reference boundaries, not only their bounding rectangles', () => {
    const ellipticalReference = { width: 200, height: 160, shape: 'ellipse' as const }
    const fitted = rectangle({ kind: 'ellipse', x: 0, y: 0, width: 200, height: 160 })
    expect(compileSketch([fitted], ellipticalReference, true).error).toBeNull()
    const corner = rectangle({ x: 0, y: 0, width: 10, height: 10, mirror: true })
    expect(compileSketch([corner], ellipticalReference, true).error).toMatch(/椭圆|圆形.*范围/)
    expect(compileSketch([rectangle({ x: 0, y: 0, width: 10, height: 10 })], ellipticalReference, false).error).toBeNull()
    expect(compileSketch([rectangle({ x: 70, y: 60, width: 60, height: 40 })], { width: 200, height: 200, shape: 'ellipse' }, true).error).toBeNull()
  })

  it('permits a cutting tool across a circular reference edge while keeping all remaining material inside', () => {
    const board = rectangle({ kind: 'ellipse', x: 0, y: 0, width: 130, height: 130 })
    const cut = rectangle({ id: 'cut', operation: 'cut', x: 64, y: -2, width: 2, height: 20 })
    const result = compileSketch([board, cut], { width: 130, height: 130, shape: 'ellipse' }, true)
    expect(result.error).toBeNull()
    expect(validatePart(result.part!).ok).toBe(true)
    expect(result.part!.holes ?? []).toHaveLength(0)
    for (const point of result.part!.contour.points) expect(Math.hypot(point[0] - 65, point[1] - 65)).toBeLessThanOrEqual(65 + 1e-7)
    const rectangular = compileSketch([rectangle({ x: 0, y: 0 }), rectangle({ id: 'cut', operation: 'cut', x: 20, y: -2, width: 2, height: 20 })], reference, true)
    expect(rectangular.error).toBeNull()
  })

  it('rejects self-intersections, duplicate vertices, and invalid normalized polygon coordinates', () => {
    for (const points of [
      [[0, 0], [1, 1], [0, 1], [1, 0]],
      [[0, 0], [1, 0], [1, 0], [1, 1]],
      [[0, 0], [2, 0], [1, 1]],
    ] as Point2D[][]) {
      expect(compileSketch([rectangle({ kind: 'polygon', points })], reference, true).error).not.toBeNull()
    }
  })

  it('rejects invalid dimensions, references, radius and non-finite inputs', () => {
    for (const patch of [{ width: 0 }, { width: -1 }, { width: 2001 }, { x: NaN }, { y: Infinity }, { radius: -1 }, { radius: 41 }]) {
      const shape = rectangle(patch)
      expect(() => shapePoints(shape)).toThrow()
      expect(compileSketch([shape], reference, false).part).toBeNull()
    }
    for (const width of [0, NaN, Infinity, 2001]) {
      expect(compileSketch([rectangle()], { width, height: 160 }, false).error).toMatch(/范围/)
    }
  })

  it('rejects excessive shape and polygon complexity before boolean operations', () => {
    expect(compileSketch(Array.from({ length: 33 }, (_, index) => rectangle({ id: `${index}` })), reference, true).error).toMatch(/32/)
    const points = Array.from({ length: 129 }, (_, index): Point2D => [0.5 + 0.5 * Math.cos(index * 2 * Math.PI / 129), 0.5 + 0.5 * Math.sin(index * 2 * Math.PI / 129)])
    expect(compileSketch([rectangle({ kind: 'polygon', points })], reference, true).error).toMatch(/128/)
  })

  it('bounds the final complexity and rejects excessive output rather than simplifying silently', () => {
    const shapes = [rectangle({ x: 0, y: 0, width: 2000, height: 2000 })]
    for (let index = 0; index < 30; index++) {
      shapes.push(rectangle({ id: `hole-${index}`, kind: 'ellipse', operation: 'cut', x: 50 + index % 6 * 300, y: 50 + Math.floor(index / 6) * 300, width: 60, height: 60 }))
    }
    expect(compileSketch(shapes, { width: 2000, height: 2000 }, true).error).toMatch(/最终顶点.*2000/)
  })

  it('handles capsule and fully rounded square endpoints without duplicate vertices', () => {
    expectValid([rectangle({ width: 80, height: 40, radius: 20 })])
    const result = expectValid([rectangle({ width: 40, height: 40, radius: 20 })])
    expect(result.bounds).toEqual({ x: 20, y: 20, width: 40, height: 40 })
    expect(partArea(result.part!)).toBeCloseTo(Math.PI * 400, 0)
  })

  it('is deterministic and disposes all Paper scopes after success and rejection', () => {
    const shapes = [rectangle({ radius: 8 }), rectangle({ id: 'hole', kind: 'ellipse', operation: 'cut', x: 40, y: 40, width: 10, height: 10 })]
    const scopes = Object.keys((paper.PaperScope as unknown as { _scopes: Record<string, unknown> })._scopes).length
    const expected = compileSketch(shapes, reference, true)
    for (let index = 0; index < 5; index++) {
      expect(compileSketch(shapes, reference, true)).toEqual(expected)
      compileSketch([...shapes, rectangle({ id: 'outside', operation: 'cut', x: 150, width: 10 })], reference, true)
      compileSketch([...shapes, rectangle({ id: 'all', operation: 'cut', x: 0, y: 0, width: 200, height: 160 })], reference, true)
    }
    expect(Object.keys((paper.PaperScope as unknown as { _scopes: Record<string, unknown> })._scopes)).toHaveLength(scopes)
  })
})

it('snaps to millimetres only when enabled and rejects invalid grid values', () => {
  expect(snapCoordinate(3.6, true)).toBe(4)
  expect(snapCoordinate(3.6, false)).toBe(3.6)
  expect(snapCoordinate(-3.6, true)).toBe(-4)
  expect(snapCoordinate(3.6, true, 0.5)).toBe(3.5)
  expect(snapCoordinate(-0.1, true)).toBe(0)
  expect(() => snapCoordinate(NaN, true)).toThrow()
  expect(() => snapCoordinate(3, true, 0)).toThrow()
})
