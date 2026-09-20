// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { partsData } from '../data/parts'
import { useDesignStore } from './designStore'
import type { Design, PartInstance } from '../types/design'
import { STORAGE_KEYS } from '../constants/storageKeys'

const connectorMocks = vi.hoisted(() => ({ load: vi.fn(), get: vi.fn() }))
const assemblyMocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../features/partStudio/assemblySources', () => ({ loadAssemblySource: assemblyMocks.load }))
vi.mock('../hooks/usePartConnectors', () => ({
  prefetchAndExtractConnectors: connectorMocks.load,
  getCachedPartConnectors: connectorMocks.get,
}))

const part = (instanceId: string, category: PartInstance['category'], parent?: string): PartInstance => ({
  instanceId,
  partId: partsData.find(p => p.category === category)!.id,
  category,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  ...(parent ? { activeConnectorId: 'PLUG_1', attachedTo: { parentInstanceId: parent, parentConnectorId: 'SOCKET_1' } } : {}),
})

function activate(parts: PartInstance[], overrides: Partial<Design> = {}) {
  const id = useDesignStore.getState().createDesign('test', 'guided')
  useDesignStore.setState(state => ({ designs: state.designs.map(d => d.id === id ? { ...d, parts, ...overrides } : d) }))
  useDesignStore.getState().setActiveDesignId(id)
  return useDesignStore.getState()
}

