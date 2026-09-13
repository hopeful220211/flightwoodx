import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Plane, Plus, Search } from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import { useDesignStore } from '../../stores/designStore'
import { useAuthStore } from '../../stores/authStore'
import { deleteDroneDesignByLocal, putDroneDesign, uploadDroneDesignCover } from '../../utils/api'
import { useMyDesigns, MY_DESIGNS_KEY } from '../../hooks/useMyDesigns'
import type { Design } from '../../types/design'
import { isAssemblyComplete } from './workStatus'
import { WorkCard } from './components/WorkCard'
import { SortMenu, type SortKey } from './components/SortMenu'
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog'
import { RenameDialog } from './components/RenameDialog'
import { PublishWorkModal } from './components/PublishWorkModal'
import { coverKeyOf } from './components/coverKey'
import { NameDroneDialog } from '../Design/components/NameDroneDialog'
import { useToast } from '../../components/common/Toast'

/** 本会话已上传过的封面键（${serverId}:${封面缓存键}），避免同一版本反复上传。 */
const uploadedCoverKeys = new Set<string>()

/**
 * 工作台 = 个人「作品文件夹」（像 WPS / 飞书）。
 *
 * 进来就看到自己全部作品平铺成卡片网格，点哪个改哪个；顶部能搜索、能一键新建空白作品。
 * 绝不默认逼用户继续上一个项目，也没有学习/课程入口。
 * 全走真实数据：作品来自本地设计库（与作品集同源），缩略图是真实 3D 预览，无 mock、无糊图。
 */

/** 左侧「分组」= 看哪一类作品（和右侧「排序」分工：分组挑一类，排序定顺序）。 */
type WorkGroup = 'all' | 'recent' | 'draft' | 'complete'

const GROUPS: { key: WorkGroup; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'recent', label: '最近' },
  { key: 'draft', label: '草稿' },
  { key: 'complete', label: '装配完成' },
]

/** 「最近修改」= 近 7 天编辑过（Date.now 包在模块函数里，避免在渲染期直接调用不纯函数）。 */
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
function isRecentlyEdited(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() <= RECENT_WINDOW_MS
}

