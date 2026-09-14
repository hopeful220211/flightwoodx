import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { FlightCheckReport } from './FlightCheckReport'
import { FlightStats } from './FlightStats'
import { calculateStats } from '../../utils/designStats'
import { runAllChecks } from '../../utils/exportChecks'

vi.mock('../../components/common/ScrollReveal', () => ({ ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</> }))

describe('export structure report', () => {
  it('keeps errors and actionable warnings visible while collapsing other results without a score', () => {
    const rendered = renderToStaticMarkup(<FlightCheckReport checks={[
      { id: 'normal', level: 'pass', title: '主板 1 个' },
      { id: 'warning', level: 'warning', title: '暂无重心数据' },
      { id: 'action', level: 'warning', title: '起落架左右不对称', fixHint: '检查两侧的位置和型号' },
      { id: 'error', level: 'error', title: '有 1 个零件未连接主板', fixHint: '返回工作台连接零件' },
      { id: 'error-without-hint', level: 'error', title: '设计记录损坏' },
    ]} />)
    expect(rendered).toContain('设计检查')
    expect(rendered).toContain('1 项正常')
    expect(rendered).toContain('2 项提示')
    expect(rendered).toContain('2 项需修改')
    const otherItems = rendered.match(/<details[^>]*>([\s\S]*?)<\/details>/)
    expect(otherItems?.[1]).toContain('查看 2 项其他检查结果')
    expect(otherItems?.[1]).toContain('主板 1 个')
    expect(otherItems?.[1]).toContain('暂无重心数据')
    expect(otherItems?.[1]).toContain('bg-accent-leaf/10')
    expect(otherItems?.[1]).toContain('bg-accent-gold/10')
    expect(otherItems?.[0]).not.toMatch(/<details[^>]*\bopen\b/)
    const visibleItems = rendered.slice(0, rendered.indexOf('<details'))
    expect(visibleItems).not.toContain('暂无重心数据')
    expect(visibleItems).toContain('检查两侧的位置和型号')
    expect(visibleItems).toContain('返回工作台连接零件')
    expect(visibleItems).toContain('设计记录损坏')
    expect(rendered).not.toMatch(/不代表|制造或飞行|必须修复|建议改进|记录较完整|>65</)
  })

  it('does not show an empty other-results disclosure', () => {
    const rendered = renderToStaticMarkup(<FlightCheckReport checks={[{ id: 'error', level: 'error', title: '缺少主板' }]} />)
    expect(rendered).toContain('缺少主板')
    expect(rendered).not.toContain('<details')
  })

  it('shows only the missing-mainboard action for an empty design and retains all twelve checks', () => {
    const checks = runAllChecks([])
    const rendered = renderToStaticMarkup(<FlightCheckReport checks={checks} />)
    const visibleItems = rendered.slice(0, rendered.indexOf('<details'))
    expect(visibleItems).toContain('0 项正常')
    expect(visibleItems).toContain('11 项提示')
    expect(visibleItems).toContain('1 项需修改')
    expect(visibleItems).toContain('缺少主板')
    expect(visibleItems).toContain('返回第 1 步选择主板')
    expect(visibleItems).not.toMatch(/起落架|保护板|暂无/)
    expect(rendered).toContain('查看 11 项其他检查结果')
    expect(checks).toHaveLength(12)
    for (const check of checks) expect(rendered.split(check.title)).toHaveLength(2)
  })

  it('labels incomplete catalogue estimates without displaying a fabricated aircraft total', () => {
    const stats = calculateStats([{ instanceId: 'missing', partId: 'not-in-catalogue', category: 'joint', position: [0, 0, 0], rotation: [0, 0, 0] }])
    const rendered = renderToStaticMarkup(<FlightStats stats={stats} />)
    expect(rendered).toContain('目录质量小计（估算）')
    expect(rendered).toContain('1 个零件缺少重量数据')
    expect(rendered).toContain('坐标镜像匹配率')
    expect(rendered).not.toMatch(/>0g<|>总重</)
    expect(rendered).not.toMatch(/尚未经过实测验证|仅作结构参考|非质量平衡/)
  })
})
