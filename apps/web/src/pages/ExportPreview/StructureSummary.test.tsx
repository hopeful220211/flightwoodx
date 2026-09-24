import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { PartInstance } from '../../types/design'
import { StructureSummary } from './StructureSummary'

vi.mock('../../components/common/ScrollReveal', () => ({ ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</> }))

const part = (instanceId: string, partId: string, category: PartInstance['category'], parent?: string): PartInstance => ({
  instanceId, partId, category, position: [0, 0, 0], rotation: [0, 0, 0],
  attachedTo: parent ? { parentInstanceId: parent, parentConnectorId: 'slot' } : null,
})

describe('structure review summary', () => {
  it('shows recorded quantities, connected parts and the known catalogue mass only', () => {
    const parts = [
      part('hub', 'core_hub_01', 'mainboard'),
      part('attached', 'arm_01', 'landing', 'hub'),
      part('loose', 'custom-1', 'landing'),
    ]
    const rendered = renderToStaticMarkup(<StructureSummary parts={parts} />)
    expect(rendered).toContain('零件总数')
    expect(rendered).toContain('已连到主板')
    expect(rendered).toContain('2 / 3')
    expect(rendered).toContain('坐标镜像匹配率')
    expect(rendered).toContain('目录质量小计')
    expect(rendered).toContain('1 个零件未连接主板')
    expect(rendered).toContain('1 个零件缺少重量数据')
    expect(rendered).not.toMatch(/可以起飞|保证飞行|飞行评分|推重比[：:]\s*\d/)
  })

  it('does not claim a mass or symmetry percentage for an empty design', () => {
    const rendered = renderToStaticMarkup(<StructureSummary parts={[]} />)
    expect(rendered).toContain('暂无零件')
    expect(rendered).not.toMatch(/>0g<|>0%<|>100%<|>0 \/ 0</)
  })
})
