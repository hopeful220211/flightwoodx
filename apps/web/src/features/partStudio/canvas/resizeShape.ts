import type { Point2D } from '@fwx/geometry'
import type { SketchShape } from '../sketch/model'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export interface ResizeOptions { snap: boolean; lockAspect: boolean }

export const RESIZE_HANDLES: { id: ResizeHandle; x: number; y: number; cursor: string }[] = [
  { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' }, { id: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { id: 'ne', x: 1, y: 0, cursor: 'nesw-resize' }, { id: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { id: 'se', x: 1, y: 1, cursor: 'nwse-resize' }, { id: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { id: 'sw', x: 0, y: 1, cursor: 'nesw-resize' }, { id: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
]

/** Generous targets may overlap on small holes/slots. Resolve their nearest
 * visible anchor geometrically, never by SVG paint order, and keep the central
 * half of the box available for moving the shape.
 */
export function resolveSelectionHandle(shape: SketchShape, point: Point2D): ResizeHandle | 'move' | null {
  if (![shape.x, shape.y, shape.width, shape.height, ...point].every(Number.isFinite) || shape.width <= 0 || shape.height <= 0) return null
  if (Math.abs((point[0] - shape.x) / shape.width - 0.5) < 0.25 && Math.abs((point[1] - shape.y) / shape.height - 0.5) < 0.25) return 'move'
  let closest: ResizeHandle = 'nw'
  let distance = Infinity
  for (const handle of RESIZE_HANDLES) {
    const next = Math.hypot(point[0] - shape.x - handle.x * shape.width, point[1] - shape.y - handle.y * shape.height)
    if (next < distance) { closest = handle.id; distance = next }
  }
  return closest
}

const MIN_SIZE = 0.1
const MAX_SIZE = 2000
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const rounded = (value: number) => Math.round(value * 1e9) / 1e9

/** Resize in model millimetres; the opposite corner/edge centre stays fixed.
 * Pointer offset inside a generous hit target is deliberately not an input.
 */
export function resizeShape(shape: SketchShape, handle: ResizeHandle, delta: Point2D, options: ResizeOptions): SketchShape | null {
  const { x, y, width: originalWidth, height: originalHeight, radius } = shape
  if (![x, y, originalWidth, originalHeight, radius, ...delta].every(Number.isFinite)
    || originalWidth < MIN_SIZE || originalHeight < MIN_SIZE || originalWidth > MAX_SIZE || originalHeight > MAX_SIZE
    || Math.abs(x) > MAX_SIZE || Math.abs(y) > MAX_SIZE || radius < 0) return null
  const horizontal = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const vertical = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0
  if ((!horizontal || delta[0] === 0) && (!vertical || delta[1] === 0)) return shape
  const anchorFractionX = horizontal === 1 ? 0 : horizontal === -1 ? 1 : 0.5
  const anchorFractionY = vertical === 1 ? 0 : vertical === -1 ? 1 : 0.5
  const anchorX = x + originalWidth * anchorFractionX
  const anchorY = y + originalHeight * anchorFractionY
  const dimension = (origin: number, size: number, direction: number, distance: number) => {
    if (!direction || distance === 0) return size
    const edge = origin + (direction === 1 ? size : 0)
    const moved = options.snap ? Math.round(edge + distance) : edge + distance
    return size + (moved - edge) * direction
  }
  let width = dimension(x, originalWidth, horizontal, delta[0])
  let height = dimension(y, originalHeight, vertical, delta[1])
  // Also respect model origin bounds while keeping the opposite anchor fixed.
  const limits = (anchor: number, fraction: number): [number, number] => fraction === 0
    ? [MIN_SIZE, MAX_SIZE]
    : [Math.max(MIN_SIZE, (anchor - MAX_SIZE) / fraction), Math.min(MAX_SIZE, (anchor + MAX_SIZE) / fraction)]
  const [minWidth, maxWidth] = limits(anchorX, anchorFractionX)
  const [minHeight, maxHeight] = limits(anchorY, anchorFractionY)
  if (options.lockAspect) {
    const widthScale = width / originalWidth
    const heightScale = height / originalHeight
    const requestedScale = !horizontal ? heightScale : !vertical ? widthScale
      : Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale
    const scale = clamp(requestedScale, Math.max(minWidth / originalWidth, minHeight / originalHeight), Math.min(maxWidth / originalWidth, maxHeight / originalHeight))
    width = originalWidth * scale
    height = originalHeight * scale
  } else {
    width = clamp(width, minWidth, maxWidth)
    height = clamp(height, minHeight, maxHeight)
  }
  width = rounded(width)
  height = rounded(height)
  return { ...shape, x: rounded(anchorX - width * anchorFractionX), y: rounded(anchorY - height * anchorFractionY),
    width, height, radius: Math.min(radius, width / 2, height / 2) }
}
