// features/partStudio/buildUserPartDef.ts
//
// 把画布上画好的闭合轮廓映射成 v2 契约 UserPartDef（RFC-024 §4.3 / M2 存盘）。
// 纯函数、可单测；不碰 React、不碰网络。契约类型来自 @fwx/parts-schema（单一事实来源）。
//
// 只接收毫米制合法轮廓及孔。参考范围不是制造证明，不生成未经验证的连接元数据。

import type { UserPartCategory, UserPartDef } from '@fwx/parts-schema'
import { USER_PART_THICKNESS_MM, UserPartDefSchema } from '@fwx/parts-schema'
import { validatePart } from '@fwx/geometry'
import type { Point2D } from './types'
import { polygonArea } from './geometry/winding'

// 木质胶合板密度（g/mm³）：椴木/桦木胶合板约 0.6 g/cm³ = 6e-4 g/mm³。用于估算零件重量。
const WOOD_DENSITY_G_PER_MM3 = 6e-4

/** 两位小数，避免存一长串浮点尾数。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 闭合顶点序列 → SVG path 的 d 串（首点 M，其余 L，末尾 Z 闭合）。坐标已是局部 mm。 */
export function pointsToSvgPath(points: Point2D[]): string {
  const [x0, y0] = points[0]
  const rest = points
    .slice(1)
    .map(([x, y]) => `L ${round2(x)} ${round2(y)}`)
    .join(' ')
  return `M ${round2(x0)} ${round2(y0)} ${rest} Z`
}

export interface BuildUserPartDefInput {
  name: string
  category: UserPartCategory
  /** 毫米坐标，y向下；显示缩放不参与存盘。 */
  points: Point2D[]
  holes?: Point2D[][]
  /** 轮廓是否已闭合（保存前应为 true）。 */
  closed: boolean
}

/**
 * 组装 v2 UserPartDef。毫米轮廓平移到局部原点（不存绝对画布坐标），
 * 由此推出 bboxMm 与重量估算。返回体形状严格对齐 @fwx/parts-schema 的 UserPartDefSchema。
 */
export function buildUserPartDef(input: BuildUserPartDefInput): UserPartDef {
  const { name, category, points: mm, holes = [], closed } = input
  if (!closed || !validatePart({ contour: { points: mm }, holes: holes.map(points => ({ points })) }).ok) {
    throw new Error('请先修正轮廓与孔的几何问题')
  }

  // 包围盒（mm）
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of mm) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const w = Math.max(0, maxX - minX)
  const h = Math.max(0, maxY - minY)

  // 平移到局部原点：轮廓从 (0,0) 起，配合 bboxMm 可直接作为 SVG viewBox 渲染
  const toLocal = (points: Point2D[]): Point2D[] => points.map(([x, y]) => [round2(x - minX), round2(y - minY)])
  const local = toLocal(mm)
  const localHoles = holes.map(toLocal)
  if (!validatePart({ contour: { points: local }, holes: localHoles.map(points => ({ points })) }).ok) {
    throw new Error('轮廓存在小于0.01毫米的细节，请调整后保存')
  }
  const contour = pointsToSvgPath(local)

  // 重量估算：面积(mm²) × 厚度(2mm) × 木材密度
  const areaMm2 = polygonArea(local) - localHoles.reduce((sum, hole) => sum + polygonArea(hole), 0)
  const massG = round2(areaMm2 * USER_PART_THICKNESS_MM * WOOD_DENSITY_G_PER_MM3)

  return UserPartDefSchema.parse({
    name: name.trim() || '未命名零件',
    category,
    geometry: {
      contour,
      holes: localHoles.map(pointsToSvgPath),
      thicknessMm: USER_PART_THICKNESS_MM,
      bboxMm: { w: round2(w), h: round2(h) },
    },
    sockets: [], // Phase 2：卡扣印章
    // 当前只验证闭合；最小筋宽和板材边界尚未完成，不能提前声称可制造。
    manufacturability: {
      closed,
      minFeatureMm: 0,
      withinBoard: false, // 尚无获批板材加工幅面，界面参考框不能代替它
      passed: false,
    },
    flightImpact: { massG }, // 估算值，只进入结构统计，不作为实飞证据
    assets: {},
  })
}
