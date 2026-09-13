import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { UserPartSchema, type UserPart } from '@fwx/parts-schema'
import { useAuthStore } from '../../stores/authStore'
import { listCustomParts } from '../../utils/api'
import { PlaceCustomPartDialog } from './PlaceCustomPartDialog'
import { USER_PART_CATEGORY_LABELS } from './partCategoryLabels'

export function CustomPartsLibrary() {
  const token = useAuthStore(state => state.token)
  const ownerId = useAuthStore(state => state.user?.id)
  const [page, setPage] = useState(1)
  const [target, setTarget] = useState<UserPart | null>(null)
  const query = useQuery({
    queryKey: ['custom-parts', ownerId, 'assembly-library', page], enabled: !!token,
    queryFn: async () => {
      const response = await listCustomParts(page, 20)
      if (useAuthStore.getState().token !== token) throw new Error('登录账号已改变')
      if (!response.success || !response.data) throw new Error(response.error || '读取自制零件失败')
      return { ...response.data, items: UserPartSchema.array().parse(response.data.items) }
    },
  })
  return <div className="space-y-3 text-xs">
    <Link to="/part-studio" className="block rounded border border-sky-200 p-2 text-center text-sky-700">绘制零件</Link>
    <p className="text-amber-800">自制零件仅自由摆放，未连接，未验证制造与飞行。</p>
    {!token ? <p>登录原账号后可读取我的零件。</p> : query.isError ? <p role="alert">零件列表读取失败。<button className="underline" onClick={() => void query.refetch()}>重试</button></p> : query.isPending ? <p role="status">正在读取零件…</p> : <>
      {query.data.items.length === 0 && <p>暂无自制零件，先在工坊画一个并保存。</p>}
      {query.data.items.map(part => <button type="button" key={part.id} className="flex w-full items-center gap-2 rounded border p-2 text-left hover:bg-sky-50" onClick={() => setTarget(part)} aria-label={`放入自由拼装：${part.name}`}>
        <svg className="h-12 w-12 shrink-0" viewBox={`-1 -1 ${part.geometry.bboxMm.w + 2} ${part.geometry.bboxMm.h + 2}`} aria-hidden><path d={[part.geometry.contour, ...part.geometry.holes].join(' ')} fill="#d2b48c" fillRule="evenodd" stroke="#91724c" strokeWidth="0.4" /></svg>
        <span className="min-w-0"><span className="block truncate font-medium">{part.name}</span><span className="block text-slate-500">{USER_PART_CATEGORY_LABELS[part.category]}</span><span>放入自由拼装</span></span>
      </button>)}
      <div className="flex items-center justify-between"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="rounded border p-1 disabled:opacity-40">上一页</button><span>第 {page} 页</span><button disabled={query.data.items.length < 20} onClick={() => setPage(value => value + 1)} className="rounded border p-1 disabled:opacity-40">下一页</button></div>
    </>}
    {target && <PlaceCustomPartDialog part={target} onClose={() => setTarget(null)} />}
  </div>
}
