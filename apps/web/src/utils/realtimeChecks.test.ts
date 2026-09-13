import { describe, expect, it } from 'vitest'
import type { PartInstance } from '../types/design'
import { calculateWeight, checkBeforeAdd, checkDualMainboard, getWeightColor, getWeightTextColor } from './realtimeChecks'

const board = (id: string, height: number, rotation: [number, number, number]): PartInstance => ({
  instanceId: id, partId: 'core_hub_01', category: 'mainboard', position: [0, height, 0], rotation,
})

describe('catalogue mass is not a verified flight limit', () => {
  it('does not block an otherwise allowed part using an unverified 35g limit', () => {
    const existing = Array.from({ length: 13 }, (_, n) => ({ ...board(`joint-${n}`, 0, [0, 0, 0]), partId: 'joint_01', category: 'guard' as const }))
    expect(checkBeforeAdd('joint', 'deco_01', existing)).toBeNull()
  })

  it('preserves deterministic category count limits', () => {
    expect(checkBeforeAdd('mainboard', 'core_hub_01', [board('a', 0, [0, 0, 0]), board('b', 0.1, [0, 0, 0])])?.id).toBe('mainboard-max')
    const landings = Array.from({ length: 8 }, (_, n) => ({ ...board(`landing-${n}`, 0, [0, 0, 0]), partId: 'arm_01', category: 'landing' as const }))
    expect(checkBeforeAdd('landing', 'arm_01', landings)?.id).toBe('landing-max')
  })

  it.each([
    { category: 'mainboard' as const, limit: 2, message: '主板数量已达上限：2 块。' },
    { category: 'landing' as const, limit: 8, message: '起落架数量已达上限：8 个。' },
    { category: 'guard' as const, limit: 4, message: '保护板数量已达上限：4 个。' },
  ])('states the $category quantity limit without changing the allowed boundary', ({ category, limit, message }) => {
    const parts = Array.from({ length: limit }, (_, index) => ({ ...board(`part-${index}`, 0, [0, 0, 0]), category }))
    expect(checkBeforeAdd(category, 'test-part', parts.slice(0, limit - 1))).toBeNull()
    expect(checkBeforeAdd(category, 'test-part', parts)).toMatchObject({ id: `${category}-max`, level: 'error', message })
    expect(checkBeforeAdd(category, 'test-part', [...parts, { ...parts[0], instanceId: 'extra' }])).toMatchObject({ id: `${category}-max`, level: 'error', message })
  })

  it('does not use unconnected custom categories to consume the official part quota', () => {
    const custom = Array.from({ length: 8 }, (_, n) => ({ ...board(`custom-${n}`, 0, [0, 0, 0]), category: 'landing' as const, source: { kind: 'custom' as const, id: `source-${n}`, version: 1, updatedAt: '2026-09-07T00:00:00.000Z' } }))
    expect(checkBeforeAdd('landing', 'arm_01', custom)).toBeNull()
  })

  it('does not invent a mass for unknown or custom entries', () => {
    const known = board('known', 0, [0, 0, 0])
    const unknown = { ...known, instanceId: 'unknown', partId: 'missing' }
    const custom = { ...known, instanceId: 'custom', source: { kind: 'custom' as const, id: 'source', version: 1, updatedAt: '2026-09-07T00:00:00.000Z' } }
    expect(calculateWeight([known, unknown, custom])).toBe(3)
    expect(calculateWeight([unknown])).toBe(0) // Known catalogue subtotal only, never an aircraft total.
  })

  it('does not color large estimates as physical danger and small estimates as verified safety', () => {
    expect(getWeightColor(3)).toBe(getWeightColor(50))
    expect(getWeightTextColor(3)).toBe(getWeightTextColor(50))
  })
})

describe('dual mainboard geometry', () => {
  it('accepts equivalent Euler rotations that leave both boards horizontal', () => {
    expect(checkDualMainboard([board('bottom', 0, [0, 0, 0]), board('top', 0.04, [Math.PI, 0, Math.PI])])).toBeNull()
  })

  it('continues to warn about a genuinely tilted or coplanar board', () => {
    expect(checkDualMainboard([board('bottom', 0, [0, 0, 0]), board('top', 0.04, [Math.PI / 4, 0, 0])])?.id).toBe('mainboard-level')
    expect(checkDualMainboard([board('bottom', 0, [0, 0, 0]), board('top', 0.001, [0, 0, 0])])?.id).toBe('mainboard-parallel')
  })
})
