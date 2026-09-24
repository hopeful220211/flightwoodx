// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StepGuide } from './StepGuide'
import { StepPartPanel } from './StepPartPanel'
import { StepActions } from './StepActions'
import { ReviewStep } from './steps/ReviewStep'
import { flightReadiness } from '../../../utils/flightReadiness'
import type { PartInstance } from '../../../types/design'

const state = vi.hoisted(() => ({ parts: [] as PartInstance[] }))
vi.mock('../../../stores/designStore', () => ({ useDesignStore: (selector: (store: unknown) => unknown) => selector({ getActiveDesign: () => state }) }))
beforeEach(() => {
  state.parts = [{ instanceId: 'hub', partId: 'core_hub_01', category: 'mainboard', position: [0, 0, 0], rotation: [0, 0, 0] }]
})

describe('assembly review copy', () => {
  it('gives the review action without repeating flight disclaimers', () => {
    const guide = renderToStaticMarkup(<StepGuide currentStep="REVIEW" canAdvance />)
    const panel = renderToStaticMarkup(<MemoryRouter><StepPartPanel currentStep="REVIEW" onPartClick={() => {}} onPartDragStart={() => {}} /></MemoryRouter>)
    for (const html of [guide, panel]) {
      expect(html).toContain('核对')
      expect(html).not.toMatch(/不验证|不代表|实物结构|真实飞行/)
    }
  })

  it('shows the primary correction once and uses neutral text for missing statistics', () => {
    const html = renderToStaticMarkup(<ReviewStep />)
    const primaryFix = flightReadiness(state.parts as PartInstance[]).primaryFix!
    expect(html).toContain('装配检查')
    expect(primaryFix).toBeTruthy()
    expect(html.split(primaryFix)).toHaveLength(2)
    expect(html).not.toMatch(/检查条件未满足|需要处理的问题|仅目录估算，非/)
    expect(html).toContain('暂无动力数据')
    expect(html).toContain('暂无续航数据')
  })

  it('omits the hardware-evidence reminder without changing the assessment or completion state', () => {
    const hub = state.parts[0]!
    state.parts = [hub, ...Array.from({ length: 4 }, (_, index): PartInstance => ({
      instanceId: `arm-${index}`, partId: 'landing_01', category: 'landing', position: [0, 0, 0], rotation: [0, 0, 0],
      attachedTo: { parentInstanceId: hub.instanceId, parentConnectorId: `socket-${index}` },
    }))]
    const before = flightReadiness(state.parts)
    expect(before.issues.map(issue => issue.code)).toEqual(['EVIDENCE_MISSING'])
    expect(before.canTakeoff).toBe(false)
    const html = renderToStaticMarkup(<ReviewStep />)
    expect(html).not.toContain(before.issues[0]!.message)
    expect(html).toContain('装配检查')
    expect(html).toContain(`已通过 ${before.passedCount}/${before.totalChecks} 项检查`)
    expect(html).not.toContain('检查通过')
    expect(html).toContain('暂无动力数据')
    expect(flightReadiness(state.parts)).toEqual(before)
  })

  it('offers only review and coding actions with matching size and shape', () => {
    const html = renderToStaticMarkup(<StepActions currentStep="REVIEW" canAdvance onAdvance={() => {}} onGoBack={() => {}} onReset={() => {}} onReview={() => {}} onContinueCoding={() => {}} />)
    const controls = new DOMParser().parseFromString(html, 'text/html').querySelectorAll('button[data-review-action]')
    expect(controls).toHaveLength(2)
    expect([...controls].map(control => control.textContent?.trim())).toEqual(['检查结构', '继续积木编程'])
    expect(controls[0]?.getAttribute('data-size')).toBe(controls[1]?.getAttribute('data-size'))
    expect(controls[0]?.classList.contains('rounded-md')).toBe(true)
    expect(controls[1]?.classList.contains('rounded-md')).toBe(true)
    expect(controls[0]?.getAttribute('data-variant')).not.toBe(controls[1]?.getAttribute('data-variant'))
    expect(html).not.toMatch(/订购零件|保存草稿|导出清单|已通过 0\/4|检查通过/)
  })
})
