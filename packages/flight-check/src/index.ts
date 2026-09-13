/**
 * @fwx/flight-check — 装配检查与经验证的飞行包线判断。
 *
 * 默认只检查结构，不推断真实可飞性。只有传入经过工程测试冻结的
 * VerifiedFlightEnvelope，才允许 canTakeoff=true。这样页面、服务端和未来真机
 * 使用同一条边界，不会把演示常数当作物理事实。
 */

export type FlightIssueCode =
  | 'STRUCTURE_MISSING'
  | 'ARM_COUNT_ILLEGAL'
  | 'ASYMMETRIC'
  | 'OVERWEIGHT'
  | 'UNDERPOWERED'
  | 'EVIDENCE_MISSING'

export interface FlightIssue {
  code: FlightIssueCode
  message: string
}

export interface FlightReadiness {
  issues: FlightIssue[]
  /** 只有结构检查和已验证物理包线全部通过时才为 true。 */
  canTakeoff: boolean
  /** 未提供工程证据时只能是 assembly-only。 */
  assessment: 'assembly-only' | 'verified-flight'
  evidenceProfileId: string | null
  primaryFix: string | null
  passedCount: number
  totalChecks: number
}

/** 套件当前产品结构要求；它不是推力或续航结论。 */
export const REQUIRED_ARM_COUNT = 4

export interface VerifiedFlightEnvelope {
  status: 'verified'
  profileId: string
  verifiedAt: string
  requiredMotorCount: number
  maxWeightG: number
  minSymmetryPercent: number
  minThrustWeightRatio: number
}

export interface FlightRuleInput {
  hasMainboard: boolean
  motorCount: number
  totalWeightG: number
  symmetryPercent: number
  thrustWeightRatio: number | null
}

function isValidEnvelope(value: VerifiedFlightEnvelope | undefined): value is VerifiedFlightEnvelope {
  if (!value || value.status !== 'verified' || value.profileId.trim() === '') return false
  if (!Number.isFinite(Date.parse(value.verifiedAt))) return false
  return (
    Number.isInteger(value.requiredMotorCount) &&
    value.requiredMotorCount > 0 &&
    Number.isFinite(value.maxWeightG) &&
    value.maxWeightG > 0 &&
    Number.isFinite(value.minSymmetryPercent) &&
    value.minSymmetryPercent >= 0 &&
    value.minSymmetryPercent <= 100 &&
    Number.isFinite(value.minThrustWeightRatio) &&
    value.minThrustWeightRatio > 0
  )
}

/**
 * 结构问题始终检查；物理问题只有在 evidence 存在且有效时检查。
 * 没有 evidence 时明确返回 EVIDENCE_MISSING，绝不把结构完整等同于可飞。
 */
export function evaluateFlightRules(
  input: FlightRuleInput,
  evidence?: VerifiedFlightEnvelope,
): FlightReadiness {
  const verified = isValidEnvelope(evidence)
  const required = verified ? evidence.requiredMotorCount : REQUIRED_ARM_COUNT
  const issues: FlightIssue[] = []

  if (!input.hasMainboard || input.motorCount === 0) {
    issues.push({ code: 'STRUCTURE_MISSING', message: `当前检查要求包含主板和 ${required} 个起落架，请核对零件清单` })
  } else if (input.motorCount !== required) {
    issues.push({
      code: 'ARM_COUNT_ILLEGAL',
      message:
        input.motorCount < required
          ? `当前检查要求 ${required} 个起落架，还缺 ${required - input.motorCount} 个`
          : `当前检查要求 ${required} 个起落架，现有 ${input.motorCount} 个`,
    })
  }

  const structurePassed = input.hasMainboard && input.motorCount === required
  if (!verified) {
    issues.push({ code: 'EVIDENCE_MISSING', message: '当前只完成装配检查，真实飞行参数仍待硬件测试确认' })
    return {
      issues,
      canTakeoff: false,
      assessment: 'assembly-only',
      evidenceProfileId: null,
      primaryFix: issues[0]?.message ?? null,
      passedCount: structurePassed ? 1 : 0,
      totalChecks: 4,
    }
  }

  if (input.symmetryPercent < evidence.minSymmetryPercent) {
    issues.push({ code: 'ASYMMETRIC', message: '对称性指标未达到当前验证配置的要求' })
  }
  if (input.totalWeightG <= 0 || input.totalWeightG > evidence.maxWeightG) {
    issues.push({ code: 'OVERWEIGHT', message: '质量值无效或超出当前验证配置的范围' })
  }
  if (input.thrustWeightRatio === null || input.thrustWeightRatio < evidence.minThrustWeightRatio) {
    issues.push({ code: 'UNDERPOWERED', message: '动力数据缺失或未达到当前验证配置的要求' })
  }

  const checks = [
    structurePassed,
    input.totalWeightG > 0 && input.totalWeightG <= evidence.maxWeightG,
    input.symmetryPercent >= evidence.minSymmetryPercent,
    input.thrustWeightRatio !== null && input.thrustWeightRatio >= evidence.minThrustWeightRatio,
  ]
  const passedCount = checks.filter(Boolean).length
  const canTakeoff = passedCount === checks.length

  return {
    issues,
    canTakeoff,
    assessment: 'verified-flight',
    evidenceProfileId: evidence.profileId,
    primaryFix: canTakeoff ? null : issues[0]?.message ?? null,
    passedCount,
    totalChecks: checks.length,
  }
}
