/**
 * SimulatorPage — 仿真试飞。
 *
 * 消费 CommandProgram IR → SimAdapter 执行 → Three.js 场景渲染飞行。
 * 运行/停止/重置、遥测 HUD、飞行轨迹、障碍物、结果面板（完成/撞机/停止 + 用时）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Play, Pause, RotateCcw, Activity } from 'lucide-react'
import { Button } from '../../components/common/Button'
import { useToast } from '../../components/common/Toast'
import { FlightScene } from '../../simulator/FlightScene'
import { SimAdapter, type SimObstacle } from '../../simulator/SimAdapter'
import type { Telemetry, RunResult } from '@fwx/shared'
import { useProgramStore } from '../../stores/programStore'
import { useAuthStore } from '../../stores/authStore'
import { useDesignStore } from '../../stores/designStore'
import { loadDesignProgram } from '../../utils/designProgram'
import { compileWorkspaceXml } from '../../blockly/compileWorkspaceXml'
import { SimResultPanel, type SimFinishKind } from './SimResultPanel'

/** 飞行轨迹最多保留点数（防止长飞累积拖慢渲染）。 */
const MAX_TRAIL_POINTS = 300

/** Demo obstacles（heightCm 默认 100，与场景圆柱一致）。 */
const DEFAULT_OBSTACLES: SimObstacle[] = [
  { posCm: [0, 0, 200], radiusCm: 30, heightCm: 100 },
  { posCm: [180, 0, 350], radiusCm: 25, heightCm: 100 },
  { posCm: [-80, 0, 500], radiusCm: 35, heightCm: 100 },
]

export function SimulatorPage() {
  const { id } = useParams()
  const userId = useAuthStore(state => state.user?.id)
  return <SimulatorWorkspace key={`${id ?? 'unbound'}:${userId ?? 'guest'}`} designId={id} />
}

