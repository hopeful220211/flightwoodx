// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { useDesignStore } from './designStore'
import { partsData } from '../data/parts'

const tracked = vi.hoisted(() => vi.fn())
vi.mock('../features/analytics/client', () => ({ trackEvent: tracked }))

beforeEach(() => {
  localStorage.clear()
  useDesignStore.setState({ designs: [], activeDesignId: null, deletedIds: [] })
  tracked.mockClear()
})

it('records an explicit empty draft separately from its first real assembly edit', () => {
  const store = useDesignStore.getState()
  const id = store.createDesign('Private student work', 'free')
  expect(tracked).toHaveBeenCalledWith('design_created', { designId: id, origin: 'explicit', mode: 'free' })
  expect(tracked).not.toHaveBeenCalledWith('design_edit_started', expect.anything(), expect.anything())
  store.setActiveDesignId(id)
  const hub = partsData.find(part => part.category === 'mainboard')!
  expect(store.addPartToActiveDesign({ partId: hub.id, category: hub.category, position: [0, 0, 0], rotation: [0, 0, 0] })).toBe(true)
  expect(tracked).toHaveBeenCalledWith('assembly_part_added', { designId: id, source: 'official', mode: 'free' })
  expect(tracked).toHaveBeenCalledWith('design_edit_started', { designId: id, area: 'assembly' }, { onceKey: `edit:assembly:${id}` })
  expect(JSON.stringify(tracked.mock.calls)).not.toContain('Private student work')
})

it('does not count a rejected part or a restored draft as creation or editing', () => {
  const store = useDesignStore.getState()
  expect(store.addPartToActiveDesign({ partId: 'missing', category: 'mainboard', position: [0, 0, 0], rotation: [0, 0, 0] })).toBe(false)
  store.importServerDesigns([{ schemaVersion: 1, id: 'restored', name: 'private', buildMode: 'free', parts: [], currentStep: 'HUB', stepReached: 0, updatedAt: new Date().toISOString() }])
  expect(tracked).not.toHaveBeenCalled()
})

it('distinguishes automatically created draft and tracks actual content edits without coordinates', () => {
  const store = useDesignStore.getState()
  // The optional origin identifies the editor bootstrap, not a user's New action.
  const id = store.createDesign('Auto', 'free', 'automatic')
  expect(tracked).toHaveBeenCalledWith('design_created', { designId: id, origin: 'automatic', mode: 'free' })
  store.setActiveDesignId(id)
  const hub = partsData.find(part => part.category === 'mainboard')!
  store.addPartToActiveDesign({ partId: hub.id, category: hub.category, position: [0, 0, 0], rotation: [0, 0, 0] })
  tracked.mockClear()
  const instance = store.getActiveDesign()!.parts[0]!
  store.updatePartInActiveDesign(instance.instanceId, { position: [0.03, 0, 0] })
  expect(tracked).toHaveBeenCalledWith('design_edit_started', { designId: id, area: 'assembly' }, { onceKey: `edit:assembly:${id}` })
  expect(JSON.stringify(tracked.mock.calls)).not.toContain('position')
})
