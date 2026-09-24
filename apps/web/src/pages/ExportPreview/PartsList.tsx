import { ScrollReveal } from '../../components/common/ScrollReveal'
import type { Design } from '../../types/design'
import { partsData } from '../../data/parts'
import { PART_REGISTRY, CATEGORY_LABELS as PART_CATEGORY_LABELS, type PartCategory } from '@fwx/parts-schema'

interface PartsListProps {
  parts: Design['parts']
}

interface GroupedPart {
  partId: string
  name: string
  category: string
  categoryLabel: string
  thumbnailUrl?: string
  count: number
}

const CATEGORY_LABELS: Record<string, string> = {
  HUB: '核心主板',
  ARM: '机臂',
  PLATE: '保护罩·一体版',
  JOINT: '保护罩·分体版',
  LAND: '起落架',
  DECO: '衔接件',
  MOTOR: '电机',
  PROP: '螺旋桨',
}

function categoryLabel(category: string) {
  return PART_CATEGORY_LABELS[category as PartCategory]?.zh ?? CATEGORY_LABELS[category] ?? category
}

function groupParts(parts: Design['parts']): Map<string, GroupedPart[]> {
  const countMap = new Map<string, { count: number; category: string }>()
  for (const p of parts) {
    const existing = countMap.get(p.partId)
    if (existing) {
      existing.count++
    } else {
      countMap.set(p.partId, { count: 1, category: p.category })
    }
  }

  const groups = new Map<string, GroupedPart[]>()
  for (const [partId, { count, category }] of countMap) {
    const partData = partsData.find(p => p.id === partId)
    const registryEntry = PART_REGISTRY.find(r => r.id === partId)
    const name = registryEntry?.name.zh ?? partData?.name ?? partId
    const label = categoryLabel(category)

    const grouped: GroupedPart = {
      partId,
      name,
      category,
      categoryLabel: label,
      thumbnailUrl: partData?.thumbnailUrl,
      count,
    }

    const existing = groups.get(category)
    if (existing) {
      existing.push(grouped)
    } else {
      groups.set(category, [grouped])
    }
  }

  return groups
}

export function PartsList({ parts }: PartsListProps) {
  const grouped = groupParts(parts)
  const totalParts = parts.length
  const totalCategories = grouped.size

  return (
    <section className="py-12 lg:py-16 bg-white">
      <div className="mx-auto max-w-5xl px-4">
        <ScrollReveal>
          <h2 className="text-[28px] font-semibold leading-8 tracking-[-.03em] text-ink-900 sm:text-[32px] sm:leading-9">零件清单</h2>
          <p className="mt-2 text-sm text-ink-600">共 {totalParts} 个零件 · {totalCategories} 种类别</p>
        </ScrollReveal>

        <div className="mt-8 space-y-8">
          {Array.from(grouped.entries()).map(([category, items], catIdx) => (
            <ScrollReveal key={category} delay={catIdx * 100}>
              <h3 className="font-display text-xl font-semibold text-ink-900">
                {categoryLabel(category)}
                <span className="text-sm font-normal text-ink-400 ml-2">
                  ({items.reduce((s, i) => s + i.count, 0)} 个)
                </span>
              </h3>
              <div className="mt-3 flex flex-wrap gap-3">
                {items.map(item => (
                  <div key={item.partId} className="flex items-center gap-3 bg-sky-50 rounded-md px-3 py-2">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.name}
                        className="w-[80px] h-[80px] object-contain rounded bg-white"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-[80px] h-[80px] rounded bg-sky-100 flex items-center justify-center text-ink-400 text-xs">
                        3D
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-ink-900">{item.name}</p>
                      <p className="text-base font-semibold text-sky-600">× {item.count}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
