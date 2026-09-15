import { useState } from 'react'
import { useNavigate } from 'react-router'
import { getCategoryStep, type UserPart } from '@fwx/parts-schema'
import { Modal } from '../../components/common/Modal'
import { Button } from '../../components/common/Button'
import { useToast } from '../../components/common/Toast'
import { useDesignStore } from '../../stores/designStore'
import { useAuthStore } from '../../stores/authStore'
import { getCustomPart } from '../../utils/api'
import { useDesignSync } from '../../hooks/useDesignSync'
import { makeCustomInstance, resolveCustomPart } from './customAssembly'

/** Explicit destination selection retains the selected work's assembly mode. */
export function PlaceCustomPartDialog({ part, onClose }: { part: UserPart | null; onClose: () => void }) {
  const designs = useDesignStore(state => state.designs)
  const current = useDesignStore(state => state.getActiveDesign())
  const [destination, setDestination] = useState(current?.id ?? '')
  const [name, setName] = useState('我的作品')
  const [newMode, setNewMode] = useState<'guided' | 'free' | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const toast = useToast()
  const { saveNow } = useDesignSync()
  const place = async () => {
    if (!part || busy || (!destination && (!name.trim() || !newMode))) return
    const { token, user } = useAuthStore.getState()
    setBusy(true)
    setError('')
    try {
      if (!token || !user) throw new Error('请先登录原零件所属账号')
      const instance = makeCustomInstance(part, user.id)
      const response = await getCustomPart(part.id)
      if (useAuthStore.getState().token !== token) throw new Error('登录账号已改变，请重试')
      if (!response.success || !response.data) throw new Error(response.error || '原零件不可用，请刷新零件列表')
      resolveCustomPart(response.data, instance, user.id)
      const store = useDesignStore.getState()
      if (destination && !store.getDesignById(destination)) throw new Error('目标作品已不存在，请重新选择')
      const id = destination || store.createDesign(name.trim(), newMode as 'guided' | 'free')
      store.setActiveDesignId(id)
      const count = store.getActiveDesign()?.parts.length ?? 0
      instance.position = [Math.min(count, 10) * 0.06, 0, 0]
      if (!store.addPartToActiveDesign(instance)) throw new Error('无法添加到当前作品，请检查作品结构和零件数量')
      const placed = store.getActiveDesign()!
      store.setSelectedInstanceId(placed.parts.at(-1)!.instanceId)
      if (placed.buildMode === 'guided') {
        const step = getCategoryStep(instance.category)
        if (step) store.goToStep(step)
      }
      const saved = await saveNow(store.getActiveDesign()!)
      if (useAuthStore.getState().token !== token) return
      toast.push(saved ? 'success' : 'error', saved ? '零件已放入作品并保存' : '已放入本机草稿，账号保存失败，请在作品中重试保存')
      onClose()
      navigate(`/design/${id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '添加失败，请重试')
    } finally { setBusy(false) }
  }
  return <Modal open={!!part} onClose={() => { if (!busy) onClose() }} title="放入作品">
    <div className="space-y-4 text-sm">
      <p>放入后，点击连接零件，选择双方的边缘插接口。</p>
      <label className="block">选择作品<select aria-label="自制零件目标作品" className="mt-1 min-h-11 w-full rounded border p-2" value={destination} onChange={event => setDestination(event.target.value)}><option value="">新建作品</option>{designs.map(design => <option key={design.id} value={design.id}>{design.name} · {design.buildMode === 'guided' ? '按步骤拼装' : '自由拼装'}</option>)}</select></label>
      {!destination && <>
        <label className="block">作品名称<input aria-label="新作品名称" maxLength={80} className="mt-1 min-h-11 w-full rounded border p-2" value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="block">拼装方式<select aria-label="新作品拼装方式" className="mt-1 min-h-11 w-full rounded border p-2" value={newMode} onChange={event => setNewMode(event.target.value as typeof newMode)}><option value="">请选择拼装方式</option><option value="guided">按步骤拼装</option><option value="free">自由拼装</option></select></label>
      </>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy || (!destination && (!name.trim() || !newMode))} onClick={() => void place()}>{busy ? '正在放入…' : '确认放入'}</Button></div>
    </div>
  </Modal>
}
