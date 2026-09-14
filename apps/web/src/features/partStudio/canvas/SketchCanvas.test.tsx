// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SketchShape } from '../sketch/model'
import { SketchCanvas, type SketchCanvasProps } from './SketchCanvas'

let container: HTMLDivElement
let root: Root
let props: SketchCanvasProps
const shape: SketchShape = { id: 'base', kind: 'rectangle', operation: 'add', x: 20, y: 20, width: 40, height: 30, radius: 0 }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  props = { shapes: [], reference: { width: 100, height: 100 }, part: null, tool: 'rectangle', selectedId: null, snap: true, disabled: false, onChange: vi.fn(), onSelect: vi.fn(), onPendingChange: vi.fn() }
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function render() { await act(async () => root.render(<SketchCanvas {...props} />)) }
function svg() { return container.querySelector<SVGSVGElement>('[data-testid="sketch-canvas"]')! }
function pointEvent(type: string, x: number, y: number, target: Element = svg(), pointerId = 1, shiftKey = false, pointerType = 'mouse') {
  // getScreenCTM is deliberately unavailable in jsdom. A 116px element maps to
  // the 116mm viewBox (8mm margins) without scaling, matching the DOM fallback.
  vi.spyOn(svg(), 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 116, bottom: 116, width: 116, height: 116, toJSON() {} })
  const event = new MouseEvent(type, { bubbles: true, clientX: x + 8, clientY: y + 8, button: 0, shiftKey })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  target.dispatchEvent(event)
}
async function draw(x: number, y: number, endX: number, endY: number) {
  await act(async () => pointEvent('pointerdown', x, y))
  await act(async () => pointEvent('pointermove', endX, endY))
  expect(props.onChange).not.toHaveBeenCalled()
  await act(async () => pointEvent('pointerup', endX, endY))
}

it('draws a snapped rectangle in mm and commits only once when the gesture ends', async () => {
  await render()
  await draw(10.2, 20.3, 50.2, 60.2)
  expect(props.onChange).toHaveBeenCalledTimes(1)
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ kind: 'rectangle', x: 10, y: 20, width: 40, height: 40, operation: 'add' })
  expect(props.onPendingChange).toHaveBeenCalledWith(true)
  expect(props.onPendingChange).toHaveBeenLastCalledWith(false)
})

it('anchors the insertion tool at the board edge and commits one selected 2mm notch', async () => {
  props = { ...props, tool: 'insert-slot', shapes: [shape], part: { contour: { points: [[20, 20], [60, 20], [60, 50], [20, 50]] } } }
  await render()
  await draw(40, 19.5, 43, 35)
  const created = vi.mocked(props.onChange).mock.calls[0]![0][1]!
  expect(created).toMatchObject({ width: 2, joint: { kind: 'edge-slot', axis: 'y', entry: 'start' } })
  expect(created.y + created.height).toBe(35)
  expect(props.onChange).toHaveBeenCalledTimes(1)
  expect(props.onSelect).toHaveBeenLastCalledWith(created.id)
  props = { ...props, shapes: [shape, created], tool: 'select', selectedId: created.id }
  await render()
  expect(container.querySelector('[data-testid="joint-bottom"]')).not.toBeNull()
})

