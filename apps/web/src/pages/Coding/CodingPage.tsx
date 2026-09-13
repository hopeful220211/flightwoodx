/**
 * CodingPage — 积木编程器。
 *
 * 左侧：Blockly 工作区（自定义无人机积木）
 * 右侧：默认「飞行计划」大白话预览，可切「开发者视图」看原始 IR
 *
 * 积木 → 编译为 IR → 仿真器 / 真机适配器消费（硬件解耦红线）。
 * 本地 programStore 保留编辑草稿；登录后的正式记录通过作品绑定的 /api/programs 保存。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import * as Blockly from 'blockly'
import 'blockly/blocks'
import { Play, Save, Undo2, Redo2, ListTree } from 'lucide-react'
import { Button } from '../../components/common/Button'
import { useToast } from '../../components/common/Toast'
import { useAuthStore } from '../../stores/authStore'
import { useProgramStore } from '../../stores/programStore'
import { loadDesignProgram, saveDesignProgram } from '../../utils/designProgram'

// 自定义主题 + JSON 工具箱 + 分类图标注入（内部已 import './blocks' 注册积木）
import { DRONE_THEME, DRONE_TOOLBOX, applyCategoryIcons } from '../../blockly/blocklyTheme'
import '../../blockly/blocklyTheme.css'
import { compileWorkspace } from '../../blockly/compiler'
import { EXAMPLE_PROGRAM_XML } from '../../blockly/exampleProgram'
import { restoreWorkspaceXml } from '../../blockly/restoreWorkspaceXml'
import { FlightPlanPanel } from './components/FlightPlanPanel'
import { EmptyCanvasGuide } from './components/EmptyCanvasGuide'
import type { CommandProgram } from '@fwx/shared'

export function CodingPage() {
  const { id } = useParams()
  const userId = useAuthStore(state => state.user?.id)
  return <CodingWorkspace key={`${id ?? 'unbound'}:${userId ?? 'guest'}`} designId={id} />
}

function CodingWorkspace({ designId: id }: { designId?: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const user = useAuthStore(s => s.user)
  const token = useAuthStore(s => s.token)
  const isGuest = useAuthStore(s => s.user?.isGuest)

  const blocklyDiv = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null)
  const [ir, setIr] = useState<CommandProgram | null>(null)
  const [compileError, setCompileError] = useState<string | null>(null)
  // 画布上真实的顶层积木数，决定是否显示空态引导（比"编译出的命令数"更准：
  // 残块/缺条件时命令数可能为 0，但画布并不空）。
  const [blockCount, setBlockCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(Boolean(token && !isGuest))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [saveStatus, setSaveStatus] = useState('本地草稿自动保存')
  // 上次持久化的 XML，用于过滤掉点击/滚动等非内容变化事件
  const lastXmlRef = useRef('')
  const preserveUnreadableDraftRef = useRef(false)

  // 编译元数据（项目名/作者）放 ref；同一作品内登录态变化不重建 Blockly。
  const metaRef = useRef({ id, username: user?.username })
  useEffect(() => {
    metaRef.current = { id, username: user?.username }
  }, [id, user?.username])

  const isEmpty = blockCount === 0

  // Initialize Blockly workspace（只在挂载时 inject 一次）
  useEffect(() => {
    if (!blocklyDiv.current || workspaceRef.current) return

    // 更强的磁吸半径，让两块积木更容易「啪」地连成一串
    Blockly.config.snapRadius = 36
    Blockly.config.connectingSnapRadius = 36

    const ws = Blockly.inject(blocklyDiv.current, {
      media: '/blockly-media/',
      toolbox: DRONE_TOOLBOX,
      grid: { spacing: 20, length: 3, colour: '#e0efff', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 2, minScale: 0.3 },
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: true },
      renderer: 'zelos',
      theme: DRONE_THEME,
    })

    workspaceRef.current = ws
    // 给分类图标 chip 注入白色 glyph（toolbox 已同步构建完成）
    applyCategoryIcons(blocklyDiv.current)

    // 未绑定的旧版草稿保持未绑定，不能自动认领到最近打开的作品。
    const programStore = useProgramStore.getState()
    const savedDraft = id ? programStore.getDraft(id) : null
    const savedXml = savedDraft?.blocklyXml ?? ''
    // 已损坏的旧草稿不能在空画布初始化时被 clearProgram 静默覆盖；用户开始新编辑后再恢复正常清空语义。
    if (savedXml) {
      if (restoreWorkspaceXml(ws, savedXml)) {
        lastXmlRef.current = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(ws))
      } else {
        preserveUnreadableDraftRef.current = true
        toast.push('error', '已保存的程序无法读取，原草稿未覆盖')
      }
    }

    // Live compile on workspace change
    const onWorkspaceChange = (event?: Blockly.Events.Abstract) => {
      if (event?.isUiEvent) return
      const topBlocks = ws.getTopBlocks(false).length
      setBlockCount(topBlocks)
      const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(ws))
      const hasEdit = Boolean(event) && xml !== lastXmlRef.current
      let program: CommandProgram | null = null
      try {
        const { id, username } = metaRef.current
        program = compileWorkspace(ws, {
          name: id ? `项目 ${id.slice(0, 6)}` : '未命名程序',
          author: username || '设计师',
        })
        setIr(program)
        setCompileError(null)
      } catch (err) {
        // 编译失败：清空 IR，确保「运行」被拦住，不会拿旧程序去跑（如拖了第二个「开始」）
        setIr(null)
        setCompileError(err instanceof Error ? err.message : '编译错误')
      }
      // 空画布和未完成积木也必须保留：刷新不复活旧云端程序，仿真不读取旧 IR。
      if (hasEdit && id) {
        preserveUnreadableDraftRef.current = false
        lastXmlRef.current = xml
        useProgramStore.getState().setProgram(id, xml, program)
        setSaveStatus(token && !isGuest ? '已保存本地草稿，尚未同步到账号' : '已保存本地草稿')
      } else if (!preserveUnreadableDraftRef.current && savedDraft && id && !program) {
        useProgramStore.getState().setProgram(id, xml, null)
      }
    }

    ws.addChangeListener(onWorkspaceChange)
    onWorkspaceChange() // 初始编译一次：恢复的程序立即显示在预览里

    return () => {
      ws.removeChangeListener(onWorkspaceChange)
      ws.dispose()
      workspaceRef.current = null
    }
  }, [id, toast, token, isGuest])

  // 登录后按 DroneDesign.localId 找当前路由作品，再按它绑定的 programId 回填。
  // 本地未同步草稿保留；已同步缓存重新读取云端，刷新不覆盖离线修改。
  useEffect(() => {
    if (!token || isGuest || !id) return
    let cancelled = false

    const loadBoundProgram = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const { design, program } = await loadDesignProgram(id)
        if (cancelled) return
        const store = useProgramStore.getState()
        const localDraft = store.getDraft(id)
        store.setServerId(id, design.programId ?? null)
        // 本地未同步修改（包括主动清空）保持原样；不能被请求回来后的数据覆盖。
        if (localDraft?.blocklyXml && localDraft.blocklyXml !== localDraft.syncedXml) {
          setSaveStatus('已保留本地草稿，尚未同步到账号')
          return
        }
        if (!program) return
        const ws = workspaceRef.current
        if (!ws) return
        Blockly.Events.disable()
        try {
          if (!restoreWorkspaceXml(ws, program.blocklyXml, candidate => {
            compileWorkspace(candidate, { name: program.name, author: user?.username || '设计师' })
          })) throw new Error('账号中的程序无法读取，本地画布未更改')
          const compiled = compileWorkspace(ws, { name: program.name, author: user?.username || '设计师' })
          const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(ws))
          lastXmlRef.current = xml
          store.setProgram(id, xml, compiled)
          store.setServerId(id, program.id)
          store.markSynced(id, xml)
          setIr(compiled)
          setCompileError(null)
          setBlockCount(ws.getTopBlocks(false).length)
          setSaveStatus('已与账号同步')
        } finally {
          Blockly.Events.enable()
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '账号中的程序加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadBoundProgram()
    return () => {
      cancelled = true
    }
  }, [id, token, isGuest, user?.username, reloadKey])

  // Resize Blockly on window resize
  useEffect(() => {
    const handleResize = () => {
      if (workspaceRef.current) {
        Blockly.svgResize(workspaceRef.current)
      }
    }
    window.addEventListener('resize', handleResize)
    const observer = new ResizeObserver(handleResize)
    if (blocklyDiv.current) observer.observe(blocklyDiv.current)
    // Initial resize after mount
    const timer = setTimeout(handleResize, 100)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  const handleUndo = useCallback(() => {
    workspaceRef.current?.undo(false)
  }, [])

  const handleRedo = useCallback(() => {
    workspaceRef.current?.undo(true)
  }, [])

  // 整理画布：把散乱的积木竖直对齐排好
  const handleCleanup = useCallback(() => {
    workspaceRef.current?.cleanUp()
  }, [])

  // 「从示例开始」：仅在空画布载入示例，避免和已有积木叠加
  const handleLoadExample = useCallback(() => {
    const ws = workspaceRef.current
    if (!ws) return
    if (ws.getTopBlocks(false).length > 0) return
    const dom = Blockly.utils.xml.textToDom(EXAMPLE_PROGRAM_XML)
    Blockly.Xml.domToWorkspace(dom, ws)
  }, [])

  const handleSave = useCallback(async () => {
    if (!id || !workspaceRef.current || preserveUnreadableDraftRef.current) {
      toast.push('error', '当前作品或程序尚未就绪，请检查加载提示')
      return
    }
    const ws = workspaceRef.current
    let program: CommandProgram
    try {
      program = compileWorkspace(ws, { name: ir?.metadata.name || `项目 ${id.slice(0, 6)}`, author: user?.username || '设计师' })
    } catch (error) {
      toast.push('error', error instanceof Error ? error.message : '请先修正积木再保存到账号')
      return
    }
    const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(ws))
    // 先本地缓存（离线优先，项目详情页据此预览）
    useProgramStore.getState().setProgram(id, xml, program)

    // 游客 / 未登录：仅本地保存
    if (!token || isGuest) {
      toast.push('success', '已本地保存（登录后可同步到账号）')
      return
    }

    setSaving(true)
    try {
      await saveDesignProgram({ designId: id,
        pendingProgramId: useProgramStore.getState().getDraft(id)?.serverId ?? null,
        name: program.metadata.name, blocklyXml: xml, commandProgram: program,
        onProgramSaved: serverId => useProgramStore.getState().setServerId(id, serverId),
        sessionIsCurrent: () => useAuthStore.getState().token === token,
      })
      useProgramStore.getState().markSynced(id, xml)
      setSaveStatus(useProgramStore.getState().getDraft(id)?.blocklyXml === xml ? '已与账号同步' : '有新的本地修改，尚未同步')
      setLoadError(null)
      toast.push('success', '程序已保存到账号')
    } catch (error) {
      setSaveStatus('同步失败，本地草稿已保留')
      toast.push('error', error instanceof Error ? error.message : '保存到账号失败（已本地保存）')
    } finally {
      setSaving(false)
    }
  }, [id, ir, token, isGuest, toast, user])

  const handleRun = useCallback(() => {
    const ws = workspaceRef.current
    if (!id || !ws || preserveUnreadableDraftRef.current) {
      toast.push('error', '当前作品或程序尚未就绪，请检查加载提示')
      return
    }
    // 运行前从工作区重新序列化，确保交接给仿真页的是最新积木（不依赖可能滞后的 state）
    try {
      const program = compileWorkspace(ws, { name: ir?.metadata.name || `项目 ${id.slice(0, 6)}`, author: user?.username || '设计师' })
      if (!program.commands.length) throw new Error('请先连接可运行的积木')
      const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(ws))
      useProgramStore.getState().setProgram(id, xml, program)
      navigate(`/simulator/${id}`)
    } catch (error) {
      toast.push('error', error instanceof Error ? error.message : '程序无法运行')
    }
  }, [ir, navigate, id, toast, user])

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Left: Blockly workspace */}
      <div className="flex-1 flex flex-col min-w-0 min-h-[280px]">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-sky-100 bg-white px-2 py-2 sm:px-4">
          <Button size="sm" variant="ghost" aria-label="撤销" onClick={handleUndo} leftIcon={<Undo2 size={14} />}><span className="hidden sm:inline">撤销</span></Button>
          <Button size="sm" variant="ghost" aria-label="重做" onClick={handleRedo} leftIcon={<Redo2 size={14} />}><span className="hidden sm:inline">重做</span></Button>
          <Button size="sm" variant="ghost" aria-label="整理" onClick={handleCleanup} leftIcon={<ListTree size={14} />}><span className="hidden sm:inline">整理</span></Button>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving || loading} leftIcon={<Save size={14} />}>{saving ? '保存中…' : '保存'}</Button>
          <Button size="sm" onClick={handleRun} disabled={loading || !ir?.commands.length || Boolean(compileError)} leftIcon={<Play size={14} />}>运行</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 bg-sky-50/60 px-3 py-1.5 text-xs text-ink-600" role="status">
          <span>{loading ? '正在加载账号程序…' : saveStatus}</span>
          {loadError && <span className="text-error">{loadError} <button className="underline" onClick={() => setReloadKey(value => value + 1)}>重试</button></span>}
        </div>

        {/* Blockly inject target + empty-state guide overlay。
            coding-blockly-shell 把 blocklyTheme.css 的作用域限定在编程页。 */}
        <div className="relative flex-1 min-h-0">
          <div ref={blocklyDiv} className="coding-blockly-shell absolute inset-0" />
          {isEmpty && <EmptyCanvasGuide onLoadExample={handleLoadExample} />}
        </div>
      </div>

      {/* Right: flight-plan preview (default) / developer IR view */}
      <FlightPlanPanel ir={ir} compileError={compileError} />
    </div>
  )
}
