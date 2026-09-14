// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { expect, it, vi } from 'vitest'
import { UserPartSchema } from '@fwx/parts-schema'
import { PlaceCustomPartDialog } from './PlaceCustomPartDialog'
import { JointGuideDialog } from './JointGuideDialog'

vi.mock('../../components/common/Modal', () => ({ Modal: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div> }))
vi.mock('../../components/common/Toast', () => ({ useToast: () => ({ push: vi.fn() }) }))
vi.mock('../../hooks/useDesignSync', () => ({ useDesignSync: () => ({ saveNow: vi.fn() }) }))

const part = UserPartSchema.parse({
  id: 'copy-test-part', ownerId: 'copy-owner', name: '自制主板', category: 'mainboard',
  geometry: { contour: 'M0 0 L40 0 L40 30 L0 30 Z', holes: [], thicknessMm: 2, bboxMm: { w: 40, h: 30 } },
  manufacturability: { closed: true, minFeatureMm: 0, withinBoard: true, passed: false },
  flightImpact: { massG: 0 }, createdAt: '2026-09-14T00:00:00.000Z', updatedAt: '2026-09-14T00:00:00.000Z',
})

it('placement describes the available controls and connection limitation once', () => {
  const html = renderToStaticMarkup(<MemoryRouter><PlaceCustomPartDialog part={part} onClose={() => {}} /></MemoryRouter>)
  expect(html).toContain('放入后可调整位置和旋转。自制零件暂不支持自动连接。')
  expect(html).not.toMatch(/未验证|不代表|尚未连接|制造、结构或飞行/)
  expect(html).toContain('自制零件目标作品')
  expect(html).toContain('确认放入')
})

it('saved slot help explains coordinates and annotation marks without a disclaimer paragraph', () => {
  const html = renderToStaticMarkup(<JointGuideDialog part={part} onClose={() => {}} />)
  expect(html).toContain('坐标从零件左上角计算，箭头标明插入方向。')
  expect(html).toContain('箭头和正反面标记为位置说明，不是切割线。')
  expect(html).not.toMatch(/尚未指定|当前自制件仍为|实际配合需检查|未验证/)
  expect(html).toContain('板厚 2 mm')
})
