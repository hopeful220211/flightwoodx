// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { DesignPage } from './DesignPage'
import { GuidedDesignPage } from './GuidedDesignPage'
import { useDesignStore } from '../../stores/designStore'
import { useAuthStore } from '../../stores/authStore'
import { partsData } from '../../data/parts'
import type { PartInstance } from '../../types/design'
import { flightReadiness } from '../../utils/flightReadiness'
import { officialConnectors } from '@fwx/geometry'

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  push: vi.fn(), saveNow: vi.fn(), saveToServer: vi.fn(),
  saveStatus: 'saved' as 'saved' | 'error', sourceError: '',
}))
vi.mock('../../features/analytics/client', () => ({ trackEvent: mocks.track, getAnalyticsHeaders: () => ({}) }))
vi.mock('../../components/common/Toast', () => ({ useToast: () => ({ push: mocks.push }) }))
vi.mock('../../hooks/useDesignSync', () => ({ useDesignSync: () => mocks }))
vi.mock('../../components/design/ThreeCanvas', () => ({ ThreeCanvas: () => null }))
vi.mock('../../components/design/PartPreview3D', () => ({ PartPreview3D: () => null }))
vi.mock('../../components/design/AssembledDrone', () => ({ AssembledDrone: () => null }))
vi.mock('../../components/design/SceneLighting', () => ({ SceneLighting: () => null }))
vi.mock('../../hooks/usePartConnectors', () => ({ getCachedPartConnectors: () => [], prefetchAndExtractConnectors: vi.fn() }))
vi.mock('../../features/partStudio/CustomPartsLibrary', () => ({ CustomPartsLibrary: () => <div>自制零件库</div> }))
vi.mock('../../features/partStudio/CustomAssemblyPart', () => ({ CustomPartInspector: () => mocks.sourceError ? <div role="alert">{mocks.sourceError}</div> : <div>自制主机身</div> }))
vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@react-three/drei', () => ({ Bounds: ({ children }: { children: ReactNode }) => <>{children}</>, OrbitControls: () => null, Html: ({ children }: { children: ReactNode }) => <>{children}</> }))

let root: Root
let container: HTMLDivElement
const hub = partsData.find(part => part.category === 'mainboard')!
const landing = partsData.find(part => part.category === 'landing')!
const custom: PartInstance = {
  instanceId: 'custom-1', partId: 'custom:source-1', category: 'mainboard',
  position: [0, 0, 0], rotation: [0, 0, 0], attachedTo: null,
  source: { kind: 'custom', id: 'source-1', version: 1, updatedAt: '2026-09-14T00:00:00.000Z' },
}
const official = (part: typeof hub): PartInstance => ({ instanceId: part.id, partId: part.id, category: part.category, position: [0, 0, 0], rotation: [0, 0, 0], attachedTo: null })

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  mocks.push.mockReset()
  mocks.track.mockClear()
  mocks.saveNow.mockReset().mockResolvedValue(true)
  mocks.saveToServer.mockReset()
  mocks.saveStatus = 'saved'
  mocks.sourceError = ''
  localStorage.clear()
  useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
  useDesignStore.setState({ designs: [], activeDesignId: null, deletedIds: [] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function renderDesign(parts: PartInstance[]) {
  const id = useDesignStore.getState().createDesign('我的设计', 'free')
  useDesignStore.setState(state => ({ designs: state.designs.map(design => design.id === id ? { ...design, parts } : design), activeDesignId: id }))
  await act(async () => root.render(<DesignPage />))
}

function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text)
  expect(found).toBeDefined()
  return found!
}