export function DashboardPage() {
  const nav = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const designs = useDesignStore((s) => s.designs)
  const setActiveDesignId = useDesignStore((s) => s.setActiveDesignId)
  const createDesign = useDesignStore((s) => s.createDesign)
  const deleteDesign = useDesignStore((s) => s.deleteDesign)
  const token = useAuthStore((s) => s.token)
  const isGuest = useAuthStore((s) => s.user?.isGuest)
  const loggedIn = !!token && !isGuest

  // 服务器作品记录（真相源）：拉 GET /drone-designs 的完整记录，并把快照合并进本地离线缓存。
  // byLocalId 让每张作品卡按 localId 找到它的服务器 id（发布 / 封面靠它）。
  const { byLocalId, isError: accountDesignsLoadFailed } = useMyDesigns()
  const accountLoadErrorShownRef = useRef(false)

  useEffect(() => {
    if (accountDesignsLoadFailed && !accountLoadErrorShownRef.current) {
      accountLoadErrorShownRef.current = true
      toast.push('error', '账号作品加载失败，当前显示本机作品')
    } else if (!accountDesignsLoadFailed) {
      accountLoadErrorShownRef.current = false
    }
  }, [accountDesignsLoadFailed, toast])

  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<WorkGroup>('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [renameTarget, setRenameTarget] = useState<Design | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Design | null>(null)
  const [publishTarget, setPublishTarget] = useState<Design | null>(null)
  const [naming, setNaming] = useState(false)

  /** 幂等写回服务器（按 localId=design.id）：新建 / 改名后调用，保证刷新仍在、跨设备一致。 */
  const saveToServer = (d: Design) =>
    putDroneDesign({
      localId: d.id,
      name: d.name,
      designData: d,
      weightG: d.safetyCheck?.totalWeightG ?? 0,
    })

  // 全部作品 → 搜索 + 左侧分组过滤 → 右侧排序。先过滤再排序，对全部作品生效（不只当前一屏）。
  const works = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = designs.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false
      if (group === 'draft') return !isAssemblyComplete(d)
      if (group === 'complete') return isAssemblyComplete(d)
      if (group === 'recent') return isRecentlyEdited(d.updatedAt)
      return true
    })
    const sorted = [...filtered]
    if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    } else if (sort === 'oldest') {
      sorted.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    } else {
      sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }
    return sorted
  }, [designs, query, group, sort])

  const openDesign = (d: Design) => {
    setActiveDesignId(d.id)
    nav(`/design/${d.id}`)
  }

  // 新建 = 先弹窗给无人机起名字，确认后再进设计页（留空记为「未命名无人机」）。
  const startNew = () => setNaming(true)

  const createNamed = (name: string) => {
    const id = createDesign(name || '未命名无人机', 'guided')
    setActiveDesignId(id)
    setNaming(false)
    // 已登录：立刻把新作品写回服务器，这样即便还没编辑就刷新，工作台也能从服务器看到它。
    if (loggedIn) {
      const d = useDesignStore.getState().getDesignById(id)
      if (d) {
        void saveToServer(d).then((result) => {
          if (!result.success) toast.push('error', '账号同步失败，本机作品仍保留')
        })
      }
    }
    nav(`/design/${id}`)
  }

  // 重命名：只改名字（顺带更新「上次修改」），不动设计内容。
  const confirmRename = (name: string) => {
    if (!renameTarget) return
    const id = renameTarget.id
    useDesignStore.setState((state) => ({
      designs: state.designs.map((d) =>
        d.id === id ? { ...d, name, updatedAt: new Date().toISOString() } : d,
      ),
    }))
    // 已登录：把新名字写回服务器（服务器是真相源），并刷新记录映射。失败不打扰（本机已改）。
    if (loggedIn) {
      const d = useDesignStore.getState().getDesignById(id)
      if (d) {
        void saveToServer(d).then((result) => {
          if (result.success) void qc.invalidateQueries({ queryKey: MY_DESIGNS_KEY })
          else toast.push('error', '账号同步失败，本机改名仍保留')
        })
      }
    }
    setRenameTarget(null)
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    deleteDesign(id)
    // 已登录用户：同时删服务器那份，否则下次同步又会把它拉回来「复活」。
    // 幂等接口；删服务器失败也不打扰用户（本机已删，下次重试无副作用）。
    if (loggedIn) {
      void deleteDroneDesignByLocal(id).then((result) => {
        if (result.success) void qc.invalidateQueries({ queryKey: MY_DESIGNS_KEY })
        else toast.push('error', '账号删除失败，本机已隐藏该作品')
      })
    }
    setDeleteTarget(null)
  }

  // 发布到社区：打开设计版发布弹窗（弹窗内自行 PATCH 公开 + 发帖，走 designId）。
  const handlePublish = (d: Design) => setPublishTarget(d)

  // 封面：作品卡抓到 3D 定格图后，登录用户把同一张图存为服务器封面（供以后公开画廊）。
  // 未同步（没有服务器记录）先跳过——发布时会兜底落库；同一版本只上传一次。
  const handleCaptureCover = (d: Design, blob: Blob) => {
    const rec = byLocalId.get(d.id)
    if (!rec?.id) return
    const key = `${rec.id}:${coverKeyOf(d)}`
    if (uploadedCoverKeys.has(key)) return
    uploadedCoverKeys.add(key)
    uploadDroneDesignCover(rec.id, blob)
      .then((res) => {
        if (res.success) qc.invalidateQueries({ queryKey: MY_DESIGNS_KEY })
        else uploadedCoverKeys.delete(key) // 允许下次重试
      })
      .catch(() => uploadedCoverKeys.delete(key))
  }

  const noWorksAtAll = designs.length === 0

  return (
    <PageContainer className="py-8">
      {/* 标题 */}
      <div>
        <h1 className="font-display text-[1.75rem] leading-tight text-sky-900 sm:text-[2rem]">
          我的作品
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          查看、新建和管理无人机设计，选择作品可继续编辑。
        </p>
      </div>

      {/* 工具栏：搜索 + 新建作品 */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索作品名称"
            aria-label="搜索作品"
            className="w-full rounded-lg border border-sky-200 bg-white py-2.5 pl-10 pr-4 text-sm text-sky-900 outline-none transition focus:border-accent-spark focus:ring-2 focus:ring-accent-spark/30"
          />
        </div>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-accent-spark px-6 text-sm font-semibold text-white shadow-sky-glow transition hover:brightness-110 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-spark"
        >
          <Plus className="h-4 w-4" aria-hidden />
          新建作品
        </button>
      </div>

      {/* 分组（左：看哪一类）+ 排序（右：按什么顺序），各司其职、视觉分开 */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {/* 左：分组 tab */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="作品分组">
          {GROUPS.map((g) => {
            const active = group === g.key
            return (
              <button
                key={g.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setGroup(g.key)}
                className={
                  active
                    ? 'rounded-lg bg-accent-spark px-4 py-1.5 text-sm font-semibold text-white shadow-sky-glow'
                    : 'rounded-lg border border-sky-200 bg-white px-4 py-1.5 text-sm font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-50'
                }
              >
                {g.label}
              </button>
            )
          })}
        </div>

        {/* 右：排序 */}
        <SortMenu value={sort} onChange={setSort} />
      </div>

      {/* 作品网格 / 空状态 */}
      <div className="mt-6">
        {noWorksAtAll ? (
          <EmptyAll onStart={startNew} />
        ) : works.length === 0 ? (
          <EmptyFiltered />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {works.map((d) => (
              <WorkCard
                key={d.id}
                design={d}
                onOpen={openDesign}
                onRename={setRenameTarget}
                onDelete={setDeleteTarget}
                onPublish={loggedIn ? handlePublish : undefined}
                onCaptureCover={loggedIn ? handleCaptureCover : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <NameDroneDialog
        open={naming}
        onConfirm={createNamed}
        onCancel={() => setNaming(false)}
      />
      <RenameDialog
        key={renameTarget?.id ?? 'rename-closed'}
        current={renameTarget?.name ?? null}
        onCancel={() => setRenameTarget(null)}
        onConfirm={confirmRename}
      />
      <DeleteConfirmDialog
        name={deleteTarget?.name ?? null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      {publishTarget && (
        <PublishWorkModal
          open
          design={publishTarget}
          serverId={byLocalId.get(publishTarget.id)?.id}
          initialReusable={byLocalId.get(publishTarget.id)?.reusable}
          onClose={() => setPublishTarget(null)}
        />
      )}
    </PageContainer>
  )
}

/** 一个作品都没有：友好空态 + 新建。绝无学习/课程引导文案。 */
function EmptyAll({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-sky-200 bg-gradient-to-br from-sky-50 to-white p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-sky-400">
        <Plane className="h-8 w-8" strokeWidth={1.5} aria-hidden />
      </div>
      <p className="max-w-sm text-base font-semibold text-sky-900">暂无作品。新建作品后可以开始设计。</p>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent-spark px-6 text-sm font-semibold text-white shadow-sky-glow transition hover:brightness-110 active:translate-y-px"
      >
        <Plus className="h-4 w-4" aria-hidden />
        新建作品
      </button>
    </div>
  )
}

/** 搜索 / 筛选后没有匹配项（但用户其实是有作品的）。 */
function EmptyFiltered() {
  return (
    <div className="rounded-card border border-dashed border-sky-200 bg-white p-10 text-center">
      <p className="text-sm font-medium text-sky-700">没有符合条件的作品，请调整关键词或筛选条件。</p>
    </div>
  )
}
