import { describe, expect, it } from 'vitest'
import {
  evaluateFlightRules,
  REQUIRED_ARM_COUNT,
  type FlightRuleInput,
  type VerifiedFlightEnvelope,
} from './index'

const PASS: FlightRuleInput = {
  hasMainboard: true,
  motorCount: 4,
  totalWeightG: 25,
  symmetryPercent: 95,
  thrustWeightRatio: 2.5,
}

const VERIFIED: VerifiedFlightEnvelope = {
  status: 'verified',
  profileId: 'seed-v1',
  verifiedAt: '2026-08-04T00:00:00.000Z',
  requiredMotorCount: 4,
  maxWeightG: 35,
  minSymmetryPercent: 70,
  minThrustWeightRatio: 2,
}

describe('evaluateFlightRules', () => {
  it('没有工程证据时只返回装配检查，绝不宣称可飞', () => {
    const result = evaluateFlightRules(PASS)
    expect(result.canTakeoff).toBe(false)
    expect(result.assessment).toBe('assembly-only')
    expect(result.issues.some((issue) => issue.code === 'EVIDENCE_MISSING')).toBe(true)
  })

  it('工程包线有效且四项通过时才允许 canTakeoff', () => {
    const result = evaluateFlightRules(PASS, VERIFIED)
    expect(result.canTakeoff).toBe(true)
    expect(result.assessment).toBe('verified-flight')
    expect(result.evidenceProfileId).toBe('seed-v1')
    expect(result.passedCount).toBe(4)
  })

  it('非法工程包线按未验证处理', () => {
    const result = evaluateFlightRules(PASS, { ...VERIFIED, verifiedAt: 'not-a-date' })
    expect(result.canTakeoff).toBe(false)
    expect(result.assessment).toBe('assembly-only')
  })

  it('结构问题优先于证据缺失', () => {
    const result = evaluateFlightRules({ ...PASS, motorCount: 0, thrustWeightRatio: null })
    expect(result.issues[0]?.code).toBe('STRUCTURE_MISSING')
  })

  it('四臂是当前结构要求', () => {
    expect(REQUIRED_ARM_COUNT).toBe(4)
    const result = evaluateFlightRules({ ...PASS, motorCount: 3 })
    expect(result.issues[0]?.code).toBe('ARM_COUNT_ILLEGAL')
  })

  it('验证包线下按证据阈值报告重量、平衡和动力问题', () => {
    const result = evaluateFlightRules(
      { ...PASS, totalWeightG: 40, symmetryPercent: 50, thrustWeightRatio: 1.2 },
      VERIFIED,
    )
    expect(result.canTakeoff).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'ASYMMETRIC',
      'OVERWEIGHT',
      'UNDERPOWERED',
    ])
    expect(result.issues.map((issue) => issue.message)).toEqual([
      '对称性指标未达到当前验证配置的要求',
      '质量值无效或超出当前验证配置的范围',
      '动力数据缺失或未达到当前验证配置的要求',
    ])
  })
})
