// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/common/Toast'
import { useAuthStore } from '../../stores/authStore'
import { PartStudioPage } from './PartStudioPage'
import type { UserPartDef } from '@fwx/parts-schema'
import type { SketchCanvasProps } from './canvas/SketchCanvas'
import type { SketchShape } from './sketch/model'

// Use real Paper in its geometry-only Node mode; no emulated canvas required.
const originalSelf = vi.hoisted(() => {
  const saved = globalThis.self
  Object.defineProperty(globalThis, 'self', { configurable: true, value: { navigator: { userAgent: 'Node.js' } } })
  return saved
})
Object.defineProperty(globalThis, 'self', { configurable: true, value: originalSelf })
const canvas = vi.hoisted(() => ({ current: null as SketchCanvasProps | null }))
vi.mock('./canvas/SketchCanvas', () => ({ SketchCanvas: (props: SketchCanvasProps & { children?: ReactNode }) => { canvas.current = props; return <div>毫米画布{props.children}</div> } }))
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
  const button = (name: string) => [...container.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === name || item.textContent?.trim() === name)!
  return { container, button, close: async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals() } }
}

/** The canvas gesture behavior has separate real SVG tests. These callbacks
 * enter a completed gesture through the public page boundary, preserving real
 * page history, numeric inputs, geometry compilation and save payloads. */
async function completeCanvasShape(overrides: Partial<SketchShape> = {}) {
  const shape: SketchShape = { id: crypto.randomUUID(), kind: 'rectangle', operation: 'add', x: 35, y: 45, width: 60, height: 40, radius: 0, ...overrides }
  await act(async () => {
    const props = canvas.current!
    props.onChange([...props.shapes, shape])
    props.onSelect(shape.id)
  })
  return shape
}

it('starts with canvas drawing tools and shows no add button, shape dropdown or unselected properties', async () => {
  const ui = await mount()
  try {
    expect(ui.button('添加图形')).toBeUndefined()
    expect(ui.container.querySelector('[aria-label="选中图形"]')).toBeNull()
    expect(ui.container.querySelector('[aria-label="图形属性"]')).toBeNull()
    expect(ui.container.querySelector('[aria-label="宽（毫米）"]')).toBeNull()
    expect(ui.container.querySelector('[aria-label="绘图工具"]')).not.toBeNull()
  } finally { await ui.close() }
})

it('offers a distinct insertion icon and directly enters edge-slot creation without a menu', async () => {
  const ui = await mount()
  try {
    const insert = ui.button('插接口')
    expect(insert).toBeDefined()
    expect(insert.querySelector('svg')?.innerHTML).not.toBe(ui.button('孔 / 开口').querySelector('svg')?.innerHTML)
    await act(async () => insert.click())
    expect(canvas.current?.tool).toBe('insert-slot')
    expect(ui.container.querySelector('[aria-label="开孔方式"]')).toBeNull()
    const created = await completeCanvasShape({ operation: 'cut', x: 64, y: 45, width: 2, height: 15, joint: { kind: 'edge-slot', axis: 'y', entry: 'start' } })
    expect(canvas.current?.tool).toBe('select')
    expect(canvas.current?.selectedId).toBe(created.id)
  } finally { await ui.close() }
})

