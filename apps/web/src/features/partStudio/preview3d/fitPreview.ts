/** Camera-only fitting. Physical geometry is never normalized or stretched. */
export type PreviewView = 'perspective' | 'top' | 'side'
type Vec3 = [number, number, number]

export function getPreviewFrame(dimensions: readonly [number, number, number], aspect: number, view: PreviewView) {
  const radius = Math.max(Math.hypot(...dimensions) / 2, 0.0001)
  const verticalFov = 42 * Math.PI / 180
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.1))
  const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.22
  const direction: Vec3 = view === 'top' ? [0, 1, 0] : view === 'side' ? [0, 0, 1] : [1, 1.15, 1]
  const length = Math.hypot(...direction)
  const span = Math.max(...dimensions)
  const gridStep = span > 0.5 ? 0.05 : 0.01
  const gridSize = Math.max(gridStep * 4, Math.ceil(span * 1.5 / gridStep) * gridStep)
  return {
    position: direction.map(value => value / length * distance) as Vec3,
    up: (view === 'top' ? [0, 0, -1] : [0, 1, 0]) as Vec3,
    near: Math.max(radius / 100, 0.000001),
    far: Math.max(distance + radius * 6, 1),
    minDistance: radius * 1.2,
    maxDistance: distance * 4,
    gridSize, gridStep,
    gridDivisions: Math.round(gridSize / gridStep),
  }
}
