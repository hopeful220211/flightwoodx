import { expect, it } from 'vitest'
import { roundOuterCorners } from './roundCorners'
import { validatePart, type Part2D } from './index'

const board: Part2D = { contour: { points: [[0, 0], [40, 0], [40, 30], [0, 30]] } }
it('rounds four exterior corners with tangent arcs without mutating the source', () => {
  const result = roundOuterCorners(board, 1)
  expect(result.rounded).toBe(4)
  expect(result.part.contour.points).toContainEqual([1, 0])
  expect(result.part.contour.points).toContainEqual([0, 1])
  expect(result.part.contour.points).not.toContainEqual([0, 0])
  expect(board.contour.points).toHaveLength(4)
  expect(validatePart(result.part).ok).toBe(true)
})
it('adapts radius at acute short edges and thin regions, preserving a valid outline', () => {
  const triangle: Part2D = { contour: { points: [[0, 0], [40, 0], [0.3, 0.8]] } }
  const result = roundOuterCorners(triangle, 2)
  expect(result.limited).toBeGreaterThan(0)
  expect(validatePart(result.part).ok).toBe(true)
  expect(result.part.contour.points.every(([x, y]) => x >= 0 && y >= 0 && x <= 40 && y <= 0.8)).toBe(true)
})
it('preserves inner holes and all slot corners, walls and bottom coordinates', () => {
  const part: Part2D = { contour: { points: [[0, 0], [10, 0], [10, 10], [12, 10], [12, 0], [40, 0], [40, 30], [0, 30]] }, holes: [{ points: [[20, 10], [20, 15], [25, 15], [25, 10]] }] }
  const result = roundOuterCorners(part, 2, [{ x: 10, y: 0, width: 2, height: 10 }])
  for (const point of [[10, 0], [10, 10], [12, 10], [12, 0]]) expect(result.part.contour.points).toContainEqual(point)
  expect(result.part.holes).toEqual(part.holes)
  expect(result.protected).toBeGreaterThan(0)
  expect(validatePart(result.part).ok).toBe(true)
})
it('is opt-in and rejects invalid radii', () => {
  expect(roundOuterCorners(board, 0).part).toEqual(board)
  for (const r of [-1, NaN, Infinity, 2001]) expect(() => roundOuterCorners(board, r)).toThrow()
})