function SimulatorWorkspace({ designId: id }: { designId?: string }) {
  const toast = useToast()
  const token = useAuthStore(state => state.token)
  const user = useAuthStore(state => state.user)
  const design = useDesignStore(state => state.designs.find(value => value.id === id))
  const draft = useProgramStore(state => id ? state.draftsByDesignId[id] : undefined)
  const [loading, setLoading] = useState(Boolean(token && !user?.isGuest))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  const adapterRef = useRef<SimAdapter | null>(null)
  const runIdRef = useRef(0)
  const startTimeRef = useRef(0)
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null)
  const [trail, setTrail] = useState<[number, number, number][]>([])
  const [ledColor, setLedColor] = useState<[number, number, number]>([0, 0, 0])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [finishKind, setFinishKind] = useState<SimFinishKind | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [currentCmdIndex, setCurrentCmdIndex] = useState(-1)

  useEffect(() => {
    if (!id || !token || user?.isGuest) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const localDraft = useProgramStore.getState().getDraft(id)
        // Run the current intentional edit, including an incomplete or empty draft.
        if (localDraft?.blocklyXml && localDraft.blocklyXml !== localDraft.syncedXml) return
        const { program } = await loadDesignProgram(id)
        if (cancelled || !program) return
        const compiled = compileWorkspaceXml(program.blocklyXml, { name: program.name, author: user?.username || '设计师' })
        const store = useProgramStore.getState()
        store.setProgram(id, program.blocklyXml, compiled)
        store.setServerId(id, program.id)
        store.markSynced(id, program.blocklyXml)
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '程序加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, token, user?.isGuest, user?.username, retryKey])

  useEffect(() => () => {
    runIdRef.current++
    adapterRef.current?.stop()
  }, [])

  const handleRun = useCallback(async () => {
    // 只运行当前路由作品自己的程序；示例必须由用户在编程页主动载入。
    if (!id) {
      toast.push('error', '未找到该作品已保存的程序')
      return
    }
    const draft = useProgramStore.getState().getDraft(id)
    let program
    try {
      if (!draft?.blocklyXml) throw new Error('未找到该作品已保存的程序')
      program = compileWorkspaceXml(draft.blocklyXml, { name: draft.commandProgram?.metadata.name || '当前作品', author: user?.username || '设计师' })
      if (!program.commands.length) throw new Error('请先在编程页连接可运行的积木')
    } catch (error) {
      toast.push('error', error instanceof Error ? error.message : '程序无法运行')
      return
    }

    // 竞态防护：作废上一轮回调，开启新一轮（照搬 useProjectFlight 的 runId 模式）
    adapterRef.current?.stop()
    const myRun = ++runIdRef.current
    const live = () => runIdRef.current === myRun

    const adapter = new SimAdapter({ speed: 1, obstacles: DEFAULT_OBSTACLES, tickMs: 50 })
    adapterRef.current = adapter

    setRunning(true)
    setResult(null)
    setFinishKind(null)
    setTrail([])
    setLedColor([0, 0, 0])
    setCurrentCmdIndex(-1)
    startTimeRef.current = performance.now()

    await adapter.execute(program, {
      onCommandStart: (index) => {
        if (!live()) return
        setCurrentCmdIndex(index)
      },
      onTelemetry: (t) => {
        if (!live()) return
        setTelemetry({ ...t })
        setTrail(prev => {
          const next = [...prev, [...t.posCm] as [number, number, number]]
          return next.length > MAX_TRAIL_POINTS ? next.slice(next.length - MAX_TRAIL_POINTS) : next
        })
        setLedColor([...adapter.getState().ledColor])
      },
      onFinish: (r) => {
        if (!live()) return
        // 三态：撞机 / 完成 / 手动停止。撞机优先于 success 判断。
        const kind: SimFinishKind = adapter.hasCollided() ? 'collision' : adapter.getFailureReason() ? 'error' : r.success ? 'success' : 'stopped'
        setResult(r)
        setFinishKind(kind)
        setElapsedSec((performance.now() - startTimeRef.current) / 1000)
        setRunning(false)
        toast.push(
          kind === 'success' ? 'success' : kind === 'stopped' ? 'info' : 'error',
          kind === 'success' ? '模拟运行完成' : kind === 'collision' ? '模拟中发生碰撞' : kind === 'error' ? adapter.getFailureReason()! : '已停止',
        )
      },
    })
  }, [id, toast, user])

  const handleStop = useCallback(() => {
    // 只停飞；最终结果（含用时）由 adapter 的 onFinish 回来统一产出，保证一致。
    adapterRef.current?.stop()
  }, [])

  const handleReset = useCallback(() => {
    runIdRef.current++ // 作废当前 run 的后续回调
    adapterRef.current?.stop()
    setRunning(false)
    setResult(null)
    setFinishKind(null)
    setElapsedSec(0)
    setTelemetry(null)
    setTrail([])
    setLedColor([0, 0, 0])
    setCurrentCmdIndex(-1)
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-sky-100 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          {!running ? (
            <Button size="sm" onClick={handleRun} disabled={loading || Boolean(loadError) || !draft?.commandProgram?.commands.length} leftIcon={<Play size={14} />}>
              {finishKind ? '重新运行' : '运行'}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleStop} leftIcon={<Pause size={14} />}>
              停止
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleReset} leftIcon={<RotateCcw size={14} />}>
            重置
          </Button>
        </div>

        {/* Telemetry HUD（移动端隐藏详细数据，保留按钮可用） */}
        {telemetry && (
          <div className="hidden sm:flex items-center gap-4 text-xs font-mono text-ink-600">
            <span className="inline-flex items-center gap-1">
              <Activity size={12} className="text-sky-400" />
              X:{telemetry.posCm[0].toFixed(0)} Y:{telemetry.posCm[1].toFixed(0)} Z:{telemetry.posCm[2].toFixed(0)}
            </span>
            <span>H:{telemetry.headingDeg.toFixed(0)}°</span>
            <span>前方:{telemetry.frontDistanceCm.toFixed(0)}cm</span>
            {currentCmdIndex >= 0 && <span className="text-sky-500">指令 #{currentCmdIndex + 1}</span>}
          </div>
        )}

        <div className="w-px" aria-hidden="true" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 bg-sky-50/70 px-4 py-2 text-xs text-ink-600">
        <span>视觉仿真 · {design?.parts.length ? '查看程序运行过程' : '指令预览模型'}</span>
        <Link className="font-medium text-sky-700 underline" to={id ? `/code/${id}` : '/design'}>返回积木编程</Link>
      </div>

      {/* 3D Scene */}
      <div className="relative min-h-0 flex-1">
        <FlightScene telemetry={telemetry} obstacles={DEFAULT_OBSTACLES} trail={trail} ledColor={ledColor} parts={design?.parts} />
        {(loading || loadError || !draft?.commandProgram?.commands.length) && !running && (
          <div role="status" className="absolute inset-x-4 top-4 mx-auto max-w-md rounded-xl border border-sky-100 bg-white/95 p-4 text-center text-sm text-ink-700 shadow-soft">
            {loading ? '正在加载当前作品程序…' : loadError || '当前作品还没有可运行的程序，请返回积木编程添加或修正积木。'}
            {loadError && <button className="ml-2 text-sky-700 underline" onClick={() => setRetryKey(value => value + 1)}>重试</button>}
          </div>
        )}

        {/* 结果面板（完成/撞机/停止 + 用时 + 重新运行） */}
        {finishKind && !running && (
          <SimResultPanel kind={finishKind} elapsedSec={elapsedSec} onRerun={handleRun} />
        )}

        {/* Event log overlay */}
        {result && result.events.length > 0 && (
          <div className="absolute bottom-4 left-4 max-h-40 max-w-xs overflow-auto rounded-xl border border-sky-100 bg-white/90 p-3 shadow-soft backdrop-blur">
            <h4 className="mb-1 text-xs font-semibold text-ink-700">模拟运行日志 ({result.events.length})</h4>
            <ul className="space-y-0.5">
              {result.events.map((evt, i) => (
                <li key={i} className="font-mono text-xs text-ink-500">{evt}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
