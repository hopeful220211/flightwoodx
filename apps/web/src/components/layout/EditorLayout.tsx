/**
 * EditorLayout — 全屏专注布局，用于设计器 / 积木编程器 / 模拟器。
 *
 * 顶部是「标签页工作区」（像浏览器/飞书）：
 *  - 最左是常驻的「工作台」标签，点它回 /dashboard；
 *  - 右边每个打开的无人机项目是一个可关闭(✕)的标签，可同时打开多个、随意切换；
 *  - 进某个项目编辑器时自动把它登记成一个标签（无需各页各自登记）。
 *
 * 同一作品可以在拼装、积木编程和视觉仿真间切换。
 *
 * RFC-011 §4: 编辑器类页面使用全屏专注布局 + 顶部切换条。
 */
import { useEffect, type MouseEvent } from 'react'
import { Outlet, useNavigate, useParams, useLocation } from 'react-router'
import { LayoutGrid, Pencil, X, Blocks, Play } from 'lucide-react'
import { useDesignStore } from '../../stores/designStore'
import { useEditorTabsStore } from '../../stores/editorTabsStore'
import type { Design } from '../../types/design'

function droneLabel(d: Design): string {
  return d.name?.trim() || '未命名无人机'
}

export function EditorLayout() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { pathname } = useLocation()

  const designs = useDesignStore((s) => s.designs)
  const activeDesignId = useDesignStore((s) => s.activeDesignId)
  const setActiveDesignId = useDesignStore((s) => s.setActiveDesignId)
  const openTabIds = useEditorTabsStore((s) => s.openTabIds)
  const openTab = useEditorTabsStore((s) => s.openTab)
  const closeTab = useEditorTabsStore((s) => s.closeTab)

  // 当前正在编辑哪架：URL 里的 id 优先（从工作台打开都带 id），否则用 store 里的活动项目。
  const currentId = id ?? activeDesignId ?? null
  // 当前模式（用于切标签时保持在同一个模式）
  const mode = pathname.startsWith('/code')
    ? 'code'
    : pathname.startsWith('/simulator')
      ? 'simulator'
      : 'design'

  // 进入某项目编辑器时：把 URL 的 id 同步成活动项目，并登记成一个打开的标签。
  useEffect(() => {
    if (id) {
      setActiveDesignId(id)
      openTab(id)
    } else if (activeDesignId) {
      openTab(activeDesignId)
    }
  }, [id, activeDesignId, setActiveDesignId, openTab])

  // 只显示仍然存在的项目标签（已在工作台删掉的不再显示）
  const tabs = openTabIds
    .map((tid) => designs.find((d) => d.id === tid))
    .filter((d): d is Design => !!d)

  const goToProject = (designId: string) => {
    setActiveDesignId(designId)
    navigate(`/${mode}/${designId}`)
  }

  const handleClose = (designId: string, e: MouseEvent) => {
    e.stopPropagation()
    // 内容此刻已在自动保存，关之前不用二次确认。
    const remaining = openTabIds.filter(
      (t) => t !== designId && designs.some((d) => d.id === t),
    )
    closeTab(designId)
    // 关掉的正是当前这张：切到旁边一张，没有了就回工作台
    if (designId === currentId) {
      if (remaining.length > 0) {
        const next = remaining[remaining.length - 1]
        setActiveDesignId(next)
        navigate(`/${mode}/${next}`)
      } else {
        navigate('/dashboard')
      }
    }
  }

  return (
    <div className="editor-shell flex h-dvh flex-col bg-slate-50">
      {/* ── 顶部标签栏 + 模式切换 ── */}
      <header className="flex min-h-12 shrink-0 flex-wrap items-stretch border-b border-sky-100 bg-white">
        {/* 工作台标签（常驻最左，点它回工作台） */}
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          aria-label="返回工作台"
          className="inline-flex shrink-0 items-center gap-1.5 border-r border-sky-100 px-4 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
        >
          <LayoutGrid size={16} />
          <span className="hidden sm:inline">工作台</span>
        </button>

        {/* 打开的项目标签（可横向滚动） */}
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {tabs.map((d) => {
            const isActive = d.id === currentId
            return (
              <div
                key={d.id}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                onClick={() => goToProject(d.id)}
                onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); goToProject(d.id) } }}
                className={`group inline-flex max-w-[12rem] shrink-0 cursor-pointer items-center gap-1.5 border-r border-sky-100 pl-3.5 pr-2 text-sm transition ${
                  isActive
                    ? 'border-b-2 border-b-sky-500 bg-sky-50/70 font-medium text-sky-700'
                    : 'text-ink-500 hover:bg-sky-50/50 hover:text-ink-700'
                }`}
              >
                <Pencil size={13} className={isActive ? 'text-sky-500' : 'text-ink-300'} />
                <span className="truncate">{droneLabel(d)}</span>
                <button
                  type="button"
                  aria-label={`关闭 ${droneLabel(d)}`}
                  onClick={(e) => handleClose(d.id, e)}
                  className="ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-300 transition hover:bg-sky-100 hover:text-sky-600"
                >
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </div>
        {currentId && designs.some(design => design.id === currentId) && (
          <nav aria-label="作品编辑模式" className="flex w-full shrink-0 justify-center gap-1 border-t border-sky-100 p-1 sm:w-auto sm:border-l sm:border-t-0">
            {[
              { value: 'design', label: '拼装', Icon: Pencil },
              { value: 'code', label: '积木编程', Icon: Blocks },
              { value: 'simulator', label: '视觉仿真', Icon: Play },
            ].map(({ value, label, Icon }) => (
              <button key={value} type="button" aria-current={mode === value ? 'page' : undefined}
                onClick={() => navigate(`/${value}/${currentId}`)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${mode === value ? 'bg-sky-100 text-sky-800' : 'text-slate-500 hover:bg-sky-50 hover:text-sky-800'}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* ── Editor Canvas ── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
