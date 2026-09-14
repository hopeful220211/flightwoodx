import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandProgram } from '@fwx/shared'
import { createProgram, getDroneDesigns, updateDroneDesign, updateProgram } from './api'
import { saveDesignProgram } from './designProgram'

const tracked = vi.hoisted(() => vi.fn())
vi.mock('../features/analytics/client', () => ({ trackEvent: tracked }))

vi.mock('./api', () => ({
  createProgram: vi.fn(), getDroneDesigns: vi.fn(), getProgram: vi.fn(),
  updateDroneDesign: vi.fn(), updateProgram: vi.fn(),
}))

const program: CommandProgram = {
  version: '1.0', metadata: { name: 'Test', author: 'Test', createdAt: '2026-09-07T00:00:00Z' }, commands: [],
}
const input = {
  designId: 'local-a', pendingProgramId: 'stale-program', name: 'Test', blocklyXml: '<xml />',
  commandProgram: program, onProgramSaved: vi.fn(),
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getDroneDesigns).mockResolvedValue({ success: true, data: [
    { id: 'server-a', localId: 'local-a', programId: 'bound-a' } as never,
    { id: 'server-b', localId: 'local-b', programId: 'bound-b' } as never,
  ] })
})

describe('design program persistence', () => {
  it('updates only the current design binding instead of a stale local Program id', async () => {
    vi.mocked(updateProgram).mockResolvedValue({ success: true, data: { id: 'bound-a' } as never })
    vi.mocked(updateDroneDesign).mockResolvedValue({ success: true })
    await saveDesignProgram(input)
    expect(updateProgram).toHaveBeenCalledWith('bound-a', expect.anything())
    expect(updateDroneDesign).toHaveBeenCalledWith('server-a', { programId: 'bound-a' })
    expect(createProgram).not.toHaveBeenCalled()
    expect(tracked).toHaveBeenCalledWith('program_bound', { designId: 'local-a', programId: 'bound-a', destination: 'account' })
  })

  it('does not create another program after a failed update', async () => {
    vi.mocked(updateProgram).mockResolvedValue({ success: false, error: '连接失败', status: 503 })
    await expect(saveDesignProgram(input)).rejects.toThrow('连接失败')
    expect(createProgram).not.toHaveBeenCalled()
    expect(updateDroneDesign).not.toHaveBeenCalled()
  })

  it('reports failed binding while preserving the created id for a retry', async () => {
    vi.mocked(updateProgram).mockResolvedValue({ success: true, data: { id: 'bound-a' } as never })
    vi.mocked(updateDroneDesign).mockResolvedValue({ success: false, error: '绑定失败' })
    await expect(saveDesignProgram(input)).rejects.toThrow('绑定失败')
    expect(input.onProgramSaved).toHaveBeenCalledWith('bound-a')
    expect(tracked).not.toHaveBeenCalledWith('program_bound', expect.anything())
  })

  it('recreates only after a definite 404', async () => {
    vi.mocked(updateProgram).mockResolvedValue({ success: false, status: 404 })
    vi.mocked(createProgram).mockResolvedValue({ success: true, data: { id: 'replacement' } as never })
    vi.mocked(updateDroneDesign).mockResolvedValue({ success: true })
    await saveDesignProgram(input)
    expect(createProgram).toHaveBeenCalledTimes(1)
    expect(updateDroneDesign).toHaveBeenCalledWith('server-a', { programId: 'replacement' })
  })

  it('does not update or bind a program after the account changes during loading', async () => {
    let current = true
    vi.mocked(getDroneDesigns).mockImplementation(async () => {
      current = false
      return { success: true, data: [{ id: 'server-a', localId: 'local-a', programId: 'bound-a' } as never] }
    })
    await expect(saveDesignProgram({ ...input, sessionIsCurrent: () => current })).rejects.toThrow('登录状态已改变')
    expect(updateProgram).not.toHaveBeenCalled()
    expect(updateDroneDesign).not.toHaveBeenCalled()
  })
})
