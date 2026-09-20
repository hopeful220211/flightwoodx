// @vitest-environment node
import { afterAll, expect, it, vi } from 'vitest'
vi.hoisted(() => vi.stubGlobal('self', { navigator: { userAgent: 'Node.js' } }))
afterAll(() => vi.unstubAllGlobals())
import { curveShape, smoothFreehand, curvePoints } from './curves'
import { compileSketch, shapePoints } from './model'

it('uses exact cubic extrema for the selection box instead of flattened samples', () => {
  // y(t) = -90t(1-t)^2 reaches its minimum at t=1/3, not a subdivision point.
  const shape = curveShape([[20, 20], [60, 20], [60, 60], [20, 60]], [
    { in: [0, 0], out: [10, -30] }, { in: [-10, 0], out: [0, 0] },
    { in: [0, 0], out: [0, 0] }, { in: [0, 0], out: [0, 0] },
  ])!
  expect(shape.y).toBeCloseTo(20 - 40 / 3, 8)
  expect(shape.height).toBeCloseTo(40 + 40 / 3, 8)
})

it('retains editable cubic handles and compiles the same curved geometry after resize', () => {
  const shape = curveShape([[20, 20], [60, 20], [60, 60], [20, 60]], [
    { in: [0, 0], out: [10, -8] }, { in: [-10, -8], out: [0, 0] },
    { in: [0, 0], out: [0, 0] }, { in: [0, 0], out: [0, 0] },
  ])!
  expect(shape.curveHandles).toHaveLength(4)
  const points = shapePoints(shape)
  expect(Math.min(...points.map(p => p[1]))).toBeLessThan(20)
  const enlarged = shapePoints({ ...shape, width: shape.width * 2, height: shape.height * 2 })
  expect(Math.max(...enlarged.map(p => p[0])) - shape.x).toBeCloseTo(shape.width * 2)
  expect(compileSketch([shape], { width: 130, height: 130 }, true).error).toBeNull()
})

it('smooths a noisy unsnapped circle into bounded editable curves rather than grid stairs', () => {
  const raw = Array.from({ length: 300 }, (_, i): [number, number] => {
    const a = i / 299 * Math.PI * 2
    const r = 20 + Math.sin(i * 1.7) * 0.22
    return [50.3 + Math.cos(a) * r, 50.4 + Math.sin(a) * r]
  })
  const shape = smoothFreehand(raw)!
  expect(shape.points!.length).toBeLessThan(100)
  expect(shape.curveHandles!.some(h => h.out.some(v => v !== 0))).toBe(true)
  const sampled = curvePoints(shape)
  expect(sampled.every(p => Math.abs(Math.hypot(p[0] - 50.3, p[1] - 50.4) - 20) < 0.8)).toBe(true)
  expect(compileSketch([shape], { width: 130, height: 130 }, true).error).toBeNull()
})

it('rejects invalid control data and keeps self-crossing curves invalid', () => {
  expect(() => curveShape([[0, 0], [20, 0], [20, 20]], [{ in: [0, 0], out: [NaN, 0] }])).toThrow()
  const crossed = curveShape([[20, 20], [60, 60], [20, 60], [60, 20]])!
  expect(compileSketch([crossed], { width: 130, height: 130 }, true).part).toBeNull()
})
