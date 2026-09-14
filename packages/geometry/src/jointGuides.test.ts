import { describe, expect, it } from 'vitest'
import * as geometry from './index'
import type { Part2D, Point2D } from './index'

const through = { id: 'through-1', kind: 'through-slot' as const, x: 5, y: 5, lengthMm: 10, axis: 'x' as const, entry: 'front' as const }
const edge = { id: 'edge-1', kind: 'edge-slot' as const, x: 0, y: 9, lengthMm: 10, axis: 'x' as const, entry: 'start' as const }
const square: Point2D[] = [[0, 0], [20, 0], [20, 20], [0, 20]]
const hole: Point2D[] = [[5, 5], [15, 5], [15, 7], [5, 7]]
const outline: Point2D[] = [[0, 0], [20, 0], [20, 20], [0, 20], [0, 11], [10, 11], [10, 9], [0, 9]]
const plate: Part2D = { contour: { points: square }, holes: [{ points: hole }] }
const notched: Part2D = { contour: { points: outline } }
const check = (part: Part2D, guides: unknown[]) => {
  expect(geometry).toHaveProperty('validateJointGuides')
  return (geometry as unknown as { validateJointGuides: (part: Part2D, guides: unknown[]) => geometry.ValidationResult }).validateJointGuides(part, guides)
}
const transform = (points: Point2D[], fn: (point: Point2D) => Point2D): Point2D[] => points.map(fn)

describe('validateJointGuides', () => {
  it('accepts legacy parts without guides and real through-slots on either face', () => {
    expect(check(plate, []).ok).toBe(true)
    expect(check(plate, [through]).ok).toBe(true)
    expect(check(plate, [{ ...through, entry: 'back' }]).ok).toBe(true)
  })
  it('accepts complete edge slots in all four entry directions', () => {
    expect(check(notched, [edge]).ok).toBe(true)
    expect(check({ contour: { points: transform(outline, ([x, y]) => [20 - x, y]) } }, [{ ...edge, x: 10, entry: 'end' }]).ok).toBe(true)
    expect(check({ contour: { points: transform(outline, ([x, y]) => [y, x]) } }, [{ ...edge, x: 9, y: 0, axis: 'y' }]).ok).toBe(true)
    expect(check({ contour: { points: transform(outline, ([x, y]) => [y, 20 - x]) } }, [{ ...edge, x: 9, y: 10, axis: 'y', entry: 'end' }]).ok).toBe(true)
  })
  it('matches reversed, rotated-start and collinearly subdivided rings', () => {
    const split = [...outline.slice(0, 5), [5, 11] as Point2D, ...outline.slice(5)]
    expect(check({ contour: { points: [...split.slice(6), ...split.slice(0, 6)].reverse() } }, [edge]).ok).toBe(true)
    expect(check({ contour: { points: square }, holes: [{ points: [[5, 5], [10, 5], [15, 5], [15, 7], [5, 7]].reverse() as Point2D[] }] }, [through]).ok).toBe(true)
  })
  it('accepts unequal mouth endpoints on a sloped outer edge without moving the bottom', () => {
    const sloped: Part2D = { contour: { points: [[0, 0], [20, 0], [20, 20], [0, 20], [0, 11], [10, 11], [10, 9], [1, 9]] } }
    expect(check(sloped, [edge]).ok).toBe(true)
    expect(check(sloped, [{ ...edge, lengthMm: 9 }]).ok).toBe(false)
    expect(check(sloped, [{ ...edge, x: -1, lengthMm: 11 }]).ok).toBe(false)
    expect(check(sloped, [{ ...edge, entry: 'end' }]).ok).toBe(false)
  })
  it('accepts vertical through-slots and the serialization tolerance', () => {
    expect(check({ contour: { points: square }, holes: [{ points: transform(hole, ([x, y]) => [y, x]) }] }, [{ ...through, axis: 'y' }]).ok).toBe(true)
    expect(check(plate, [{ ...through, x: through.x + 0.005 }]).ok).toBe(true)
  })
  it('accepts separate real edge and through guides in one part', () => {
    const both: Part2D = { contour: notched.contour, holes: [{ points: [[12, 5], [18, 5], [18, 7], [12, 7]] }] }
    expect(check(both, [edge, { ...through, x: 12, lengthMm: 6 }]).ok).toBe(true)
  })
  it('rejects absent, displaced, widened, merged or altered holes', () => {
    expect(check({ contour: { points: square } }, [through]).ok).toBe(false)
    expect(check(plate, [{ ...through, x: 6 }]).ok).toBe(false)
    expect(check(plate, [{ ...through, lengthMm: 8 }]).ok).toBe(false)
    expect(check({ contour: { points: square }, holes: [{ points: [[5, 5], [15, 5], [15, 8], [5, 8]] }] }, [through]).ok).toBe(false)
    expect(check({ contour: { points: square }, holes: [{ points: [[5, 5], [15, 5], [15, 7], [12, 7], [12, 8], [9, 8], [9, 7], [5, 7]] }] }, [through]).ok).toBe(false)
  })
  it('rejects wrong entry, incomplete or damaged U shapes and convex protrusions', () => {
    expect(check(notched, [{ ...edge, entry: 'end' }]).ok).toBe(false)
    expect(check(plate, [{ ...through, kind: 'edge-slot', entry: 'start' }]).ok).toBe(false)
    expect(check({ contour: { points: [...outline.slice(0, 6), [11, 10], ...outline.slice(6)] as Point2D[] } }, [edge]).ok).toBe(false)
    const tongue: Part2D = { contour: { points: [[0, 0], [20, 0], [20, 9], [30, 9], [30, 11], [20, 11], [20, 20], [0, 20]] } }
    expect(check(tongue, [{ ...edge, x: 20 }]).ok).toBe(false)
  })
  it('rejects duplicate/overlapping guides and forged schema values', () => {
    expect(check(plate, [through, through]).ok).toBe(false)
    expect(check(plate, [through, { ...through, id: 'another', entry: 'back' }]).ok).toBe(false)
    for (const patch of [{ lengthMm: 1 }, { x: NaN }, { widthMm: 3 }, { entry: 'start' }, { id: '' }]) expect(check(plate, [{ ...through, ...patch }]).ok).toBe(false)
  })
  it('rejects malformed or self-intersecting geometry without throwing', () => {
    expect(check({ contour: { points: [[0, 0], [20, 20], [20, 0], [0, 20]] } }, [edge]).ok).toBe(false)
    expect(check({ ...plate, holes: {} } as unknown as Part2D, [through]).ok).toBe(false)
    expect(check({ ...plate, holes: [null] } as unknown as Part2D, [through]).ok).toBe(false)
  })
  it('does not double coordinate tolerance into a wider-than-2mm slot', () => {
    const widened: Part2D = { contour: { points: square }, holes: [{ points: [[5, 4.99], [15, 4.99], [15, 7.01], [5, 7.01]] }] }
    expect(check(widened, [through]).ok).toBe(false)
  })
})