it('explains insertion before the first click and marks only the real outer-edge hover target', async () => {
  props.tool = 'insert-slot'
  await render()
  const hint = () => container.querySelector('[data-testid="insertion-guidance"]')!
  expect(hint()?.textContent).toContain('先画一块完整木板')
  expect(svg().style.cursor).toBe('not-allowed')
  props = { ...props, shapes: [shape], part: { contour: { points: [[20, 20], [60, 20], [60, 50], [20, 50]] }, holes: [{ points: [[36, 32], [44, 32], [44, 38], [36, 38]] }] } }
  await render()
  expect(hint().textContent).toContain('靠近红色板边')
  expect(container.querySelector('[data-testid="insertion-edge-guide"]')?.getAttribute('d')).toBe('M 20 20 L 60 20 L 60 50 L 20 50 Z')
  // The reference frame and a hole inside the board are not entry edges.
  for (const point of [[0, 50], [40, 35]]) {
    await act(async () => pointEvent('pointermove', point[0]!, point[1]!))
    expect(svg().style.cursor).toBe('not-allowed')
    expect(container.querySelector('[data-testid="insertion-hover-anchor"]')).toBeNull()
  }
  await act(async () => pointEvent('pointerdown', 40, 35))
  expect(hint().textContent).toContain('请从木板外边缘向内拖动')
  expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1)
  await act(async () => pointEvent('pointermove', 40, 19.5))
  expect(svg().style.cursor).toBe('crosshair')
  expect(hint().textContent).toContain('已对准板边')
  const anchor = container.querySelector('[data-testid="insertion-hover-anchor"]')!
  expect(anchor.getAttribute('cx')).toBe('40')
  expect(anchor.getAttribute('cy')).toBe('20')
  expect(props.onChange).not.toHaveBeenCalled()
  expect(props.onSelect).not.toHaveBeenCalled()
  await act(async () => svg().dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })))
  expect(container.querySelector('[data-testid="insertion-hover-anchor"]')).toBeNull()
  props.tool = 'select'
  await render()
  expect(hint()).toBeNull()
  expect(container.querySelector('[data-testid="insertion-edge-guide"]')).toBeNull()
})

it('shows drag and retry instructions inside the canvas without duplicating errors', async () => {
  props = { ...props, tool: 'insert-slot', shapes: [shape], part: { contour: { points: [[20, 20], [60, 20], [60, 50], [20, 50]] } } }
  await render()
  await act(async () => pointEvent('pointerdown', 40, 20))
  expect(container.querySelector('[data-testid="insertion-guidance"]')?.textContent).toContain('拖到槽底后松开')
  expect(container.querySelector('[data-testid="insertion-hover-anchor"]')).toBeNull()
  await act(async () => pointEvent('pointerup', 40, 10))
  expect(container.querySelector('[data-testid="insertion-guidance"]')?.textContent).toContain('向内拖动至少 2 mm')
  expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1)
  expect(props.onChange).not.toHaveBeenCalled()
})

it.each(['mouse', 'touch'])('does not create an insertion after an outward or cancelled %s gesture', async pointerType => {
  props = { ...props, tool: 'insert-slot', shapes: [shape], part: { contour: { points: [[20, 20], [60, 20], [60, 50], [20, 50]] } } }
  await render()
  await act(async () => pointEvent('pointerdown', 40, 20, svg(), 1, false, pointerType))
  expect(container.querySelector('[data-testid="insertion-mouth"]')).not.toBeNull()
  await act(async () => pointEvent('pointermove', 40, 10, svg(), 1, false, pointerType))
  await act(async () => pointEvent('pointerup', 40, 10, svg(), 1, false, pointerType))
  expect(props.onChange).not.toHaveBeenCalled()
  expect(container.textContent).toContain('向内拖动至少 2 mm')
  await act(async () => pointEvent('pointerdown', 40, 20, svg(), 2, false, pointerType))
  await act(async () => pointEvent('pointermove', 40, 35, svg(), 2, false, pointerType))
  await act(async () => svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  await act(async () => pointEvent('pointerup', 40, 35, svg(), 2, false, pointerType))
  expect(props.onChange).not.toHaveBeenCalled()
  expect(props.onSelect).not.toHaveBeenCalled()
})

it('keeps the existing board when the new interface would cut through another opening', async () => {
  props = { ...props, tool: 'insert-slot', shapes: [shape], part: { contour: { points: [[20, 20], [60, 20], [60, 50], [20, 50]] } }, validateInsertion: () => '请避开已有孔槽。' }
  await render()
  await draw(40, 20, 40, 35)
  expect(props.onChange).not.toHaveBeenCalled()
  expect(container.querySelector('[data-testid="compiled-sketch"]')).not.toBeNull()
  expect(container.textContent).toContain('请避开已有孔槽')
})

it('marks a diagnosed source and its mirror without changing selection, hit targets or geometry', async () => {
  props.shapes = [{ ...shape, mirror: true }, { ...shape, id: 'hole', operation: 'cut', x: 80 }]
  props.problemShapeIds = ['base']
  props.referenceInvalid = true
  props.tool = 'select'
  props.selectedId = 'base'
  await render()
  const problems = container.querySelectorAll('[data-problem-shape-id="base"]')
  expect(problems).toHaveLength(2)
  for (const problem of problems) {
    expect(problem.getAttribute('pointer-events')).toBe('none')
    expect(problem.getAttribute('stroke')).toBe('#b45309')
  }
  expect(container.querySelector('[data-problem-shape-id="hole"]')).toBeNull()
  expect(container.querySelector('[data-testid="reference-outline"]')?.getAttribute('stroke')).toBe('#b45309')
  expect(container.querySelectorAll('[data-resize-handle]')).toHaveLength(8)
  expect(props.onChange).not.toHaveBeenCalled()
  props.problemShapeIds = []
  props.referenceInvalid = false
  await render()
  expect(container.querySelector('[data-problem-shape-id]')).toBeNull()
})

it('draws a true circle and a freely sized ordinary rectangular cut', async () => {
  props.tool = 'circle-hole'
  await render()
  await draw(10, 10, 30, 50)
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ kind: 'ellipse', width: 20, height: 20, operation: 'cut' })
  vi.mocked(props.onChange).mockClear()
  props.tool = 'slot'
  await render()
  await draw(10, 10, 15, 50)
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ kind: 'rectangle', width: 5, height: 40, operation: 'cut' })
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]?.joint).toBeUndefined()
})

