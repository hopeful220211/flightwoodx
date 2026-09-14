import { validateJointGuides, type Part2D, type Point2D } from '@fwx/geometry'
import { USER_PART_THICKNESS_MM, type JointGuide } from '@fwx/parts-schema'
import type { SketchShape } from './model'

const EPSILON = 1e-7
const near = (a: number, b: number) => Math.abs(a - b) <= EPSILON
const rounded = (value: number) => Math.round(value * 1e9) / 1e9
const failure = (error: string) => ({ guides: [] as JointGuide[], error })

/** Only remove redundant points on the same directed straight segment. This
 * helps map an editable cut to its boundary; shared geometry remains the final
 * authority for a complete hole/U and for overlapping guides.
 */
function corners(points: Point2D[]): Point2D[] {
  let result = points.slice()
  if (result.length > 1 && result[0]![0] === result.at(-1)![0] && result[0]![1] === result.at(-1)![1]) result.pop()
  let changed = true
  while (changed && result.length > 3) {
    changed = false
    result = result.filter((point, index, ring) => {
      const previous = ring[(index + ring.length - 1) % ring.length]!
      const next = ring[(index + 1) % ring.length]!
      const ax = point[0] - previous[0]
      const ay = point[1] - previous[1]
      const bx = next[0] - point[0]
      const by = next[1] - point[1]
      if (ax * by - ay * bx === 0 && ax * bx + ay * by >= 0) { changed = true; return false }
      return true
    })
  }
  return result
}

/** Find the two fixed bottom corners and their adjacent side endpoints. Only
 * the outside extension is clipped: the editable cut's bottom never moves.
 */
function edgeGuide(shape: SketchShape, contour: Point2D[]): JointGuide | null {
  const joint = shape.joint!
  const horizontal = joint.axis === 'x'
  const begin = horizontal ? shape.x : shape.y
  const length = horizontal ? shape.width : shape.height
  const side = horizontal ? shape.y : shape.x
  const bottom = joint.entry === 'start' ? begin + length : begin
  const ring = corners(contour).map(([x, y]): Point2D => horizontal ? [x, y] : [y, x])
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index]!
    const b = ring[(index + 1) % ring.length]!
    if (!near(a[0], bottom) || !near(b[0], bottom)
      || !((near(a[1], side) && near(b[1], side + USER_PART_THICKNESS_MM))
        || (near(b[1], side) && near(a[1], side + USER_PART_THICKNESS_MM)))) continue
    const before = ring[(index + ring.length - 1) % ring.length]!
    const after = ring[(index + 2) % ring.length]!
    if (!near(before[1], a[1]) || !near(after[1], b[1])) continue
    const mouths = [before[0], after[0]]
    if (mouths.some(value => (joint.entry === 'start' ? bottom - value : value - bottom) < USER_PART_THICKNESS_MM - EPSILON)) continue
    const mouth = joint.entry === 'start' ? Math.min(...mouths) : Math.max(...mouths)
    const depth = rounded(joint.entry === 'start' ? bottom - mouth : mouth - bottom)
    if (mouth < begin - EPSILON || mouth > begin + length + EPSILON || depth < USER_PART_THICKNESS_MM) continue
    const origin = rounded(joint.entry === 'start' ? mouth : bottom)
    return { id: shape.id, ...joint, x: horizontal ? origin : side, y: horizontal ? side : origin, lengthMm: depth }
  }
  return null
}

/** Map explicit editing intent to the actual, compiled millimetre geometry.
 * Invalid/inactive joint intent is repairable: it never mutates or discards
 * the part or source cuts. Generic cuts deliberately create no guides.
 */
export function analyzeSketchJoints(shapes: SketchShape[], part: Part2D | null, referenceWidth: number): { guides: JointGuide[]; error: string | null } {
  const joints = shapes.filter(shape => shape.joint !== undefined)
  if (!joints.length) return { guides: [], error: null }
  if (!part) return failure('请先生成完整木板，再调整拼接槽。')
  if (!Number.isFinite(referenceWidth) || referenceWidth <= 0) return failure('参考范围宽度无效，请重新设置。')
  const guides: JointGuide[] = []
  for (const shape of joints) {
    const joint = shape.joint!
    const length = joint.axis === 'x' ? shape.width : shape.height
    const width = joint.axis === 'x' ? shape.height : shape.width
    const validEntry = joint.kind === 'edge-slot' ? joint.entry === 'start' || joint.entry === 'end'
      : joint.kind === 'through-slot' && (joint.entry === 'front' || joint.entry === 'back')
    if (shape.kind !== 'rectangle' || shape.operation !== 'cut' || shape.radius !== 0
      || ![shape.x, shape.y, shape.width, shape.height].every(Number.isFinite)
      || (joint.axis !== 'x' && joint.axis !== 'y') || !validEntry
      || width !== USER_PART_THICKNESS_MM || length < USER_PART_THICKNESS_MM || length > 2000) {
      return failure('拼接槽需为直角矩形切除，槽宽固定 2 mm，长度至少 2 mm；请检查类型、尺寸和入口方向。')
    }
    const copies = [shape]
    const mirrorX = referenceWidth - shape.x - shape.width
    if (shape.mirror && !near(mirrorX, shape.x)) {
      const entry = joint.axis === 'x' && joint.kind === 'edge-slot' ? joint.entry === 'start' ? 'end' : 'start' : joint.entry
      copies.push({ ...shape, id: `${shape.id}_mirror`, x: mirrorX, joint: { ...joint, entry } })
    }
    for (const copy of copies) {
      const guide = joint.kind === 'through-slot'
        ? { id: copy.id, ...copy.joint!, x: copy.x, y: copy.y, lengthMm: length }
        : edgeGuide(copy, part.contour.points)
      if (!guide) return failure('边缘拼接槽需从木板边缘开口，并保留完整的两侧和槽底；请调整位置、长度或入口方向。')
      guides.push(guide)
    }
  }
  const validation = validateJointGuides(part, guides)
  if (!validation.ok) return failure('拼接槽与实际孔槽不一致，或槽之间重叠；请调整位置、尺寸或类型。')
  return { guides, error: null }
}
