import { describe, expect, it } from 'vitest'
import { canAddPart } from './compatibility'
import { PART_REGISTRY, STEP_INFO } from './registry'

describe('assembly guidance wording', () => {
  it('names actions and keeps quantity rules explicit', () => {
    const mainboard = PART_REGISTRY.find(part => part.category === 'mainboard')!
    const landing = PART_REGISTRY.find(part => part.category === 'landing')!
    expect(canAddPart(landing, { currentStep: 'ARM', parts: [] }).message).toBe('请先添加主板，再安装其他零件。')
    expect(canAddPart(mainboard, { currentStep: 'ARM', parts: [{ partNumber: mainboard.partNumber, category: 'mainboard' }] }).message).toBe('此零件不属于当前步骤，请切换到对应步骤。')
    expect(canAddPart(mainboard, { currentStep: 'HUB', parts: Array.from({ length: 2 }, () => ({ partNumber: mainboard.partNumber, category: 'mainboard' as const })) }).message).toBe('主板数量已达上限：2 块。')
    expect(STEP_INFO.HUB.description).toBe('选择主板，作为其他零件的连接基础')
    expect(STEP_INFO.REVIEW.description).toBe('核对已装零件、连接和位置对称性')
  })
})
