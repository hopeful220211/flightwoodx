import { describe, it, expect } from 'vitest'
import { UserPartDefSchema } from '@fwx/parts-schema'
import { buildUserPartDef, pointsToSvgPath } from './buildUserPartDef'
import type { Point2D } from './types'

// 一个简单的闭合正方形（毫米，y 向下）
const square: Point2D[] = [
  [40, 40],
  [240, 40],
  [240, 240],
  [40, 240],
]

describe('buildUserPartDef', () => {
  it('产出能通过后端同一份 v2 契约校验（UserPartDefSchema）', () => {
    const def = buildUserPartDef({ name: '测试罩', category: 'guard', points: square, closed: true })
    const parsed = UserPartDefSchema.safeParse(def)
    expect(parsed.success).toBe(true)
  })

  it('只完成闭合检查时不会提前标记为可制造', () => {
    const def = buildUserPartDef({ name: '测试罩', category: 'guard', points: square, closed: true })
    expect(def.manufacturability.closed).toBe(true)
    expect(def.manufacturability.passed).toBe(false)
  })

  it('类别 / 厚度锁死 2mm / 封闭 / 重量估算都正确', () => {
    const def = buildUserPartDef({ name: '', category: 'landing', points: square, closed: true })
    expect(def.category).toBe('landing')
    expect(def.geometry.thicknessMm).toBe(2)
    expect(def.name).toBe('未命名零件') // 名字留空回退
    expect(def.manufacturability.closed).toBe(true)
    expect(def.flightImpact.massG).toBeGreaterThan(0)
    expect(def.geometry.bboxMm.w).toBeGreaterThan(0)
    expect(def.geometry.bboxMm.h).toBeGreaterThan(0)
    expect(def.sockets).toEqual([]) // 卡扣印章留到 Phase 2
  })

  it('contour 是以 M 开头、Z 结尾的封闭路径', () => {
    const def = buildUserPartDef({ name: 'x', category: 'deco', points: square, closed: true })
    expect(def.geometry.contour.startsWith('M ')).toBe(true)
    expect(def.geometry.contour.trim().endsWith('Z')).toBe(true)
  })

  it('uses actual millimetres for dimensions and subtracts holes from the mass estimate', () => {
    const def = buildUserPartDef({ name: '毫米板', category: 'guard', points: [[10, 20], [90, 20], [90, 80], [10, 80]], holes: [[[20, 30], [30, 30], [30, 40], [20, 40]]], closed: true })
    expect(def.geometry.bboxMm).toEqual({ w: 80, h: 60 })
    expect(def.geometry.thicknessMm).toBe(2)
    expect(def.geometry.holes).toEqual(['M 10 10 L 20 10 L 20 20 L 10 20 Z'])
    expect(def.flightImpact.massG).toBe(5.64)
    expect(def.manufacturability.passed).toBe(false)
  })

  it('rejects invalid or open geometry before saving', () => {
    expect(() => buildUserPartDef({ name: 'x', category: 'guard', points: square, closed: false })).toThrow()
    expect(() => buildUserPartDef({ name: 'x', category: 'guard', points: [[0, 0], [NaN, 2], [3, 4]], closed: true })).toThrow()
  })
})

describe('pointsToSvgPath', () => {
  it('首点用 M、其余用 L、末尾 Z 闭合', () => {
    expect(pointsToSvgPath([[0, 0], [10, 0], [10, 10]])).toBe('M 0 0 L 10 0 L 10 10 Z')
  })
})
