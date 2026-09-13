/**
 * @fwx/geometry — 木质激光切割件的 2D 几何工具（RFC-024 §4.4 / RFC-024-A §二）。
 *
 * 定位：薄封装 maker.js（Apache-2.0），把合法闭合折线转换为待验证的 DXF 与预览 SVG。
 * 边界（够用就好，刻意不做）：kerf 补偿、自动排版 nesting、材料库、多厚度、G-code、
 *   Bezier/spline 保真、OBJ 反推。1.0 只走「合法 2D 闭合折线 → DXF/SVG」这一条确定性链路。
 *
 * 只支持：单位 mm、闭合折线（首尾自动相连）、外轮廓 + 内孔、单层 CUT、板厚常量 2mm。
 */
import makerjs from 'makerjs'

// 一个平面点，单位 mm：[x, y]。
export type Point2D = [number, number]

// 一条闭合折线：点序列，首尾自动相连（无需重复首点），点数 ≥ 3。
export interface Polyline {
  points: Point2D[]
}

// 一个可切割的 2D 零件：一条外轮廓 + 若干内孔（镂空）。单位 mm。
export interface Part2D {
  contour: Polyline
  holes?: Polyline[]
}

/** 与零件契约解耦的 SVG 折线路径输入，供 web 与 api 共用同一解析规则。 */
export interface SvgPathGeometry {
  contour: string
  holes?: string[]
  /** 有声明时必须与路径实测范围一致；允许存盘坐标的 0.01mm 舍入。 */
  bboxMm?: { w: number; h: number }
}

// 与现有自制件显示边界一致。这些是输入/计算上限，不代表板材或加工能力。
export const MAX_SVG_TOTAL_POINTS = 2000
export const MAX_SVG_SIZE_MM = 2000
export const MAX_SVG_COORDINATE_MM = 1_000_000

// 包围盒（mm）。
export interface BBox {
  min: Point2D
  max: Point2D
  w: number
  h: number
}

export interface ValidationResult {
  ok: boolean
  reason?: string
}

/**
 * SVG path → 闭合折线顶点。只接受 M/L/H/V/Z（含相对命令）；
 * 曲线、圆弧、非有限数和未闭合路径一律拒绝，不能静默近似为制造文件。
 */
