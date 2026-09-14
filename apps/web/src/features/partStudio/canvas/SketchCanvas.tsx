import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { Part2D, Point2D } from '@fwx/geometry'
import { USER_PART_THICKNESS_MM, type JointGuide } from '@fwx/parts-schema'
import type { SketchReference, SketchShape } from '../sketch/model'
import type { SketchTool } from './SketchTools'
import { getResizeHandles, resizeShape, resolveSelectionHandle, type ResizeHandle } from './resizeShape'
import { JointDirectionMark } from '../JointDirectionMark'
import { createInsertionSlot, nearestOuterEdge } from './insertionSlot'

export type SlotMode = 'cut' | 'edge-slot' | 'through-slot'

export interface SketchCanvasProps {
  shapes: SketchShape[]
  reference: SketchReference
  part: Part2D | null
  tool: SketchTool
  slotMode?: SlotMode
  jointGuides?: readonly JointGuide[]
  problemShapeIds?: readonly string[]
  referenceInvalid?: boolean
  selectedId: string | null
  snap: boolean
  disabled: boolean
  onChange: (shapes: SketchShape[]) => void
  onSelect: (id: string | null) => void
  onPendingChange: (pending: boolean) => void
  validateInsertion?: (shape: SketchShape) => string | null
  children?: ReactNode
}

type Gesture =
  | { kind: 'draw'; tool: SketchTool; slotMode?: SlotMode; board?: Part2D; start: Point2D; end: Point2D }
  | { kind: 'move'; shape: SketchShape; start: Point2D; end: Point2D }
  | { kind: 'vertex'; shape: SketchShape; index: number; start: Point2D; end: Point2D }
  | { kind: 'resize'; shape: SketchShape; handle: ResizeHandle; start: Point2D; end: Point2D; snap: boolean; lockAspect: boolean }
  | { kind: 'freehand'; start: Point2D; end: Point2D }

const MAX_SHAPES = 32
const MAX_POINTS = 128
const tip: Record<SketchTool, string> = {
  select: '拖动图形移动，拖动方形锚点缩放；Shift 等比缩放、移动时锁定方向。方向键移动 1 mm。',
  rectangle: '拖出矩形；选中后可以输入宽、高和圆角半径。',
  ellipse: '拖出圆形；选中后可分别调整宽、高，得到椭圆。',
  polygon: '逐个点击顶点，Shift 锁定水平或垂直；按 Enter 或点击完成闭合，不需要点回起点。',
  freehand: '按住绘制辅助草图，再点击完成闭合；按约 1 mm 间距采点，最多 128 点。',
  'circle-hole': '拖出圆孔；红色区域将从实体中切除。',
  slot: '普通切孔：拖出矩形，调整宽、高；拼接时选择插槽工具。',
  'insert-slot': '从木板边缘向内拖到槽底；自动水平或竖直，槽宽 2 mm。',
}

function line(points: Point2D[], close = true): string {
  return points.length ? `M ${points.map(point => `${point[0]} ${point[1]}`).join(' L ')}${close ? ' Z' : ''}` : ''
}