it.each(['edge-slot', 'through-slot'] as const)('keeps the 2mm narrow axis and explicit intent when drawing %s', async slotMode => {
  props.tool = 'slot'
  props.slotMode = slotMode
  await render()
  await draw(10, 10, 15, 50)
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ width: 2, height: 40, operation: 'cut', joint: { kind: slotMode, axis: 'y', entry: slotMode === 'edge-slot' ? 'start' : 'front' } })
})

it('marks the actual board-edge entrance rather than the cutter extension', async () => {
  const slot: SketchShape = { ...shape, id: 'edge', operation: 'cut', x: 39, y: 10, width: 2, height: 25, joint: { kind: 'edge-slot', axis: 'y', entry: 'start' } }
  props = { ...props, shapes: [shape, slot], tool: 'select', selectedId: slot.id,
    jointGuides: [{ id: 'edge', kind: 'edge-slot', x: 39, y: 20, lengthMm: 15, axis: 'y', entry: 'start' }] }
  await render()
  expect(container.querySelector('[data-testid="joint-direction"]')?.getAttribute('d')).toBe('M 40 13 V 24 m -2 -2 l 2 2 l 2 -2')
})

it('closes a polygon explicitly with Enter without requiring a hit on its first vertex', async () => {
  props.tool = 'polygon'
  await render()
  for (const [x, y] of [[10, 10], [50, 10], [30, 40]]) await act(async () => pointEvent('pointerdown', x!, y!))
  expect(props.onChange).not.toHaveBeenCalled()
  await act(async () => svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ kind: 'polygon', x: 10, y: 10, width: 40, height: 30, points: [[0, 0], [1, 0], [0.5, 1]] })
})

