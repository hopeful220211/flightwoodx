import { shapePoints, type SketchShape } from './model'

const PREFIX = 'FlightWoodX-sketch-v1:'
export function encodeSketchClipboard(shape: SketchShape): string {
  return PREFIX + JSON.stringify(shape)
}
export function decodeSketchClipboard(text: string): SketchShape | null {
  if (!text.startsWith(PREFIX) || text.length > 200_000) return null
  try {
    const shape = JSON.parse(text.slice(PREFIX.length)) as SketchShape
    if (!shape || typeof shape.id !== 'string' || !shape.id || !['add', 'cut'].includes(shape.operation)
      || (shape.mirror !== undefined && typeof shape.mirror !== 'boolean')) return null
    shapePoints(shape)
    if (shape.joint && (shape.kind !== 'rectangle' || shape.operation !== 'cut'
      || !['edge-slot', 'through-slot'].includes(shape.joint.kind) || !['x', 'y'].includes(shape.joint.axis)
      || !(shape.joint.kind === 'edge-slot' ? ['start', 'end'] : ['front', 'back']).includes(shape.joint.entry))) return null
    // Explicitly select editable fields, never copy an owner/server record.
    return { id: shape.id, kind: shape.kind, operation: shape.operation, x: shape.x, y: shape.y,
      width: shape.width, height: shape.height, radius: shape.radius,
      ...(shape.points ? { points: shape.points } : {}), ...(shape.joint ? { joint: shape.joint } : {}),
      ...(shape.curveHandles ? { curveHandles: shape.curveHandles } : {}),
      ...(shape.mirror !== undefined ? { mirror: shape.mirror } : {}) }
  } catch { return null }
}
export function pastedShape(shape: SketchShape, repetition: number): SketchShape {
  const copy = structuredClone(shape)
  const offset = Math.min(Math.max(1, repetition), 20) * 5
  return { ...copy, id: crypto.randomUUID(), x: copy.x + offset, y: copy.y + offset }
}

export function isNativeTextEdit(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="dialog"]')
}
