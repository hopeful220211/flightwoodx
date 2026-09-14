// @vitest-environment node
import { afterAll, expect, it, vi } from 'vitest'
vi.hoisted(() => vi.stubGlobal('self', { navigator: { userAgent: 'Node.js' } }))
import type { Part2D, Point2D } from '@fwx/geometry'
import { compileSketch, type SketchShape } from '../sketch/model'
import { analyzeSketchJoints } from '../sketch/jointGuides'
import { buildUserPartDef } from '../buildUserPartDef'
import { createInsertionSlot, nearestOuterEdge } from './insertionSlot'

afterAll(() => vi.unstubAllGlobals())

const board: SketchShape = { id: 'board', kind: 'rectangle', operation: 'add', x: 20, y: 20, width: 60, height: 60, radius: 0 }
const reference = { width: 100, height: 100 }
const part = compileSketch([board], reference, false).part!

it('snaps to the actual outer boundary, never an internal hole or a distant edge', () => {
  expect(nearestOuterEdge(part, [40, 19], 2)).toEqual([40, 20])
  expect(nearestOuterEdge(part, [40, 40], 2)).toBeNull()
  const withHole: Part2D = { ...part, holes: [{ points: [[40, 40], [50, 40], [50, 50], [40, 50]] }] }
  expect(nearestOuterEdge(withHole, [45, 40], 2)).toBeNull()
})

it.each([
  [[40, 20], [43, 35], 'y', 'start', [40, 35]],
  [[40, 80], [43, 65], 'y', 'end', [40, 65]],
  [[20, 40], [35, 43], 'x', 'start', [35, 40]],
  [[80, 40], [65, 43], 'x', 'end', [65, 40]],
] as const)('creates and persists the bottom and direction from %s', (start, end, axis, entry, bottom) => {
  const slot = createInsertionSlot(part, [...start], [...end])!
  expect(slot).toMatchObject({ operation: 'cut', kind: 'rectangle', joint: { kind: 'edge-slot', axis, entry } })
  expect(axis === 'x' ? slot.height : slot.width).toBe(2)
  const compiled = compileSketch([board, slot], reference, false)
  const result = analyzeSketchJoints([slot], compiled.part, 100)
  expect(result.error).toBeNull()
  const guide = result.guides[0]!
  expect(guide.lengthMm).toBe(15)
  expect(axis === 'x' ? [guide.x + (entry === 'start' ? guide.lengthMm : 0), guide.y + 1] : [guide.x + 1, guide.y + (entry === 'start' ? guide.lengthMm : 0)]).toEqual(bottom)
  const saved = buildUserPartDef({ name: '接口', category: 'mainboard', points: compiled.part!.contour.points, closed: true, jointGuides: result.guides })
  expect(saved.jointGuides).toHaveLength(1)
  expect(saved.jointGuides![0]).toMatchObject({ axis, entry, lengthMm: 15 })
})

it('rejects outward, too short, interior and missing-board gestures', () => {
  for (const end of [[40, 10], [40, 21], [60, 20]] as Point2D[]) expect(createInsertionSlot(part, [40, 20], end)).toBeNull()
  expect(createInsertionSlot(part, [40, 40], [40, 50])).toBeNull()
  expect(nearestOuterEdge(null, [40, 20], 10)).toBeNull()
})

it('keeps the bottom fixed on a curved board even when the mouth sides have unequal lengths', () => {
  const circle: SketchShape = { ...board, kind: 'ellipse' }
  const roundPart = compileSketch([circle], reference, false).part!
  const anchor = nearestOuterEdge(roundPart, [65, 24], 4)!
  const slot = createInsertionSlot(roundPart, anchor, [anchor[0], 40])!
  expect(slot).not.toBeNull()
  const compiled = compileSketch([circle, slot], reference, false)
  const result = analyzeSketchJoints([slot], compiled.part, 100)
  expect(result.error).toBeNull()
  expect(result.guides[0]!.y + result.guides[0]!.lengthMm).toBeCloseTo(40, 5)
  expect(() => buildUserPartDef({ name: '圆板接口', category: 'mainboard', points: compiled.part!.contour.points, closed: true, jointGuides: result.guides })).not.toThrow()
})