it.each(['rectangle', 'ellipse', 'circle-hole', 'slot'] as const)('creates a bounded %s from the keyboard without an add button', async tool => {
  props.tool = tool
  props.reference = { width: 130, height: 130, shape: 'ellipse' }
  await render()
  await act(async () => svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(props.onChange).toHaveBeenCalledTimes(1)
  const created = vi.mocked(props.onChange).mock.calls[0]![0][0]!
  expect(created.operation).toBe(['circle-hole', 'slot'].includes(tool) ? 'cut' : 'add')
  expect(created.width).toBeGreaterThan(0)
  expect(created.height).toBeGreaterThan(0)
  if (tool === 'slot') expect(created.height).toBe(2)
  if (tool === 'rectangle') expect(created).toMatchObject({ x: 35, y: 45, width: 60, height: 40 })
  if (tool === 'ellipse' || tool === 'circle-hole') expect(created.width).toBe(created.height)
  expect(props.onSelect).toHaveBeenCalledWith(created.id)
})

it('does not create a keyboard shape when disabled or at capacity, and Escape only deselects', async () => {
  props.disabled = true
  await render()
  await act(async () => svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(props.onChange).not.toHaveBeenCalled()
  props.disabled = false
  props.shapes = Array.from({ length: 32 }, (_, index) => ({ ...shape, id: `shape-${index}` }))
  await render()
  await act(async () => svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(props.onChange).not.toHaveBeenCalled()
  await act(async () => svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(props.onSelect).toHaveBeenLastCalledWith(null)
  expect(props.onChange).not.toHaveBeenCalled()
})

it('cancels an uncommitted polygon and drawing without losing existing shapes', async () => {
  props.shapes = [shape]
  props.tool = 'polygon'
  await render()
  await act(async () => pointEvent('pointerdown', 70, 70))
  await act(async () => svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(props.onChange).not.toHaveBeenCalled()
  expect(props.onPendingChange).toHaveBeenLastCalledWith(false)
  expect(container.querySelector('[data-shape-id="base"]')).not.toBeNull()
})

it('moves the selected shape with one undoable commit and preserves its dimensions', async () => {
  props.shapes = [shape]
  props.tool = 'select'
  props.selectedId = 'base'
  await render()
  await act(async () => pointEvent('pointerdown', 30, 30, container.querySelector('[data-shape-id="base"]')!))
  await act(async () => pointEvent('pointermove', 35, 37))
  expect(props.onChange).not.toHaveBeenCalled()
  await act(async () => pointEvent('pointerup', 35, 37))
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ x: 25, y: 27, width: 40, height: 30 })
})

it('moves a selected polygon vertex and renormalizes its bounding box', async () => {
  props.shapes = [{ ...shape, kind: 'polygon', points: [[0, 0], [1, 0], [0.5, 1]] }]
  props.tool = 'select'
  props.selectedId = 'base'
  await render()
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '编辑顶点')!.click())
  await act(async () => pointEvent('pointerdown', 40, 50, container.querySelector('[data-vertex-index="2"]')!))
  await act(async () => pointEvent('pointermove', 40, 70))
  await act(async () => pointEvent('pointerup', 40, 70))
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ height: 50, points: [[0, 0], [1, 0], [0.5, 1]] })
})

it('renders the real combined outline with evenodd holes and keeps disabled input read-only', async () => {
  props.part = { contour: { points: [[0, 0], [100, 0], [100, 100], [0, 100]] }, holes: [{ points: [[10, 10], [20, 10], [20, 20], [10, 20]] }] }
  props.disabled = true
  await render()
  expect(container.querySelector('[data-testid="compiled-sketch"]')?.getAttribute('fill-rule')).toBe('evenodd')
  await draw(10, 20, 40, 50)
  expect(props.onChange).not.toHaveBeenCalled()
})

it('rejects too many shapes and too many polygon points instead of silently truncating them', async () => {
  props.shapes = Array.from({ length: 32 }, (_, index) => ({ ...shape, id: `${index}` }))
  await render()
  await draw(10, 10, 20, 20)
  expect(props.onChange).not.toHaveBeenCalled()
  expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/32/)
  props.shapes = []
  props.tool = 'polygon'
  await render()
  for (let index = 0; index < 129; index++) await act(async () => pointEvent('pointerdown', index % 100, Math.floor(index / 100)))
  expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/128/)
  expect(props.onChange).not.toHaveBeenCalled()
})

it('holds horizontal or vertical alignment with Shift for polygon points and moving shapes', async () => {
  props.tool = 'polygon'
  await render()
  await act(async () => pointEvent('pointerdown', 10, 10))
  await act(async () => pointEvent('pointerdown', 50, 16, svg(), 1, true))
  await act(async () => pointEvent('pointerdown', 30, 40))
  await act(async () => svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ points: [[0, 0], [1, 0], [0.5, 1]] })
  vi.mocked(props.onChange).mockClear()
  props.shapes = [shape]
  props.tool = 'select'
  props.selectedId = 'base'
  await render()
  await act(async () => pointEvent('pointerdown', 30, 30, container.querySelector('[data-shape-id="base"]')!))
  await act(async () => pointEvent('pointermove', 38, 32, svg(), 1, true))
  await act(async () => pointEvent('pointerup', 38, 32, svg(), 1, true))
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ x: 28, y: 20 })
})