it('shows short hover names for every bottom tool, including disabled actions, and dismisses them after use', async () => {
  const ui = await mount()
  try {
    const toolbar = ui.container.querySelector('[data-testid="sketch-toolbar"]')!
    for (const button of toolbar.querySelectorAll('button')) {
      const name = button.getAttribute('aria-label')!
      await act(async () => button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
      const tooltip = ui.container.querySelector('[role="tooltip"]')
      expect(tooltip?.textContent).toBe(name === '孔 / 开口' ? '矩形开孔' : name)
      expect(button.getAttribute('title')).toBeNull()
      expect(button.getAttribute('aria-describedby')).toBe(tooltip?.id)
      await act(async () => button.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
      expect(ui.container.querySelector('[role="tooltip"]')).toBeNull()
    }
    await act(async () => ui.button('插接口').focus())
    expect(ui.container.querySelector('[role="tooltip"]')?.textContent).toBe('插接口')
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(ui.container.querySelector('[role="tooltip"]')).toBeNull()
    await act(async () => ui.button('插接口').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    await act(async () => ui.button('插接口').click())
    expect(ui.container.querySelector('[role="tooltip"]')).toBeNull()
    expect(canvas.current?.tool).toBe('insert-slot')
  } finally { await ui.close() }
})

it('keeps empty and unfinished previews free of instruction cards', async () => {
  const ui = await mount()
  const feedback = () => ui.container.querySelector('[aria-label="预览提示"]')
  try {
    expect(feedback()).toBeNull()
    await act(async () => canvas.current!.onPendingChange(true))
    expect(feedback()).toBeNull()
    expect(ui.container.querySelector('[role="alert"]')).toBeNull()
    await act(async () => canvas.current!.onPendingChange(false))
    expect(feedback()).toBeNull()
  } finally { await ui.close() }
})

it('explains disconnected material in the preview and recovers automatically after connecting it', async () => {
  const ui = await mount()
  try {
    const first = await completeCanvasShape({ x: 35, y: 55, width: 20, height: 20 })
    const second = await completeCanvasShape({ x: 75, y: 55, width: 20, height: 20 })
    const feedback = ui.container.querySelector('[aria-label="预览提示"]')!
    expect(feedback.getAttribute('role')).not.toBe('alert')
    expect(feedback.querySelector('[role="alert"]')).not.toBeNull()
    expect(feedback?.textContent).toContain('图形没有连成一块')
    expect(feedback?.textContent).toContain('2 个不相连的部分')
    expect(feedback?.textContent).toContain('切孔')
    expect(ui.button('返回二维修改')).toBeDefined()
    expect(feedback.textContent!.length).toBeLessThan(100)
    expect(feedback.querySelectorAll('p')).toHaveLength(1)
    expect(ui.container.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(ui.container.querySelector('[aria-label="二维设计"]')?.textContent).not.toContain('存在多个不相连的实体')
    expect(ui.button('保存').disabled).toBe(true)
    expect(canvas.current?.shapes.map(shape => shape.id)).toEqual([first.id, second.id])
    expect(ui.container.querySelector('[data-testid="extrude-preview"]')).toBeNull()
    await act(async () => canvas.current!.onChange([first, { ...second, x: 50 }]))
    expect(ui.container.querySelector('[aria-label="预览提示"]')).toBeNull()
    expect(ui.button('保存').disabled).toBe(false)
    expect(ui.container.querySelector('[data-testid="extrude-preview"]')?.textContent).toContain('"w":35')
  } finally { await ui.close() }
})

it('identifies the out-of-reference shape and can select it without changing the drawing', async () => {
  const ui = await mount()
  try {
    await completeCanvasShape()
    const outside = await completeCanvasShape({ x: 5, y: 5, width: 10, height: 10 })
    await act(async () => canvas.current!.onSelect(null))
    const before = structuredClone(canvas.current!.shapes)
    expect(ui.container.querySelector('[aria-label="预览提示"]')?.textContent).toContain('图形超出参考范围')
    expect(canvas.current?.problemShapeIds).toEqual([outside.id])
    expect(canvas.current?.referenceInvalid).toBe(true)
    expect(ui.container.querySelector('[aria-label="预览提示"]')?.querySelectorAll('button')).toHaveLength(1)
    await act(async () => ui.button('选择图形 2').click())
    expect(canvas.current?.selectedId).toBe(outside.id)
    expect(canvas.current?.tool).toBe('select')
    expect(canvas.current?.shapes).toEqual(before)
    expect(ui.button('保存').disabled).toBe(true)
    await act(async () => ui.button('撤销').click())
    expect(ui.container.querySelector('[aria-label="预览提示"]')).toBeNull()
    expect(canvas.current?.problemShapeIds).toEqual([])
    expect(canvas.current?.referenceInvalid).toBe(false)
  } finally { await ui.close() }
})

it.each([
  ['还没有木板实体', false, { operation: 'cut', kind: 'ellipse', x: 55, y: 55, width: 8, height: 8 }],
  ['木板已被全部切除', true, { operation: 'cut', x: 25, y: 35, width: 80, height: 60 }],
  ['图形没有连成一块', true, { operation: 'cut', x: 60, y: 40, width: 2, height: 50 }],
  ['图形轮廓需要修改', false, { kind: 'polygon', points: [[0, 0], [1, 0.8], [0, 1], [1, 0]] }],
] as const)('shows a specific preview explanation: %s', async (title, board, shape) => {
  const ui = await mount()
  try {
    if (board) await completeCanvasShape()
    await completeCanvasShape(shape as Partial<SketchShape>)
    expect(ui.container.querySelector('[aria-label="预览提示"]')?.textContent).toContain(title)
    expect(ui.container.querySelector('[aria-label="预览提示"]')?.getAttribute('data-state')).toBe('error')
    expect(ui.container.querySelector('[data-testid="extrude-preview"]')).toBeNull()
    expect(ui.button('保存').disabled).toBe(true)
    await act(async () => canvas.current!.onPendingChange(true))
    expect(ui.container.querySelector('[aria-label="预览提示"]')).toBeNull()
    expect(ui.container.querySelector('[role="alert"]')).toBeNull()
  } finally { await ui.close() }
})

it('does not repeat manufacturing and flight disclaimers around the drawing workspace', async () => {
  const ui = await mount()
  try {
    await completeCanvasShape()
    expect(ui.container.textContent).not.toMatch(/不代表|需试片验证|未验证制造|预览不代表/)
    expect(ui.container.querySelector('[aria-label="木板三维预览"] p')).toBeNull()
  } finally { await ui.close() }
})

it('uses red for cut tools in idle and selected states while additive tools stay blue', async () => {
  const ui = await mount()
  try {
    for (const label of ['圆孔', '孔 / 开口', '插接口']) {
      const cut = ui.button(label)
      expect(cut.classList.contains('text-red-600')).toBe(true)
      expect(cut.classList.contains('hover:bg-red-50')).toBe(true)
      await act(async () => cut.click())
      expect(cut.getAttribute('aria-pressed')).toBe('true')
      expect(cut.classList.contains('bg-red-600')).toBe(true)
      expect(cut.classList.contains('text-white')).toBe(true)
      await act(async () => ui.button('矩形').click())
      expect(cut.getAttribute('aria-pressed')).toBe('false')
      expect(cut.classList.contains('text-red-600')).toBe(true)
      expect(ui.button('矩形').classList.contains('bg-sky-500')).toBe(true)
    }
  } finally { await ui.close() }
})

it.each([
  ['矩形', 'rectangle', { kind: 'rectangle' }],
  ['圆形', 'ellipse', { kind: 'ellipse' }],
  ['多边形', 'polygon', { kind: 'polygon', points: [[0, 0], [1, 0], [0.5, 1]] }],
  ['自由画', 'freehand', { kind: 'polygon', points: [[0, 0], [1, 0], [0.5, 1]] }],
  ['圆孔', 'circle-hole', { kind: 'ellipse', operation: 'cut' }],
  ['孔 / 开口', 'slot', { operation: 'cut' }],
] as const)('returns from %s to Select only after a shape is created', async (label, tool, overrides) => {
  const ui = await mount()
  try {
    await act(async () => ui.button(label).click())
    expect(canvas.current?.tool).toBe(tool)
    await act(async () => { canvas.current!.onPendingChange(true) })
    expect(canvas.current?.tool).toBe(tool)
    await act(async () => { canvas.current!.onPendingChange(false); canvas.current!.onSelect(null) })
    expect(canvas.current?.tool).toBe(tool)
    const created = await completeCanvasShape(overrides as Partial<SketchShape>)
    expect(canvas.current?.tool).toBe('select')
    expect(canvas.current?.selectedId).toBe(created.id)
    expect(ui.button('选择').getAttribute('aria-pressed')).toBe('true')
    expect(ui.button(label).getAttribute('aria-pressed')).toBe('false')
    expect(ui.container.querySelector('[aria-label="图形属性"]')).not.toBeNull()
    expect(ui.container.querySelector('[aria-label="开孔方式"]')).toBeNull()
  } finally { await ui.close() }
})

it.each(['边缘插槽', '板内插槽'])('returns to Select after creating %s without resetting the chosen slot mode', async label => {
  const ui = await mount()
  try {
    await completeCanvasShape()
    await act(async () => ui.button('孔 / 开口').click())
    await act(async () => ui.button(label).click())
    const kind = label === '边缘插槽' ? 'edge-slot' : 'through-slot'
    const created = await completeCanvasShape({ operation: 'cut', x: 45, y: 55, width: 12, height: 2, joint: { kind, axis: 'x', entry: kind === 'edge-slot' ? 'start' : 'front' } })
    expect(canvas.current?.tool).toBe('select')
    expect(canvas.current?.selectedId).toBe(created.id)
    expect(canvas.current?.slotMode).toBe(kind)
    expect(ui.button('选择').getAttribute('aria-pressed')).toBe('true')
  } finally { await ui.close() }
})

it('offers dimensioned shape tools, fixed thickness, live preview and undoable clearing', async () => {
  const ui = await mount()
  try {
    expect(ui.container.querySelector('h1')?.textContent).toBe('零件绘制')
    expect(ui.container.textContent).toContain('板厚 2 mm')
    expect(ui.container.querySelectorAll('[aria-label="参考类型"] option')).toHaveLength(5)
    for (const name of ['矩形', '圆形', '多边形', '圆孔', '孔 / 开口']) expect(ui.button(name)).toBeDefined()
    expect(ui.button('保存').disabled).toBe(true)
    await completeCanvasShape()
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

it('distinguishes ordinary cuts and fixed-width slots, preserving the board for invalid slot placement', async () => {
  const ui = await mount()
  try {
    await act(async () => ui.button('孔 / 开口').click())
    expect(ui.button('边缘插槽')).toBeDefined()
    expect(ui.button('板内插槽')).toBeDefined()
    await act(async () => ui.button('板内插槽').click())
    expect(canvas.current?.slotMode).toBe('through-slot')
    await completeCanvasShape()
    await completeCanvasShape({ operation: 'cut', x: 45, y: 55, width: 12, height: 2, joint: { kind: 'through-slot', axis: 'x', entry: 'front' } })
    expect(ui.button('保存').disabled).toBe(false)
    expect(ui.container.querySelector<HTMLInputElement>('[aria-label="槽宽（毫米）"]')?.disabled).toBe(true)
    expect(ui.container.querySelector('[aria-label="插入方向"]')).not.toBeNull()
    expect(ui.container.textContent).toContain('插片')
    await act(async () => canvas.current!.onChange(canvas.current!.shapes.map(shape => shape.joint ? { ...shape, y: 5 } : shape)))
    expect(ui.button('保存').disabled).toBe(true)
    expect(ui.container.querySelector('[data-testid="extrude-preview"]')?.textContent).toContain('"w":60')
    expect(ui.container.textContent).toContain('插槽')
  } finally { await ui.close() }
})

it('retains editable geometry and the 2mm mainboard payload after a failed save', async () => {
  useAuthStore.setState({ token: 'test-token', user: { id: 'test-user', username: 'test', role: 'student' } })
  save.mockClear()
  const ui = await mount()
  try {
    await completeCanvasShape()
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
    await completeCanvasShape()
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

it('preserves circular geometry drawn in a wide landing reference', async () => {
  const ui = await mount()
  try {
    const category = ui.container.querySelector<HTMLSelectElement>('[aria-label="参考类型"]')!
    await act(async () => { category.value = 'landing'; category.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => ui.button('圆形').click())
    expect(canvas.current?.tool).toBe('ellipse')
    await completeCanvasShape({ kind: 'ellipse', x: 20, y: 5, width: 40, height: 40 })
    expect(ui.container.querySelector<HTMLInputElement>('[aria-label="宽（毫米）"]')?.value).toBe('40')
    expect(ui.container.querySelector<HTMLInputElement>('[aria-label="高（毫米）"]')?.value).toBe('40')
    expect(ui.container.querySelector('[data-testid="extrude-preview"]')?.textContent).toContain('"bboxMm":{"w":40,"h":40}')
  } finally { await ui.close() }
})

it('shows non-modal properties only for the selected shape and disables rectangle-only parameters for circles', async () => {
  const ui = await mount()
  try {
    const labels = ['X', 'Y', '宽', '高', '圆角']
    const control = (label: string) => ui.container.querySelector<HTMLInputElement>(`[aria-label="${label}（毫米）"]`)
    for (const label of labels) expect(control(label)).toBeNull()
    expect(ui.container.querySelector('[aria-label="选中图形"]')).toBeNull()
    await completeCanvasShape()
    const properties = ui.container.querySelector('[aria-label="图形属性"]')
    expect(properties).not.toBeNull()
    expect(properties?.getAttribute('aria-modal')).not.toBe('true')
    for (const label of labels) expect(control(label)?.matches(':disabled')).toBe(false)
    await act(async () => canvas.current!.onSelect(null))
    for (const label of labels) expect(control(label)).toBeNull()
    expect(ui.container.querySelector('[aria-label="图形属性"]')).toBeNull()
    await act(async () => ui.button('圆形').click())
    await completeCanvasShape({ kind: 'ellipse', x: 45, y: 45, width: 40, height: 40 })
    expect(control('圆角')).not.toBeNull()
    expect(control('圆角')?.matches(':disabled')).toBe(true)
    expect(control('宽')?.matches(':disabled')).toBe(false)
  } finally { await ui.close() }
})

it('preserves invalid numeric edits when selecting another shape or invoking history', async () => {
  const ui = await mount()
  try {
    const selected = await completeCanvasShape()
    const width = ui.container.querySelector<HTMLInputElement>('[aria-label="宽（毫米）"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(width, '2500')
      width.dispatchEvent(new Event('input', { bubbles: true }))
      width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await act(async () => canvas.current!.onSelect(null))
    expect(canvas.current?.selectedId).toBe(selected.id)
    expect(width.isConnected).toBe(true)
    expect(width.value).toBe('2500')
    expect(ui.button('保存').disabled).toBe(true)
    expect(ui.button('撤销').disabled).toBe(true)
    expect(ui.button('清空').disabled).toBe(true)
    await act(async () => width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(ui.button('撤销').disabled).toBe(false)
  } finally { await ui.close() }
})
