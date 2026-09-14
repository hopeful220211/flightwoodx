import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Part2D, Point2D } from '@fwx/geometry'
vi.hoisted(() => vi.stubGlobal('self', { navigator: { userAgent: 'Node.js' } }))
import { compileSketch, type SketchShape } from './model'
import { analyzeSketchJoints } from './jointGuides'

afterAll(() => vi.unstubAllGlobals())
const reference = { width: 140, height: 120 }
const board: SketchShape = { id: 'board', kind: 'rectangle', operation: 'add', x: 20, y: 20, width: 100, height: 80, radius: 0 }
const through: SketchShape = { id: 'slot', kind: 'rectangle', operation: 'cut', x: 40, y: 40, width: 2, height: 20, radius: 0, joint: { kind: 'through-slot', axis: 'y', entry: 'front' } }
const edge: SketchShape = { ...through, y: 10, height: 30, joint: { kind: 'edge-slot', axis: 'y', entry: 'start' } }

function compile(shapes: SketchShape[]): Part2D {
  const result = compileSketch(shapes, reference, true)
  expect(result.error).toBeNull()
  expect(result.part).not.toBeNull()
  return result.part!
}
function analyze(shapes: SketchShape[]) {
  return analyzeSketchJoints(shapes, compile(shapes), reference.width)
}

