/**
 * exportBundle — 客户端「导出加工包」流水线（RFC-024 §4.2 / RFC-024-A §一.3、§三 Phase 1）。
 *
 * 点「确认导出」→ 前端直接生成一个 zip，交给用户下载。zip 内容：
 *   parts/<partId>.dxf + parts/<partId>.svg  每个「有 2D 闭合轮廓」的零件的切割图（@fwx/geometry 生成）
 *   BOM.csv                                   整机物料清单（结构件 + 电子件，人可读）
 *   assembly.md                               按 5 步搭建模板自动生成的装配说明
 *   manifest.json                             schemaVersion / units / thicknessMm / partCount / 每件 hash
 *   README.txt                                总说明 + pending2D（缺 2D 轮廓的零件）待补清单
 *
 * 分层：buildExportFiles 是纯函数（确定性、可单测，不碰 jszip/DOM）；downloadExportZip 只负责
 * 打包与触发浏览器下载。服务端 /export-cad 保留作备份通道，本流水线不依赖它。
 *
 * 已知料缺口（诚实、不硬造，RFC-024-A）：
 *  - 官方零件当前只有 3D 模型、无 2D 轮廓 → 全部进 pending2D，切割图待补数据源到位后自动生成。
 *  - 官方件的 boMRole/电子件（电机/桨/电池）种子 BOM 尚未落数据 → BOM 按类别分类，电子件由官方
 *    随件配齐（见 README）；一旦零件带上 2D 轮廓 / 电子件数据，本流水线无需改动即自动纳入。
 */
import {
  toDxf,
  toSvg,
  bbox,
  svgGeometryToPart2D,
  svgPathToPolyline,
  type Part2D,
} from '@fwx/geometry'
import {
  BUILD_STEPS,
  STEP_INFO,
  STEP_CATEGORIES,
  CATEGORY_LABELS,
  USER_PART_THICKNESS_MM,
  type PartCategory,
  type UserPartGeometry,
} from '@fwx/parts-schema'
import { getPartById } from '../data/parts'
import type { Design, PartInstance } from '../types/design'

/** 导出包里的一个文件（文本内容）。 */
export interface ExportFile {
  path: string
  content: string
}

/**
 * 给定一个零件实例，返回它的 2D 用户几何（若有）。
 * Phase 1 官方件无 2D → 返回 null（进 pending2D）；Phase 2 用户零件提供真实几何，管线自动出图。
 */
export type GeometryResolver = (part: PartInstance) => UserPartGeometry | null | undefined

/** Phase 1 默认解析器：官方件没有 2D 轮廓，一律 null。 */
export const noGeometry: GeometryResolver = () => null

export interface ExportBundleResult {
  files: ExportFile[]
  /** 真正生成了切割图（DXF/SVG）的零件 id。 */
  generatedParts: string[]
  /** 缺 2D 轮廓、切割图待补的零件 id。 */
  pending2D: string[]
}

// ─────────────────────────────── 工具 ───────────────────────────────

/**
 * 把 SVG path 的 d 字符串解析成一条闭合折线的点序列。
 * 只支持折线命令 M/L/H/V/Z（大写绝对 + 小写相对）——这正是激光切割件的表示（RFC-024-A §二
 * 明确「砍掉 Bezier/spline 保真」）。遇到曲线/圆弧命令（C/S/Q/T/A）返回 null，宁可标 pending
 * 也不产出不可切的近似线（诚实原则）。
 */
export { svgPathToPolyline }

/** 用户零件几何（SVG path）→ geometry 包的 Part2D（点序列）。任一轮廓解析失败则返回 null。 */
export function geometryToPart2D(g: UserPartGeometry): Part2D | null {
  return svgGeometryToPart2D(g)
}

