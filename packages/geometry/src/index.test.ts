import { describe, it, expect } from 'vitest'
import {
  toDxf,
  toSvg,
  bbox,
  validatePart,
  svgPathToPolyline,
  svgGeometryToPart2D,
  DXF_INSUNITS_MM,
  type Part2D,
} from './index'

// 20mm 标定方块：激光软件里量出来应正好 20×20mm。这是「图纸比例对不对」的地面真值——
// 仓库留着它，配 §三 的「真实软件人工导入验一次比例」的人工发布阻断关。
const SQUARE_20MM: Part2D = { contour: { points: [[0, 0], [20, 0], [20, 20], [0, 20]] } }

// 带一个 8mm 内孔的方块（验证孔也进 DXF）。
const SQUARE_WITH_HOLE: Part2D = {
  contour: { points: [[0, 0], [20, 0], [20, 20], [0, 20]] },
  holes: [{ points: [[6, 6], [14, 6], [14, 14], [6, 14]] }],
}

// 从 DXF 头部读出 $INSUNITS 的值（group code 70 紧跟其后）。
function readInsunits(dxf: string): number | null {
  const lines = dxf.split('\n').map((l) => l.trim())
  const i = lines.indexOf('$INSUNITS')
  if (i < 0) return null
  // 结构：$INSUNITS \n 70 \n <value>
  return Number(lines[i + 2])
}

describe('validatePart', () => {
  it('接受合法的 20mm 方块', () => {
    expect(validatePart(SQUARE_20MM).ok).toBe(true)
  })
  it('拒绝点数不足的折线', () => {
    const bad: Part2D = { contour: { points: [[0, 0], [1, 1]] } }
    expect(validatePart(bad).ok).toBe(false)
  })
  it('拒绝退化（面积为 0）的折线', () => {
    const degenerate: Part2D = { contour: { points: [[0, 0], [10, 0], [20, 0]] } }
    expect(validatePart(degenerate).ok).toBe(false)
  })
  it('拒绝非有限坐标', () => {
    const nan: Part2D = { contour: { points: [[0, 0], [Number.NaN, 0], [20, 20]] } }
    expect(validatePart(nan).ok).toBe(false)
  })
  it('拒绝重复点和自交轮廓', () => {
    const duplicate: Part2D = { contour: { points: [[0, 0], [20, 0], [20, 20], [0, 0]] } }
    const bowTie: Part2D = { contour: { points: [[0, 0], [20, 20], [0, 20], [20, 0]] } }
    expect(validatePart(duplicate).ok).toBe(false)
    expect(validatePart(bowTie).ok).toBe(false)
  })
  it('拒绝外置、越界和彼此重叠的孔', () => {
    const outside: Part2D = {
      contour: SQUARE_20MM.contour,
      holes: [{ points: [[21, 1], [25, 1], [25, 5], [21, 5]] }],
    }
    const crossing: Part2D = {
      contour: SQUARE_20MM.contour,
      holes: [{ points: [[18, 5], [22, 5], [22, 10], [18, 10]] }],
    }
    const overlapping: Part2D = {
      contour: SQUARE_20MM.contour,
      holes: [
        { points: [[3, 3], [10, 3], [10, 10], [3, 10]] },
        { points: [[8, 8], [15, 8], [15, 15], [8, 15]] },
      ],
    }
    expect(validatePart(outside).ok).toBe(false)
    expect(validatePart(crossing).ok).toBe(false)
    expect(validatePart(overlapping).ok).toBe(false)
  })
})