it('ignores secondary pointers while another pointer is drawing', async () => {
  await render()
  await act(async () => pointEvent('pointerdown', 10, 10))
  await act(async () => pointEvent('pointermove', 80, 80, svg(), 2))
  await act(async () => pointEvent('pointerup', 80, 80, svg(), 2))
  expect(props.onChange).not.toHaveBeenCalled()
  await act(async () => pointEvent('pointermove', 30, 30))
  await act(async () => pointEvent('pointerup', 30, 30))
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ x: 10, y: 10, width: 20, height: 20 })
})

it('keeps a freehand stroke uncommitted until the user explicitly closes it', async () => {
  props.tool = 'freehand'
  await render()
  await act(async () => pointEvent('pointerdown', 10, 10))
  await act(async () => pointEvent('pointermove', 50, 10))
  await act(async () => pointEvent('pointermove', 30, 40))
  await act(async () => pointEvent('pointerup', 30, 40))
  expect(props.onChange).not.toHaveBeenCalled()
  expect(props.onPendingChange).toHaveBeenLastCalledWith(true)
  const close = [...container.querySelectorAll('button')].find(button => button.textContent === '完成闭合')!
  close.focus()
  await act(async () => close.click())
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ kind: 'polygon', points: [[0, 0], [1, 0], [0.5, 1]] })
  expect(props.onPendingChange).toHaveBeenLastCalledWith(false)
  expect(document.activeElement === svg()).toBe(true)
  expect(props.onSelect).toHaveBeenCalledWith(vi.mocked(props.onChange).mock.calls[0]![0][0]!.id)
})

it('shows a round mainboard reference and distinguishes an elliptical reference', async () => {
  props.reference = { width: 100, height: 100, shape: 'ellipse' }
  await render()
  const circleReference = container.querySelector('[data-testid="reference-outline"]')!
  expect(circleReference.tagName.toLowerCase()).toBe('ellipse')
  expect(circleReference.getAttribute('rx')).toBe('50')
  expect(circleReference.getAttribute('ry')).toBe('50')
  expect(container.textContent).toContain('圆形参考 Ø 100 mm')
  props.reference = { width: 100, height: 80, shape: 'ellipse' }
  await render()
  expect(container.textContent).toContain('椭圆参考 100 × 80 mm')
})

it.each(['rectangle', 'ellipse', 'polygon'] as const)('resizes %s with eight handles, live preview and exactly one commit', async kind => {
  props.shapes = [{ ...shape, kind, points: kind === 'polygon' ? [[0, 0], [1, 0], [0.5, 1]] : undefined }]
  props.tool = 'select'
  props.selectedId = 'base'
  await render()
  expect(container.querySelectorAll('[data-resize-handle]')).toHaveLength(8)
  expect(container.querySelectorAll('[data-vertex-index]')).toHaveLength(0)
  await act(async () => pointEvent('pointerdown', 60, 50, container.querySelector('[data-resize-handle="se"]')!))
  await act(async () => pointEvent('pointermove', 70, 65))
  expect(props.onChange).not.toHaveBeenCalled()
  const outline = container.querySelector('[data-testid="selection-outline"]')!
  expect(outline.getAttribute('width')).toBe('50')
  expect(outline.getAttribute('height')).toBe('45')
  await act(async () => pointEvent('pointerup', 70, 65))
  expect(props.onChange).toHaveBeenCalledTimes(1)
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ x: 20, y: 20, width: 50, height: 45, kind })
  expect(props.onPendingChange).toHaveBeenLastCalledWith(false)
})

