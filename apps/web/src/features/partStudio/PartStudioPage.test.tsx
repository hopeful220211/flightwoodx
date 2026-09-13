// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/common/Toast'
import { useAuthStore } from '../../stores/authStore'
import { PartStudioPage } from './PartStudioPage'
import type { UserPartDef } from '@fwx/parts-schema'

// Use real Paper in its geometry-only Node mode; no emulated canvas required.
const originalSelf = vi.hoisted(() => {
  const saved = globalThis.self
  Object.defineProperty(globalThis, 'self', { configurable: true, value: { navigator: { userAgent: 'Node.js' } } })
  return saved
})
Object.defineProperty(globalThis, 'self', { configurable: true, value: originalSelf })
vi.mock('./canvas/SketchCanvas', () => ({ SketchCanvas: () => <div>毫米画布</div> }))
vi.mock('./preview3d/ExtrudePreview', () => ({ ExtrudePreview: ({ geometry }: { geometry: unknown }) => <div data-testid="extrude-preview">{JSON.stringify(geometry)}</div> }))
const save = vi.hoisted(() => vi.fn(async (_def: UserPartDef) => ({ success: false, error: '测试网络失败' })))
vi.mock('../../utils/api', async importOriginal => ({ ...await importOriginal<object>(), createCustomPart: save, listCustomParts: async () => ({ success: true, data: { items: [] } }) }))

async function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><ToastProvider><PartStudioPage /></ToastProvider></MemoryRouter></QueryClientProvider>))
  const button = (name: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === name)!
  return { container, button, close: async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals() } }
}

it('offers dimensioned shape tools, fixed thickness, live preview and undoable clearing', async () => {
  const ui = await mount()
  try {
    expect(ui.container.querySelector('h1')?.textContent).toBe('零件绘制')
    expect(ui.container.textContent).toContain('板厚 2 mm')
    expect(ui.container.querySelectorAll('[aria-label="参考类型"] option')).toHaveLength(5)
    for (const name of ['矩形', '圆形', '多边形', '圆孔', '孔 / 开口']) expect(ui.button(name)).toBeDefined()
    expect(ui.button('保存').disabled).toBe(true)
    await act(async () => ui.button('添加图形').click())
    expect(ui.button('保存').disabled).toBe(false)
    expect(ui.container.querySelector('[data-testid="extrude-preview"]')?.textContent).toContain('"thicknessMm":2')
    await act(async () => ui.button('清空').click())
    expect(ui.button('保存').disabled).toBe(true)
    await act(async () => ui.button('撤销').click())
    expect(ui.button('保存').disabled).toBe(false)
    await act(async () => ui.button('重做').click())
    expect(ui.button('保存').disabled).toBe(true)
  } finally { await ui.close() }
})

it('retains editable geometry and the 2mm mainboard payload after a failed save', async () => {
  useAuthStore.setState({ token: 'test-token', user: { id: 'test-user', username: 'test', role: 'student' } })
  save.mockClear()
  const ui = await mount()
  try {
    await act(async () => ui.button('添加图形').click())
    await act(async () => ui.button('保存').click())
    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0]?.[0]).toMatchObject({ category: 'mainboard', geometry: { thicknessMm: 2, bboxMm: { w: 60, h: 40 } }, sockets: [], manufacturability: { passed: false } })
    expect(ui.container.textContent).toContain('测试网络失败')
    expect(ui.button('保存').disabled).toBe(false)
    expect(ui.container.querySelector('[aria-label="宽（毫米）"]')).not.toBeNull()
  } finally { await ui.close(); useAuthStore.setState({ token: null, user: null }) }
})

it('blocks saving unconfirmed or invalid dimensions and recovers on Escape', async () => {
  const ui = await mount()
  try {
    await act(async () => ui.button('添加图形').click())
    const width = ui.container.querySelector<HTMLInputElement>('[aria-label="宽（毫米）"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(width, '2500')
      width.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(width.value).toBe('2500')
    expect(ui.button('保存').disabled).toBe(true)
    await act(async () => width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(width.getAttribute('aria-invalid')).toBe('true')
    expect(ui.button('保存').disabled).toBe(true)
    expect(ui.container.querySelector('[data-testid="extrude-preview"]')?.textContent).toContain('"w":60')
    await act(async () => width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(width.value).toBe('60')
    expect(ui.button('保存').disabled).toBe(false)
  } finally { await ui.close() }
})

it('adds an actual circle within a wide landing reference rather than an ellipse', async () => {
  const ui = await mount()
  try {
    const category = ui.container.querySelector<HTMLSelectElement>('[aria-label="参考类型"]')!
    await act(async () => { category.value = 'landing'; category.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => ui.button('圆形').click())
    await act(async () => ui.button('添加图形').click())
    expect(ui.container.querySelector<HTMLInputElement>('[aria-label="宽（毫米）"]')?.value).toBe('40')
    expect(ui.container.querySelector<HTMLInputElement>('[aria-label="高（毫米）"]')?.value).toBe('40')
    expect(ui.container.querySelector('[data-testid="extrude-preview"]')?.textContent).toContain('"bboxMm":{"w":40,"h":40}')
  } finally { await ui.close() }
})

it('keeps the same parameter controls and shape picker mounted across selection states', async () => {
  const ui = await mount()
  try {
    const labels = ['X', 'Y', '宽', '高', '圆角']
    const control = (label: string) => ui.container.querySelector<HTMLInputElement>(`[aria-label="${label}（毫米）"]`)
    for (const label of labels) {
      expect(control(label), `reserve ${label} before any shape is selected`).not.toBeNull()
      expect(control(label)?.matches(':disabled')).toBe(true)
      expect(control(label)?.value).toBe('')
    }
    expect(ui.container.querySelector('[aria-label="选中图形"]')).not.toBeNull()
    await act(async () => ui.button('添加图形').click())
    for (const label of labels) expect(control(label)?.matches(':disabled')).toBe(false)
    const picker = ui.container.querySelector<HTMLSelectElement>('[aria-label="选中图形"]')!
    await act(async () => { picker.value = ''; picker.dispatchEvent(new Event('change', { bubbles: true })) })
    for (const label of labels) expect(control(label)?.matches(':disabled')).toBe(true)
    await act(async () => ui.button('圆形').click())
    await act(async () => ui.button('添加图形').click())
    expect(control('圆角')).not.toBeNull()
    expect(control('圆角')?.matches(':disabled')).toBe(true)
    expect(control('宽')?.matches(':disabled')).toBe(false)
  } finally { await ui.close() }
})

it('preserves invalid numeric edits when selecting another shape or invoking history', async () => {
  const ui = await mount()
  try {
    await act(async () => ui.button('添加图形').click())
    const width = ui.container.querySelector<HTMLInputElement>('[aria-label="宽（毫米）"]')!
    const picker = ui.container.querySelector<HTMLSelectElement>('[aria-label="选中图形"]')!
    const selected = picker.value
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(width, '2500')
      width.dispatchEvent(new Event('input', { bubbles: true }))
      width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await act(async () => { picker.value = ''; picker.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(picker.value).toBe(selected)
    expect(width.isConnected).toBe(true)
    expect(width.value).toBe('2500')
    expect(ui.button('保存').disabled).toBe(true)
    expect(ui.button('撤销').disabled).toBe(true)
    expect(ui.button('清空').disabled).toBe(true)
    await act(async () => width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(ui.button('撤销').disabled).toBe(false)
  } finally { await ui.close() }
})
