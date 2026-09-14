import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { WeightBar } from './WeightBar'

vi.mock('../../../stores/designStore', () => ({ useDesignStore: (selector: (state: unknown) => unknown) => selector({
  getActiveDesign: () => ({ parts: [{ instanceId: 'missing', partId: 'not-in-catalogue', category: 'joint', position: [0, 0, 0], rotation: [0, 0, 0] }] }),
}) }))

it('does not show a default mass or an unverified 35g progress limit', () => {
  const rendered = renderToStaticMarkup(<WeightBar />)
  expect(rendered).toContain('目录质量估算')
  expect(rendered).toContain('1 个零件缺少质量数据')
  expect(rendered).not.toMatch(/不代表|不是整机|飞行安全/)
  expect(rendered).not.toMatch(/35g|2.0g|0.0g|animate-pulse/)
})