export function svgPathToPolyline(pathData: string): Point2D[] | null {
  if (typeof pathData !== 'string' || pathData.length > 200_000 || pathData.trim() === '') return null
  // Sticky 匹配要求消费每个字符，禁止把未知字符丢弃后拼成另一条合法轮廓。
  const tokenizer = /([MLHVZmlhvz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|([ \t\r\n]+)|(,)/gy
  const tokens: string[] = []
  let offset = 0
  let commaPending = false
  while (offset < pathData.length) {
    const match = tokenizer.exec(pathData)
    if (!match) return null
    offset = tokenizer.lastIndex
    if (match[3]) continue
    if (match[4]) {
      if (commaPending || !tokens.length || /^[a-zA-Z]$/.test(tokens[tokens.length - 1]!)) return null
      commaPending = true
      continue
    }
    if (commaPending && !match[2]) return null
    commaPending = false
    tokens.push(match[0])
    // 每个顶点最多三个 token，另容纳重复闭合首点及 Z。
    if (tokens.length > (MAX_SVG_TOTAL_POINTS + 1) * 3 + 1) return null
  }
  if (commaPending || !/^[Mm]$/.test(tokens[0] ?? '')) return null

  const points: Point2D[] = []
  let currentX = 0
  let currentY = 0
  let command = ''
  let closed = false
  let index = 0

  const readNumber = (): number | null => {
    const token = tokens[index]
    if (token === undefined || /^[a-zA-Z]$/.test(token)) return null
    const value = Number(token)
    if (!Number.isFinite(value)) return null
    index += 1
    return value
  }

  while (index < tokens.length) {
    const token = tokens[index]!
    if (/^[a-zA-Z]$/.test(token)) {
      // 外轮廓与每个孔必须各是一条子路径，不能把第二次 M 静默连成边。
      if ((token === 'M' || token === 'm') && points.length > 0) return null
      command = token
      index += 1
      if (command === 'Z' || command === 'z') {
        closed = true
        if (index !== tokens.length) return null
        continue
      }
    }

    switch (command) {
      case 'M':
      case 'L': {
        const x = readNumber()
        const y = readNumber()
        if (x === null || y === null) return null
        currentX = x
        currentY = y
        points.push([currentX, currentY])
        if (command === 'M') command = 'L'
        break
      }
      case 'm':
      case 'l': {
        const dx = readNumber()
        const dy = readNumber()
        if (dx === null || dy === null) return null
        currentX += dx
        currentY += dy
        points.push([currentX, currentY])
        if (command === 'm') command = 'l'
        break
      }
      case 'H': {
        const x = readNumber()
        if (x === null) return null
        currentX = x
        points.push([currentX, currentY])
        break
      }
      case 'h': {
        const dx = readNumber()
        if (dx === null) return null
        currentX += dx
        points.push([currentX, currentY])
        break
      }
      case 'V': {
        const y = readNumber()
        if (y === null) return null
        currentY = y
        points.push([currentX, currentY])
        break
      }
      case 'v': {
        const dy = readNumber()
        if (dy === null) return null
        currentY += dy
        points.push([currentX, currentY])
        break
      }
      default:
        return null
    }
    if (!Number.isFinite(currentX) || !Number.isFinite(currentY) ||
        Math.abs(currentX) > MAX_SVG_COORDINATE_MM || Math.abs(currentY) > MAX_SVG_COORDINATE_MM ||
        points.length > MAX_SVG_TOTAL_POINTS + 1) return null
  }

  if (!closed) return null
  if (points.length >= 2 && samePoint(points[0]!, points[points.length - 1]!)) points.pop()
  return points.length >= 3 && points.length <= MAX_SVG_TOTAL_POINTS ? points : null
}

/** SVG 路径几何 → 已完整校验的 Part2D。 */
export function svgGeometryToPart2D(geometry: SvgPathGeometry): Part2D | null {
  if (!geometry || typeof geometry.contour !== 'string') return null
  if (geometry.holes !== undefined && !Array.isArray(geometry.holes)) return null
  const contour = svgPathToPolyline(geometry.contour)
  if (!contour) return null
  const holes: Polyline[] = []
  let totalPoints = contour.length
  for (const path of geometry.holes ?? []) {
    const points = svgPathToPolyline(path)
    if (!points) return null
    totalPoints += points.length
    if (totalPoints > MAX_SVG_TOTAL_POINTS) return null
    holes.push({ points })
  }
  const part: Part2D = { contour: { points: contour }, holes: holes.length > 0 ? holes : undefined }
  // 在 O(n²) 拓扑检查前限制真实尺寸，不能只信任客户端填写的 bbox。
  const allPoints = [contour, ...holes.map(hole => hole.points)].flat()
  const xs = allPoints.map(point => point[0]), ys = allPoints.map(point => point[1])
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys)
  if (width > MAX_SVG_SIZE_MM || height > MAX_SVG_SIZE_MM) return null
  const declared = geometry.bboxMm
  if (declared !== undefined && (!declared || !Number.isFinite(declared.w) || !Number.isFinite(declared.h) ||
      declared.w <= 0 || declared.h <= 0 || declared.w > MAX_SVG_SIZE_MM || declared.h > MAX_SVG_SIZE_MM ||
      Math.abs(width - declared.w) > 0.01 + EPSILON || Math.abs(height - declared.h) > 0.01 + EPSILON)) return null
  return validatePart(part).ok ? part : null
}

// 所有切割线放同一图层 CUT（不做多图层/雕刻分层）。
export const CUT_LAYER = 'CUT'
// DXF $INSUNITS：4 = 毫米（Autodesk DXF Reference）。maker.js 传 Millimeter 即写入此值。
export const DXF_INSUNITS_MM = 4

// 鞋带公式算有向面积，用于剔除面积为 0 的退化折线。
function signedArea(pts: Point2D[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const q = pts[(i + 1) % pts.length]!
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

const EPSILON = 1e-9

function samePoint(a: Point2D, b: Point2D): boolean {
  return Math.abs(a[0] - b[0]) <= EPSILON && Math.abs(a[1] - b[1]) <= EPSILON
}

function cross(a: Point2D, b: Point2D, c: Point2D): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function pointOnSegment(point: Point2D, a: Point2D, b: Point2D): boolean {
  if (Math.abs(cross(a, b, point)) > EPSILON) return false
  return (
    point[0] >= Math.min(a[0], b[0]) - EPSILON &&
    point[0] <= Math.max(a[0], b[0]) + EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - EPSILON &&
    point[1] <= Math.max(a[1], b[1]) + EPSILON
  )
}

function segmentsIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)

  if (
    ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
    ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))
  ) {
    return true
  }
  return (
    (Math.abs(abC) <= EPSILON && pointOnSegment(c, a, b)) ||
    (Math.abs(abD) <= EPSILON && pointOnSegment(d, a, b)) ||
    (Math.abs(cdA) <= EPSILON && pointOnSegment(a, c, d)) ||
    (Math.abs(cdB) <= EPSILON && pointOnSegment(b, c, d))
  )
}

function polygonSelfIntersects(points: Point2D[]): boolean {
  const segmentCount = points.length
  for (let i = 0; i < segmentCount; i++) {
    const a = points[i]!
    const b = points[(i + 1) % segmentCount]!
    for (let j = i + 1; j < segmentCount; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === segmentCount - 1)
      if (adjacent) continue
      const c = points[j]!
      const d = points[(j + 1) % segmentCount]!
      if (segmentsIntersect(a, b, c, d)) return true
    }
  }
  return false
}

