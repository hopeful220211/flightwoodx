/**
 * Part Registry — 94 parts across 4 categories.
 * Category is determined by folder, NOT by GLB filename prefix.
 */
import type { PartCategory, BuildStep, PartRegistryEntry } from './index'

export type PartEntry = PartRegistryEntry

/** Category → model folder mapping */
export const CATEGORY_FOLDERS: Record<string, string> = {
  mainboard: 'mainboards',
  landing: 'landings',
  guard: 'guards',
  joint: 'joints',
}

/** Step ↔ allowed categories mapping (RFC-008 new workflow) */
/** Step ID → allowed part categories for that step */
// RFC-022：删除第 6 步 MOTOR（进不去的孤儿 + 假动画）。MOTOR/PROP 仍是物料类别
// （PartCategoryEnum），只是不再作为搭建步骤。推力由"真实连到主板的机臂"派生（见 flightReadiness）。
export const STEP_CATEGORIES: Record<BuildStep, PartCategory[]> = {
  HUB: ['mainboard'],       // Step 1: mainboard
  ARM: ['landing'],          // Step 2: landings (step ID is legacy 'ARM')
  GUARD: ['guard'],          // Step 3: guards
  DECO: ['joint'],           // Step 4: joints/decorations (optional)
  REVIEW: [],                // Step 5: 结构检查（最后一步）
}

/** New workflow order per RFC-008 §6.3；RFC-022 删 MOTOR，REVIEW 为终点 */
export const BUILD_STEPS: BuildStep[] = ['HUB', 'ARM', 'GUARD', 'DECO', 'REVIEW']

export const STEP_INFO: Record<BuildStep, { label: string; number: number; description: string; optional?: boolean }> = {
  HUB:    { label: '主板',   number: 1, description: '选择主板，作为其他零件的连接基础' },
  ARM:    { label: '起落架', number: 2, description: '安装起落架（4-8 个）' },
  GUARD:  { label: '保护板', number: 3, description: '选择并安装保护板（1/2/4 个）' },
  DECO:   { label: '装饰件', number: 4, description: '添加装饰件或衔接件（可跳过）', optional: true },
  REVIEW: { label: '结构检查', number: 5, description: '核对已装零件、连接和位置对称性' },
}

// === Part factory functions ===

function mainboard(num: number, weight: number, essential = false): PartEntry {
  const nn = String(num).padStart(2, '0')
  const id = `core_hub_${nn}`
  return {
    partNumber: `FW-MB-${String(num).padStart(3, '0')}`,
    id,
    category: 'mainboard',
    name: { zh: `主板件${nn}`, en: `Mainboard ${nn}` },
    modelPath: `/models/mainboards/${id}.glb`,
    thumbnailFile: `${id}.png`,
    weightG: weight,
    tags: essential ? ['初学者'] : [],
  }
}

function landing(num: number, weight: number, essential = false): PartEntry {
  const nn = String(num).padStart(2, '0')
  const id = `arm_${nn}`
  return {
    partNumber: `FW-LD-${String(num).padStart(3, '0')}`,
    id,
    category: 'landing',
    name: { zh: `起落架${nn}`, en: `Landing ${nn}` },
    modelPath: `/models/landings/${id}.glb`,
    thumbnailFile: `${id}.png`,
    weightG: weight,
    tags: essential ? ['初学者'] : [],
  }
}

function guard(num: number, fileNum: number, weight: number): PartEntry {
  const fn = String(fileNum).padStart(2, '0')
  const id = `joint_${fn}`
  return {
    partNumber: `FW-GD-${String(num).padStart(3, '0')}`,
    id,
    category: 'guard',
    name: { zh: `保护板${fn}`, en: `Guard ${fn}` },
    modelPath: `/models/guards/${id}.glb`,
    thumbnailFile: `${id}.png`,
    weightG: weight,
    tags: [],
  }
}

function joint(num: number, weight: number): PartEntry {
  const nn = String(num).padStart(2, '0')
  const id = `deco_${nn}`
  return {
    partNumber: `FW-JT-${String(num).padStart(3, '0')}`,
    id,
    category: 'joint',
    name: { zh: `连接件${nn}`, en: `Joint ${nn}` },
    modelPath: `/models/joints/${id}.glb`,
    thumbnailFile: `${id}.png`,
    weightG: weight,
    tags: [],
  }
}

// === Registry (94 parts) ===
// Weights from collaborator data (1-5g, realistic)

