import { describe, expect, it } from 'vitest'
import type { PartInstance } from '../types/design'
import { runAllChecks } from './exportChecks'

function part(id: string, partId: string, category: PartInstance['category'], parent?: string): PartInstance {
  return {
    instanceId: id, partId, category, position: [0, 0, 0], rotation: [0, 0, 0],
    attachedTo: parent ? { parentInstanceId: parent, parentConnectorId: 'recorded-connector' } : null,
  }
}
const hub = part('hub', 'core_hub_01', 'mainboard')
const check = (parts: PartInstance[], id: string) => runAllChecks(parts).find(item => item.id === id)!

describe('export checks describe current design data', () => {
  it('keeps existing check levels while using short titles and specific actions', () => {
    const results = runAllChecks([hub])
    expect(results.map(({ id, level }) => [id, level])).toEqual([
      ['mainboard', 'pass'], ['armCount', 'warning'], ['armSameType', 'warning'],
      ['armSymmetry', 'warning'], ['motorCount', 'warning'], ['connectorPairs', 'pass'],
      ['landingGear', 'warning'], ['guard', 'warning'], ['guardSameType', 'warning'],
      ['guardSymmetry', 'warning'], ['weightBalance', 'warning'], ['totalWeight', 'warning'],
    ])
    expect(check([hub], 'mainboard').title).toBe('主板 1 个')
    expect(check([], 'mainboard').fixHint).toBe('返回第 1 步选择主板')
    expect(check([hub], 'weightBalance').title).toBe('暂无重心数据')
    expect(JSON.stringify(results)).not.toMatch(/未验证|不代表|不证明|不从数量推断|实物|实测重量|飞行稳定性/)
  })

  it('reports three landing records without inventing a flight or hardware threshold', () => {
    const parts = [hub, ...[1, 2, 3].map(n => part(`landing-${n}`, 'arm_01', 'landing', 'hub'))]
    expect(check(parts, 'armCount').title).toContain('3')
    expect(check(parts, 'armCount').level).not.toBe('error')
    expect(JSON.stringify(runAllChecks(parts))).not.toMatch(/可以飞|才能飞|也能飞|不太稳|至少 [34]|至少[34]/)
    expect(check(parts, 'motorCount').level).toBe('warning')
    expect(check(parts, 'motorCount').title).toContain('0')
  })

  it('counts only recorded MOTOR instances and never claims the motors are fitted', () => {
    const parts = [hub, part('arm', 'arm_01', 'landing', 'hub'), part('motor', 'motor-record', 'MOTOR', 'arm')]
    expect(check(parts, 'motorCount').title).toContain('1')
    expect(check(parts, 'motorCount').level).toBe('warning')
    expect(check(parts, 'motorCount').title).not.toContain('已配齐')
  })

  it('shows known catalogue weight as an estimate, not a 35g flight limit', () => {
    const parts = Array.from({ length: 13 }, (_, n) => part(`hub-${n}`, 'core_hub_01', 'mainboard'))
    const result = check(parts, 'totalWeight')
    expect(result.title).toContain('39.0')
    expect(result.title).toContain('估算')
    expect(result.level).toBe('warning')
    expect(JSON.stringify(result)).not.toMatch(/35g|超重|合适|推不动|上限/)
  })

  it('does not substitute 2g for a missing or custom part weight', () => {
    const unknown = part('unknown', 'missing-catalogue-id', 'joint')
    const result = check([hub, unknown], 'totalWeight')
    expect(result.level).toBe('warning')
    expect(result.title).toContain('3.0')
    expect(result.detail).toContain('1 个零件缺少')
    expect(result.title).not.toContain('5.0')
    expect(check([unknown], 'totalWeight').title).not.toMatch(/\d\.\dg/)
    const disguisedCustom = { ...hub, source: { kind: 'custom' as const, id: 'custom-id', version: 1, updatedAt: '2026-09-07T00:00:00.000Z' } }
    expect(check([disguisedCustom], 'totalWeight').detail).toContain('1 个零件缺少')
  })

  it('does not equate mean coordinates with the aircraft center of gravity', () => {
    for (const parts of [[], [hub], [hub, part('arm', 'arm_01', 'landing', 'hub')]]) {
      expect(check(parts, 'weightBalance').level).toBe('warning')
      expect(check(parts, 'weightBalance').title).toBe('暂无重心数据')
      expect(check(parts, 'weightBalance').title).not.toContain('合理')
    }
  })

  it('reports missing, dangling and cyclic parent references instead of claiming paired connectors', () => {
    const dangling = part('dangling', 'arm_01', 'landing', 'missing')
    const first = part('first', 'arm_01', 'landing', 'second')
    const second = part('second', 'arm_01', 'landing', 'first')
    for (const parts of [[hub, dangling], [hub, first, second], [hub, part('loose', 'arm_01', 'landing')]]) {
      expect(check(parts, 'connectorPairs').level).toBe('error')
    }
    const valid = check([hub, part('arm', 'arm_01', 'landing', 'hub')], 'connectorPairs')
    expect(valid.level).toBe('pass')
    expect(valid.title).not.toContain('所有连接点都已配对')
    expect(valid.title).toBe('零件连接可追溯到主板')
    expect(valid.detail).toBeUndefined()
  })

  it('does not mark absent parts or incomparable symmetry as verified', () => {
    expect(check([], 'mainboard').level).toBe('error')
    expect(check([], 'armSymmetry').level).toBe('warning')
    expect(check([], 'guardSymmetry').level).toBe('warning')
    expect(check([], 'connectorPairs').level).toBe('warning')
  })
})
