import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { occupiedAssemblyConnectors } from '@fwx/geometry'
import { getPartById } from '@fwx/parts-schema'
import { Modal } from '../../components/common/Modal'
import { Button } from '../../components/common/Button'
import { useToast } from '../../components/common/Toast'
import { useDesignStore } from '../../stores/designStore'
import { useAuthStore } from '../../stores/authStore'
import { useDesignSync } from '../../hooks/useDesignSync'
import { loadAssemblySource } from './assemblySources'

export function AssemblyConnections() {
  const [open, setOpen] = useState(false)
  const id = useDesignStore(s => s.activeDesignId)
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}><Link2 size={16} />连接零件</Button>
    <Modal open={open} title="连接零件" onClose={() => setOpen(false)}>
      {open && <ConnectionForm key={id} onDone={() => setOpen(false)} />}
    </Modal>
  </>
}

function ConnectionForm({ onDone }: { onDone: () => void }) {
  const design = useDesignStore(s => s.getActiveDesign())
  const selected = useDesignStore(s => s.selectedInstanceId)
  const owner = useAuthStore(s => s.user?.id)
  const [childId, setChild] = useState(selected ?? '')
  const [parentId, setParent] = useState('')
  const [ownId, setOwn] = useState('')
  const [targetId, setTarget] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const { saveNow } = useDesignSync()
  const parts = design?.parts ?? []
  const sourceKey = (p: typeof parts[number]) => `${p.partId}/${p.source?.version}/${p.source?.updatedAt}`
  const uniqueParts = parts.filter((p,i) => parts.findIndex(candidate => sourceKey(candidate) === sourceKey(p)) === i)
  const sources = useQueries({ queries: uniqueParts.map(p => ({ queryKey: ['assembly-connectors', owner, sourceKey(p)], queryFn: () => loadAssemblySource(p), retry: false, staleTime: 0 })) })
  const used = occupiedAssemblyConnectors(parts)
  const child = parts.find(p => p.instanceId === childId)
  const lookup = (id: string) => {
    const part = parts.find(p => p.instanceId === id)
    return part ? sources[uniqueParts.findIndex(p => sourceKey(p) === sourceKey(part))] : undefined
  }
  const connect = async () => {
    if (!design || busy) return
    setError(''); setBusy(true)
    try {
      const token = useAuthStore.getState().token
      // Fresh source data prevents a previously opened picker from attaching a changed revision.
      const resolved = await Promise.all(parts.filter(p => p.instanceId === childId || p.instanceId === parentId).map(async p => [p.instanceId, await loadAssemblySource(p)] as const))
      if (useAuthStore.getState().token !== token || useDesignStore.getState().activeDesignId !== design.id) throw new Error('作品或账号已切换，请重试')
      const frames = new Map(resolved)
      useDesignStore.getState().connectParts(childId, ownId, parentId, targetId, p => frames.get(p.instanceId)?.connectors ?? [])
      const saved = await saveNow(useDesignStore.getState().getActiveDesign()!)
      toast.push(saved ? 'success' : 'error', saved ? '插接口已连接并保存' : '已连接，本机草稿保留；账号保存失败，请重试保存')
      onDone()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '连接失败，请重试') }
    finally { setBusy(false) }
  }
  const partPicker = (role: '移动' | '固定', value: string, change: (id: string) => void) => <label className="block text-sm font-medium">{role}零件<select aria-label={`${role}零件`} value={value} disabled={busy} onChange={e => {change(e.target.value);setError('')}} className="site-form-control mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3">
    <option value="">请选择零件</option>{parts.filter(p => role === '移动' || p.instanceId !== childId).map(p => <option key={p.instanceId} value={p.instanceId}>{parts.indexOf(p)+1}. {p.source ? lookup(p.instanceId)?.data?.name ?? '自制零件' : getPartById(p.partId)?.name.zh ?? p.partId}{p.attachedTo ? ' · 已连接' : ''}</option>)}
  </select></label>
  const connectorPicker = (role: '移动' | '固定', id: string, value: string, change: (id: string) => void) => {
    if (!id) return null
    const query = lookup(id), connectors = query?.data?.connectors ?? []
    return <div className="space-y-1 text-xs">
      {query?.isError ? <p role="alert" className="text-red-700">{query.error.message}<button className="ml-2 min-h-11 underline" onClick={() => void query.refetch()}>重试</button></p> : query?.isPending ? <p role="status">读取插接口…</p> : connectors.length === 0 ? <p className="text-slate-600">此零件没有边缘插接口。请在绘制页沿板边添加插接口后，保存为新零件。</p> : <label className="block">{role}零件的插接口<select aria-label={`${role}插接口`} disabled={busy} className="site-form-control mt-1 min-h-11 w-full rounded-md border border-slate-300 px-2 text-sm" value={value} onChange={e => change(e.target.value)}><option value="">请选择插接口</option>{connectors.map((c,i) => <option key={c.id} value={c.id} disabled={used.has(`${id}/${c.id}`)}>插接口 {i+1} · {c.position.map(n => +(n*1000).toFixed(1)).join(', ')} mm{used.has(`${id}/${c.id}`) ? ' · 已占用' : ''}</option>)}</select><p className="mt-1 text-slate-500">坐标相对于零件中心；画板中可查看接口编号。</p></label>}
    </div>
  }
  return <div className="space-y-4">
    <p className="text-sm text-slate-600">选择两块木片及各自的插接口，槽底自动对齐、木片自动垂直。</p>
    {parts.length < 2 && <p role="status" className="text-sm text-slate-600">先从左侧零件栏添加至少两个零件。</p>}
    {partPicker('移动', childId, id => {setChild(id);setOwn('');if(id===parentId){setParent('');setTarget('')}useDesignStore.getState().setSelectedInstanceId(id || null)})}
    {child?.attachedTo ? <div className="flex items-center justify-between gap-2 text-sm"><p>此零件已连接，调整前请先断开。</p><Button variant="outline" onClick={() => {useDesignStore.getState().disconnectPart(childId);setOwn('')}}>断开连接</Button></div> : connectorPicker('移动', childId, ownId, setOwn)}
    {partPicker('固定', parentId, id => {setParent(id);setTarget('')})}
    {connectorPicker('固定', parentId, targetId, setTarget)}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onDone}>取消</Button><Button disabled={busy || !!child?.attachedTo || !childId || !parentId || !ownId || !targetId} onClick={() => void connect()}>{busy ? '正在连接…' : '连接插接口'}</Button></div>
  </div>
}
