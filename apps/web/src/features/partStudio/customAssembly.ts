import { CustomPartSourceSchema, UserPartGeometrySchema, UserPartSchema, type DesignPartInstance, type UserPartGeometry } from '@fwx/parts-schema'
import { svgGeometryToPart2D, type Part2D } from '@fwx/geometry'
import { ExtrudeGeometry, Path, Shape, Vector2 } from 'three'
import { ensureWinding } from './geometry/winding'

function parseGeometry(geometry: UserPartGeometry): Part2D {
  const part = svgGeometryToPart2D(geometry)
  if (!part) throw new Error('零件轮廓无效、尺寸不符或超出显示范围（2000 个顶点 / 2000 mm）；来源引用仍保留')
  return part
}

/** Authenticated source data is authoritative. Never promote a new revision to an existing reference. */
export function resolveCustomPart(data: unknown, instance: Pick<DesignPartInstance, 'partId' | 'category' | 'source'>, ownerId: string | undefined) {
  const part = UserPartSchema.parse(data)
  const source = CustomPartSourceSchema.parse(instance.source)
  if (!ownerId || part.ownerId !== ownerId) throw new Error('零件不属于当前登录账号，来源引用仍保留')
  if (part.id !== source.id || instance.partId !== `custom_${source.id}` || part.version !== source.version || part.updatedAt !== source.updatedAt) {
    throw new Error('原零件已修改，无法恢复该版本；来源引用仍保留，请重新选择零件')
  }
  if ((part.category === 'deco' ? 'joint' : part.category) !== instance.category) throw new Error('零件来源类别不一致，来源引用仍保留')
  parseGeometry(part.geometry)
  return part
}

export function makeCustomInstance(data: unknown, ownerId: string | undefined): Omit<DesignPartInstance, 'instanceId'> {
  const part = UserPartSchema.parse(data)
  const instance = {
    partId: `custom_${part.id}`, category: part.category === 'deco' ? 'joint' as const : part.category,
    position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number], attachedTo: null,
    source: CustomPartSourceSchema.parse({ kind: 'custom', id: part.id, version: part.version, updatedAt: part.updatedAt }),
  }
  resolveCustomPart(part, instance, ownerId)
  return instance
}

/** Geometry stays transient. Millimetres become metres; 2mm thickness and holes are retained. */
export function buildCustomGeometry(geometry: UserPartGeometry): ExtrudeGeometry {
  UserPartGeometrySchema.parse(geometry)
  const part = parseGeometry(geometry)
  const toVectors = (points: Part2D['contour']['points'], ccw: boolean) => ensureWinding(points, ccw).map(([x, y]) => new Vector2(x / 1000, -y / 1000))
  const shape = new Shape(toVectors(part.contour.points, true))
  shape.holes = (part.holes ?? []).map(hole => new Path(toVectors(hole.points, false)))
  const mesh = new ExtrudeGeometry(shape, { depth: geometry.thicknessMm / 1000, bevelEnabled: false, steps: 1, curveSegments: 1 })
  // Default ExtrudeGeometry UVs use metre coordinates. Normalize once so
  // studio, assembly and generated covers use identical visible wood grain.
  mesh.computeBoundingBox()
  const box = mesh.boundingBox!
  const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y)
  const positions = mesh.getAttribute('position')
  const normals = mesh.getAttribute('normal')
  const uv = mesh.getAttribute('uv')
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) - box.min.x
    const y = positions.getY(i) - box.min.y
    const z = positions.getZ(i) - box.min.z
    if (Math.abs(normals.getZ(i)) > 0.5) uv.setXY(i, x / span, y / span)
    else uv.setXY(i, (Math.abs(normals.getX(i)) > Math.abs(normals.getY(i)) ? y : x) / span, z / span)
  }
  uv.needsUpdate = true
  mesh.center()
  mesh.rotateX(-Math.PI / 2)
  return mesh
}