it('supports Shift resizing and ignores another finger until the active drag commits', async () => {
  props.shapes = [shape]
  props.tool = 'select'
  props.selectedId = 'base'
  await render()
  const handle = container.querySelector('[data-resize-handle="e"]')!
  await act(async () => pointEvent('pointerdown', 60, 35, handle, 1, true, 'touch'))
  await act(async () => pointEvent('pointerdown', 20, 35, container.querySelector('[data-resize-handle="w"]')!, 2, false, 'touch'))
  await act(async () => pointEvent('pointermove', 100, 100, svg(), 2, false, 'touch'))
  await act(async () => pointEvent('pointerup', 100, 100, svg(), 2, false, 'touch'))
  expect(props.onChange).not.toHaveBeenCalled()
  await act(async () => pointEvent('pointermove', 80, 35, svg(), 1, true, 'touch'))
  await act(async () => pointEvent('pointerup', 80, 35, svg(), 1, true, 'touch'))
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ x: 20, y: 12.5, width: 60, height: 45 })
  expect(container.textContent).toContain('Shift 等比缩放')
})

it.each(['pointercancel', 'Escape'])('does not commit a resize interrupted by %s', async cancel => {
  props.shapes = [shape]
  props.tool = 'select'
  props.selectedId = 'base'
  await render()
  await act(async () => pointEvent('pointerdown', 60, 50, container.querySelector('[data-resize-handle="se"]')!))
  await act(async () => pointEvent('pointermove', 80, 80))
  await act(async () => cancel === 'Escape' ? svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) : pointEvent('pointercancel', 80, 80))
  await act(async () => pointEvent('pointerup', 80, 80))
  expect(props.onChange).not.toHaveBeenCalled()
  expect(container.querySelector('[data-testid="selection-outline"]')?.getAttribute('width')).toBe('40')
  expect(props.onPendingChange).toHaveBeenLastCalledWith(false)
})

it('prevents selection focus scrolling and never moves a shape on click after a layout shift', async () => {
  props.shapes = [shape]
  props.tool = 'select'
  await render()
  const focus = vi.spyOn(svg(), 'focus')
  const target = container.querySelector<SVGGElement>('[data-shape-id="base"]')!
  await act(async () => pointEvent('pointerdown', 30, 30, target))
  expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  expect(target.style.outline).toBe('none')
  vi.mocked(svg().getBoundingClientRect).mockReturnValue({ x: 0, y: 48, left: 0, top: 48, right: 116, bottom: 164, width: 116, height: 116, toJSON() {} })
  const up = new MouseEvent('pointerup', { bubbles: true, clientX: 38, clientY: 38, button: 0 })
  Object.defineProperty(up, 'pointerId', { value: 1 })
  await act(async () => svg().dispatchEvent(up))
  expect(props.onChange).not.toHaveBeenCalled()
  expect(props.onPendingChange).toHaveBeenLastCalledWith(false)
})

it('keeps outlines one CSS pixel and provides separate constant-size mouse/touch hit targets', async () => {
  props.shapes = [shape]
  props.tool = 'select'
  props.selectedId = 'base'
  await render()
  vi.spyOn(svg(), 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 232, bottom: 232, width: 232, height: 232, toJSON() {} })
  await act(async () => window.dispatchEvent(new Event('resize')))
  const outline = container.querySelector('[data-testid="selection-outline"]')!
  expect(outline.getAttribute('vector-effect')).toBe('non-scaling-stroke')
  expect(outline.getAttribute('stroke-width')).toBe('1')
  expect(container.querySelector('[data-resize-handle="se"] [data-handle-hit]')?.getAttribute('width')).toBe('12')
  expect(container.querySelector('[data-resize-handle="se"] [data-handle-mark]')?.getAttribute('width')).toBe('3')
  expect(container.querySelector('[data-shape-id="base"] rect')?.getAttribute('vector-effect')).toBe('non-scaling-stroke')
  await act(async () => pointEvent('pointerdown', 60, 50, container.querySelector('[data-resize-handle="se"]')!, 1, false, 'touch'))
  expect(container.querySelector('[data-resize-handle="se"] [data-handle-hit]')?.getAttribute('width')).toBe('44')
})