describe('sketch joint intent follows the final cut geometry', () => {
  it('does not infer joints from ordinary cuts and tolerates a missing preview without intent', () => {
    const ordinary = { ...through, joint: undefined }
    expect(analyze([board, ordinary])).toEqual({ guides: [], error: null })
    expect(analyzeSketchJoints([], null, reference.width)).toEqual({ guides: [], error: null })
  })

  it.each(['front', 'back'] as const)('records a complete internal through-slot with %s entry', entry => {
    expect(analyze([board, { ...through, joint: { ...through.joint!, entry } }])).toEqual({
      guides: [{ id: 'slot', kind: 'through-slot', x: 40, y: 40, lengthMm: 20, axis: 'y', entry }], error: null,
    })
  })

  it.each<[Partial<SketchShape>, number, number, number]>([
    [{}, 40, 20, 20],
    [{ y: 80, height: 30, joint: { kind: 'edge-slot', axis: 'y', entry: 'end' } }, 40, 80, 20],
    [{ x: 10, y: 40, width: 30, height: 2, joint: { kind: 'edge-slot', axis: 'x', entry: 'start' } }, 20, 40, 20],
    [{ x: 100, y: 40, width: 30, height: 2, joint: { kind: 'edge-slot', axis: 'x', entry: 'end' } }, 100, 40, 20],
  ])('clips only the outside extension of an actual edge slot %j', (patch, x, y, lengthMm) => {
    const cut = { ...edge, ...patch }
    const before = structuredClone(cut)
    const result = analyze([board, cut])
    expect(result).toEqual({ guides: [{ id: 'slot', ...cut.joint!, x, y, lengthMm }], error: null })
    expect(cut).toEqual(before)
  })

  it('accepts the mouth exactly on the real edge without requiring an outside extension', () => {
    expect(analyze([board, { ...edge, y: 20, height: 20 }]).guides[0]).toMatchObject({ x: 40, y: 20, lengthMm: 20 })
  })

  it('keeps an exact 2 mm depth valid after decimal-coordinate subtraction', () => {
    const result = analyze([ { ...board, y: 15.99 }, { ...edge, height: 7.99 } ])
    expect(result.error).toBeNull()
    expect(result.guides[0]).toMatchObject({ x: 40, y: 15.99, lengthMm: 2 })
  })

  it('finds a U across the contour start and with redundant straight-edge points', () => {
    const part = compile([board, edge])
    const points = part.contour.points
    const bottomIndex = points.findIndex(([x, y]) => x === 40 && y === 40)
    const rotated = [...points.slice(bottomIndex), ...points.slice(0, bottomIndex)]
    const withMidpoints = rotated.flatMap((point, index): Point2D[] => {
      const next = rotated[(index + 1) % rotated.length]!
      return [point, [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2]]
    })
    expect(analyzeSketchJoints([board, edge], { ...part, contour: { points: withMidpoints } }, reference.width).error).toBeNull()
    expect(analyzeSketchJoints([board, edge], { ...part, contour: { points: [...withMidpoints].reverse() } }, reference.width).error).toBeNull()
  })

  it('keeps the preview and source intact but reports an inactive joint as fixable', () => {
    const outside = { ...edge, x: 130 }
    const shapes = [board, outside]
    const part = compile(shapes)
    const before = structuredClone({ part, shapes })
    expect(analyzeSketchJoints(shapes, part, reference.width)).toMatchObject({ guides: [], error: expect.any(String) })
    expect({ part, shapes }).toEqual(before)
  })

  it('rejects an interior hole as an edge slot and an open notch as a through-slot', () => {
    expect(analyze([board, { ...through, joint: edge.joint }]).error).not.toBeNull()
    expect(analyze([board, { ...edge, joint: through.joint }]).error).not.toBeNull()
    expect(analyze([board, { ...edge, joint: { ...edge.joint!, entry: 'end' } }]).error).not.toBeNull()
  })

  it('rejects holes or U walls changed by other cuts', () => {
    const intrusion: SketchShape = { ...through, id: 'intrusion', x: 41, y: 30, width: 4, height: 3, joint: undefined }
    expect(analyze([board, edge, intrusion]).error).not.toBeNull()
    expect(analyze([board, through, { ...intrusion, y: 50 }]).error).not.toBeNull()
  })

  it('rejects a sloping entry whose two mouth coordinates do not align', () => {
    const sloping: SketchShape = { ...board, kind: 'polygon', points: [[0, 0], [1, 0.25], [1, 1], [0, 1]] }
    expect(analyze([sloping, { ...edge, height: 50 }]).error).not.toBeNull()
  })

  it('does not annotate a convex three-edge protrusion as an empty U notch', () => {
    // The board is below the U so its centre is material rather than cutout.
    const bump: Part2D = { contour: { points: [[20, 60], [40, 60], [40, 40], [42, 40], [42, 60], [120, 60], [120, 100], [20, 100]] } }
    const staleIntent: SketchShape = { ...edge, y: 40, height: 30, joint: { kind: 'edge-slot', axis: 'y', entry: 'end' } }
    expect(analyzeSketchJoints([staleIntent], bump, reference.width).error).not.toBeNull()
  })

  it('mirrors x coordinates and reverses x-axis entry, not y or through-face entry', () => {
    const xSlot: SketchShape = { ...edge, x: 10, y: 40, width: 20, height: 2, mirror: true, joint: { kind: 'edge-slot', axis: 'x', entry: 'start' } }
    expect(analyze([board, xSlot])).toEqual({ error: null, guides: [
      { id: 'slot', kind: 'edge-slot', axis: 'x', entry: 'start', x: 20, y: 40, lengthMm: 10 },
      { id: 'slot_mirror', kind: 'edge-slot', axis: 'x', entry: 'end', x: 110, y: 40, lengthMm: 10 },
    ] })
    const result = analyze([board, { ...through, mirror: true }])
    expect(result.error).toBeNull()
    expect(result.guides).toMatchObject([{ x: 40, entry: 'front' }, { x: 98, entry: 'front' }])
    expect(analyze([board, { ...edge, mirror: true }]).guides).toMatchObject([{ x: 40, entry: 'start' }, { x: 98, entry: 'start' }])
  })

  it('does not create duplicate guides for a centred mirrored cut', () => {
    const result = analyze([board, { ...through, x: 69, mirror: true }])
    expect(result.error).toBeNull()
    expect(result.guides).toHaveLength(1)
  })

  it('rejects incomplete geometry and malformed joint intent without changing the part', () => {
    const part = compile([board, through])
    for (const patch of [{ kind: 'ellipse' as const }, { operation: 'add' as const }, { radius: 0.1 }, { width: 3 }, { height: 1 }, { x: NaN }, { joint: { kind: 'through-slot' as const, axis: 'y' as const, entry: 'start' as const } }]) {
      expect(analyzeSketchJoints([{ ...through, ...patch }], part, reference.width).error).not.toBeNull()
    }
    expect(analyzeSketchJoints([through], null, reference.width).error).not.toBeNull()
    expect(analyzeSketchJoints([{ ...through, mirror: true }], part, NaN).error).not.toBeNull()
    expect(analyze([board, { ...edge, y: 10, height: 11 }]).error).not.toBeNull()
  })
})
