/**
 * useProjectFlight — 枢纽页「一键试飞」的运行时（C1 / M5）。
 *
 * 红线（RFC-011 §6.1）：只把仿真器当 `DroneAdapter` 接口持有，仅调用 `execute / stop`，
 * 绝不触碰 SimAdapter 的私有扩展（如 getState()）。LED 颜色只从 IR 的 `led` 指令读取
 * （经 onCommandStart 回调），不依赖适配器内部状态——换真机 / AR 适配器时这段无需改。
 *
 * 竞态防护：每次 run 递增 runId，旧 run 的回调用它做闸门；新 run 先 stop 上一轮。
 * 生命周期由调用方（OneClickFlyModal）在同一个 effect 里 run + cleanup stop 管理——
 * 这对 React StrictMode 的 setup→cleanup→setup 也安全（cleanup 停掉的那轮会被新 setup 重开）。
 *
 * 职责边界（与 /simulator 工作台划清）：本 hook 只做「跑当前项目绑定的程序、产出
 * RunResult + 实时遥测」的轻量只读运行；调试 / 重置 / HUD / 回放 / 赛道属于 SimulatorPage。
 */
import { useCallback, useRef, useState } from 'react'
import type { DroneAdapter, CommandProgram, Command, Telemetry, RunResult } from '@fwx/shared'
import { SimAdapter } from '../../../simulator/SimAdapter'
import { beginSimulationObservation } from '../../../utils/productEvents'

export interface ProjectFlightState {
  running: boolean
  telemetry: Telemetry | null
  trail: [number, number, number][]
  ledColor: [number, number, number]
  result: RunResult | null
  currentCmdIndex: number
}

const IDLE: ProjectFlightState = {
  running: false,
  telemetry: null,
  trail: [],
  ledColor: [0, 0, 0],
  result: null,
  currentCmdIndex: -1,
}

export function useProjectFlight() {
  // 红线：按接口类型持有，调用面被收窄到 DroneAdapter 合约。
  const adapterRef = useRef<DroneAdapter | null>(null)
  // 每次 run 递增的 token：旧 run 的回调用它做闸门，避免快速开关 / 重跑 / StrictMode 双调用时回写到新一轮。
  const runIdRef = useRef(0)
  const [state, setState] = useState<ProjectFlightState>(IDLE)
  const finishObservation = useRef<ReturnType<typeof beginSimulationObservation> | null>(null)

  const run = useCallback(async (program: CommandProgram) => {
    finishObservation.current?.('stopped')
    adapterRef.current?.stop() // 先停掉上一轮，避免两个 adapter 并行回写
    const myRun = ++runIdRef.current
    const live = () => runIdRef.current === myRun // 仅当仍是当前 run 时才回写状态

    const adapter: DroneAdapter = new SimAdapter({ speed: 1, tickMs: 50 })
    adapterRef.current = adapter
    setState({ ...IDLE, running: true })
    const finishRun = beginSimulationObservation()
    finishObservation.current = finishRun

    await adapter.execute(program, {
      onCommandStart: (index: number, cmd: Command) => {
        if (!live()) return
        setState((s) => ({
          ...s,
          currentCmdIndex: index,
          // LED 只从 IR 指令读取（合约内），不读适配器内部状态
          ledColor: cmd.type === 'led' ? [cmd.params.r, cmd.params.g, cmd.params.b] : s.ledColor,
        }))
      },
      onTelemetry: (t: Telemetry) => {
        if (!live()) return
        setState((s) => ({
          ...s,
          telemetry: { ...t },
          trail: [...s.trail, [...t.posCm] as [number, number, number]],
        }))
      },
      onFinish: (r: RunResult) => {
        if (!live()) return
        finishRun(r.success ? 'success' : 'error')
        setState((s) => ({ ...s, result: r, running: false }))
      },
    }).catch(error => { finishRun('error'); throw error })
  }, [])

  const stop = useCallback(() => {
    finishObservation.current?.('stopped')
    adapterRef.current?.stop()
    runIdRef.current++ // 作废当前 run 的后续回调（含卸载时）
    setState((s) => ({ ...s, running: false }))
  }, [])

  const reset = useCallback(() => {
    finishObservation.current?.('stopped')
    adapterRef.current?.stop()
    runIdRef.current++
    setState(IDLE)
  }, [])

  return { ...state, run, stop, reset }
}