/** FNV-1a 32 位十六进制 hash，用于给切割文件做完整性指纹（确定性，前后端同源可复核）。 */
export function fnv1aHex(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function safeName(name: string): string {
  return (name || '未命名').replace(/[^\w一-龥-]/g, '_')
}

// ─────────────────────────────── BOM ───────────────────────────────

interface BomRow {
  partId: string
  partNumber: string
  name: string
  category: PartCategory
  role: '结构件' | '电子件'
  count: number
  unitWeightG: number | null
}

/** MOTOR/PROP 属电子件，其余（主板/起落架/保护板/装饰件/用户结构件）属结构件。 */
function roleOf(category: PartCategory): BomRow['role'] {
  return category === 'MOTOR' || category === 'PROP' ? '电子件' : '结构件'
}

function sourceKey(part: PartInstance): string {
  return part.source ? `${part.partId}:${part.source.version}:${part.source.updatedAt}` : part.partId
}

/** 按 partId 归并设计里的零件实例，产出物料行（含数量、单重）。 */
function collectBom(design: Design): BomRow[] {
  const map = new Map<string, BomRow>()
  for (const inst of design.parts) {
    const key = sourceKey(inst)
    const hit = map.get(key)
    if (hit) {
      hit.count += 1
      continue
    }
    const def = getPartById(inst.partId)
    const category = (def?.category ?? inst.category) as PartCategory
    map.set(key, {
      partId: inst.partId,
      partNumber: def?.partNumber ?? '—',
      name: inst.source ? `自制零件 ${inst.source.id} v${inst.source.version} ${inst.source.updatedAt}（未连接）` : def?.name ?? inst.partId,
      category,
      role: roleOf(category),
      count: 1,
      unitWeightG: def?.weight ?? null,
    })
  }
  return [...map.values()]
}

function buildBomCsv(rows: BomRow[]): string {
  const header = ['零件号', '名称', '类别', '角色', '数量', '单重(g)', '小计(g)']
  const lines = [header.map(csvCell).join(',')]
  let totalWeight = 0
  let totalCount = 0
  const weightKnown = rows.every(row => row.unitWeightG !== null)
  for (const r of rows) {
    const subtotal = r.unitWeightG === null ? null : +(r.unitWeightG * r.count).toFixed(1)
    totalWeight += subtotal ?? 0
    totalCount += r.count
    lines.push(
      [r.partNumber, r.name, CATEGORY_LABELS[r.category].zh, r.role, r.count, r.unitWeightG ?? '未核实', subtotal ?? '未核实']
        .map(csvCell)
        .join(','),
    )
  }
  lines.push(['合计', '', '', '', totalCount, '', weightKnown ? +totalWeight.toFixed(1) : '未核实'].map(csvCell).join(','))
  lines.push('')
  lines.push('# 当前清单只包含设计中可确认的结构件；电机、电调、螺旋桨和电池需按经确认的硬件清单另行核对。')
  // 前缀 UTF-8 BOM，方便 Excel 正确识别中文
  return '﻿' + lines.join('\n') + '\n'
}

// ─────────────────────────── 装配说明 ───────────────────────────

function buildAssemblyMd(design: Design, rows: BomRow[]): string {
  const byCategory = new Map<PartCategory, BomRow[]>()
  for (const r of rows) {
    const arr = byCategory.get(r.category) ?? []
    arr.push(r)
    byCategory.set(r.category, arr)
  }

  const out: string[] = []
  out.push(`# ${design.name || '未命名无人机'} · 装配说明`)
  out.push('')
  if (design.parts.some(part => part.source)) {
    out.push('自制零件仅自由摆放，未连接；本作品尚无可执行的制造或装配说明。')
    out.push('来源和版本保留在 manifest.json，摆放位置保留在 design.json；不得据此推定卡扣兼容、结构或飞行安全。')
    return out.join('\n') + '\n'
  }
  out.push('> 由 FlightWoodX 工作台自动生成 · 单位 mm · 板厚 2mm')
  out.push('> 对照零件清单 `BOM.csv` 与切割件目录 `parts/`，按下面 5 步组装。')
  out.push('')

  for (const step of BUILD_STEPS) {
    const info = STEP_INFO[step]
    out.push(`## 第 ${info.number} 步 · ${info.label}`)
    out.push('')
    out.push(info.description)
    out.push('')
    const cats = STEP_CATEGORIES[step]
    if (cats.length === 0) {
      // REVIEW：终点，无零件安装
      out.push('- 装配完成后，对照结构检查结果确认零件完整性与左右对称。')
      out.push('- ⚠️ 当前导出不含经过确认的动力、电池、材料、公差或实飞参数，不能作为实飞或加工保证。')
      out.push('')
      continue
    }
    const stepRows = cats.flatMap((c) => byCategory.get(c) ?? [])
    if (stepRows.length === 0) {
      out.push('- （本步未使用零件）')
    } else {
      for (const r of stepRows) {
        out.push(`- ${r.name} ×${r.count}（${r.partNumber}）`)
      }
    }
    out.push('')
  }
  return out.join('\n')
}

// ─────────────────────────────── 主流程 ───────────────────────────────

/**
 * 纯函数：把一个设计生成为导出包的全部文件（不打包、不下载）。
 * @param resolveGeometry 从零件实例取 2D 用户几何；缺省 noGeometry（官方件无 2D）。
 * @param now 供测试注入固定时间，保证确定性。
 */
export function buildExportFiles(
  design: Design,
  resolveGeometry: GeometryResolver = noGeometry,
  now: Date = new Date(),
): ExportBundleResult {
  const files: ExportFile[] = []
  const generatedParts: string[] = []
  const pending2D: string[] = []

  const bom = collectBom(design)

  // 每个「唯一 partId」尝试生成一份切割图（一种零件一份 DXF/SVG，份数记在 BOM/manifest）。
  const seen = new Set<string>()
  const manifestParts: Array<Record<string, unknown>> = []
  const countByPart = new Map<string, number>()
  for (const inst of design.parts) countByPart.set(sourceKey(inst), (countByPart.get(sourceKey(inst)) ?? 0) + 1)

  for (const inst of design.parts) {
    const key = sourceKey(inst)
    if (seen.has(key)) continue
    seen.add(key)
    const count = countByPart.get(key) ?? 1

    // 当前来源引用没有历史几何/制造验证，不把显示轮廓自动当作可生产切割图。
    const geom = inst.source ? null : resolveGeometry(inst)
    const part2d = geom ? geometryToPart2D(geom) : null

    if (part2d) {
      try {
        const dxf = toDxf(part2d)
        const svg = toSvg(part2d)
        const box = bbox(part2d)
        files.push({ path: `parts/${inst.partId}.dxf`, content: dxf })
        files.push({ path: `parts/${inst.partId}.svg`, content: svg })
        generatedParts.push(inst.partId)
        manifestParts.push({
          partId: inst.partId,
          count,
          has2D: true,
          dxf: `parts/${inst.partId}.dxf`,
          svg: `parts/${inst.partId}.svg`,
          bboxMm: { w: +box.w.toFixed(3), h: +box.h.toFixed(3) },
          hash: fnv1aHex(dxf),
        })
        continue
      } catch {
        // 几何非法：当作缺 2D 处理，绝不产出坏图
      }
    }
    pending2D.push(inst.partId)
    manifestParts.push({ partId: inst.partId, count, has2D: false, ...(inst.source ? { source: inst.source, placement: 'unconnected', reason: '自制件制造与连接未验证' } : {}) })
  }

  files.push({ path: 'BOM.csv', content: buildBomCsv(bom) })
  files.push({ path: 'assembly.md', content: buildAssemblyMd(design, bom) })
  if (design.parts.some(part => part.source)) files.push({ path: 'design.json', content: JSON.stringify(design, null, 2) + '\n' })

  const manifest = {
    schemaVersion: 1,
    generator: 'fwx-web-export',
    units: 'mm',
    thicknessMm: USER_PART_THICKNESS_MM,
    designId: design.id,
    designName: design.name || '未命名无人机',
    exportedAt: now.toISOString(),
    partCount: design.parts.length,
    uniquePartCount: seen.size,
    generatedCount: generatedParts.length,
    parts: manifestParts,
    pending2D,
  }
  files.push({ path: 'manifest.json', content: JSON.stringify(manifest, null, 2) + '\n' })

  files.push({ path: 'README.txt', content: buildReadme(design, generatedParts, pending2D) })

  return { files, generatedParts, pending2D }
}

function buildReadme(design: Design, generated: string[], pending2D: string[]): string {
  const out: string[] = []
  out.push(`FlightWoodX 设计导出包 — ${design.name || '未命名无人机'}`)
  out.push('')
  out.push('目录说明：')
  out.push('  parts/       已生成的二维图（.dxf / .svg），单位 mm、板厚 2mm；加工前仍需在实际材料和软件中验证。')
  out.push('  BOM.csv      当前设计中可确认的结构件与数量。')
  out.push('  assembly.md  按 5 步搭建的装配说明。')
  out.push('  manifest.json 机器可读清单（版本 / 单位 / 厚度 / 零件数 / 每件指纹）。')
  out.push('')
  out.push(`已生成切割图的零件：${generated.length} 种`)
  if (design.parts.some(part => part.source)) out.push('自制件仍是未连接摆放；来源版本和位置已保留。缺失、改版或无权限的源记录不会被导出器替换，制造图与重量尚未核实。')
  if (pending2D.length > 0) {
    out.push('')
    out.push('以下零件暂无 2D 轮廓，当前导出不完整：')
    for (const id of pending2D) out.push(`  - ${id}`)
    out.push('这些零件缺少可用的二维轮廓，本次无法导出对应切割图；加工前需另行准备并验证图纸。')
  }
  out.push('')
  out.push('注：电子件、材料、公差、强度和真实飞行参数不在本导出的已验证范围内。')
  out.push('')
  return out.join('\n')
}

// ─────────────────────────── 打包 + 下载（IO 边界） ───────────────────────────

/**
 * 生成导出包并触发浏览器下载。返回本次生成/待补的零件清单供 UI 提示。
 * jszip（MIT）在浏览器端打包，无需服务端。
 */
export async function downloadExportZip(
  design: Design,
  resolveGeometry: GeometryResolver = noGeometry,
): Promise<{ fileName: string; generatedParts: string[]; pending2D: string[] }> {
  const { default: JSZip } = await import('jszip')
  const { files, generatedParts, pending2D } = buildExportFiles(design, resolveGeometry)

  const zip = new JSZip()
  for (const f of files) zip.file(f.path, f.content)
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } })

  const dateStr = new Date().toISOString().slice(0, 10)
  const fileName = `flightwoodx-${safeName(design.name)}-${dateStr}.zip`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return { fileName, generatedParts, pending2D }
}
