import type { CommandProgram } from '@fwx/shared'
import { createProgram, getDroneDesigns, getProgram, updateDroneDesign, updateProgram } from './api'
import { trackEvent } from '../features/analytics/client'

/** Resolve the binding every time; a browser's cached Program id is not the design's authority. */
export async function loadDesignProgram(designId: string) {
  const designs = await getDroneDesigns()
  if (!designs.success || !designs.data) throw new Error(designs.error || '作品加载失败')
  const design = designs.data.find(value => value.localId === designId || value.id === designId)
  if (!design) throw new Error('作品尚未保存到账号，请先返回拼装页保存作品')
  if (!design.programId) return { design, program: null }
  const response = await getProgram(design.programId)
  if (!response.success || !response.data) throw new Error(response.error || '程序加载失败')
  return { design, program: response.data }
}

export async function saveDesignProgram(input: {
  designId: string
  pendingProgramId: string | null
  name: string
  blocklyXml: string
  commandProgram: CommandProgram
  onProgramSaved: (programId: string) => void
  sessionIsCurrent?: () => boolean
}) {
  const assertSession = () => {
    if (input.sessionIsCurrent && !input.sessionIsCurrent()) throw new Error('登录状态已改变，请重新打开作品后保存')
  }
  assertSession()
  const designs = await getDroneDesigns()
  assertSession()
  if (!designs.success || !designs.data) throw new Error(designs.error || '作品加载失败')
  const design = designs.data.find(value => value.localId === input.designId || value.id === input.designId)
  if (!design) throw new Error('作品尚未保存到账号，请先返回拼装页保存作品')
  const programId = design.programId || input.pendingProgramId
  const payload = { name: input.name, blocklyXml: input.blocklyXml, commandProgram: input.commandProgram }
  let saved = programId ? await updateProgram(programId, payload) : await createProgram(payload)
  assertSession()
  // Only a definite missing record can be recreated. Network/auth/validation errors must remain errors.
  if (programId && !saved.success && saved.status === 404) saved = await createProgram(payload)
  assertSession()
  if (!saved.success || !saved.data) throw new Error(saved.error || '程序保存失败')
  input.onProgramSaved(saved.data.id)
  const binding = await updateDroneDesign(design.id, { programId: saved.data.id })
  assertSession()
  if (!binding.success) throw new Error(binding.error || '程序与作品绑定失败')
  trackEvent('program_bound', { designId: input.designId, programId: saved.data.id, destination: 'account' })
  return saved.data
}
