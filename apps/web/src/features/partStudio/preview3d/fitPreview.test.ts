import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { getPreviewFrame, type PreviewView } from './fitPreview'

describe('physical part preview camera', () => {
  it.each(['perspective', 'top', 'side'] as PreviewView[])('fits the real millimetre geometry in %s at every target aspect', view => {
    for (const aspect of [0.65, 1, 1.8]) {
      const dimensions = [0.23, 0.002, 0.16] as const
      const frame = getPreviewFrame(dimensions, aspect, view)
      const camera = new PerspectiveCamera(42, aspect, frame.near, frame.far)
      camera.position.fromArray(frame.position)
      camera.up.fromArray(frame.up)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld(true)
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        const projected = new Vector3(x * dimensions[0] / 2, y * dimensions[1] / 2, z * dimensions[2] / 2).project(camera)
        expect(Math.abs(projected.x)).toBeLessThan(0.91)
        expect(Math.abs(projected.y)).toBeLessThan(0.91)
        expect(projected.z).toBeGreaterThan(-1)
        expect(projected.z).toBeLessThan(1)
      }
    }
  })

  it('changes camera distance proportionally instead of inflating a small part or its thickness', () => {
    const small = getPreviewFrame([0.04, 0.002, 0.02], 1, 'perspective')
    const large = getPreviewFrame([0.4, 0.02, 0.2], 1, 'perspective')
    expect(new Vector3(...large.position).length() / new Vector3(...small.position).length()).toBeCloseTo(10)
    expect(small.near).toBeLessThan(0.001)
    expect(small.gridStep).toBe(0.01)
  })
})
