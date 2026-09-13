/**
 * Real-time assembly validation — runs on every part add/remove.
 * Lighter than exportChecks (no score/label), returns actionable violations.
 */
import type { PartInstance } from '../types/design'
import type { PartCategory } from '@fwx/parts-schema'
import { getPartById } from '@fwx/parts-schema'

export interface Violation {
  id: string
  level: 'error' | 'warning'
  message: string
  hint?: string
}

function countByCategory(parts: PartInstance[], cat: PartCategory): number {
  return parts.filter(p => !p.source && p.category === cat).length
}

/**
 * Check if adding a part would violate any assembly rule.
 * Returns a violation if blocked, null if allowed.
 * Called BEFORE the part is actually placed.
 */
export function checkBeforeAdd(
  partCategory: PartCategory,
  _partId: string,
  currentParts: PartInstance[],
): Violation | null {
  // Mainboard: max 2
  if (partCategory === 'mainboard') {
    const count = countByCategory(currentParts, 'mainboard')
    if (count >= 2) {
      return { id: 'mainboard-max', level: 'error', message: '主板数量已达上限：2 块。', hint: '已经有 2 块了' }
    }
  }

  // Landing: max 8
  if (partCategory === 'landing') {
    const count = countByCategory(currentParts, 'landing')
    if (count >= 8) {
      return { id: 'landing-max', level: 'error', message: '起落架数量已达上限：8 个。', hint: '当前装配模式的数量限制，不是实物飞行结论' }
    }
  }

  // Guard: max 4
  if (partCategory === 'guard') {
    const count = countByCategory(currentParts, 'guard')
    if (count >= 4) {
      return { id: 'guard-max', level: 'error', message: '保护板数量已达上限：4 个。', hint: '1个、2个或4个都可以' }
    }
  }

  // No verified hardware mass limit is available. Catalogue estimates cannot block software placement.
  return null
}

/**
 * Check mainboard dual-board geometry: if 2 mainboards, they must be
 * on parallel horizontal planes (different Y, similar X/Z rotation).
 */
export function checkDualMainboard(parts: PartInstance[]): Violation | null {
  const mainboards = parts.filter(p => p.category === 'mainboard')
  if (mainboards.length !== 2) return null

  const yDiff = Math.abs(mainboards[0].position[1] - mainboards[1].position[1])
  // Models scaled to 2mm thickness — Y gap between stacked mainboards is small
  if (yDiff < 0.005) {
    return {
      id: 'mainboard-parallel',
      level: 'warning',
      message: '两块主板要放在上下两层',
      hint: '建议不要放在同一高度',
    }
  }

  // XYZ Euler 的同一平面有多种角度表示（例如 [π, 0, π] 仍然水平）。
  // 比较旋转后板面法向与世界 Y 轴，不能用各 Euler 分量的绝对值判断倾斜。
  const tilt = ([x, y, z]: [number, number, number]) => Math.acos(Math.min(1, Math.abs(Math.cos(x) * Math.cos(z) - Math.sin(x) * Math.sin(y) * Math.sin(z))))
  const tilt0 = tilt(mainboards[0].rotation)
  const tilt1 = tilt(mainboards[1].rotation)
  if (tilt0 > 0.1 || tilt1 > 0.1) {
    return {
      id: 'mainboard-level',
      level: 'warning',
      message: '两块主板都要保持水平',
      hint: '建议保持水平放置',
    }
  }

  return null
}

/** Known catalogue estimates only; missing/custom data is counted, never filled with a default mass. */
export function summarizeCatalogueWeight(parts: PartInstance[]) {
  let knownWeightG = 0
  let knownCount = 0
  for (const part of parts) {
    const entry = part.source ? undefined : getPartById(part.partId)
    if (entry && Number.isFinite(entry.weightG) && entry.weightG >= 0) {
      knownWeightG += entry.weightG
      knownCount += 1
    }
  }
  return { knownWeightG, knownCount, missingCount: parts.length - knownCount }
}

/** Compatibility helper: returns the known catalogue subtotal, not measured whole-aircraft mass. */
export function calculateWeight(parts: PartInstance[]): number {
  return summarizeCatalogueWeight(parts).knownWeightG
}

/** Neutral colors indicate an estimate, not a physical safety verdict. */
export function getWeightColor(weight: number): string {
  return Number.isFinite(weight) ? 'bg-sky-400' : 'bg-gray-300'
}

export function getWeightTextColor(weight: number): string {
  return Number.isFinite(weight) ? 'text-sky-700' : 'text-gray-500'
}
