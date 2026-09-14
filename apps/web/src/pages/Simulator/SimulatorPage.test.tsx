// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import type { Design } from '../../types/design'
import { SimulatorPage } from './SimulatorPage'

const state = vi.hoisted(() => ({ design: undefined as Design | undefined }))
vi.mock('../../simulator/FlightScene', () => ({ FlightScene: () => <div data-testid="flight-scene" /> }))
vi.mock('../../components/common/Toast', () => ({ useToast: () => ({ push: vi.fn() }) }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (select: (value: unknown) => unknown) => select({ token: null, user: null }) }))
vi.mock('../../stores/programStore', () => ({ useProgramStore: (select: (value: unknown) => unknown) => select({ draftsByDesignId: {} }) }))
vi.mock('../../stores/designStore', () => ({ useDesignStore: (select: (value: unknown) => unknown) => select({ designs: state.design ? [state.design] : [] }) }))

afterEach(() => { state.design = undefined })

function render() {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter initialEntries={['/sim/sim-copy']}><Routes><Route path="/sim/:id" element={<SimulatorPage />} /></Routes></MemoryRouter>)
  return container
}

it('identifies the simulation and preview model without general flight disclaimers', () => {
  const container = render()
  expect(container.textContent).toContain('视觉仿真 · 指令预览模型')
  expect(container.textContent).not.toMatch(/不代表|未验证|不验证/)
  expect(container.textContent).toContain('当前作品还没有可运行的程序')
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/code/sim-copy')
  expect(container.querySelector('button')?.disabled).toBe(true)
})

it('shows custom geometry in the simulation without a repeated warning banner', () => {
  state.design = {
    schemaVersion: 1, id: 'sim-copy', name: '模拟作品', updatedAt: '2026-09-14T00:00:00.000Z',
    buildMode: 'free', currentStep: 'HUB', stepReached: 0,
    parts: [{ instanceId: 'custom-copy', partId: 'custom:source', category: 'mainboard', position: [0, 0, 0], rotation: [0, 0, 0], source: { kind: 'custom', id: 'source', version: 2, updatedAt: '2026-09-14T00:00:00.000Z' } }],
  }
  const container = render()
  expect(container.textContent).toContain('视觉仿真 · 查看程序运行过程')
  expect(container.textContent).not.toMatch(/指令预览模型|不代表|未验证|不验证|自制零件仅自由摆放/)
  expect(container.querySelector('[data-testid="flight-scene"]')).not.toBeNull()
  expect(container.querySelector('.bg-amber-50')).toBeNull()
})