it('provides a thin visible focus outline when keyboard navigation reaches an unselected shape', async () => {
  props.shapes = [shape]
  props.tool = 'select'
  await render()
  await act(async () => container.querySelector<SVGGElement>('[data-shape-id="base"]')!.focus())
  const outline = container.querySelector('[data-testid="shape-focus-outline"]')!
  expect(outline).not.toBeNull()
  expect(outline.getAttribute('stroke-width')).toBe('1')
  expect(outline.getAttribute('vector-effect')).toBe('non-scaling-stroke')
})

it.each(['move', 'resize', 'draw'])('commits a valid numeric draft before starting %s from the latest shape', async operation => {
  function EditingHarness() {
    const [shapes, setShapes] = useState([shape])
    const [blocked, setBlocked] = useState(true)
    return <><input defaultValue="80" onBlur={() => { setShapes([{ ...shape, width: 80 }]); setBlocked(false) }} />
      <SketchCanvas {...props} shapes={shapes} selectedId="base" tool={operation === 'draw' ? 'rectangle' : 'select'} disabled={blocked}
        onChange={next => { props.onChange(next); setShapes(next) }} /></>
  }
  await act(async () => root.render(<EditingHarness />))
  await act(async () => container.querySelector('input')!.focus())
  const target = operation === 'move' ? container.querySelector('[data-shape-id="base"]')! : operation === 'resize' ? container.querySelector('[data-resize-handle="e"]')! : svg()
  await act(async () => pointEvent('pointerdown', 60, 35, target))
  await act(async () => pointEvent('pointermove', 70, 45))
  await act(async () => pointEvent('pointerup', 70, 45))
  expect(props.onChange).toHaveBeenCalledTimes(1)
  const result = vi.mocked(props.onChange).mock.calls[0]![0]
  expect(result[0]).toMatchObject({ width: operation === 'resize' ? 90 : 80, x: operation === 'move' ? 30 : 20 })
  expect(result).toHaveLength(operation === 'draw' ? 2 : 1)
})

it.each(['move', 'resize', 'draw'])('does not start %s if the numeric draft remains invalid after blur', async operation => {
  props.shapes = [shape]
  props.tool = operation === 'draw' ? 'rectangle' : 'select'
  props.selectedId = 'base'
  props.disabled = true
  await act(async () => root.render(<><input defaultValue="invalid" /><SketchCanvas {...props} /></>))
  await act(async () => container.querySelector('input')!.focus())
  const target = operation === 'move' ? container.querySelector('[data-shape-id="base"]')! : operation === 'resize' ? container.querySelector('[data-resize-handle="e"]')! : svg()
  await act(async () => pointEvent('pointerdown', 60, 35, target))
  await act(async () => pointEvent('pointermove', 70, 45))
  await act(async () => pointEvent('pointerup', 70, 45))
  expect(props.onChange).not.toHaveBeenCalled()
  expect(props.onSelect).not.toHaveBeenCalled()
  expect(container.querySelector('input')!.value).toBe('invalid')
})

it('resolves overlapping hit rectangles on a 2 mm slot by pointer position and leaves its centre movable', async () => {
  props.shapes = [{ ...shape, width: 2, height: 8 }]
  props.tool = 'select'
  props.selectedId = 'base'
  await render()
  // The last painted west hit rectangle can cover all eight visible anchors.
  const covered = container.querySelector('[data-resize-handle="w"]')!
  await act(async () => pointEvent('pointerdown', 22, 28, covered, 1, false, 'touch'))
  await act(async () => pointEvent('pointermove', 24, 30, svg(), 1, false, 'touch'))
  await act(async () => pointEvent('pointerup', 24, 30, svg(), 1, false, 'touch'))
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ x: 20, y: 20, width: 4, height: 10 })
  vi.mocked(props.onChange).mockClear()
  await act(async () => pointEvent('pointerdown', 21, 24, covered, 1, false, 'touch'))
  await act(async () => pointEvent('pointermove', 26, 29, svg(), 1, false, 'touch'))
  await act(async () => pointEvent('pointerup', 26, 29, svg(), 1, false, 'touch'))
  expect(vi.mocked(props.onChange).mock.calls[0]![0][0]).toMatchObject({ x: 25, y: 25, width: 2, height: 8 })
})
