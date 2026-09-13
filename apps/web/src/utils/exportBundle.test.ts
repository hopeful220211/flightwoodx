import { describe, it, expect } from 'vitest'
import { bbox } from '@fwx/geometry'
import type { UserPartGeometry } from '@fwx/parts-schema'
import {
  svgPathToPolyline,
  geometryToPart2D,
  buildExportFiles,
  type GeometryResolver,
} from './exportBundle'
import type { Design, PartInstance } from '../types/design'

// 20mm 标定方块（闭合折线，RFC-024-A §二 校准件）。
const SQUARE: UserPartGeometry = {
  contour: 'M0,0 L20,0 L20,20 L0,20 Z',
  holes: [],
  thicknessMm: 2,
  bboxMm: { w: 20, h: 20 },
}

function inst(partId: string, category: PartInstance['category']): PartInstance {
  return {
    instanceId: `${partId}-${Math.random().toString(36).slice(2)}`,
    partId,
    category,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  }
}

function design(parts: PartInstance[]): Design {
  return {
    schemaVersion: 1,
    id: 'test-design',
    name: '测试机',
    updatedAt: '2026-07-03T00:00:00.000Z',
    buildMode: 'guided',
    currentStep: 'REVIEW',
    stepReached: 5,
    parts,
  }
}

const FIXED_NOW = new Date('2026-07-03T00:00:00.000Z')

describe('svgPathToPolyline', () => {
  it('解析闭合折线方块为 4 个顶点', () => {
    const pts = svgPathToPolyline(SQUARE.contour)
    expect(pts).not.toBeNull()
    expect(pts!.length).toBe(4)
    expect(pts![0]).toEqual([0, 0])
    expect(pts![2]).toEqual([20, 20])
  })

  it('拒绝含曲线命令的路径（返回 null，标 pending 而非乱切）', () => {
    expect(svgPathToPolyline('M0,0 C5,5 10,10 20,0 Z')).toBeNull()
  })

  it('支持相对命令与水平/垂直短命令', () => {
    const pts = svgPathToPolyline('M0 0 h20 v20 h-20 Z')
    expect(pts).not.toBeNull()
    expect(pts!.length).toBe(4)
    expect(pts![1]).toEqual([20, 0])
    expect(pts![2]).toEqual([20, 20])
  })
})

describe('geometryToPart2D + bbox', () => {
  it('方块几何转 Part2D 后 bbox 为 20×20', () => {
    const p2d = geometryToPart2D(SQUARE)
    expect(p2d).not.toBeNull()
    const box = bbox(p2d!)
    expect(box.w).toBeCloseTo(20, 3)
    expect(box.h).toBeCloseTo(20, 3)
  })
})

