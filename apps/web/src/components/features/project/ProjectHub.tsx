/**
 * ProjectHub — 项目详情页「引力枢纽」（C1 / M5，RFC-011 §5.3）。
 *
 * 在一处挂载项目的全部入口与动作：三入口（设计 / 编程 / 试飞，各自真实预览）
 * + 一键试飞（经 DroneAdapter 产出 RunResult）+ 分享 / 导出 / 版本 / 提交参赛入口
 * （占位按钮，真实逻辑归 C3 / D / 后续 M）。所有散落功能两跳内可达。
 *
 * 数据来自 useProjectHub（真实绑定优先，游客/离线降级为「本地草稿」并诚实标注）。
 * 三态齐全：加载骨架 / 错误重试 / 空态引导。
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Pencil, Code2, Play, Rocket, Share2, Download, Settings, GitBranch, Send,
  Check, X, Loader2, AlertCircle, WifiOff, type LucideIcon,
} from 'lucide-react'
import { PageContainer } from '../../layout/PageContainer'
import { Button } from '../../common/Button'
import { useToast } from '../../common/Toast'
import { uploadProjectCover } from '../../../utils/api'
import { useAuthStore } from '../../../stores/authStore'
import { DesignPreview3D } from '../../design/DesignPreview3D'
import { IRBlocksPreview } from '../../coding/IRBlocksPreview'
import { FlightPreview3D } from '../../simulator/FlightPreview3D'
import { useProjectHub } from './useProjectHub'
import { useUpdateProject } from '../../../hooks/useProjects'
import { OneClickFlyModal } from './OneClickFlyModal'
import { ProjectSettingsModal } from './ProjectSettingsModal'
import { PublishModal } from './PublishModal'

const CARD = 'rounded-xl bg-white shadow-[0_2px_18px_-8px_rgba(23,74,126,0.16)] ring-1 ring-sky-100/80'

function EmptyPreview({ icon: Icon, text, hint }: { icon: LucideIcon; text: string; hint: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-sky-400">
      <Icon size={26} />
      <p className="text-sm font-medium text-sky-500">{text}</p>
      <p className="text-xs text-sky-400">{hint}</p>
    </div>
  )
}

export function ProjectHub() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const hub = useProjectHub(id)

  const [flyOpen, setFlyOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState('')

  const canEditName = hub.source === 'server'
  const startEdit = () => {
    setNameInput(hub.name)
    setEditing(true)
  }
  const updateMutation = useUpdateProject()
  const saveName = async () => {
    const name = nameInput.trim()
    setEditing(false)
    if (!name || name === hub.name || !id) return
    try {
      // 乐观更新：详情标题与工作台列表立刻反映新名（不等网络往返），失败自动回滚。
      await updateMutation.mutateAsync({ id, data: { name } })
      toast.push('success', '项目名已更新')
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : '保存失败')
    }
  }

  // 复用「设计」卡的 3D 渲染：加载完成后抓一帧，上传为项目封面 → 列表（读 coverUrl）显示真实作品。
  // 只有当前账号、项目与已绑定快照都有效时才上传，不能把本地回退草稿写到服务器项目。
  const token = useAuthStore(state => state.token)
  const ownerId = useAuthStore(state => state.user?.id)
  const isGuest = useAuthStore(state => state.user?.isGuest)
  const coverEligible = !!token && !!ownerId && !isGuest && hub.loggedIn && hub.source === 'server'
    && hub.projectId === id && !!id && hub.designBound && !hub.degraded && hub.status === 'ready'
    && !!hub.design?.parts.length
  const coverKey = JSON.stringify([id, hub.design?.id, hub.design?.updatedAt, hub.design?.parts])
  const coverBinding = useMemo(() => coverEligible ? { projectId: id, token, ownerId, key: coverKey } : null,
    [coverEligible, id, token, ownerId, coverKey])
  const currentCoverBinding = useRef<typeof coverBinding>(null)
  const coverAttemptRef = useRef<typeof coverBinding>(null)
  const coverQueueRef = useRef<Promise<void>>(Promise.resolve())
  useLayoutEffect(() => {
    currentCoverBinding.current = coverBinding
    return () => { currentCoverBinding.current = null }
  }, [coverBinding])

  const handleDesignSnapshot = useCallback(
    async (blob: Blob) => {
      const isCurrent = () => coverBinding !== null && currentCoverBinding.current === coverBinding
        && useAuthStore.getState().token === coverBinding.token
        && useAuthStore.getState().user?.id === coverBinding.ownerId
      if (!coverBinding || !isCurrent() || coverAttemptRef.current === coverBinding) return
      coverAttemptRef.current = coverBinding
      const upload = async () => {
        // A queued image may become obsolete while a previous upload is in flight.
        if (!isCurrent()) return
        try {
          const res = await uploadProjectCover(coverBinding.projectId, blob)
          if (!isCurrent()) return
          if (res.success) {
            await qc.invalidateQueries({ queryKey: ['projects'] })
          } else if (coverAttemptRef.current === coverBinding) {
            coverAttemptRef.current = null
          }
        } catch {
          if (isCurrent() && coverAttemptRef.current === coverBinding) coverAttemptRef.current = null
        }
      }
      const pending = coverQueueRef.current.then(upload, upload)
      coverQueueRef.current = pending
      await pending
    },
    [coverBinding, qc],
  )

  // ── 加载态 ──
  if (hub.status === 'loading') {
    return (
      <PageContainer className="py-8">
        <div className="flex items-center justify-center py-24 text-sky-400">
          <Loader2 size={24} className="animate-spin" />
          <span className="ml-2 text-sm">加载项目…</span>
        </div>
      </PageContainer>
    )
  }

  // ── 错误态 ──
  if (hub.status === 'error') {
    return (
      <PageContainer className="py-8">
        <button type="button" onClick={() => nav('/dashboard')} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 transition hover:text-sky-700">
          <ArrowLeft size={16} /> 返回工作台
        </button>
        <div className={`flex flex-col items-center justify-center ${CARD} py-16 text-center`}>
          <AlertCircle size={32} className="mb-2 text-error" />
          <p className="text-sm font-medium text-sky-800">{hub.error || '项目加载失败'}</p>
          <p className="mt-1 text-xs text-sky-500">请检查网络后重试</p>
          <Button className="mt-4" variant="outline" onClick={hub.refetch}>重试</Button>
        </div>
      </PageContainer>
    )
  }

  // ── ready / empty 共用枢纽外壳 ──
  const stages: { label: string; desc: string; path: string; icon: LucideIcon; preview: ReactNode; tag?: string }[] = [
    {
      label: '设计', desc: '编辑机身', path: 'design', icon: Pencil,
      preview: hub.design
        ? <DesignPreview3D design={hub.design} fill onSnapshot={handleDesignSnapshot} />
        : <EmptyPreview icon={Pencil} text="还没有设计内容" hint="点击进入设计工作台" />,
      tag: hub.design && !hub.designBound ? '本地草稿' : undefined,
    },
    {
      label: '编程', desc: '积木编程', path: 'code', icon: Code2,
      preview: hub.program
        ? <IRBlocksPreview commands={hub.program.commandProgram.commands} />
        : <EmptyPreview icon={Code2} text="还没有编程" hint="点击开始积木编程" />,
      tag: hub.program && !hub.programBound ? '本地草稿' : undefined,
    },
    {
      label: '模拟', desc: '模拟运行程序', path: 'simulator', icon: Play,
      preview: <FlightPreview3D />,
    },
  ]

  const flyDisabled = !hub.program

  return (
    <PageContainer className="py-8 space-y-6">
      <button type="button" onClick={() => nav('/dashboard')} className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 transition hover:text-sky-700">
        <ArrowLeft size={16} /> 返回工作台
      </button>

      {/* 标题区 = 项目名（可改）+ 来源徽标 + 主动作 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false) }}
                maxLength={40}
                className="min-w-0 flex-1 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-2xl font-bold text-sky-900 outline-none focus:ring-2 focus:ring-sky-200 sm:text-3xl"
              />
              <button type="button" onClick={saveName} className="shrink-0 rounded-lg bg-sky-500 p-2 text-white transition hover:bg-sky-600" aria-label="保存"><Check size={18} /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(false)} className="shrink-0 rounded-lg p-2 text-sky-400 transition hover:bg-sky-50" aria-label="取消"><X size={18} /></button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight text-sky-900 sm:text-3xl">{hub.name}</h1>
              {canEditName && (
                <button type="button" onClick={startEdit} className="shrink-0 text-sky-400 transition hover:text-sky-600" aria-label="编辑项目名"><Pencil size={18} /></button>
              )}
              {hub.source === 'local-draft' && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">本地草稿</span>
              )}
            </div>
          )}
          <p className="mt-1 text-sm text-sky-500">项目 #{id.slice(0, 6) || '...'}</p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {hub.source === 'server' && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="项目设置"
              title="项目设置"
              className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-white text-ink-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 active:scale-95"
            >
              <Settings size={18} />
            </button>
          )}
          <Button size="sm" variant="outline" leftIcon={<Send size={14} />} onClick={() => setPublishOpen(true)}>发布到社区</Button>
          <Button size="sm" variant="outline" leftIcon={<Share2 size={14} />} onClick={() => toast.push('info', '项目分享与网页嵌入暂未开放')}>分享</Button>
          <button
            type="button"
            onClick={() => {
              // 接现成的设计 CAD 导出（方案 A）：有设计就跳导出预览页，没有就提示先做设计
              if (hub.design) nav(`/design/export-preview/${hub.design.id}`)
              else toast.push('info', '请先创建设计，再导出已有的零件数据')
            }}
            // 配色与「一键试飞」一致（from-sky-600 to-sky-700），与「分享/设置」的描边区分
            className="touch-target inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-md bg-gradient-to-br from-sky-600 to-sky-700 px-3 text-sm font-semibold text-white shadow-sm transition hover:from-sky-700 hover:to-sky-800 active:translate-y-[1px] active:scale-95"
          >
            <Download size={14} />
            导出
          </button>
        </div>
      </div>

      {/* 来源提示（诚实标注：本地草稿 / 离线降级） */}
      {(hub.source === 'local-draft' || hub.degraded) && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-2.5 ring-1 ring-amber-100">
          <WifiOff size={15} className="mt-0.5 shrink-0 text-amber-500" />
          <p className="text-xs text-amber-700">
            {hub.degraded
              ? '项目部分内容加载失败，请刷新或检查网络后重试。'
              : '未登录，内容仅保存在当前浏览器。登录并保存到账号后，可在其他设备查看。'}
          </p>
        </div>
      )}

      {/* 一键试飞（主动作，经 DroneAdapter → RunResult） */}
      <button
        type="button"
        disabled={flyDisabled}
        onClick={() => setFlyOpen(true)}
        className="group relative flex w-full items-center justify-between overflow-hidden rounded-xl bg-gradient-to-br from-sky-600 to-sky-700 p-5 text-left text-white shadow-[0_12px_34px_-16px_rgba(23,74,126,0.6)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
      >
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20"><Rocket size={22} /></span>
          <div>
            <p className="text-base font-bold">运行模拟</p>
            <p className="mt-0.5 text-xs text-sky-100">
              {flyDisabled ? '请先在编程页编写程序，再运行模拟。' : '查看当前程序的模拟运行过程。'}
            </p>
          </div>
        </div>
        {!flyDisabled && (
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 group-hover:translate-x-1"><Play size={18} /></span>
        )}
      </button>

      {/* 三入口卡：真实预览，点击进入对应编辑器 */}
      <div className="grid gap-5 sm:grid-cols-3">
        {stages.map((st) => (
          <button
            key={st.label}
            type="button"
            onClick={() => nav(`/${st.path}/${id}`)}
            className={`group flex flex-col overflow-hidden text-left transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:shadow-[0_22px_44px_-16px_rgba(23,74,126,0.4)] ${CARD}`}
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-sky-100 to-sky-50">
              <div className="pointer-events-none absolute inset-0">{st.preview}</div>
              {st.tag && (
                <span className="absolute left-3 top-3 rounded-full bg-amber-100/90 px-2 py-0.5 text-[10px] font-medium text-amber-700 backdrop-blur-sm">{st.tag}</span>
              )}
              <div className="absolute inset-0 flex items-end justify-end p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span className="rounded-full bg-sky-600/90 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">进入{st.label} →</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 border-t border-sky-100/70 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600"><st.icon size={16} /></span>
              <div>
                <p className="text-sm font-bold text-sky-900">{st.label}</p>
                <p className="text-xs text-sky-500">{st.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* 次级挂载点：版本（占位入口，两跳内可达） */}
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => toast.push('info', '历史版本与分支管理暂未开放')} className={`flex items-center gap-3 p-4 text-left transition hover:ring-sky-200 ${CARD}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600"><GitBranch size={18} /></span>
          <div>
            <p className="text-sm font-bold text-sky-900">版本与分支</p>
            <p className="text-xs text-sky-500">历史查看、分支与版本恢复暂未开放</p>
          </div>
        </button>
      </div>

      <OneClickFlyModal
        open={flyOpen}
        onClose={() => setFlyOpen(false)}
        program={hub.program?.commandProgram ?? null}
        programName={hub.program?.name}
      />

      {settingsOpen && (
        <ProjectSettingsModal
          open
          onClose={() => setSettingsOpen(false)}
          projectId={id}
          name={hub.name}
        />
      )}

      {publishOpen && (
        <PublishModal
          open
          onClose={() => setPublishOpen(false)}
          projectId={id}
          defaultTitle={hub.name}
        />
      )}
    </PageContainer>
  )
}
