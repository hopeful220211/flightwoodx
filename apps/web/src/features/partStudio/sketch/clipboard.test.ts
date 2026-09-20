// @vitest-environment node
import { afterAll, expect, it, vi } from 'vitest'
vi.hoisted(() => vi.stubGlobal('self', { navigator: { userAgent: 'Node.js' } }))
afterAll(() => vi.unstubAllGlobals())
import { encodeSketchClipboard, decodeSketchClipboard, pastedShape } from './clipboard'
import type { SketchShape } from './model'

const shape: SketchShape = { id: 'original', kind: 'rectangle', operation: 'cut', x: 10, y: 15, width: 2, height: 12, radius: 0, joint: { kind: 'edge-slot', axis: 'y', entry: 'start' } }
it('copies only a bounded, validated sketch payload and preserves slot intent', () => {
  const decoded = decodeSketchClipboard(encodeSketchClipboard(shape))!
  expect(decoded).toEqual(shape)
  const pasted = pastedShape(decoded, 1)
  expect(pasted.id).not.toBe(shape.id)
  expect(pasted.x).toBe(15)
  expect(pasted.y).toBe(20)
  expect(pasted.width).toBe(2)
  expect(pasted.joint).toEqual(shape.joint)
  expect(pasted.joint).not.toBe(shape.joint)
})
it('ignores ordinary text and rejects corrupt or oversized payloads', () => {
  for (const value of ['hello', '{}', 'FlightWoodX-sketch-v1:{', 'x'.repeat(210000), encodeSketchClipboard(shape).replace('"width":2', '"width":-2')]) expect(decodeSketchClipboard(value)).toBeNull()
})
