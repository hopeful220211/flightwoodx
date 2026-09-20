/**
 * OneClickFlyModal — 枢纽页「一键试飞」的内联弹窗（C1 / M5）。
 *
 * 打开即自动把项目绑定的程序经 DroneAdapter 跑一遍（见 useProjectFlight），
 * 用 FlightScene 实时可视化，并展示 RunResult（成功/中止 + 事件日志）。
 *
 * 边界：这是「快速验证当前项目程序」的只读运行；完整调试 / HUD / 回放 / 赛道在 /simulator 工作台。
 */
import { useEffect } from 'react'
import { Pause, RotateCcw, CheckCircle2, AlertCircle, Activity } from 'lucide-react'
import type { CommandProgram } from '@fwx/shared'
import { Modal } from '../../common/Modal'
import { Button } from '../../common/Button'
import { FlightScene } from '../../../simulator/FlightScene'
import { useProjectFlight } from './useProjectFlight'

interface OneClickFlyModalProps {
  open: boolean
  onClose: () => void
  program: CommandProgram | null
  programName?: string
}

export function OneClickFlyModal({ open, onClose, program, programName }: OneClickFlyModalProps) {
  const { running, telemetry, trail, ledColor, result, currentCmdIndex, run, stop } = useProjectFlight()

  // 打开即自动试飞；关闭 / 卸载由本 effect 的 cleanup 统一停掉飞行。
  // run 与 stop 在同一个 effect 里成对出现——这对 StrictMode 的 setup→cleanup→setup 也安全
  // （被 cleanup 停掉的那一轮会被随后的 setup 重新开起来，不会卡死）。
  useEffect(() => {
    if (!open || !program) return
    run(program)
    return () => {
      stop()
    }
  }, [open, program, run, stop])

  const handleClose = () => {
    onClose() // open→false 触发上面 effect 的 cleanup 停止飞行
  }

  return (
    <Modal open={open} onClose={handleClose} title={`运行模拟${programName ? ` · ${programName}` : ''}`}>
      <div className="space-y-3">
        {/* 3D 飞行场景 */}
        <div className="relative h-72 overflow-hidden rounded-lg ring-1 ring-sky-100">
          <FlightScene telemetry={telemetry} trail={trail} ledColor={ledColor} />

          {telemetry && (
            <div className="absolute left-3 top-3 rounded-md bg-white/85 px-2.5 py-1 text-xs font-mono text-sky-700 backdrop-blur">
              <span className="inline-flex items-center gap-1">
                <Activity size={11} className="text-sky-400" />
                X{telemetry.posCm[0].toFixed(0)} Y{telemetry.posCm[1].toFixed(0)} Z{telemetry.posCm[2].toFixed(0)}
              </span>
              {currentCmdIndex >= 0 && <span className="ml-2 text-sky-500">指令 #{currentCmdIndex + 1}</span>}
            </div>
          )}

          {result && (
            <div
              className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                result.success ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
              }`}
            >
              {result.success ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
              {result.success ? '模拟完成' : '模拟中止'}
            </div>
          )}
        </div>

        {/* 控制条 */}
        <div className="flex items-center gap-2">
          {running ? (
            <Button size="sm" variant="outline" onClick={stop} leftIcon={<Pause size={14} />}>
              停止
            </Button>
          ) : (
            <Button size="sm" onClick={() => program && run(program)} leftIcon={<RotateCcw size={14} />}>
              {result ? '再次运行' : '开始运行'}
            </Button>
          )}
          <span className="text-xs text-sky-500">
            {running ? '模拟运行中…' : result ? `共 ${result.events.length} 条运行记录` : '准备就绪'}
          </span>
        </div>

        {/* RunResult 事件日志 */}
        {result && result.events.length > 0 && (
          <div className="max-h-32 overflow-auto rounded-lg bg-sky-50/70 p-3">
            <ul className="space-y-0.5">
              {result.events.map((evt, i) => (
                <li key={i} className="font-mono text-xs text-sky-600">
                  {evt}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
