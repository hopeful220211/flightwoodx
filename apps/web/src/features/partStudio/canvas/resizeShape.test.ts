import { describe, expect, it } from 'vitest'
import type { SketchShape } from '../sketch/model'
import { resizeShape, resolveSelectionHandle, type ResizeHandle } from './resizeShape'

const shape: SketchShape = { id: 'part', kind: 'rectangle', operation: 'add', x: 20, y: 30, width: 40, height: 20, radius: 8 }
const plain = { snap: false, lockAspect: false }

describe('millimetre resize math', () => {
  it('resolves overlapping small-shape targets by nearest anchor and reserves the centre for moving', () => {
    const small = { ...shape, x: 10, y: 10, width: 2, height: 8, radius: 0 }
    const anchors: [ResizeHandle, number, number][] = [['nw', 10, 10], ['n', 11, 10], ['ne', 12, 10], ['e', 12, 14], ['se', 12, 18], ['s', 11, 18], ['sw', 10, 18], ['w', 10, 14]]
    for (const [handle, x, y] of anchors) expect(resolveSelectionHandle(small, [x, y])).toBe(handle)
    expect(resolveSelectionHandle(small, [11, 14])).toBe('move')
    expect(resolveSelectionHandle(small, [11.2, 14.3])).toBe('move')
    expect(resolveSelectionHandle(small, [11.9, 17.9])).toBe('se')
    expect(resolveSelectionHandle(small, [NaN, 14])).toBeNull()
  })
  it.each<[ResizeHandle, number, number, number, number]>([
    ['nw', 25, 35, 35, 15], ['n', 20, 35, 40, 15], ['ne', 20, 35, 45, 15],
    ['e', 20, 30, 45, 20], ['se', 20, 30, 45, 25], ['s', 20, 30, 40, 25],
    ['sw', 25, 30, 35, 25], ['w', 25, 30, 35, 20],
  ])('keeps the opposite anchor fixed for %s', (handle, x, y, width, height) => {
    expect(resizeShape(shape, handle, [5, 5], plain)).toMatchObject({ x, y, width, height })
  })

  it('snaps the moving edge, without moving an off-grid shape on a click', () => {
    const fractional = { ...shape, x: 20.25, width: 40.5 }
    expect(resizeShape(fractional, 'e', [0, 0], { ...plain, snap: true })).toBe(fractional)
    expect(resizeShape(fractional, 'e', [2.4, 0], { ...plain, snap: true })).toMatchObject({ x: 20.25, width: 42.75 })
  })

  it('locks the ratio for corners and side handles and permits shrinking', () => {
    expect(resizeShape(shape, 'se', [20, 1], { ...plain, lockAspect: true })).toMatchObject({ x: 20, y: 30, width: 60, height: 30 })
    expect(resizeShape(shape, 'nw', [20, 0], { ...plain, lockAspect: true })).toMatchObject({ x: 40, y: 40, width: 20, height: 10 })
    expect(resizeShape(shape, 'e', [20, 5], { ...plain, lockAspect: true })).toMatchObject({ x: 20, y: 25, width: 60, height: 30 })
    expect(resizeShape(shape, 'n', [0, 10], { ...plain, lockAspect: true })).toMatchObject({ x: 30, y: 40, width: 20, height: 10 })
  })

  it('never flips and clamps dimensions and corner radius', () => {
    expect(resizeShape(shape, 'nw', [100, 100], plain)).toMatchObject({ x: 59.9, y: 49.9, width: 0.1, height: 0.1, radius: 0.05 })
    expect(resizeShape(shape, 'se', [9000, 9000], plain)).toMatchObject({ width: 2000, height: 2000 })
    const locked = resizeShape(shape, 'se', [9000, 9000], { ...plain, lockAspect: true })!
    expect(locked.width / locked.height).toBe(2)
    expect(Math.max(locked.width, locked.height)).toBe(2000)
    const small = resizeShape(shape, 'nw', [9000, 9000], { ...plain, lockAspect: true })!
    expect(small.height).toBe(0.1)
    expect(small.width).toBe(0.2)
  })

  it('clamps radius against the final rounded dimensions without rounding the limit upward', () => {
    const result = resizeShape(shape, 'e', [-25.6666666667, 0], plain)!
    expect(result.width).toBe(14.333333333)
    expect(result.radius).toBeLessThanOrEqual(Math.min(result.width, result.height) / 2)
    expect(result.radius).toBe(result.width / 2)
  })

  it('preserves normalized polygon points and cut/mirror attributes', () => {
    const polygon: SketchShape = { ...shape, kind: 'polygon', operation: 'cut', radius: 0, mirror: true, points: [[0, 0], [1, 0], [0.5, 1]] }
    const result = resizeShape(polygon, 's', [0, 10], plain)!
    expect(result).toMatchObject({ id: polygon.id, kind: 'polygon', operation: 'cut', mirror: true, width: 40, height: 30 })
    expect(result.points).toBe(polygon.points)
    expect(polygon.height).toBe(20)
  })

  it('supports ellipses and rejects non-finite input without introducing NaN', () => {
    expect(resizeShape({ ...shape, kind: 'ellipse', radius: 0 }, 'e', [10, 0], plain)).toMatchObject({ kind: 'ellipse', width: 50, height: 20 })
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(resizeShape(shape, 'e', [value, 0], plain)).toBeNull()
      expect(resizeShape({ ...shape, width: value }, 'e', [10, 0], plain)).toBeNull()
    }
  })

  it('keeps negative origins inside the model coordinate bounds without shifting the fixed anchor', () => {
    const nearEdge = { ...shape, x: -1990, y: -1990 }
    expect(resizeShape(nearEdge, 'nw', [-100, -100], plain)).toMatchObject({ x: -2000, y: -2000, width: 50, height: 30 })
    const result = resizeShape(nearEdge, 'nw', [-100, -100], { ...plain, lockAspect: true })!
    expect(result.x).toBe(-2000)
    expect(result.y).toBe(-1995)
    expect(result.x + result.width).toBe(-1950)
    expect(result.y + result.height).toBe(-1970)
  })
})