function polygonShape(points: Point2D[], original?: SketchShape): SketchShape | null {
  if (points.length < 3) return null
  const xs = points.map(point => point[0])
  const ys = points.map(point => point[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const width = Math.max(...xs) - x
  const height = Math.max(...ys) - y
  if (width < 0.1 || height < 0.1) return null
  return { id: original?.id ?? crypto.randomUUID(), kind: 'polygon', operation: original?.operation ?? 'add', x, y, width, height, radius: 0, mirror: original?.mirror,
    points: points.map(point => [(point[0] - x) / width, (point[1] - y) / height]) }
}

function vertices(shape: SketchShape): Point2D[] {
  return (shape.points ?? []).map(([x, y]) => [shape.x + x * shape.width, shape.y + y * shape.height])
}

function alignPoint(point: Point2D, anchor: Point2D, enabled: boolean): Point2D {
  if (!enabled) return point
  return Math.abs(point[0] - anchor[0]) >= Math.abs(point[1] - anchor[1]) ? [point[0], anchor[1]] : [anchor[0], point[1]]
}

function shapeFromDrag(gesture: Gesture): SketchShape | null {
  const [x, y] = gesture.start
  const [endX, endY] = gesture.end
  if (gesture.kind === 'resize') return resizeShape(gesture.shape, gesture.handle, [endX - x, endY - y], gesture)
  if (gesture.kind === 'move') return { ...gesture.shape, x: gesture.shape.x + endX - x, y: gesture.shape.y + endY - y }
  if (gesture.kind === 'vertex') {
    const points = vertices(gesture.shape)
    points[gesture.index] = gesture.end
    return polygonShape(points, gesture.shape)
  }
  if (gesture.kind !== 'draw') return null
  if (gesture.tool === 'insert-slot') return gesture.board ? createInsertionSlot(gesture.board, gesture.start, gesture.end) : null
  const width = Math.abs(endX - x)
  const height = Math.abs(endY - y)
  const base = { id: 'drag-preview', kind: 'rectangle' as const, operation: 'add' as 'add' | 'cut', x: Math.min(x, endX), y: Math.min(y, endY), width, height, radius: 0 }
  if (gesture.tool === 'slot' && gesture.slotMode && gesture.slotMode !== 'cut') {
    if (Math.max(width, height) < USER_PART_THICKNESS_MM) return null
    const axis = width >= height ? 'x' : 'y'
    const entry = gesture.slotMode === 'through-slot' ? 'front' : (axis === 'x' ? endX >= x : endY >= y) ? 'start' : 'end'
    const joint = { kind: gesture.slotMode, axis, entry } as const
    return axis === 'x' ? { ...base, operation: 'cut', y: y - USER_PART_THICKNESS_MM / 2, height: USER_PART_THICKNESS_MM, joint } : { ...base, operation: 'cut', x: x - USER_PART_THICKNESS_MM / 2, width: USER_PART_THICKNESS_MM, joint }
  }
  if (width < 0.1 || height < 0.1) return null
  if (gesture.tool === 'ellipse' || gesture.tool === 'circle-hole') {
    const diameter = Math.min(width, height)
    return { ...base, kind: 'ellipse', operation: gesture.tool === 'circle-hole' ? 'cut' : 'add', x: endX < x ? x - diameter : x, y: endY < y ? y - diameter : y, width: diameter, height: diameter }
  }
  return gesture.tool === 'slot' ? { ...base, operation: 'cut' } : base
}

function ShapeMark({ shape }: { shape: SketchShape }) {
  if (shape.kind === 'ellipse') return <ellipse vectorEffect="non-scaling-stroke" cx={shape.x + shape.width / 2} cy={shape.y + shape.height / 2} rx={shape.width / 2} ry={shape.height / 2} />
  if (shape.kind === 'polygon') return <path vectorEffect="non-scaling-stroke" d={line(vertices(shape))} />
  return <rect vectorEffect="non-scaling-stroke" x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.radius} />
}

export function SketchCanvas({ shapes, reference, part, tool, slotMode = 'cut', jointGuides = [], problemShapeIds = [], referenceInvalid = false, selectedId, snap, disabled, onChange, onSelect, onPendingChange, validateInsertion, children }: SketchCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const shapesRef = useRef(shapes)
  const disabledRef = useRef(disabled)
  const onSelectRef = useRef(onSelect)
  const gridId = useId().replaceAll(':', '')
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const activePointerId = useRef<number | null>(null)
  const pointerOrigin = useRef<Point2D | null>(null)
  const [vertexEditingId, setVertexEditingId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [screenScale, setScreenScale] = useState(1)
  const [hoveredEdge, setHoveredEdge] = useState<{ point: Point2D; board: Part2D } | null>(null)
  const [touchTargets, setTouchTargets] = useState(() => window.matchMedia?.('(any-pointer: coarse)').matches ?? false)
  const [draft, setDraft] = useState<Point2D[]>([])
  const draftRef = useRef<Point2D[]>([])
  const [error, setError] = useState<string | null>(null)
  const [overflow, setOverflow] = useState(false)
  const overflowRef = useRef(false)
  const pending = gesture !== null || draft.length > 0
  const margin = Math.max(reference.width, reference.height) * 0.08
  const viewWidth = reference.width + margin * 2
  const viewHeight = reference.height + margin * 2
  const gridStep = Math.max(1, Math.ceil(Math.max(reference.width, reference.height) / 50 / 5) * 5)
  const tickStep = gridStep * 2
  const displayScale = Math.max(reference.width, reference.height) / 130
  const selected = shapes.find(shape => shape.id === selectedId)
  const preview = gesture ? shapeFromDrag(gesture) : null
  const selection = preview?.id === selected?.id ? preview : selected
  const editingVertices = selected?.kind === 'polygon' && vertexEditingId === selectedId
  const hitSize = (touchTargets ? 44 : 24) / screenScale
  const markSize = 6 / screenScale
  const inserting = tool === 'insert-slot'
  const hoverAnchor = inserting && !disabled && !pending && hoveredEdge?.board === part ? hoveredEdge.point : null
  const insertionDrawing = gesture?.kind === 'draw' && gesture.tool === 'insert-slot'
  const insertionHint = error ?? (insertionDrawing ? '向内拖到槽底后松开。' : !part ? shapes.length ? '先完成木板轮廓，再添加插接口。' : '先画一块完整木板，再添加插接口。' : hoverAnchor ? '已对准板边，按住向内拖动。' : '靠近红色板边，按住向内拖到槽底。')

  useEffect(() => { onPendingChange(pending) }, [onPendingChange, pending])
  useLayoutEffect(() => { shapesRef.current = shapes; disabledRef.current = disabled; onSelectRef.current = onSelect }, [shapes, disabled, onSelect])
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const matrix = svg.getScreenCTM?.()
      const bounds = svg.getBoundingClientRect()
      const scale = matrix ? Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) : Math.min(bounds.width / viewWidth, bounds.height / viewHeight)
      if (Number.isFinite(scale) && scale > 0) setScreenScale(scale)
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(svg)
    window.addEventListener('resize', measure)
    const media = window.matchMedia?.('(any-pointer: coarse)')
    const updatePointer = () => setTouchTargets(media?.matches ?? false)
    media?.addEventListener('change', updatePointer)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); media?.removeEventListener('change', updatePointer) }
  }, [viewWidth, viewHeight])

  function updateGesture(value: Gesture | null) { gestureRef.current = value; setGesture(value) }
  function updateDraft(value: Point2D[]) { draftRef.current = value; setDraft(value) }
  function failOverflow() { overflowRef.current = true; setOverflow(true); setError('顶点不能超过 128 个。请取消这次绘制后重画，原有形状不会丢失。') }
  function resetPending() {
    if (activePointerId.current !== null && svgRef.current?.hasPointerCapture?.(activePointerId.current)) svgRef.current.releasePointerCapture(activePointerId.current)
    activePointerId.current = null
    pointerOrigin.current = null
    updateGesture(null); updateDraft([]); overflowRef.current = false; setOverflow(false)
  }
  function cancel() { resetPending(); setError(null) }
  function coordinate(event: PointerEvent<SVGSVGElement> | PointerEvent<SVGGElement>, applySnap = snap): Point2D | null {
    const svg = svgRef.current
    if (!svg) return null
    let x: number
    let y: number
    const matrix = svg.getScreenCTM?.()
    if (matrix && svg.createSVGPoint) {
      const point = svg.createSVGPoint()
      point.x = event.clientX
      point.y = event.clientY
      const transformed = point.matrixTransform(matrix.inverse())
      x = transformed.x
      y = transformed.y
    } else {
      const bounds = svg.getBoundingClientRect()
      const [left = -margin, top = -margin, width = viewWidth, height = viewHeight] = svg.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? []
      const scale = Math.min(bounds.width / width, bounds.height / height)
      if (!Number.isFinite(scale) || scale <= 0) return null
      x = (event.clientX - bounds.left - (bounds.width - width * scale) / 2) / scale + left
      y = (event.clientY - bounds.top - (bounds.height - height * scale) / 2) / scale + top
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return applySnap ? [Math.round(x) || 0, Math.round(y) || 0] : [x, y]
  }
  function beginCapture(event: PointerEvent<SVGSVGElement> | PointerEvent<SVGGElement>) {
    activePointerId.current = event.pointerId
    pointerOrigin.current = [event.clientX, event.clientY]
    // Suppress the browser's subsequent default focus on a <g>, which draws a
    // thick native outline and can scroll the page after this explicit focus.
    event.preventDefault()
    svgRef.current?.focus({ preventScroll: true })
    svgRef.current?.setPointerCapture?.(event.pointerId)
    const bounds = svgRef.current?.getBoundingClientRect()
    const matrix = svgRef.current?.getScreenCTM?.()
    const scale = matrix ? Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) : bounds ? Math.min(bounds.width / viewWidth, bounds.height / viewHeight) : 0
    if (Number.isFinite(scale) && scale > 0) setScreenScale(scale)
    if (event.pointerType === 'touch') setTouchTargets(true)
  }
  function insertionAnchor(event: PointerEvent<SVGSVGElement>) {
    const raw = coordinate(event, false)
    // Hover feedback and pointer-down must agree at every zoom and pointer size.
    return raw && nearestOuterEdge(part, raw, (event.pointerType === 'touch' ? 22 : 12) / screenScale)
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || event.isPrimary === false || gestureRef.current) return
    event.preventDefault()
    flushSync(() => svgRef.current?.focus({ preventScroll: true }))
    if (disabledRef.current) return
    let point = coordinate(event)
    if (!point) return
    if (tool === 'select') { onSelectRef.current(null); return }
    if (shapesRef.current.length >= MAX_SHAPES) { setError('形状不能超过 32 个，请先删除不需要的形状。'); return }
    event.preventDefault()
    svgRef.current?.focus({ preventScroll: true })
    if (tool === 'polygon') {
      if (draftRef.current.length >= MAX_POINTS) { failOverflow(); return }
      const previous = draftRef.current[draftRef.current.length - 1]
      if (previous) point = alignPoint(point, previous, event.shiftKey)
      if (previous && previous[0] === point[0] && previous[1] === point[1]) return
      updateDraft([...draftRef.current, point])
      setError(null)
      return
    }
    if (draftRef.current.length) { setError('请先完成闭合或取消当前草图。'); return }
    if (tool === 'insert-slot') {
      setHoveredEdge(null)
      const anchor = insertionAnchor(event)
      if (!anchor) { setError(part ? '请从木板外边缘向内拖动。' : '请先画出一块完整木板。'); return }
      point = anchor
    }
    setError(null)
    if (tool === 'freehand') updateDraft([point])
    updateGesture({ kind: tool === 'freehand' ? 'freehand' : 'draw', tool, slotMode, board: tool === 'insert-slot' && part ? part : undefined, start: point, end: point })
    beginCapture(event)
  }
  function selectShape(event: PointerEvent<SVGGElement>, shape: SketchShape, vertex?: number) {
    if (tool !== 'select' || event.button !== 0 || event.isPrimary === false || gestureRef.current) return
    event.stopPropagation()
    event.preventDefault()
    // Numeric inputs commit on blur. Finish that commit before capturing the
    // gesture's original shape, otherwise a drag would overwrite that edit.
    flushSync(() => svgRef.current?.focus({ preventScroll: true }))
    if (disabledRef.current) return
    const committed = shapesRef.current.find(item => item.id === shape.id)
    if (!committed) return
    const point = coordinate(event)
    if (!point) return
    event.preventDefault()
    onSelectRef.current(shape.id)
    setError(null)
    updateGesture(vertex === undefined ? { kind: 'move', shape: committed, start: point, end: point } : { kind: 'vertex', shape: committed, index: vertex, start: point, end: point })
    beginCapture(event)
  }
  function startResize(event: PointerEvent<SVGGElement>, shape: SketchShape) {
    event.stopPropagation()
    if (tool !== 'select' || event.button !== 0 || event.isPrimary === false || gestureRef.current) return
    const visualPoint = coordinate(event, false)
    const handle = visualPoint ? resolveSelectionHandle(shape, visualPoint) : null
    if (!handle) return
    if (handle === 'move') { selectShape(event, shape); return }
    event.preventDefault()
    flushSync(() => svgRef.current?.focus({ preventScroll: true }))
    if (disabledRef.current) return
    const committed = shapesRef.current.find(item => item.id === shape.id)
    if (!committed) return
    const point = coordinate(event, false)
    if (!point) return
    setError(null)
    updateGesture({ kind: 'resize', shape: committed, handle, start: point, end: point, snap, lockAspect: event.shiftKey })
    beginCapture(event)
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const current = gestureRef.current
    if (!current && inserting && !disabled) {
      const anchor = insertionAnchor(event)
      setHoveredEdge(anchor && part ? { point: anchor, board: part } : null)
      if (anchor) setError(null)
      return
    }
    if (!current || disabled || event.pointerId !== activePointerId.current) return
    let point = coordinate(event, current.kind === 'resize' ? false : snap)
    if (!point) return
    if (pointerOrigin.current?.[0] === event.clientX && pointerOrigin.current?.[1] === event.clientY) point = current.start
    if (current.kind === 'move' || current.kind === 'vertex') point = alignPoint(point, current.start, event.shiftKey)
    if (current.kind === 'freehand') {
      const last = draftRef.current[draftRef.current.length - 1]!
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 1) {
        if (draftRef.current.length >= MAX_POINTS) { failOverflow(); return }
        updateDraft([...draftRef.current, point])
      }
    }
    updateGesture(current.kind === 'resize' ? { ...current, end: point, lockAspect: event.shiftKey } : { ...current, end: point })
  }
  function end(event: PointerEvent<SVGSVGElement>) {
    const current = gestureRef.current
    if (!current || disabled || event.pointerId !== activePointerId.current) return
    const unmoved = pointerOrigin.current?.[0] === event.clientX && pointerOrigin.current?.[1] === event.clientY
    let point = unmoved ? current.start : coordinate(event, current.kind === 'resize' ? false : snap) ?? current.end
    if (current.kind === 'move' || current.kind === 'vertex') point = alignPoint(point, current.start, event.shiftKey)
    activePointerId.current = null
    pointerOrigin.current = null
    updateGesture(null)
    if (current.kind === 'freehand') return // Explicit close or cancel follows.
    if (unmoved && current.kind !== 'draw') return
    const next = shapeFromDrag(current.kind === 'resize' ? { ...current, end: point, lockAspect: event.shiftKey } : { ...current, end: point })
    if (!next) { setError(current.kind === 'draw' && current.tool === 'insert-slot' ? '请从板边向内拖动至少 2 mm，保留两侧和槽底。' : '形状需要有宽度和高度，请重新拖动。'); return }
    if (current.kind === 'draw') {
      next.id = crypto.randomUUID()
      if (current.tool === 'insert-slot') {
        const invalid = validateInsertion?.(next)
        if (invalid) { setError(invalid); return }
      }
      onChange([...shapes, next])
      onSelect(next.id)
    } else if ((current.start[0] !== point[0] || current.start[1] !== point[1]) && JSON.stringify(next) !== JSON.stringify(current.shape)) {
      onChange(shapes.map(shape => shape.id === next.id ? next : shape))
    }
  }
  function finish() {
    if (disabled || overflowRef.current || gestureRef.current) return
    const shape = polygonShape(draftRef.current)
    if (!shape) { setError('至少添加 3 个不在同一直线上的顶点，再完成闭合。'); return }
    if (shapes.length >= MAX_SHAPES) { setError('形状不能超过 32 个，请先取消并删除不需要的形状。'); return }
    onChange([...shapes, shape])
    onSelect(shape.id)
    resetPending()
    setError(null)
    svgRef.current?.focus({ preventScroll: true })
  }
  function keyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (disabled) return
    if (event.key === 'Escape') { event.preventDefault(); if (pending) cancel(); else onSelect(null); return }
    if (event.key === 'Enter' && draft.length) { event.preventDefault(); finish(); return }
    if (event.key === 'Enter' && tool === 'insert-slot' && !pending) { event.preventDefault(); setError('请从木板外边缘向内拖动，指定插接口位置。'); return }
    // Keep rule-based creation accessible without an add-shape button.
    if (event.key === 'Enter' && !pending && ['rectangle', 'ellipse', 'circle-hole', 'slot'].includes(tool)) {
      event.preventDefault()
      if (shapes.length >= MAX_SHAPES) { setError('形状不能超过 32 个，请先删除不需要的形状。'); return }
      const cut = tool === 'circle-hole' || tool === 'slot'
      const width = Math.min(cut ? 8 : 60, reference.width * 0.5, reference.height * 0.5)
      const height = tool === 'rectangle' ? Math.min(40, reference.height * 0.5) : tool === 'slot' ? slotMode === 'cut' ? 2 : 0 : width
      const start: Point2D = [(reference.width - width) / 2, (reference.height - height) / 2]
      const shape = shapeFromDrag({ kind: 'draw', tool, slotMode, start, end: [start[0] + width, start[1] + height] })
      if (shape) { shape.id = crypto.randomUUID(); onChange([...shapes, shape]); onSelect(shape.id); setError(null) }
      return
    }
    if (pending || tool !== 'select' || !selected) return
    const delta: Record<string, Point2D> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const direction = delta[event.key]
    if (!direction) return
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    onChange(shapes.map(shape => shape.id === selected.id ? { ...shape, x: shape.x + direction[0] * step, y: shape.y + direction[1] * step } : shape))
  }
  const handles = editingVertices && selection ? vertices(selection) : []
  return <div className="w-full bg-slate-50">
    <div data-testid="sketch-stage" className="relative h-[clamp(728px,calc(100dvh-176px),1048px)] pb-[172px] min-[440px]:h-[clamp(680px,calc(100dvh-224px),1000px)] min-[440px]:pb-[124px]">
    <svg ref={svgRef} data-testid="sketch-canvas" aria-label="二维零件绘制画布" aria-describedby={inserting ? `${gridId}-insertion-hint` : `${gridId}-tip`} role="application" tabIndex={0}
      viewBox={`${-margin} ${-margin} ${viewWidth} ${viewHeight}`} preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sky-400"
      style={{ touchAction: 'none', cursor: inserting ? hoverAnchor || insertionDrawing ? 'crosshair' : 'not-allowed' : tool === 'select' ? 'default' : 'crosshair' }}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={() => setHoveredEdge(null)}
      onPointerCancel={event => { if (gestureRef.current && event.pointerId === activePointerId.current) { resetPending(); setError('绘制已中断，未保存这次操作，请重新绘制。') } }} onKeyDown={keyDown}>
      <defs><pattern id={gridId} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse"><path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="#dbe8f3" strokeWidth={0.5} vectorEffect="non-scaling-stroke" /></pattern></defs>
      <rect x={-margin} y={-margin} width={viewWidth} height={viewHeight} fill="#f7faff" />
      <rect data-testid={reference.shape === 'ellipse' ? undefined : 'reference-outline'} width={reference.width} height={reference.height} fill={`url(#${gridId})`} stroke={referenceInvalid && reference.shape !== 'ellipse' ? '#b45309' : '#a9c5df'} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="4 4" />
      {reference.shape === 'ellipse' && <ellipse data-testid="reference-outline" cx={reference.width / 2} cy={reference.height / 2} rx={reference.width / 2} ry={reference.height / 2} fill="none" stroke={referenceInvalid ? '#b45309' : '#559ac9'} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="6 4" pointerEvents="none" />}
      <path d={`M ${reference.width / 2} 0 V ${reference.height}`} stroke="#aac4dd" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="6 4" pointerEvents="none" />
      <g fill="#607990" fontSize={2.3 * displayScale} pointerEvents="none">
        {Array.from({ length: Math.floor(reference.width / tickStep) + 1 }, (_, index) => <text key={`x${index}`} x={index * tickStep} y={-margin * 0.35} textAnchor="middle">{index * tickStep}</text>)}
        {Array.from({ length: Math.floor(reference.height / tickStep) + 1 }, (_, index) => <text key={`y${index}`} x={-margin * 0.4} y={index * tickStep} textAnchor="end" dominantBaseline="middle">{index * tickStep}</text>)}
      </g>
      {part && !gesture && <path data-testid="compiled-sketch" d={[line(part.contour.points), ...(part.holes ?? []).map(hole => line(hole.points))].join(' ')} fill="#cce7f9" fillRule="evenodd" stroke="#2789cb" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      {shapes.map(shape => {
        const current = preview?.id === shape.id ? preview : shape
        return <g key={shape.id}>
          <g data-shape-id={shape.id} aria-label={`${shape.operation === 'cut' ? '切除' : '实体'}形状 ${shapes.indexOf(shape) + 1}`} role="button" tabIndex={tool === 'select' ? 0 : -1}
            fill={shape.operation === 'cut' ? '#ef444412' : gesture ? '#cce7f9aa' : 'transparent'} stroke={shape.operation === 'cut' ? '#dc5252' : shape.id === selectedId ? '#1479c0' : '#79accf'}
            strokeWidth={1} strokeDasharray={shape.operation === 'cut' ? '4 4' : undefined}
            style={{ cursor: tool === 'select' ? 'move' : 'inherit', outline: 'none' }} onPointerDown={event => selectShape(event, shape)}
            onFocus={() => setFocusedId(shape.id)} onBlur={() => setFocusedId(null)}
            onKeyDown={event => { if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); onSelect(shape.id); svgRef.current?.focus({ preventScroll: true }) } }}>
            <ShapeMark shape={current} />
          </g>
          {shape.mirror && <g transform={`translate(${reference.width} 0) scale(-1 1)`} fill="none" stroke={shape.operation === 'cut' ? '#dc5252' : '#79accf'} strokeWidth={1} strokeDasharray="4 4" pointerEvents="none" aria-hidden="true"><ShapeMark shape={current} /></g>}
          {!gesture && problemShapeIds.includes(shape.id) && <>
            <g data-problem-shape-id={shape.id} fill="none" stroke="#b45309" strokeWidth={2} strokeDasharray="5 3" pointerEvents="none" aria-hidden="true"><ShapeMark shape={current} /></g>
            {shape.mirror && <g data-problem-shape-id={shape.id} transform={`translate(${reference.width} 0) scale(-1 1)`} fill="none" stroke="#b45309" strokeWidth={2} strokeDasharray="5 3" pointerEvents="none" aria-hidden="true"><ShapeMark shape={current} /></g>}
          </>}
          {focusedId === shape.id && focusedId !== selectedId && <rect data-testid="shape-focus-outline" x={current.x} y={current.y} width={current.width} height={current.height} fill="none" stroke="#1479c0" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" pointerEvents="none" />}
        </g>
      })}
      {inserting && part && !disabled && <path data-testid="insertion-edge-guide" d={line(part.contour.points)} fill="none" stroke="#dc5252" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      {hoverAnchor && <g pointerEvents="none" aria-hidden="true">
        <circle cx={hoverAnchor[0]} cy={hoverAnchor[1]} r={12 / screenScale} fill="#fee2e280" stroke="#dc5252" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <circle data-testid="insertion-hover-anchor" cx={hoverAnchor[0]} cy={hoverAnchor[1]} r={4 / screenScale} fill="white" stroke="#b91c1c" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </g>}
      {preview && gesture?.kind === 'draw' && <g fill={preview.operation === 'cut' ? '#ef444430' : '#60a5fa30'} stroke={preview.operation === 'cut' ? '#dc5252' : '#1479c0'} strokeWidth={1} pointerEvents="none"><ShapeMark shape={preview} />{preview.joint && <JointDirectionMark guide={{ id: preview.id, ...preview.joint, x: preview.x, y: preview.y, lengthMm: preview.joint.axis === 'x' ? preview.width : preview.height }} scale={screenScale} />}</g>}
      {gesture?.kind === 'draw' && gesture.tool === 'insert-slot' && <circle data-testid="insertion-mouth" cx={gesture.start[0]} cy={gesture.start[1]} r={4 / screenScale} fill="white" stroke="#b91c1c" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      {draft.length > 0 && <g pointerEvents="none"><path d={line(draft, false)} fill="none" stroke="#1479c0" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {draft.length > 1 && <path d={line([draft[draft.length - 1]!, draft[0]!], false)} fill="none" stroke="#7197b6" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="4 4" />}
        {draft.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={0.65 * displayScale} fill={index === 0 ? '#16a34a' : '#1479c0'} />)}</g>}
      {tool === 'select' && selection && <rect data-testid="selection-outline" x={selection.x} y={selection.y} width={selection.width} height={selection.height} fill="none" stroke="#1479c0" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      {tool === 'select' && selected && selection && !editingVertices && getResizeHandles(selected).map(handle => {
        const x = selection.x + handle.x * selection.width
        const y = selection.y + handle.y * selection.height
        return <g key={handle.id} data-resize-handle={handle.id} onPointerDown={event => startResize(event, selected)} style={{ cursor: handle.cursor }}>
          <rect data-handle-hit="" x={x - hitSize / 2} y={y - hitSize / 2} width={hitSize} height={hitSize} fill="transparent" />
          <rect data-handle-mark="" x={x - markSize / 2} y={y - markSize / 2} width={markSize} height={markSize} fill="white" stroke="#1479c0" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        </g>
      })}
      {tool === 'select' && selected && handles.map(([x, y], index) => <g key={index} data-vertex-index={index} onPointerDown={event => selectShape(event, selected, index)} style={{ cursor: 'crosshair' }}>
        <rect x={x - hitSize / 2} y={y - hitSize / 2} width={hitSize} height={hitSize} fill="transparent" />
        <circle cx={x} cy={y} r={markSize / 2} fill="white" stroke="#1479c0" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      </g>)}
      {selection?.joint && <JointDirectionMark scale={screenScale} guide={(!gesture && jointGuides.find(guide => guide.id === selection.id)) || { id: selection.id, ...selection.joint, x: selection.x, y: selection.y, lengthMm: selection.joint.axis === 'x' ? selection.width : selection.height }} />}
    </svg>
    {inserting && <div className="pointer-events-none absolute inset-0 z-10 p-3 pb-[176px] min-[440px]:pb-[128px]"><div data-testid="insertion-guidance" className="sticky top-[76px] w-fit max-w-full rounded-lg border border-red-100 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-sm">
      <p className="mb-0.5 font-semibold text-red-700">插接口 <span className="font-normal text-slate-500">· 槽宽 2 mm</span></p>
      <p id={`${gridId}-insertion-hint`} role={error ? 'alert' : 'status'} aria-atomic="true">{insertionHint}</p>
    </div></div>}
    {children}
    {draft.length > 0 && <div className="absolute bottom-[176px] left-3 z-20 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-2 rounded-lg border border-sky-100 bg-white p-2 shadow-sm min-[440px]:bottom-[128px]">
      <button type="button" onClick={finish} disabled={disabled || gesture !== null || draft.length < 3 || overflow} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-40">完成闭合</button>
      <button type="button" onClick={cancel} disabled={disabled} className="rounded-lg border border-sky-200 px-3 py-2 text-sm text-sky-900 disabled:opacity-40">取消绘制</button>
      <span className="text-xs text-slate-500">{draft.length} / 128 个顶点</span>
    </div>}
    </div>
    <div className="shrink-0 border-t border-sky-100 bg-white px-3 py-2">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{reference.shape === 'ellipse' ? reference.width === reference.height ? `圆形参考 Ø ${reference.width} mm` : `椭圆参考 ${reference.width} × ${reference.height} mm` : `参考范围 ${reference.width} × ${reference.height} mm`}</span>
        <span>{shapes.length} / 32 个图形 · 网格 {gridStep} mm</span>
        <button type="button" disabled={disabled || pending || tool !== 'select' || selected?.kind !== 'polygon'}
          className={`shrink-0 rounded-md border border-sky-200 px-2 py-1 text-sky-800 disabled:opacity-40 ${tool === 'select' && selected?.kind === 'polygon' ? '' : 'invisible'}`}
          onClick={() => { setVertexEditingId(editingVertices ? null : selectedId); svgRef.current?.focus({ preventScroll: true }) }}>{editingVertices ? '缩放图形' : '编辑顶点'}</button>
      </div>
      <p id={`${gridId}-tip`} className={`text-xs leading-relaxed text-slate-500 ${inserting ? 'invisible' : ''}`}>{tool === 'slot' && slotMode !== 'cut' ? slotMode === 'edge-slot' ? '边缘插槽：从板外向板内拖动，箭头表示插入方向；槽宽固定 2 mm，需形成完整边缘凹口。' : '板内插槽：在板内拖动，槽宽固定 2 mm；另一零件的插片从板面插入。' : tip[tool]}{['rectangle', 'ellipse', 'circle-hole', 'slot'].includes(tool) && ' 画布聚焦后按 Enter 可创建默认图形。'}</p>
      {error && !inserting && <p role="alert" className="mt-1 text-xs leading-relaxed text-red-700">{error}</p>}
    </div>
  </div>
}
