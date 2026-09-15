import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import { BUILD_STEPS } from '@fwx/parts-schema'
import { useDesignStore } from '../../stores/designStore'
import { useDesignSync } from '../../hooks/useDesignSync'
import { DesignPage } from './DesignPage'
import { GuidedDesignPage } from './GuidedDesignPage'
import { WelcomeEmptyState } from './components/WelcomeEmptyState'
import { DesignListModal } from './components/DesignListModal'
import { NameDroneDialog } from './components/NameDroneDialog'
import { getAnalyticsClient, trackEvent } from '../../features/analytics/client'

/**
 * Routes between Welcome / Guided / Free modes based on state.
 * - No active design + no history → Welcome
 * - No active design + 1 unfinished design → auto-resume
 * - No active design + multiple designs → Welcome with "view history"
 * - Active guided design → GuidedDesignPage
 * - Active free design → DesignPage (legacy)
 */
export function DesignPageRouter() {
  const designs = useDesignStore(s => s.designs)
  const activeDesignId = useDesignStore(s => s.activeDesignId)
  const activeDesign = useDesignStore(s => s.getActiveDesign())
  const createDesign = useDesignStore(s => s.createDesign)
  const setActiveDesignId = useDesignStore(s => s.setActiveDesignId)
  const { loadFromServer } = useDesignSync()
  const navigate = useNavigate()
  const [showHistory, setShowHistory] = useState(false)
  const [showNaming, setShowNaming] = useState(false)
  const autoResumedRef = useRef(false)
  const analytics = getAnalyticsClient()
  const { decision } = useSyncExternalStore(analytics.subscribe, analytics.getSnapshot, analytics.getSnapshot)

  useEffect(() => {
    // Consent may restore after the design loads. Observe only the currently
    // visible work; never replay earlier navigation or unconsented edits.
    if (decision === 'granted' && activeDesign?.id) trackEvent('design_opened', { designId: activeDesign.id }, { onceKey: `open:${activeDesign.id}` })
  }, [activeDesign?.id, decision])

  // 进入设计页：从账号拉回设计合并进本地（跨设备/新设备还原）。
  // 仅认领数据，自动新建空设计要用户点击，不会和这里抢跑。
  useEffect(() => {
    loadFromServer()
  }, [loadFromServer])

  // Auto-resume: if user has exactly 1 unfinished design and no active selection, resume it
  useEffect(() => {
    if (activeDesignId || autoResumedRef.current) return
    const unfinished = designs.filter(d => {
      const mode = d.buildMode ?? 'free'
      if (mode === 'free') return false
      // 未完成 = 还没到达最后一步（结构检查）。跟着 BUILD_STEPS 走，删/增步骤都不用改这里。
      return (d.stepReached ?? 0) < BUILD_STEPS.length - 1
    })
    if (unfinished.length === 1) {
      autoResumedRef.current = true
      setActiveDesignId(unfinished[0].id)
    }
  }, [activeDesignId, designs, setActiveDesignId])

  // No active design — show welcome or history
  if (!activeDesign) {
    // 新建第一步：先弹窗起名字，确认后再进设计（留空记为「未命名无人机」）
    const handleCreateNamed = (name: string, mode: 'guided' | 'free') => {
      const id = createDesign(name || '未命名无人机', mode)
      setActiveDesignId(id)
      setShowNaming(false)
      navigate(`/design/${id}`)
    }

    return (
      <>
        <WelcomeEmptyState
          onStartNew={() => setShowNaming(true)}
          onViewHistory={designs.length > 0 ? () => setShowHistory(true) : undefined}
          historyCount={designs.length}
        />
        <NameDroneDialog
          open={showNaming}
          onConfirm={handleCreateNamed}
          onCancel={() => setShowNaming(false)}
        />
        {showHistory && (
          <DesignListModal
            designs={designs}
            onSelect={(id) => {
              setActiveDesignId(id)
              setShowHistory(false)
              navigate(`/design/${id}`)
            }}
            onClose={() => setShowHistory(false)}
          />
        )}
      </>
    )
  }

  // Guided mode
  if (activeDesign.buildMode === 'guided') {
    return <GuidedDesignPage />
  }

  // Free mode (legacy designs)
  return <DesignPage />
}