describe('free design feedback', () => {
  it('shows the model connector count even before the runtime model cache is populated', async () => {
    await renderDesign([official(hub)])
    const count = officialConnectors(hub.id).length
    expect(count).toBeGreaterThan(0)
    expect(container.textContent).toContain(`${count} 个连接点`)
    expect(container.textContent).not.toContain('0 个连接点')
  })

  it('keeps the save status together when the mobile summary wraps', async () => {
    await renderDesign([custom])
    expect(container.querySelector('[role="status"]')?.classList.contains('whitespace-nowrap')).toBe(true)
    expect(container.querySelector('[role="status"]')?.classList.contains('inline-block')).toBe(true)
  })

  it.each([
    { kind: 'empty', parts: [] },
    { kind: 'custom only', parts: [custom] },
    { kind: 'official mainboard', parts: [official(hub)] },
    { kind: 'mixed', parts: [official(hub), custom] },
  ])('does not show permanent design warnings for ordinary $kind work', async ({ parts }) => {
    await renderDesign(parts)
    expect(container.textContent).not.toMatch(/设计检查|尚未添加零件|未安装官方主板|基础装配检查通过|未验证制造/)
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0)
    expect(container.textContent).toContain('已使用零件')
    expect(useDesignStore.getState().getActiveDesign()?.parts).toEqual(parts)
  })

  it('offers explicit connections without forcing an official mainboard into free assembly', async () => {
    await renderDesign([official(landing), custom])
    expect(container.textContent).not.toContain('请先添加主板，再连接官方零件。')
    expect(button('连接零件')).toBeDefined()
    await act(async () => button('自制零件').click())
    expect(container.textContent).toContain('自制零件库')
    expect(useDesignStore.getState().getActiveDesign()?.parts).toHaveLength(2)
  })

  it('shows the model in preview without another disclaimer', async () => {
    await renderDesign([custom])
    await act(async () => button('预览').click())
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).not.toMatch(/未验证|未连接|自由摆放|制造与飞行/)
  })

  it('keeps source failures visible with the original instance intact', async () => {
    mocks.sourceError = '原零件已删除，请重新选择零件'
    await renderDesign([custom])
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(mocks.sourceError)
    expect(useDesignStore.getState().getActiveDesign()?.parts).toEqual([custom])
  })

  it('keeps failed save feedback and local parts for retry', async () => {
    mocks.saveStatus = 'error'
    mocks.saveNow.mockResolvedValue(false)
    await renderDesign([custom])
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('账号保存失败，请重试')
    await act(async () => button('保存').click())
    expect(mocks.push).toHaveBeenCalledWith('error', '账号保存失败，本机草稿保留，请重试保存')
    expect(useDesignStore.getState().getActiveDesign()?.parts).toEqual([custom])
  })

  it('allows free placement when no automatic connection is found', async () => {
    await renderDesign([])
    const add = vi.spyOn(useDesignStore.getState(), 'addPartSmart').mockResolvedValue(false)
    await act(async () => root.render(<DesignPage />))
    const details = container.querySelector<HTMLButtonElement>(`[aria-label="零件详情：${hub.name}"]`)!
    await act(async () => details.click())
    await act(async () => button('添加到设计').click())
    expect(add).toHaveBeenCalledWith(hub.id)
    expect(mocks.push).toHaveBeenCalledWith('success', '已放入画板，尚未连接；点击连接零件选择插接口')
    expect(useDesignStore.getState().getActiveDesign()?.parts).toHaveLength(1)
    expect(useDesignStore.getState().getActiveDesign()?.parts[0]?.attachedTo).toBeUndefined()
  })
})

describe('guided assembly feedback', () => {
  async function renderReview(parts: PartInstance[]) {
    const id = useDesignStore.getState().createDesign('我的设计', 'guided')
    useDesignStore.setState(state => ({ designs: state.designs.map(design => design.id === id ? { ...design, parts, currentStep: 'REVIEW' as const, stepReached: 4 } : design), activeDesignId: id }))
    await act(async () => root.render(<MemoryRouter><GuidedDesignPage /></MemoryRouter>))
  }

  it('acknowledges the check without an evidence warning or verified-success transition', async () => {
    const base = official(hub)
    const parts: PartInstance[] = [base, ...Array.from({ length: 4 }, (_, index) => ({
      ...official(landing), instanceId: `arm-${index}`, attachedTo: { parentInstanceId: base.instanceId, parentConnectorId: `socket-${index}` },
    }))]
    const before = flightReadiness(parts)
    expect(before.issues.map(issue => issue.code)).toEqual(['EVIDENCE_MISSING'])
    await renderReview(parts)
    await act(async () => button('结构检查').click())
    expect(mocks.track).toHaveBeenCalledWith('assembly_check_completed', { designId: useDesignStore.getState().activeDesignId, outcome: 'blocked' })
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('info', '装配检查完成')
    expect(container.textContent).not.toContain(before.issues[0]!.message)
    expect(container.textContent).not.toContain('检查通过')
    expect(button('保存草稿')).toBeDefined()
    expect(useDesignStore.getState().getActiveDesign()?.parts).toEqual(parts)
    expect(flightReadiness(parts)).toEqual(before)
    expect(before.canTakeoff).toBe(false)
  })

  it('still displays the actual assembly error when the user runs the check', async () => {
    const parts = [official(hub)]
    const before = flightReadiness(parts)
    const issue = before.issues.find(item => item.code !== 'EVIDENCE_MISSING')!
    expect(issue).toBeDefined()
    await renderReview(parts)
    await act(async () => button('结构检查').click())
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('error', issue.message)
    expect(container.textContent).toContain(issue.message)
    expect(button('保存草稿')).toBeDefined()
    expect(flightReadiness(parts)).toEqual(before)
  })
})
