// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { CodingPage } from './CodingPage'
import { useProgramStore } from '../../stores/programStore'

const mocks = vi.hoisted(() => ({ track: vi.fn(), toast: { push: vi.fn() }, xml: '<xml/>', listener: undefined as undefined | ((event: { isUiEvent?: boolean }) => void), compile: vi.fn() }))
vi.mock('../../features/analytics/client', () => ({ trackEvent: mocks.track }))
vi.mock('../../components/common/Toast', () => ({ useToast: () => mocks.toast }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ token: null, user: { id: 'guest', isGuest: true } }) }))
vi.mock('../../utils/designProgram', () => ({ loadDesignProgram: vi.fn(), saveDesignProgram: vi.fn() }))
vi.mock('../../blockly/blocklyTheme', () => ({ DRONE_THEME: {}, DRONE_TOOLBOX: {}, applyCategoryIcons: vi.fn() }))
vi.mock('../../blockly/compiler', () => ({ compileWorkspace: mocks.compile }))
vi.mock('../../blockly/restoreWorkspaceXml', () => ({ restoreWorkspaceXml: () => true }))
vi.mock('./components/FlightPlanPanel', () => ({ FlightPlanPanel: () => null }))
vi.mock('./components/EmptyCanvasGuide', () => ({ EmptyCanvasGuide: () => null }))
vi.mock('blockly/blocks', () => ({}))
vi.mock('blockly', () => ({
  config: {}, svgResize: vi.fn(),
  Xml: { workspaceToDom: () => mocks.xml, domToText: (xml: string) => xml },
  inject: () => ({ getTopBlocks: () => [], addChangeListener: (listener: typeof mocks.listener) => { mocks.listener = listener }, removeChangeListener: vi.fn(), dispose: vi.fn() }),
}))
let root: Root
let container: HTMLDivElement
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  mocks.track.mockClear(); mocks.xml = '<xml/>'
  mocks.compile.mockReturnValue({ version: '1.0', metadata: { name: 'Private child program', author: 'private', createdAt: '' }, commands: [{ type: 'takeoff' }] })
  useProgramStore.setState({ draftsByDesignId: {} })
  container = document.createElement('div'); root = createRoot(container)
  await act(async () => root.render(<MemoryRouter initialEntries={['/code/design-a']}><Routes><Route path="/code/:id" element={<CodingPage />} /></Routes></MemoryRouter>))
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals() })

it('records only actual Blockly content edits, not mount, UI events or unchanged XML', async () => {
  expect(mocks.track).not.toHaveBeenCalled()
  await act(async () => mocks.listener?.({ isUiEvent: true }))
  expect(mocks.track).not.toHaveBeenCalled()
  mocks.xml = '<xml><private-child-content/></xml>'
  await act(async () => mocks.listener?.({}))
  expect(mocks.track).toHaveBeenCalledWith('program_edited', { designId: 'design-a' }, { onceKey: 'program-edit:design-a' })
  expect(mocks.track).toHaveBeenCalledWith('design_edit_started', { designId: 'design-a', area: 'program' }, { onceKey: 'edit:program:design-a' })
  const count = mocks.track.mock.calls.length
  await act(async () => mocks.listener?.({}))
  expect(mocks.track).toHaveBeenCalledTimes(count)
  expect(JSON.stringify(mocks.track.mock.calls)).not.toContain('private-child-content')
})

it('records local program binding only after an explicit successful save', async () => {
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '保存')!.click())
  expect(mocks.track).toHaveBeenCalledExactlyOnceWith('program_bound', { designId: 'design-a', destination: 'local' })
  expect(useProgramStore.getState().getDraft('design-a')?.blocklyXml).toBe(mocks.xml)
})