export const PART_REGISTRY: PartEntry[] = [
  // Mainboards (16) — core_hub_01 to core_hub_16
  mainboard(1, 3, true), mainboard(2, 4, true), mainboard(3, 4, true),
  mainboard(4, 5), mainboard(5, 3), mainboard(6, 4),
  mainboard(7, 3), mainboard(8, 4), mainboard(9, 5),
  mainboard(10, 4, true), mainboard(11, 3), mainboard(12, 4),
  mainboard(13, 5), mainboard(14, 3), mainboard(15, 4), mainboard(16, 5),

  // Landings (39) — arm_01 to arm_39
  landing(1, 2, true), landing(2, 1), landing(3, 2), landing(4, 1),
  landing(5, 2), landing(6, 2), landing(7, 1), landing(8, 2),
  landing(9, 2), landing(10, 1), landing(11, 2), landing(12, 2),
  landing(13, 1), landing(14, 2), landing(15, 2), landing(16, 1),
  landing(17, 2), landing(18, 2), landing(19, 1), landing(20, 2),
  landing(21, 3), landing(22, 2), landing(23, 2), landing(24, 1),
  landing(25, 2), landing(26, 2), landing(27, 3), landing(28, 2),
  landing(29, 2), landing(30, 1), landing(31, 2), landing(32, 2),
  landing(33, 3), landing(34, 2), landing(35, 2), landing(36, 2),
  landing(37, 3), landing(38, 2), landing(39, 2),

  // Guards (28) — joint_01, 03, 11-14, 16-20, 25-41
  guard(1, 1, 3), guard(2, 3, 2), guard(3, 11, 2), guard(4, 12, 3),
  guard(5, 13, 2), guard(6, 14, 3), guard(7, 16, 2), guard(8, 17, 3),
  guard(9, 18, 2), guard(10, 19, 3), guard(11, 20, 2),
  guard(12, 25, 3), guard(13, 26, 2), guard(14, 27, 3), guard(15, 28, 2),
  guard(16, 29, 3), guard(17, 30, 2), guard(18, 31, 3), guard(19, 32, 2),
  guard(20, 33, 3), guard(21, 34, 2), guard(22, 35, 3), guard(23, 36, 2),
  guard(24, 37, 3), guard(25, 38, 2), guard(26, 39, 3), guard(27, 40, 2),
  guard(28, 41, 3),

  // Joints (11) — deco_01 to deco_11
  joint(1, 1), joint(2, 2), joint(3, 1), joint(4, 2), joint(5, 1),
  joint(6, 2), joint(7, 1), joint(8, 2), joint(9, 1), joint(10, 2),
  joint(11, 1),
]

// === Lookups ===

export function getPartByNumber(partNumber: string): PartEntry | undefined {
  return PART_REGISTRY.find(p => p.partNumber === partNumber)
}

export function getPartById(id: string): PartEntry | undefined {
  return PART_REGISTRY.find(p => p.id === id)
}

export function getPartsByCategory(category: PartCategory): PartEntry[] {
  return PART_REGISTRY.filter(p => p.category === category)
}

export function getPartsForStep(step: BuildStep): PartEntry[] {
  const categories = STEP_CATEGORIES[step]
  return PART_REGISTRY.filter(p => categories.includes(p.category))
}

// === Category display (single source of truth for category names) ===

/** 分类 → 展示名（中/英）。零件库页面、详情页、未来板块统一消费，禁止在 web/api 重写。 */
export const CATEGORY_LABELS: Record<PartCategory, { zh: string; en: string }> = {
  mainboard: { zh: '主板', en: 'Mainboard' },
  landing: { zh: '起落架', en: 'Landing' },
  guard: { zh: '保护板', en: 'Guard' },
  joint: { zh: '装饰件', en: 'Joint' },
  MOTOR: { zh: '电机', en: 'Motor' },
  PROP: { zh: '螺旋桨', en: 'Propeller' },
}

export interface PartCategoryInfo {
  category: PartCategory
  /** 中文展示名 */
  label: string
  /** registry 中该类零件数量 */
  count: number
}

export function getPartCategoryInfo(category: PartCategory): PartCategoryInfo {
  return { category, label: CATEGORY_LABELS[category].zh, count: getPartsByCategory(category).length }
}

/** registry 中实际有零件的类别（保留首次出现顺序；当前为 4 类，MOTOR/PROP 暂空不返回）。 */
export function getPopulatedCategories(): PartCategory[] {
  const seen = new Set<PartCategory>()
  const ordered: PartCategory[] = []
  for (const p of PART_REGISTRY) {
    if (!seen.has(p.category)) {
      seen.add(p.category)
      ordered.push(p.category)
    }
  }
  return ordered
}

/** 某类别所属的搭建步骤（用于取 STEP_INFO 的说明文案）；无则返回 null。 */
export function getCategoryStep(category: PartCategory): BuildStep | null {
  for (const step of BUILD_STEPS) {
    if (STEP_CATEGORIES[step].includes(category)) return step
  }
  return null
}