describe('designStore addPartSmart result', () => {
  beforeEach(() => {
    localStorage.clear()
    useDesignStore.setState({
      designs: [],
      activeDesignId: null,
      deletedIds: [],
      selectedInstanceId: null,
      ghostPart: null,
      highlightedSocket: null,
      draggingPartId: null,
    })
    connectorMocks.load.mockReset().mockResolvedValue(undefined)
    assemblyMocks.load.mockReset().mockResolvedValue({ name: '自制主机身', connectors: [{ id: 'joint:edge', kind: 'edge-slot', position: [0.02,0,0], quaternion: [0,0,0,1] }] })
    connectorMocks.get.mockReset().mockImplementation((url: string) => [
      { id: url.includes('mainboards') ? 'SOCKET_1' : 'PLUG_1', type: url.includes('mainboards') ? 'socket' : 'plug', position: new Vector3(), quaternion: new Quaternion() },
      { id: 'PLUG_2', type: 'plug', position: new Vector3(0, 0.02, 0), quaternion: new Quaternion() },
    ])
  })

  afterEach(() => vi.restoreAllMocks())

  it('returns true only when the part was written to the active design', async () => {
    const store = useDesignStore.getState()
    const hub = partsData.find((part) => part.category === 'mainboard')
    expect(hub).toBeDefined()

    expect(await store.addPartSmart('missing-part')).toBe(false)

    const designId = store.createDesign('test', 'guided')
    store.setActiveDesignId(designId)

    expect(await store.addPartSmart(hub!.id)).toBe(true)
    expect(useDesignStore.getState().getDesignById(designId)?.parts).toHaveLength(1)

    expect(await store.addPartSmart(hub!.id)).toBe(false)
    expect(useDesignStore.getState().getDesignById(designId)?.parts).toHaveLength(1)
  })

  it('keeps custom references in both modes and round-trips their positions', () => {
    const store = activate([])
    const custom = { partId: 'custom_507f1f77bcf86cd799439011', category: 'joint' as const, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], source: { kind: 'custom' as const, id: '507f1f77bcf86cd799439011', version: 1, updatedAt: '2026-09-07T00:00:00.000Z' } }
    expect(store.addPartToActiveDesign(custom)).toBe(true)
    const id = store.createDesign('自由', 'free')
    store.setActiveDesignId(id)
    expect(store.addPartToActiveDesign(custom)).toBe(true)
    const instance = store.getActiveDesign()!.parts[0]!
    store.updatePartInActiveDesign(instance.instanceId, { position: [0.01, 0.02, 0.03] })
    const saved = JSON.parse(JSON.stringify(store.getActiveDesign()))
    store.clearAll()
    store.importServerDesigns([saved])
    store.setActiveDesignId(id)
    expect(store.getActiveDesign()!.parts[0]).toMatchObject({ source: custom.source, position: [0.01, 0.02, 0.03] })
  })

  it.each(['guided', 'free'] as const)('connects a catalog landing to a custom mainboard in %s mode', async buildMode => {
    const custom: PartInstance = { ...part('custom-base', 'mainboard'), partId:'custom_507f1f77bcf86cd799439011', source:{kind:'custom',id:'507f1f77bcf86cd799439011',version:1,updatedAt:'2026-09-20T00:00:00.000Z'} }
    const store = activate([custom], {buildMode})
    expect(await store.addPartSmart('arm_01', {instanceId:custom.instanceId,socketId:'joint:edge',plugId:'PLUG_01'})).toBe(true)
    expect(store.getActiveDesign()!.parts.at(-1)).toMatchObject({attachedTo:{parentInstanceId:custom.instanceId,parentConnectorId:'joint:edge'},activeConnectorId:'PLUG_01'})
  })

  it('does not mistake a custom mainboard without slots for an empty design', async () => {
    const custom: PartInstance = { ...part('custom-base', 'mainboard'), partId:'custom_507f1f77bcf86cd799439011', source:{kind:'custom',id:'507f1f77bcf86cd799439011',version:1,updatedAt:'2026-09-20T00:00:00.000Z'} }
    assemblyMocks.load.mockResolvedValue({name:'无插槽',connectors:[]})
    const store = activate([custom], {buildMode:'free'})
    expect(await store.addPartSmart('core_hub_01')).toBe(false)
    expect(store.getActiveDesign()!.parts).toEqual([custom])
  })

  it('rechecks a custom slot after concurrent loads and never occupies it twice', async () => {
    const custom: PartInstance = {...part('custom-base','mainboard'),partId:'custom_507f1f77bcf86cd799439011',source:{kind:'custom',id:'507f1f77bcf86cd799439011',version:1,updatedAt:'2026-09-20T00:00:00.000Z'}}
    const store = activate([custom],{buildMode:'free'})
    const frame = {name:'主机身',connectors:[{id:'joint:edge',kind:'edge-slot',position:[0,0,0],quaternion:[0,0,0,1]}]}
    let release!: (value:typeof frame)=>void
    assemblyMocks.load.mockReturnValue(new Promise(resolve=>{release=resolve}))
    const target = {instanceId:custom.instanceId,socketId:'joint:edge',plugId:'PLUG_01'}
    const first = store.addPartSmart('arm_01',target)
    await vi.waitFor(()=>expect(assemblyMocks.load).toHaveBeenCalledTimes(1))
    const attempts = [first,store.addPartSmart('arm_01',target)]
    await vi.waitFor(()=>expect(assemblyMocks.load).toHaveBeenCalledTimes(2))
    release(frame)
    expect((await Promise.all(attempts)).filter(Boolean)).toHaveLength(1)
    expect(store.getActiveDesign()!.parts).toHaveLength(2)
  })

  it.each(['switch','revision','deleted'] as const)('does not use a custom source invalidated by %s during loading', async action => {
    const custom: PartInstance = {...part('custom-base','mainboard'),partId:'custom_507f1f77bcf86cd799439011',source:{kind:'custom',id:'507f1f77bcf86cd799439011',version:1,updatedAt:'2026-09-20T00:00:00.000Z'}}
    const store = activate([custom],{buildMode:'free'})
    const frame = {name:'主机身',connectors:[{id:'joint:edge',kind:'edge-slot',position:[0,0,0],quaternion:[0,0,0,1]}]}
    let release!: (value:typeof frame)=>void
    assemblyMocks.load.mockReturnValue(new Promise(resolve=>{release=resolve}))
    const attempt = store.addPartSmart('arm_01',{instanceId:custom.instanceId,socketId:'joint:edge',plugId:'PLUG_01'})
    await vi.waitFor(()=>expect(assemblyMocks.load).toHaveBeenCalled())
    if (action==='switch') store.setActiveDesignId(store.createDesign('other'))
    if (action==='revision') store.updatePartInActiveDesign(custom.instanceId,{source:{...custom.source!,updatedAt:'2026-09-21T00:00:00.000Z'}})
    if (action==='deleted') store.removePartFromActiveDesign(custom.instanceId)
    release(frame)
    expect(await attempt).toBe(false)
    expect(store.getActiveDesign()!.parts.some(p=>p.partId==='arm_01')).toBe(false)
  })

  it('preserves the design and surfaces an unavailable custom source', async () => {
    const custom: PartInstance = {...part('custom-base','mainboard'),partId:'custom_507f1f77bcf86cd799439011',source:{kind:'custom',id:'507f1f77bcf86cd799439011',version:1,updatedAt:'2026-09-20T00:00:00.000Z'}}
    const store = activate([custom],{buildMode:'free'})
    assemblyMocks.load.mockRejectedValue(new Error('原零件不可用'))
    await expect(store.addPartSmart('arm_01')).rejects.toThrow('原零件不可用')
    expect(store.getActiveDesign()!.parts).toEqual([custom])
  })

  it('creates unique design and part ids for actions in the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const store = activate([])
    const firstId = store.activeDesignId
    expect(store.createDesign('second')).not.toBe(firstId)
    const input = { partId: partsData.find(p => p.category === 'mainboard')!.id, category: 'mainboard' as const, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }
    store.addPartToActiveDesign(input)
    store.addPartToActiveDesign(input)
    const ids = store.getActiveDesign()!.parts.map(p => p.instanceId)
    expect(new Set(ids).size).toBe(2)
  })

  it('does not unlock later steps by repeating the first transition', () => {
    const store = activate([part('hub', 'mainboard')])
    expect(store.advanceStep()).toBe(true)
    expect(store.goBackStep()).toBe(true)
    expect(store.advanceStep()).toBe(true)
    expect(store.getActiveDesign()!.stepReached).toBe(1)
    expect(store.goToStep('REVIEW')).toBe(false)
  })

  it('removes descendants and clears selection when their parent is removed', () => {
    const store = activate([part('hub', 'mainboard'), part('arm', 'landing', 'hub'), part('guard', 'guard', 'arm'), part('other', 'landing', 'hub')])
    store.setSelectedInstanceId('guard')
    store.removePartFromActiveDesign('arm')
    expect(store.getActiveDesign()!.parts.map(p => p.instanceId)).toEqual(['hub', 'other'])
    expect(useDesignStore.getState().selectedInstanceId).toBeNull()
  })

  it('resets a step with its dependent parts and relocks later steps', () => {
    const store = activate([part('hub', 'mainboard'), part('arm', 'landing', 'hub'), part('guard', 'guard', 'arm')], { currentStep: 'ARM', stepReached: 4 })
    store.resetCurrentStep()
    expect(store.getActiveDesign()!.parts.map(p => p.instanceId)).toEqual(['hub'])
    expect(store.getActiveDesign()!.stepReached).toBe(1)
    expect(store.goToStep('REVIEW')).toBe(false)
  })

  it('keeps a stable snapshot for legacy designs without a build mode', () => {
    const store = activate([], { buildMode: undefined } as unknown as Partial<Design>)
    expect(store.getActiveDesign()).toBe(store.getActiveDesign())
    expect(store.getActiveDesign()!.buildMode).toBe('free')
  })

  it('attaches a second mainboard to a landing connector instead of rejecting all second boards', async () => {
    const store = activate([part('hub', 'mainboard'), part('arm', 'landing', 'hub')])
    expect(await store.addPartSmart(partsData.find(p => p.category === 'mainboard')!.id)).toBe(true)
    expect(store.getActiveDesign()!.parts.at(-1)?.attachedTo?.parentInstanceId).toBe('arm')
  })

  it('enforces quantity even for direct store callers', async () => {
    const store = activate([part('hub', 'mainboard'), part('arm', 'landing', 'hub'), ...Array.from({ length: 4 }, (_, i) => part(`guard-${i}`, 'guard', 'arm'))])
    const guard = partsData.find(p => p.category === 'guard')!
    expect(await store.addPartSmart(guard.id)).toBe(false)
    expect(store.getActiveDesign()!.parts.filter(p => p.category === 'guard')).toHaveLength(4)
  })

  it('does not reuse an occupied requested connector', async () => {
    const store = activate([part('hub', 'mainboard'), part('arm', 'landing', 'hub')])
    expect(await store.addPartSmart(partsData.find(p => p.category === 'landing')!.id, { instanceId: 'hub', socketId: 'SOCKET_1', plugId: 'PLUG_1' })).toBe(false)
    expect(store.getActiveDesign()!.parts).toHaveLength(2)
  })

  it('spreads automatically placed landings across the available mainboard sockets', async () => {
    connectorMocks.get.mockImplementation((url: string) => url.includes('mainboards')
      ? Array.from({ length: 8 }, (_, i) => ({ id: `SOCKET_${i}`, type: 'socket', position: new Vector3(Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4)), quaternion: new Quaternion() }))
      : [{ id: 'PLUG_1', type: 'plug', position: new Vector3(), quaternion: new Quaternion() }])
    const store = activate([part('hub', 'mainboard')])
    for (let i = 0; i < 4; i++) expect(await store.addPartSmart(partsData.find(p => p.category === 'landing')!.id)).toBe(true)
    const sockets = store.getActiveDesign()!.parts.slice(1).map(p => p.attachedTo!.parentConnectorId)
    expect(new Set(sockets)).toEqual(new Set(['SOCKET_0', 'SOCKET_2', 'SOCKET_4', 'SOCKET_6']))
  })

  it('rechecks quantity when simultaneous model loads complete', async () => {
    const store = activate([part('hub', 'mainboard'), part('arm', 'landing', 'hub'), ...Array.from({ length: 3 }, (_, i) => part(`guard-${i}`, 'guard'))])
    let release!: () => void
    const loaded = new Promise<void>(resolve => { release = resolve })
    connectorMocks.load.mockReturnValue(loaded)
    const guard = partsData.find(p => p.category === 'guard')!
    const additions = [store.addPartSmart(guard.id), store.addPartSmart(guard.id)]
    await vi.waitFor(() => expect(connectorMocks.load).toHaveBeenCalled())
    release()
    expect((await Promise.all(additions)).filter(Boolean)).toHaveLength(1)
    expect(store.getActiveDesign()!.parts.filter(p => p.category === 'guard')).toHaveLength(4)
  })

  it('does not write into a different design selected while a model is loading', async () => {
    const store = activate([part('hub', 'mainboard')])
    let release!: () => void
    const loaded = new Promise<void>(resolve => { release = resolve })
    connectorMocks.load.mockReturnValue(loaded)
    const addition = store.addPartSmart(partsData.find(p => p.category === 'landing')!.id)
    await vi.waitFor(() => expect(connectorMocks.load).toHaveBeenCalled())
    store.setActiveDesignId(store.createDesign('other'))
    release()
    expect(await addition).toBe(false)
    expect(store.getActiveDesign()!.parts).toHaveLength(0)
  })

  it('restores the design without a stale drag or selection after refresh', async () => {
    const store = activate([part('hub', 'mainboard')])
    localStorage.setItem(STORAGE_KEYS.DESIGN_STORE, JSON.stringify({ state: {
      designs: [store.getActiveDesign()], activeDesignId: store.activeDesignId, deletedIds: [],
      draggingPartId: 'arm_01', ghostPart: { partId: 'arm_01', position: [0, 0, 0] }, selectedInstanceId: 'hub',
      highlightedSocket: { instanceId: 'hub', socketId: 'SOCKET_1', plugId: 'PLUG_1' },
    }, version: 0 }))
    await useDesignStore.persist.rehydrate()
    expect(useDesignStore.getState().getActiveDesign()?.parts).toHaveLength(1)
    expect(useDesignStore.getState().draggingPartId).toBeNull()
    expect(useDesignStore.getState().ghostPart).toBeNull()
    expect(useDesignStore.getState().selectedInstanceId).toBeNull()
    expect(useDesignStore.getState().highlightedSocket).toBeNull()
  })
})