describe('SVG path 解析边界', () => {
  const circlePath = (count: number) => `${Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * 2 / count
    return `${i === 0 ? 'M' : 'L'}${10 + 5 * Math.cos(angle)} ${10 + 5 * Math.sin(angle)}`
  }).join(' ')} Z`

  it('支持绝对与相对的闭合折线路径', () => {
    expect(svgPathToPolyline('M0 0 H20 V20 H0 Z')).toEqual([[0, 0], [20, 0], [20, 20], [0, 20]])
    expect(svgPathToPolyline('m0 0 l20 0 l0 20 l-20 0 z')).toEqual([[0, 0], [20, 0], [20, 20], [0, 20]])
    expect(svgPathToPolyline(' M +0,0 2e1,0 20.,20 .0,20 0,0 z ')).toEqual([[0, 0], [20, 0], [20, 20], [0, 20]])
  })

  it.each([
    'M0 0 L20 0 @L20 20 L0 20 Z',
    'M0 0 L20 0 L20 20 L0 20 Z!',
    'M0 0 L20 0 M20 20 L0 20 Z',
    'M0 0 L20 0 m0 20 L0 20 Z',
    'L0 0 L20 0 L20 20 L0 20 Z',
    'M0,,0 L20 0 L20 20 L0 20 Z',
    'M0 0 L20 0 L20 20 L0 20,Z',
  ])('拒绝丢弃字符、隐式起点或多个子路径：%s', (path) => {
    expect(svgPathToPolyline(path)).toBeNull()
  })

  it('在拓扑校验前限制每条路径与所有孔的总顶点', () => {
    expect(svgPathToPolyline(circlePath(2000))).toHaveLength(2000)
    expect(svgPathToPolyline(circlePath(2001))).toBeNull()
    expect(svgGeometryToPart2D({ contour: 'M0 0 H20 V20 H0 Z', holes: [circlePath(1997)] })).toBeNull()
    expect(svgGeometryToPart2D({ contour: 'M0 0 H20 V20 H0 Z', holes: [circlePath(1996)] })).not.toBeNull()
  })

  it('复核真实尺寸与声明包围盒，兼容两位小数舍入与合法偏移', () => {
    expect(svgGeometryToPart2D({ contour: 'M0 0 H2000 V20 H0 Z', bboxMm: { w: 2000, h: 20 } })).not.toBeNull()
    expect(svgGeometryToPart2D({ contour: 'M0 0 H2001 V20 H0 Z', bboxMm: { w: 20, h: 20 } })).toBeNull()
    expect(svgGeometryToPart2D({ contour: 'M0 0 H20 V20 H0 Z', bboxMm: { w: 19, h: 20 } })).toBeNull()
    expect(svgGeometryToPart2D({ contour: 'M0 0 H20 V20 H0 Z', bboxMm: { w: Number.NaN, h: 20 } })).toBeNull()
    expect(svgGeometryToPart2D({ contour: 'M10 10 H30.004 V30.004 H10 Z', bboxMm: { w: 20, h: 20 } })).not.toBeNull()
  })

  it('拒绝绝对或相对累加后的越界坐标', () => {
    expect(svgPathToPolyline('M1000001 0 h20 v20 h-20 Z')).toBeNull()
    expect(svgPathToPolyline('M999999 0 h20 v20 h-20 Z')).toBeNull()
    expect(svgPathToPolyline('M-1000001 0 h20 v20 h-20 Z')).toBeNull()
    expect(svgGeometryToPart2D({ contour: 'M999980 0 h20 v20 h-20 Z', bboxMm: { w: 20, h: 20 } })).not.toBeNull()
  })

  it('拒绝未闭合、曲线、非有限数与自交路径', () => {
    expect(svgPathToPolyline('M0 0 L20 0 L20 20')).toBeNull()
    expect(svgPathToPolyline('M0 0 C10 0 10 20 20 20 Z')).toBeNull()
    expect(svgPathToPolyline('M0 0 L1e999 0 L20 20 Z')).toBeNull()
    expect(svgGeometryToPart2D({ contour: 'M0 0 L20 20 L0 20 L20 0 Z' })).toBeNull()
  })

  it('只有孔完整位于轮廓内部时才生成 Part2D', () => {
    expect(
      svgGeometryToPart2D({
        contour: 'M0 0 L20 0 L20 20 L0 20 Z',
        holes: ['M6 6 L14 6 L14 14 L6 14 Z'],
      }),
    ).not.toBeNull()
    expect(
      svgGeometryToPart2D({
        contour: 'M0 0 L20 0 L20 20 L0 20 Z',
        holes: ['M18 6 L24 6 L24 14 L18 14 Z'],
      }),
    ).toBeNull()
  })
})

describe('toDxf（确定性二维导出）', () => {
  const dxf = toDxf(SQUARE_20MM)

  it('非空', () => {
    expect(dxf.length).toBeGreaterThan(0)
  })
  it('单位为 mm：$INSUNITS=4', () => {
    expect(readInsunits(dxf)).toBe(DXF_INSUNITS_MM)
    expect(DXF_INSUNITS_MM).toBe(4)
  })
  it('用闭合 POLYLINE，落在 CUT 图层', () => {
    expect(dxf).toContain('POLYLINE')
    expect(dxf).toContain('CUT')
    // POLYLINE 后的 group code 70 值为 1 = 闭合。
    const seg = dxf.slice(dxf.indexOf('POLYLINE'))
    expect(seg).toMatch(/POLYLINE\s*\n\s*8\s*\n\s*CUT[\s\S]*?70\s*\n\s*1\b/)
    // 方块 4 个顶点 → 4 个 VERTEX。
    expect((dxf.match(/\nVERTEX\n/g) || []).length).toBe(4)
  })
  it('bbox 与标定方块误差 < 0.1mm', () => {
    const b = bbox(SQUARE_20MM)
    expect(Math.abs(b.w - 20)).toBeLessThan(0.1)
    expect(Math.abs(b.h - 20)).toBeLessThan(0.1)
    expect(b.min).toEqual([0, 0])
    expect(b.max).toEqual([20, 20])
  })
  it('带内孔时导出两条 POLYLINE，且外框 bbox 不变', () => {
    const dxfHole = toDxf(SQUARE_WITH_HOLE)
    expect((dxfHole.match(/\nPOLYLINE\n/g) || []).length).toBe(2)
    const b = bbox(SQUARE_WITH_HOLE)
    expect(Math.abs(b.w - 20)).toBeLessThan(0.1)
    expect(Math.abs(b.h - 20)).toBeLessThan(0.1)
  })
  it('非法几何抛错，绝不产出不可切的图纸', () => {
    expect(() => toDxf({ contour: { points: [[0, 0], [1, 1]] } })).toThrow()
  })
})

describe('toSvg（预览）', () => {
  it('产出非空 SVG', () => {
    const svg = toSvg(SQUARE_20MM)
    expect(svg).toContain('<svg')
    expect(svg.length).toBeGreaterThan(0)
  })
})
