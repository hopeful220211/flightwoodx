import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Pencil } from 'lucide-react'
import { useDesignStore } from '../../stores/designStore'
import { useToast } from '../../components/common/Toast'
import { useDesignSync } from '../../hooks/useDesignSync'
import { ThreeCanvas } from '../../components/design/ThreeCanvas'
import { StepProgressBar } from './components/StepProgressBar'
import { StepPartPanel } from './components/StepPartPanel'
import { StepGuide } from './components/StepGuide'
import { StepActions } from './components/StepActions'
import { WeightBar } from './components/WeightBar'
import { ViolationBubble } from './components/ViolationBubble'
import { AutoSaveIndicator } from './components/AutoSaveIndicator'
import { checkBeforeAdd, checkDualMainboard } from '../../utils/realtimeChecks'
import type { Violation } from '../../utils/realtimeChecks'
import { ReviewStep } from './components/steps/ReviewStep'
import { flightReadiness } from '../../utils/flightReadiness'
import type { Part, PartInstance } from '../../types/design'

export function GuidedDesignPage() {
  const navigate = useNavigate()
  const activeDesign = useDesignStore(s => s.getActiveDesign())
  const advanceStep = useDesignStore(s => s.advanceStep)
  const goBackStep = useDesignStore(s => s.goBackStep)
  const goToStep = useDesignStore(s => s.goToStep)
  const canAdvanceCheck = useDesignStore(s => s.canAdvance)
  const getStepAdvanceReason = useDesignStore(s => s.getStepAdvanceReason)
  const resetCurrentStep = useDesignStore(s => s.resetCurrentStep)
  const addPartSmart = useDesignStore(s => s.addPartSmart)
  const setDraggingPartId = useDesignStore(s => s.setDraggingPartId)
  const toast = useToast()
  const { saveToServer, saveNow, saveStatus } = useDesignSync()
  const [violation, setViolation] = useState<Violation | null>(null)
  const [pendingPartId, setPendingPartId] = useState<string | null>(null)
  // 就地改名：null = 不在编辑；字符串 = 正在编辑的草稿
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  // 记录通过完整证据检查时的设计快照。改动设计（parts 引用变化）后快照即失效，
  // flightPassed 在渲染期自然推导回 false，无需用 effect 重置。
  const [passedSnapshot, setPassedSnapshot] = useState<PartInstance[] | null>(null)

  const currentStep = activeDesign?.currentStep ?? 'HUB'
  const stepReached = activeDesign?.stepReached ?? 0
  const canAdvance = canAdvanceCheck()
  const advanceReason = getStepAdvanceReason()
  const parts = activeDesign?.parts
  const flightPassed = passedSnapshot !== null && passedSnapshot === parts

  // 自动保存：设计内容一改动（updatedAt 变化），就走 useDesignSync 的防抖保存。
  // 用 ref 持有最新的 saveToServer（在 effect 里同步，不在渲染期写 ref），这样“内容变化”的
  // effect 只依赖 designId/updatedAt，不会因 saveToServer 身份每次渲染都变而被反复触发。
  const saveRef = useRef(saveToServer)
  useEffect(() => {
    saveRef.current = saveToServer
  })
  const designId = activeDesign?.id
  const updatedAt = activeDesign?.updatedAt
  useEffect(() => {
    const d = useDesignStore.getState().getActiveDesign()
    if (d) saveRef.current(d)
  }, [designId, updatedAt])

  // 就地改名：留空记为「未命名无人机」。updatedAt 一变，上面的自动保存就把改名存下来。
  const startRename = useCallback(() => {
    setNameDraft(activeDesign?.name ?? '')
  }, [activeDesign?.name])

  const commitRename = useCallback(() => {
    const current = useDesignStore.getState().getActiveDesign()
    setNameDraft(null)
    if (nameDraft === null || !current) return
    const next = nameDraft.trim() || '未命名无人机'
    if (next !== current.name) {
      useDesignStore.setState((state) => ({
        designs: state.designs.map((d) =>
          d.id === current.id ? { ...d, name: next, updatedAt: new Date().toISOString() } : d,
        ),
      }))
    }
  }, [nameDraft])

  const handlePartClick = useCallback(async (part: Part) => {
    if (!activeDesign || pendingPartId) return

    // Real-time validation before adding
    const v = checkBeforeAdd(part.category, part.id, activeDesign.parts)
    if (v) {
      setViolation({ ...v }) // new ref to re-trigger bubble
      return
    }

    setPendingPartId(part.id)
    let added = false
    try {
      added = await addPartSmart(part.id)
    } catch {
      toast.push('error', '零件加载失败，请检查网络后重试')
      return
    } finally {
      setPendingPartId(null)
    }
    if (!added) {
      toast.push('error', '未找到可用连接点，零件未添加')
      return
    }

    // Post-add check: dual mainboard geometry
    const updatedDesign = useDesignStore.getState().getActiveDesign()
    if (updatedDesign) {
      const dualCheck = checkDualMainboard(updatedDesign.parts)
      if (dualCheck) {
        setViolation({ ...dualCheck })
      }
      // 同步到后端由「内容改动 → 自动保存」的 effect 统一负责，这里不再单独触发
    }

    toast.push('success', `已添加 ${part.name}`)
  }, [addPartSmart, toast, activeDesign, pendingPartId])

  const handlePartDragStart = useCallback((partId: string) => {
    setDraggingPartId(partId)
  }, [setDraggingPartId])

  const handleAdvance = useCallback(() => {
    const success = advanceStep()
    if (!success && advanceReason) {
      toast.push('error', advanceReason)
    }
  }, [advanceStep, advanceReason, toast])

  const handleGoBack = useCallback(() => {
    goBackStep()
  }, [goBackStep])

  const handleReset = useCallback(() => {
    resetCurrentStep()
    toast.push('info', '已重置当前步骤')
  }, [resetCurrentStep, toast])

  const handleSave = useCallback(async () => {
    if (!activeDesign) return
    const saved = await saveNow(activeDesign)
    toast.push(saved ? 'success' : 'error', saved ? '已保存' : '账号同步失败，本机草稿仍保留')
  }, [toast, activeDesign, saveNow])

  const handleSaveAndExport = useCallback(async () => {
    if (!activeDesign) return
    navigate(`/design/export-preview/${activeDesign.id}`)
  }, [activeDesign, navigate])

  // 结构与证据检查——只读 flightReadiness，不在页面重算规则。
  const handleRunFlightTest = useCallback(() => {
    if (!activeDesign) return
    const r = flightReadiness(activeDesign.parts)
    if (r.canTakeoff) {
      setPassedSnapshot(activeDesign.parts)
      toast.push('success', '已通过全部已验证条件')
    } else {
      setPassedSnapshot(null)
      toast.push('error', r.primaryFix ?? '检查条件未满足，请查看检查结果')
    }
  }, [activeDesign, toast])

  if (!activeDesign) return null

  const isReviewStep = currentStep === 'REVIEW'
  const readiness = isReviewStep ? flightReadiness(activeDesign.parts) : null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50">
      <div className="shrink-0">
        {/* 顶部栏：左边是当前无人机名（可点改名）+ 浅色「已自动保存」，右边是自动保存状态 */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-white border-b border-gray-100">
          <div className="min-w-0">
            {nameDraft !== null ? (
              <input
                autoFocus
                type="text"
                value={nameDraft}
                maxLength={40}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) commitRename()
                  if (e.key === 'Escape') setNameDraft(null)
                }}
                placeholder="未命名无人机"
                aria-label="无人机名字"
                className="w-56 max-w-full rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-sm font-semibold text-sky-900 outline-none focus:border-accent-spark focus:ring-2 focus:ring-accent-spark/30"
              />
            ) : (
              <button
                type="button"
                onClick={startRename}
                title="点一下改名字"
                className="group inline-flex max-w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition hover:bg-sky-50"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-ink-900">
                  {activeDesign.name?.trim() || '未命名无人机'}
                </span>
                <Pencil size={13} className="shrink-0 text-ink-300 transition group-hover:text-sky-500" />
              </button>
            )}
            <div className="px-1 text-xs text-ink-400">自动保存</div>
          </div>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <StepProgressBar currentStep={currentStep} stepReached={stepReached} onStepClick={goToStep} />
        <WeightBar />
      </div>

      <ViolationBubble violation={violation} />

      <>
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto md:overflow-hidden">
            <aside className={`${isReviewStep ? 'hidden md:flex' : 'flex'} order-2 md:order-none w-full md:w-64 shrink-0 bg-white border-t md:border-t-0 md:border-r border-gray-100 flex-col min-h-0 h-[34vh] md:h-auto`}>
              <div className="flex-1 overflow-y-auto">
                <StepPartPanel
                  currentStep={currentStep}
                  onPartClick={handlePartClick}
                  onPartDragStart={handlePartDragStart}
                  pendingPartId={pendingPartId}
                />
              </div>
            </aside>

            <main className="order-1 md:order-none relative min-h-0 min-w-0 h-[42vh] shrink-0 md:h-auto md:flex-1">
              <ThreeCanvas />
            </main>

            <aside
              className={`${
                isReviewStep ? 'flex flex-col w-full md:w-80' : 'hidden md:block md:w-56'
              } order-3 md:order-none shrink-0 bg-white border-t md:border-t-0 md:border-l border-gray-100 overflow-y-auto max-h-[42vh] md:max-h-none`}
            >
              {isReviewStep ? (
                <ReviewStep />
              ) : (
                <StepGuide
                  currentStep={currentStep}
                  canAdvance={canAdvance}
                  advanceReason={advanceReason}
                />
              )}
            </aside>
          </div>

          <div className="shrink-0">
            <StepActions
              currentStep={currentStep}
              canAdvance={canAdvance}
              onAdvance={handleAdvance}
              onGoBack={handleGoBack}
              onReset={handleReset}
              onSave={handleSave}
              onExportList={handleSaveAndExport}
              onContinueCoding={() => navigate(`/code/${activeDesign.id}`)}
              onRunFlightTest={handleRunFlightTest}
              flightPassed={flightPassed}
              flightSummary={
                readiness
                  ? {
                      passedCount: readiness.passedCount,
                      totalChecks: readiness.totalChecks,
                      canTakeoff: readiness.canTakeoff,
                      primaryFix: readiness.primaryFix,
                    }
                  : undefined
              }
            />
          </div>
        </>
    </div>
  )
}