describe('buildExportFiles', () => {
  it('retains pinned custom sources, reports unknown mass and refuses automatic manufacturing output', () => {
    const source = { kind: 'custom' as const, id: '507f1f77bcf86cd799439011', version: 1, updatedAt: '2026-09-07T00:00:00.000Z' }
    const custom = { ...inst(`custom_${source.id}`, 'joint'), source }
    const result = buildExportFiles({ ...design([custom]), buildMode: 'free' }, () => SQUARE, FIXED_NOW)
    expect(result.generatedParts).toEqual([])
    expect(result.pending2D).toEqual([custom.partId])
    const manifest = JSON.parse(result.files.find(file => file.path === 'manifest.json')!.content)
    expect(manifest.parts[0]).toMatchObject({ source, has2D: false, placement: 'unconnected' })
    expect(result.files.find(file => file.path === 'BOM.csv')!.content).toContain('未核实')
    expect(result.files.find(file => file.path === 'assembly.md')!.content).toContain('未连接')
    const nextSource = { ...source, updatedAt: '2026-09-07T00:00:01.000Z' }
    const mixed = buildExportFiles({ ...design([custom, { ...custom, instanceId: 'new-revision', source: nextSource }]), buildMode: 'free' })
    const variants = JSON.parse(mixed.files.find(file => file.path === 'manifest.json')!.content).parts
    expect(variants).toHaveLength(2)
    expect(variants.map((part: { source: typeof source }) => part.source)).toEqual([source, nextSource])
  })
  // 一件有 2D 轮廓（走注入解析器），一件官方件无 2D（进 pending2D）。
  const d = design([inst('user_square', 'guard'), inst('core_hub_01', 'mainboard'), inst('core_hub_01', 'mainboard')])
  const resolver: GeometryResolver = (part) => (part.partId === 'user_square' ? SQUARE : null)

  const result = buildExportFiles(d, resolver, FIXED_NOW)
  const paths = result.files.map((f) => f.path)

  it('有 2D 的零件生成真 DXF + SVG', () => {
    expect(result.generatedParts).toContain('user_square')
    expect(paths).toContain('parts/user_square.dxf')
    expect(paths).toContain('parts/user_square.svg')
    const dxf = result.files.find((f) => f.path === 'parts/user_square.dxf')!.content
    expect(dxf.length).toBeGreaterThan(0)
    expect(dxf).toContain('POLYLINE') // 闭合折线（maker.js usePOLYLINE）
    expect(dxf).toContain('SECTION') // 合法 DXF 结构
  })

  it('无 2D 轮廓的官方件进 pending2D', () => {
    expect(result.pending2D).toContain('core_hub_01')
    expect(paths).not.toContain('parts/core_hub_01.dxf')
  })

  it('states missing drawing limits without promising automatic future completion', () => {
    const readme = result.files.find(file => file.path === 'README.txt')!.content
    expect(readme).toContain('这些零件缺少可用的二维轮廓，本次无法导出对应切割图；加工前需另行准备并验证图纸。')
    expect(readme).not.toMatch(/正在补齐|补齐后重新导出即会自动/)
  })

  it('zip 结构齐全：BOM/装配说明/manifest/README 都在', () => {
    expect(paths).toContain('BOM.csv')
    expect(paths).toContain('assembly.md')
    expect(paths).toContain('manifest.json')
    expect(paths).toContain('README.txt')
  })

  it('manifest 记录版本/单位/厚度/零件数与每件指纹，且 bbox≈20', () => {
    const manifest = JSON.parse(result.files.find((f) => f.path === 'manifest.json')!.content)
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.units).toBe('mm')
    expect(manifest.thicknessMm).toBe(2)
    expect(manifest.partCount).toBe(3) // 3 个实例
    expect(manifest.uniquePartCount).toBe(2)
    expect(manifest.pending2D).toContain('core_hub_01')
    const sq = manifest.parts.find((p: { partId: string }) => p.partId === 'user_square')
    expect(sq.has2D).toBe(true)
    expect(sq.count).toBe(1)
    expect(sq.hash).toMatch(/^[0-9a-f]{8}$/)
    expect(sq.bboxMm.w).toBeCloseTo(20, 1)
    expect(sq.bboxMm.h).toBeCloseTo(20, 1)
  })

  it('BOM.csv 列出零件数量、并明确电子件不在已确认范围', () => {
    const bom = result.files.find((f) => f.path === 'BOM.csv')!.content
    expect(bom).toContain('零件号')
    expect(bom).toContain('数量')
    // core_hub_01 出现 2 件
    expect(bom).toMatch(/core_hub_01|主板/)
    expect(bom).toContain('当前清单只包含设计中可确认的结构件')
    expect(bom).toContain('电机、电调、螺旋桨和电池')
    expect(bom).toContain('另行核对')
  })

  it('装配说明按 5 步生成', () => {
    const md = result.files.find((f) => f.path === 'assembly.md')!.content
    expect(md).toContain('第 1 步 · 主板')
    expect(md).toContain('第 5 步 · 结构检查')
  })

  it('确定性：同输入两次生成的 DXF 与 manifest 一致', () => {
    const again = buildExportFiles(d, resolver, FIXED_NOW)
    const dxfA = result.files.find((f) => f.path === 'parts/user_square.dxf')!.content
    const dxfB = again.files.find((f) => f.path === 'parts/user_square.dxf')!.content
    expect(dxfB).toBe(dxfA)
    const mA = result.files.find((f) => f.path === 'manifest.json')!.content
    const mB = again.files.find((f) => f.path === 'manifest.json')!.content
    expect(mB).toBe(mA)
  })
})
