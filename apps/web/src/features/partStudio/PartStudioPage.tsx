import { useCallback, useMemo, useReducer, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Undo2, Redo2, Trash2, Eraser } from 'lucide-react'
import { UserPartSchema, type UserPartDTO } from '@fwx/parts-schema'
import { useToast } from '../../components/common/Toast'
import { Modal } from '../../components/common/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { createCustomPart, listCustomParts, deleteCustomPart } from '../../utils/api'
import { SketchCanvas } from './canvas/SketchCanvas'
import { DimensionInput, ShapeParameters } from './canvas/SketchTools'
import { TOOL_ITEMS, controlClass, type SketchTool } from './canvas/sketchToolConfig'
import { compileSketch, type SketchShape } from './sketch/model'
import { editorHistory, initialDocument, REFERENCES, type SketchDocument } from './sketch/editorState'
import { ExtrudePreview } from './preview3d/ExtrudePreview'
import { buildUserPartDef } from './buildUserPartDef'
import { MyPartsStrip } from './MyPartsStrip'
import { PlaceCustomPartDialog } from './PlaceCustomPartDialog'

/** All sketch coordinates are mm. The same compiled geometry drives preview
 * and persistence; display zoom and reference frames never rescale a part. */
export function PartStudioPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const token = useAuthStore(s => s.token)
  const userId = useAuthStore(s => s.user?.id)
  const openLogin = useUIStore(s => s.openLoginModal)
  const [history, dispatch] = useReducer(editorHistory, { past: [], present: initialDocument(), future: [] })
  const document = history.present
  const [tool, setTool] = useState<SketchTool>('rectangle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snap, setSnap] = useState(true)
  const [pending, setPending] = useState(false)
  const [numericEdits, setNumericEdits] = useState<Record<string, boolean>>({})
  const onNumericEdit = useCallback((id: string, blocked: boolean) => setNumericEdits(previous => {
    if (!!previous[id] === blocked) return previous
    const next = { ...previous }
    if (blocked) next[id] = true
    else delete next[id]
    return next
  }), [])
  const numericBlocked = Object.keys(numericEdits).length > 0
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UserPartDTO | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [placeTarget, setPlaceTarget] = useState<UserPartDTO | null>(null)
  const queryClient = useQueryClient()
  const selected = document.shapes.find(shape => shape.id === selectedId)
  const reference = REFERENCES.find(item => item.category === document.category)!
  const busy = saving || pending
  const commit = (next: SketchDocument) => {
    if (!saving && next !== document) dispatch({ type: 'commit', document: next })
  }
  const updateShapes = (shapes: SketchShape[]) => commit({ ...document, shapes })
  const compiled = useMemo(() => compileSketch(document.shapes, document.reference, document.constrain), [document])
  const prepared = useMemo(() => {
    if (!compiled.part) return { def: null, error: compiled.error }
    try {
      return { def: buildUserPartDef({ name: '', category: document.category, points: compiled.part.contour.points, holes: compiled.part.holes?.map(hole => hole.points), closed: true }), error: null }
    } catch (cause) {
      return { def: null, error: cause instanceof Error ? cause.message : '请检查轮廓' }
    }
  }, [compiled, document.category])

  const { data: myParts = [], refetch: refetchMyParts, isError: partsError } = useQuery({
    queryKey: ['custom-parts', userId],
    queryFn: async (): Promise<UserPartDTO[]> => {
      const res = await listCustomParts(1, 50)
      if (!res.success) throw new Error(res.error || '获取零件失败')
      return UserPartSchema.array().parse(res.data?.items ?? [])
    },
    enabled: !!token,
  })

  const addShape = () => {
    if (busy || numericBlocked || document.shapes.length >= 32) return
    const cut = tool === 'circle-hole' || tool === 'slot'
    const circle = tool === 'ellipse' || tool === 'circle-hole'
    const base = cut && compiled.bounds ? compiled.bounds : { x: 0, y: 0, ...document.reference }
    const requestedWidth = Math.min(tool === 'slot' ? 2 : cut ? 8 : 60, base.width * (cut ? 0.5 : 0.8))
    const width = circle ? Math.min(requestedWidth, base.height * (cut ? 0.5 : 0.8)) : requestedWidth
    const height = Math.min(circle ? width : tool === 'slot' ? 12 : 40, base.height * 0.8)
    const shape: SketchShape = { id: crypto.randomUUID(), kind: circle ? 'ellipse' : 'rectangle', operation: cut ? 'cut' : 'add',
      x: base.x + (base.width - width) / 2, y: tool === 'slot' ? base.y - 1 : base.y + (base.height - height) / 2,
      width, height, radius: !cut && !circle ? Math.min(4, width / 2, height / 2) : 0 }
    updateShapes([...document.shapes, shape])
    setSelectedId(shape.id)
    setTool('select')
  }
  const removeSelected = () => { if (selected && !busy && !numericBlocked) { updateShapes(document.shapes.filter(shape => shape.id !== selected.id)); setSelectedId(null) } }

  const handleSave = async () => {
    if (!prepared.def || busy || numericBlocked) return
    if (!token) { toast.push('info', '请先登录，再将零件保存到账号'); openLogin(); return }
    setSaving(true)
    try {
      const res = await createCustomPart({ ...prepared.def, name: name.trim() || '未命名零件' })
      if (useAuthStore.getState().token !== token) return
      if (res.success && res.data) {
        toast.push('success', `已保存「${res.data.name}」到我的零件`)
        setName(''); setSelectedId(null); dispatch({ type: 'reset' })
        await refetchMyParts()
      } else toast.push('error', res.error || '保存失败，请重试')
    } catch { toast.push('error', '零件保存失败，当前轮廓仍保留，请重试') }
    finally { setSaving(false) }
  }

  const handleDelete = useCallback(async (id: string) => {
    if (deleting) return
    const requestToken = useAuthStore.getState().token
    setDeleting(true)
    try {
      const res = await deleteCustomPart(id)
      if (useAuthStore.getState().token !== requestToken) { setDeleteTarget(null); return }
      if (res.success) {
        setDeleteTarget(null); toast.push('success', '已删除')
        await refetchMyParts()
        await queryClient.invalidateQueries({ queryKey: ['custom-assembly-part', userId] })
      } else toast.push('error', res.error || '删除失败')
    } catch { toast.push('error', '删除失败，请重试') }
    finally { setDeleting(false) }
  }, [toast, refetchMyParts, deleting, queryClient, userId])

  const handleBack = () => { if (window.history.length > 1) navigate(-1); else navigate('/design') }
  return <div className="min-h-[calc(100dvh-4rem)] bg-[#F5F9FF] text-slate-800" onKeyDown={event => {
    if (busy || numericBlocked || (event.target as HTMLElement).closest('input,select,textarea')) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }) }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); dispatch({ type: 'redo' }) }
  }}>
    {partsError && <div role="alert" className="flex items-center justify-between gap-3 bg-amber-50 px-5 py-3 text-sm text-amber-900">零件列表加载失败，画布内容仍保留。<button type="button" onClick={() => void refetchMyParts()} className={controlClass}>重试</button></div>}
    <header className="flex flex-wrap items-center gap-3 border-b border-sky-100 bg-white px-4 py-3 lg:px-6">
      <button type="button" onClick={handleBack} disabled={saving} className={`${controlClass} inline-flex items-center gap-1.5`}><ArrowLeft size={16} />返回</button>
      <div><h1 className="text-lg font-semibold text-ink-900">零件绘制</h1><p className="text-xs text-slate-500">二维设计 · 木板预览</p></div>
      <input aria-label="零件名称" disabled={saving} value={name} onChange={event => setName(event.target.value)} placeholder="输入零件名称" maxLength={40} className="ml-auto min-h-10 w-36 rounded-lg border border-sky-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-300 sm:w-48" />
      <button type="button" onClick={() => void handleSave()} disabled={!prepared.def || busy || numericBlocked} title={numericBlocked ? '请先确认或修正尺寸输入' : !prepared.def ? '请先完成有效的零件轮廓' : pending ? '请先完成或取消当前绘制' : '保存到我的零件'} className="min-h-10 rounded-lg bg-sky-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{saving ? '保存中…' : '保存'}</button>
    </header>

    <fieldset disabled={busy} className="border-b border-sky-100 bg-white px-4 py-3 lg:px-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">参考类型<select aria-label="参考类型" value={document.category} onChange={event => {
          const next = REFERENCES.find(item => item.category === event.target.value)!
          commit({ ...document, category: next.category, reference: { width: next.width, height: next.height, shape: next.category === 'mainboard' ? 'ellipse' : 'rectangle' } })
        }} className={controlClass}>{REFERENCES.map(item => <option key={item.category} value={item.category}>{item.label}</option>)}</select></label>
        <label className="flex items-center gap-2 text-xs">参考形状<select aria-label="参考形状" value={document.reference.shape ?? 'rectangle'} onChange={event => commit({ ...document, reference: { ...document.reference, shape: event.target.value as 'rectangle' | 'ellipse' } })} className={controlClass}><option value="rectangle">矩形</option><option value="ellipse">圆形 / 椭圆</option></select></label>
        <DimensionInput label="参考宽" value={document.reference.width} onEditingChange={onNumericEdit} onChange={width => commit({ ...document, reference: { ...document.reference, width } })} />
        <DimensionInput label="参考高" value={document.reference.height} onEditingChange={onNumericEdit} onChange={height => commit({ ...document, reference: { ...document.reference, height } })} />
        <span className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">板厚 2 mm</span>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={document.constrain} onChange={event => commit({ ...document, constrain: event.target.checked })} />限制实体在参考范围内</label>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">初始范围参考现有零件 {reference.source}。可修改范围，已有图形尺寸不变；此范围不是加工或装配标准。</p>
    </fieldset>

    <div className="grid min-w-0 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="min-w-0 border-b border-sky-100 lg:border-b-0 lg:border-r" aria-label="二维设计">
        <fieldset disabled={busy} className="space-y-3 border-b border-sky-100 bg-white p-3 lg:px-5">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="绘图工具">
            {TOOL_ITEMS.map(item => <button key={item.key} type="button" aria-pressed={tool === item.key} onClick={() => setTool(item.key)} className={`${controlClass} inline-flex items-center gap-1.5 ${tool === item.key ? '!border-sky-500 !bg-sky-50 font-semibold !text-sky-700' : ''}`}><item.icon size={16} />{item.label}</button>)}
            <label className="ml-2 flex items-center gap-1.5 text-xs"><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} />1 mm 吸附</label>
          </div>
          <ShapeParameters key={selected?.id ?? 'no-selection'} shape={selected} onEditingChange={onNumericEdit} onChange={shape => updateShapes(document.shapes.map(item => item.id === shape.id ? shape : item))} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={addShape} disabled={numericBlocked || document.shapes.length >= 32 || tool === 'polygon' || tool === 'freehand'} className={`${controlClass} inline-flex items-center gap-1.5`}><Plus size={15} />添加图形</button>
            <label className="flex min-w-0 items-center gap-2 text-xs">选中<select aria-label="选中图形" disabled={!document.shapes.length} value={selected?.id ?? ''} onChange={event => { if (numericBlocked) return; setSelectedId(event.target.value || null); setTool('select') }} className={`${controlClass} w-[160px] max-w-full`}><option value="">请选择图形</option>{document.shapes.map((shape, index) => <option key={shape.id} value={shape.id}>{index + 1}. {shape.operation === 'cut' ? '切除' : '实体'} · {shape.kind === 'rectangle' ? '矩形' : shape.kind === 'ellipse' ? '圆形' : '多边形'}</option>)}</select></label>
            <span className="ml-auto text-xs text-slate-400">{document.shapes.length} / 32 个图形</span>
          </div>
        </fieldset>
        <SketchCanvas shapes={document.shapes} reference={document.reference} part={compiled.part} tool={tool} selectedId={selectedId} snap={snap} disabled={saving || numericBlocked} onChange={updateShapes} onSelect={setSelectedId} onPendingChange={setPending} />
        <div className="flex flex-wrap items-center gap-2 border-t border-sky-100 bg-white px-3 py-3 lg:px-5">
          <button type="button" disabled={busy || numericBlocked || !history.past.length} onClick={() => dispatch({ type: 'undo' })} className={`${controlClass} inline-flex items-center gap-1.5`}><Undo2 size={16} />撤销</button>
          <button type="button" disabled={busy || numericBlocked || !history.future.length} onClick={() => dispatch({ type: 'redo' })} className={`${controlClass} inline-flex items-center gap-1.5`}><Redo2 size={16} />重做</button>
          <button type="button" disabled={busy || numericBlocked || !selected} onClick={removeSelected} className={`${controlClass} inline-flex items-center gap-1.5`}><Trash2 size={16} />删除图形</button>
          <button type="button" disabled={busy || numericBlocked || !document.shapes.length} onClick={() => { updateShapes([]); setSelectedId(null) }} className={`${controlClass} inline-flex items-center gap-1.5`}><Eraser size={16} />清空</button>
        </div>
        <div className={`min-h-12 px-4 py-3 text-xs leading-5 ${document.shapes.length && prepared.error ? 'bg-amber-50 text-amber-900' : 'text-slate-500'}`} role={document.shapes.length && prepared.error ? 'alert' : 'status'}>
          {pending ? '当前图形尚未提交，请完成绘制或取消。' : numericBlocked ? '请按 Enter 或移开焦点确认尺寸；无效数值需修正后才能保存。' : document.shapes.length ? prepared.error ?? `零件范围 ${prepared.def?.geometry.bboxMm.w} × ${prepared.def?.geometry.bboxMm.h} mm · ${prepared.def?.geometry.holes.length} 个内孔` : '可先添加矩形或圆形，再调整尺寸。圆孔用于打孔，孔 / 开口用于在实体内部或边缘切除。'}
        </div>
      </section>
      <section className="flex min-w-0 flex-col" aria-label="木板三维预览">
        <div className="border-b border-sky-100 bg-white px-5 py-4"><h2 className="text-sm font-semibold text-ink-900">木板三维预览</h2><p className="mt-1 text-xs text-slate-500">与二维尺寸一致，自动更新。</p></div>
        <div className="h-[420px] min-h-[320px] min-w-0 flex-1 lg:min-h-[520px]"><ExtrudePreview geometry={prepared.def?.geometry ?? null} /></div>
        <p className="border-t border-sky-100 px-5 py-3 text-xs leading-5 text-slate-500">预览不代表零件可加工或可飞行。孔槽间隙、结构强度与装配效果需要实际检查；保存的自制零件可放入自由拼装。</p>
      </section>
    </div>
    <MyPartsStrip parts={myParts} onDelete={id => setDeleteTarget(myParts.find(part => part.id === id) ?? null)} onUse={setPlaceTarget} />
    {placeTarget && <PlaceCustomPartDialog part={placeTarget} onClose={() => setPlaceTarget(null)} />}
    <Modal open={!!deleteTarget} title="删除零件" onClose={() => { if (!deleting) setDeleteTarget(null) }}>
      <p className="text-sm text-slate-600">确定删除「{deleteTarget?.name}」吗？删除后无法恢复。引用它的作品将保留引用，但无法再显示该零件。</p>
      <div className="mt-5 flex justify-end gap-3"><button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className={controlClass}>取消</button><button type="button" disabled={deleting} onClick={() => { if (deleteTarget) void handleDelete(deleteTarget.id) }} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50">{deleting ? '删除中…' : '确认删除'}</button></div>
    </Modal>
  </div>
}