function polygonsIntersect(a: Point2D[], b: Point2D[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]!
    const a2 = a[(i + 1) % a.length]!
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j]!
      const b2 = b[(j + 1) % b.length]!
      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }
  return false
}

/** 边界视为不在内部，孔不能贴住或越过外轮廓。 */
function pointStrictlyInsidePolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!
    const b = polygon[i]!
    if (pointOnSegment(point, a, b)) return false
    const crosses =
      (a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    if (crosses) inside = !inside
  }
  return inside
}

// 校验单条闭合折线：≥3 点、坐标有限、无重复点、非退化且不自交。
export function validatePolyline(poly: Polyline): ValidationResult {
  const pts = poly?.points
  if (!Array.isArray(pts)) return { ok: false, reason: '缺少点序列' }
  if (pts.length < 3) return { ok: false, reason: '闭合折线至少需要 3 个点' }
  for (const p of pts) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      return { ok: false, reason: '存在非法坐标（需为有限数的 [x, y]）' }
    }
  }
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (samePoint(pts[i]!, pts[j]!)) return { ok: false, reason: '轮廓包含重复点' }
    }
  }
  if (Math.abs(signedArea(pts)) < 1e-6) return { ok: false, reason: '轮廓面积为 0（退化折线）' }
  if (polygonSelfIntersects(pts)) return { ok: false, reason: '轮廓存在自交' }
  return { ok: true }
}

// 校验整个零件：外轮廓、孔及其空间关系都必须合法。
export function validatePart(part: Part2D): ValidationResult {
  if (!part || !part.contour) return { ok: false, reason: '缺少外轮廓' }
  const c = validatePolyline(part.contour)
  if (!c.ok) return { ok: false, reason: `外轮廓：${c.reason}` }
  for (const [i, hole] of (part.holes ?? []).entries()) {
    const h = validatePolyline(hole)
    if (!h.ok) return { ok: false, reason: `第 ${i + 1} 个孔：${h.reason}` }
    if (
      polygonsIntersect(part.contour.points, hole.points) ||
      !hole.points.every((point) => pointStrictlyInsidePolygon(point, part.contour.points))
    ) {
      return { ok: false, reason: `第 ${i + 1} 个孔必须完整位于外轮廓内部且不能接触边界` }
    }
  }
  const holes = part.holes ?? []
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i]!.points
      const b = holes[j]!.points
      if (
        polygonsIntersect(a, b) ||
        pointStrictlyInsidePolygon(a[0]!, b) ||
        pointStrictlyInsidePolygon(b[0]!, a)
      ) {
        return { ok: false, reason: `第 ${i + 1} 个孔与第 ${j + 1} 个孔重叠或相交` }
      }
    }
  }
  return { ok: true }
}

// Part2D → maker.js 模型：外轮廓 + 每个孔各是一条闭合折线，统一落在 CUT 图层。
function toMakerModel(part: Part2D): makerjs.IModel {
  const models: { [id: string]: makerjs.IModel } = {
    contour: new makerjs.models.ConnectTheDots(true, part.contour.points),
  }
  for (const [i, hole] of (part.holes ?? []).entries()) {
    models[`hole_${i}`] = new makerjs.models.ConnectTheDots(true, hole.points)
  }
  return { models, layer: CUT_LAYER }
}

// 生成 DXF：单位 mm（$INSUNITS=4）、每条轮廓一条闭合 POLYLINE、图层 CUT。
// 非法几何直接抛错，绝不产出不可切的图纸。
export function toDxf(part: Part2D): string {
  const v = validatePart(part)
  if (!v.ok) throw new Error(`几何非法，无法导出 DXF：${v.reason}`)
  return makerjs.exporter.toDXF(toMakerModel(part), {
    units: makerjs.unitType.Millimeter, // → $INSUNITS=4
    usePOLYLINE: true,                  // 单条闭合 POLYLINE（激光软件通用），而非离散 LINE
  })
}

// 生成预览/备用导入用的 SVG。
export function toSvg(part: Part2D): string {
  const v = validatePart(part)
  if (!v.ok) throw new Error(`几何非法，无法导出 SVG：${v.reason}`)
  return makerjs.exporter.toSVG(toMakerModel(part))
}

// 计算包围盒（mm）。
export function bbox(part: Part2D): BBox {
  const ext = makerjs.measure.modelExtents(toMakerModel(part))
  if (!ext) throw new Error('无法计算包围盒：几何为空')
  const minX = ext.low[0] ?? 0
  const minY = ext.low[1] ?? 0
  const maxX = ext.high[0] ?? 0
  const maxY = ext.high[1] ?? 0
  return { min: [minX, minY], max: [maxX, maxY], w: maxX - minX, h: maxY - minY }
}
