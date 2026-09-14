import type { PartInstance } from '../types/design'
import { summarizeCatalogueWeight } from './realtimeChecks'
import { computeMotorPlan } from './motorPlan'
import { checkSymmetry } from './symmetryCheck'

export interface DesignStats {
  /** Legacy field name: known catalogue estimate subtotal, never the measured whole-aircraft mass. */
  totalWeightG: number
  weightKnownCount: number
  weightMissingCount: number
  thrustWeightRatio: number | null
  symmetryPercent: number
  estimatedFlightMinutes: number | null
}

export function calculateStats(parts: PartInstance[]): DesignStats {
  const weight = summarizeCatalogueWeight(parts)
  const totalWeightG = weight.knownWeightG

  // 电机/桨/电池的实测包线尚未冻结，不能从机臂数量推算推力。
  const totalThrust = computeMotorPlan(parts).totalThrustG
  const thrustWeightRatio =
    weight.missingCount === 0 && totalWeightG > 0 && totalThrust !== null && totalThrust > 0
      ? Math.round((totalThrust / totalWeightG) * 10) / 10
      : null

  // Coordinate/type mirror matching uses the same existing rule as the structure report, not mean position.
  const symmetryPercent = parts.length > 0 ? checkSymmetry(parts, 0).score : 0

  // 续航必须来自已验证的电池、螺旋桨、电机和载荷曲线；当前不提供估算值。
  const estimatedFlightMinutes: number | null = null

  return { totalWeightG, weightKnownCount: weight.knownCount, weightMissingCount: weight.missingCount, thrustWeightRatio, symmetryPercent, estimatedFlightMinutes }
}

export function getWeightLabel(g: number, missingCount = 0): { text: string; ok: boolean } {
  if (!Number.isFinite(g) || g < 0) return { text: '暂无重量数据', ok: false }
  return { text: missingCount > 0 ? `${missingCount} 个零件缺少重量数据` : '根据零件目录估算', ok: false }
}

export function getThrustLabel(ratio: number | null): { text: string; ok: boolean } {
  if (ratio === null) return { text: '暂无动力数据', ok: false }
  return { text: '推重比记录', ok: false }
}

export function getSymmetryLabel(pct: number): { text: string; ok: boolean } {
  if (pct === 100) return { text: '位置与型号左右对称', ok: true }
  return { text: '请检查左右两侧的位置和型号', ok: false }
}

export function getFlightTimeLabel(min: number | null): { text: string; ok: boolean } {
  if (min === null) return { text: '暂无续航数据', ok: false }
  return { text: '续航记录', ok: false }
}
