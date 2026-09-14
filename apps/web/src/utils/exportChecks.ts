import type { PartInstance } from '../types/design'
import type { PartCategory } from '@fwx/parts-schema'
import { checkCategorySymmetry } from './symmetryCheck'
import { summarizeCatalogueWeight } from './realtimeChecks'

export type CheckLevel = 'pass' | 'warning' | 'error'

export interface CheckResult {
  id: string
  level: CheckLevel
  title: string
  detail?: string
  fixHint?: string
}

function countByCategory(parts: PartInstance[], cat: PartCategory): number {
  return parts.filter(p => p.category === cat).length
}

function checkMainboard(parts: PartInstance[]): CheckResult {
  const count = countByCategory(parts, 'mainboard')
  return count > 0
    ? { id: 'mainboard', level: 'pass', title: `主板 ${count} 个` }
    : { id: 'mainboard', level: 'error', title: '缺少主板', fixHint: '返回第 1 步选择主板' }
}

function checkArmCount(parts: PartInstance[]): CheckResult {
  const count = countByCategory(parts, 'landing')
  return { id: 'armCount', level: count > 0 ? 'pass' : 'warning', title: `起落架 ${count} 个` }
}

function checkArmSymmetry(parts: PartInstance[]): CheckResult {
  const arms = parts.filter(p => p.category === 'landing')
  if (arms.length < 2) return { id: 'armSymmetry', level: 'warning', title: '起落架不足 2 个，未比较左右对称' }

  const isSymmetric = checkCategorySymmetry(arms.map(a => ({ partId: a.partId, position: a.position })))
  if (isSymmetric) return { id: 'armSymmetry', level: 'pass', title: '起落架位置与型号左右对称' }
  return { id: 'armSymmetry', level: 'warning', title: '起落架左右不对称', fixHint: '检查两侧的位置和型号' }
}

function checkArmSameType(parts: PartInstance[]): CheckResult {
  const arms = parts.filter(p => p.category === 'landing')
  if (arms.length === 0) return { id: 'armSameType', level: 'warning', title: '未添加起落架' }
  const types = new Set(arms.map(a => a.partId))
  if (types.size === 1) return { id: 'armSameType', level: 'pass', title: '起落架型号一致' }
  return { id: 'armSameType', level: 'warning', title: `起落架有 ${types.size} 种型号`, fixHint: '检查是否选用了预期型号' }
}

function checkGuardSymmetry(parts: PartInstance[]): CheckResult {
  const guards = parts.filter(p => p.category === 'guard')
  if (guards.length <= 1) return { id: 'guardSymmetry', level: 'warning', title: '保护板不足 2 个，未比较左右对称' }

  const isSymmetric = checkCategorySymmetry(guards.map(g => ({ partId: g.partId, position: g.position })))
  if (isSymmetric) return { id: 'guardSymmetry', level: 'pass', title: '保护板位置与型号左右对称' }
  return { id: 'guardSymmetry', level: 'warning', title: '保护板左右不对称', fixHint: '检查两侧的位置和型号' }
}

function checkGuardSameType(parts: PartInstance[]): CheckResult {
  const guards = parts.filter(p => p.category === 'guard')
  if (guards.length === 0) return { id: 'guardSameType', level: 'warning', title: '未添加保护板' }
  const types = new Set(guards.map(g => g.partId))
  if (types.size === 1) return { id: 'guardSameType', level: 'pass', title: '保护板型号一致' }
  return { id: 'guardSameType', level: 'warning', title: `保护板有 ${types.size} 种型号`, fixHint: '检查是否选用了预期型号' }
}

function checkMotorCount(parts: PartInstance[]): CheckResult {
  const motors = countByCategory(parts, 'MOTOR')
  const props = countByCategory(parts, 'PROP')
  return { id: 'motorCount', level: 'warning', title: `电机 ${motors} 个，螺旋桨 ${props} 个` }
}

function checkConnectorPairs(parts: PartInstance[]): CheckResult {
  if (!parts.length) return { id: 'connectorPairs', level: 'warning', title: '暂无零件连接' }
  const byId = new Map(parts.map(part => [part.instanceId, part]))
  const reachesMainboard = (part: PartInstance): boolean => {
    const visited = new Set<string>()
    let current: PartInstance | undefined = part
    while (current && !visited.has(current.instanceId)) {
      if (current.category === 'mainboard') return true
      visited.add(current.instanceId)
      current = current.attachedTo ? byId.get(current.attachedTo.parentInstanceId) : undefined
    }
    return false
  }
  const detached = parts.filter(part => !reachesMainboard(part)).length
  if (detached === 0) return { id: 'connectorPairs', level: 'pass', title: '零件连接可追溯到主板' }
  return { id: 'connectorPairs', level: 'error', title: `有 ${detached} 个零件未正确连接主板`, detail: '零件未连接、连接目标不存在或形成循环连接。', fixHint: '返回工作台重新连接这些零件' }
}

function checkLandingGear(parts: PartInstance[]): CheckResult {
  const landing = parts.filter(part => part.category === 'landing')
  const linked = landing.filter(part => part.attachedTo).length
  return { id: 'landingGear', level: linked === landing.length && landing.length > 0 ? 'pass' : 'warning', title: `起落架连接记录 ${linked}/${landing.length}` }
}

function checkGuard(parts: PartInstance[]): CheckResult {
  const count = countByCategory(parts, 'guard')
  return { id: 'guard', level: count > 0 ? 'pass' : 'warning', title: `保护板 ${count} 个` }
}

function checkWeightBalance(): CheckResult {
  return { id: 'weightBalance', level: 'warning', title: '暂无重心数据' }
}

function checkTotalWeight(parts: PartInstance[]): CheckResult {
  const { knownWeightG, knownCount, missingCount } = summarizeCatalogueWeight(parts)
  return {
    id: 'totalWeight', level: 'warning',
    title: knownCount > 0 ? `目录估算重量小计 ${knownWeightG.toFixed(1)}g` : '暂无目录重量数据',
    detail: missingCount > 0 ? `${missingCount} 个零件缺少重量数据。` : undefined,
  }
}

const ALL_CHECKS = [
  checkMainboard,
  checkArmCount,
  checkArmSameType,
  checkArmSymmetry,
  checkMotorCount,
  checkConnectorPairs,
  checkLandingGear,
  checkGuard,
  checkGuardSameType,
  checkGuardSymmetry,
  checkWeightBalance,
  checkTotalWeight,
]

export function runAllChecks(parts: PartInstance[]): CheckResult[] {
  return ALL_CHECKS.map(fn => fn(parts))
}

export function calculateScore(checks: CheckResult[]): number {
  const errors = checks.filter(c => c.level === 'error').length
  const warnings = checks.filter(c => c.level === 'warning').length
  return Math.max(0, 100 - errors * 30 - warnings * 5)
}

export function getScoreLabel(score: number): { text: string; color: string } {
  if (score >= 90) return { text: '记录较完整', color: 'text-accent-leaf' }
  if (score >= 70) return { text: '部分待核对', color: 'text-wood-500' }
  if (score >= 50) return { text: '多项待核对', color: 'text-accent-gold' }
  return { text: '记录待补充', color: 'text-[#E04545]' }
}
