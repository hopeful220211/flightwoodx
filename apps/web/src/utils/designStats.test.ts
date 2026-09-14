import { describe, expect, it } from 'vitest'
import type { PartInstance } from '../types/design'
import { calculateStats, getWeightLabel, getThrustLabel, getSymmetryLabel, getFlightTimeLabel } from './designStats'

const known: PartInstance = { instanceId: 'known', partId: 'core_hub_01', category: 'mainboard', position: [0, 0, 0], rotation: [0, 0, 0] }

describe('design statistics evidence', () => {
  it('uses concise data and editing labels without adding engineering assurances or repeated disclaimers', () => {
    expect(getWeightLabel(3)).toEqual({ text: '根据零件目录估算', ok: false })
    expect(getWeightLabel(3, 1)).toEqual({ text: '1 个零件缺少重量数据', ok: false })
    expect(getWeightLabel(NaN)).toEqual({ text: '暂无重量数据', ok: false })
    expect(getThrustLabel(null)).toEqual({ text: '暂无动力数据', ok: false })
    expect(getThrustLabel(2)).toEqual({ text: '推重比记录', ok: false })
    expect(getSymmetryLabel(100)).toEqual({ text: '位置与型号左右对称', ok: true })
    expect(getSymmetryLabel(50)).toEqual({ text: '请检查左右两侧的位置和型号', ok: false })
    expect(getFlightTimeLabel(null)).toEqual({ text: '暂无续航数据', ok: false })
    expect(getFlightTimeLabel(2)).toEqual({ text: '续航记录', ok: false })
  })
  it('tracks missing mass separately without filling it with an invented 2g', () => {
    const stats = calculateStats([known, { ...known, instanceId: 'unknown', partId: 'missing' }])
    expect(stats.totalWeightG).toBe(3)
    expect(stats.weightMissingCount).toBe(1)
    expect(stats.weightKnownCount).toBe(1)
    expect(stats.thrustWeightRatio).toBeNull()
    expect(stats.estimatedFlightMinutes).toBeNull()
  })

  it('never grades unverified mass with a 25g or 35g flight threshold', () => {
    for (const mass of [3, 30, 50]) {
      expect(getWeightLabel(mass).ok).toBe(false)
      expect(getWeightLabel(mass).text).toContain('估算')
      expect(getWeightLabel(mass).text).not.toMatch(/够轻|适中|影响起飞/)
    }
  })

  it('does not equate centered mean coordinates with mirrored parts', () => {
    const positions: PartInstance['position'][] = [[1, 0, 0], [-0.5, 0, 0.4], [-0.5, 0, -0.4]]
    const stats = calculateStats(positions.map((position, index) => ({ ...known, position, instanceId: `part-${index}` })))
    expect(stats.symmetryPercent).toBe(0)
  })
})
