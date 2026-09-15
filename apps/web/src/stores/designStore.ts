// src/stores/designStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Design, PartInstance } from '../types/design'
import type { BuildStep } from '@fwx/parts-schema'
import { canAdvanceStep, getNextStep, getPrevStep, STEP_CATEGORIES, BUILD_STEPS, DroneDesignSnapshotSchema } from '@fwx/parts-schema'
import { STORAGE_KEYS } from '../constants/storageKeys'
import { partsData } from '../data/parts'
import { checkBeforeAdd } from '../utils/realtimeChecks'
import { trackEvent } from '../features/analytics/client'
import { connectAssembly, moveAssemblyTree, type ConnectorResolver } from '@fwx/geometry/assembly'

// RFC-022 兼容：搭建步骤由 6 步删成 5 步（移除 MOTOR）。删步之前存下的设计——无论来自
// localStorage 还是后端快照——可能带着 currentStep='MOTOR' 或越界的 stepReached；原样读回会让
// 设计页查 STEP_INFO[step]/STEP_CATEGORIES[step] 得到 undefined 而崩溃（白屏）。
// 解决办法：在「设计进入 store 的每个入口」都过一遍 migrateDesign，把非法步骤归到最后一步、
// 把 stepReached 夹回有效区间。这样旧存档永远不会带着失效的步骤进入渲染层。
const LAST_STEP = BUILD_STEPS[BUILD_STEPS.length - 1]
const MAX_STEP_REACHED = BUILD_STEPS.length - 1
const migratedDesigns = new WeakMap<Design, Design>()

function migrateDesign(d: Design): Design {
  if (!d) return d
  const cached = migratedDesigns.get(d)
  if (cached) return cached
  if (!d.buildMode) {
    const migrated = { ...d, schemaVersion: 1 as const, buildMode: 'free' as const, currentStep: 'HUB' as const, stepReached: MAX_STEP_REACHED }
    migratedDesigns.set(d, migrated)
    return migrated
  }
  const stepValid = (BUILD_STEPS as readonly string[]).includes(d.currentStep as string)
  const currentStep = stepValid ? d.currentStep : LAST_STEP
  const currentIdx = BUILD_STEPS.indexOf(currentStep)
  const rawReached =
    typeof d.stepReached === 'number' && Number.isFinite(d.stepReached) ? Math.floor(d.stepReached) : 0
  // stepReached 至少要覆盖 currentStep 本身的索引——不可能「停在一个还没到达的步骤」。
  // 这样即使是被归一过的步骤，进度条也会一路点亮到当前步，不会出现「显示第5步但进度条锁着」。
  const stepReached = Math.min(Math.max(rawReached, currentIdx, 0), MAX_STEP_REACHED)
  if (d.schemaVersion === 1 && currentStep === d.currentStep && stepReached === d.stepReached) return d
  const migrated = { ...d, schemaVersion: 1 as const, currentStep, stepReached }
  migratedDesigns.set(d, migrated)
  return migrated
}

function dependentPartIds(parts: PartInstance[], removed: Set<string>): Set<string> {
  const ids = new Set(removed)
  let changed = true
  while (changed) {
    changed = false
    for (const part of parts) {
      if (part.attachedTo && ids.has(part.attachedTo.parentInstanceId) && !ids.has(part.instanceId)) {
        ids.add(part.instanceId)
        changed = true
      }
    }
  }
  return ids
}

function afterPartsRemoved(design: Design, removed: Set<string>): Design {
  const parts = design.parts.filter(p => !removed.has(p.instanceId))
  if (design.buildMode !== 'guided') return { ...design, parts, updatedAt: new Date().toISOString() }
  const firstIncomplete = BUILD_STEPS.findIndex(currentStep => !canAdvanceStep({
    currentStep,
    parts: parts.map(p => ({ partNumber: p.partId, category: p.category, position: p.position, rotation: p.rotation })),
  }).canAdvance)
  const stepReached = Math.min(design.stepReached, firstIncomplete < 0 ? MAX_STEP_REACHED : firstIncomplete)
  const currentStep = BUILD_STEPS[Math.min(BUILD_STEPS.indexOf(design.currentStep), stepReached)]
  return { ...design, parts, currentStep, stepReached, updatedAt: new Date().toISOString() }
}

export interface SnapTarget {
  instanceId: string
  socketId: string
  plugId: string
}

interface DesignState {
  designs: Design[]
  activeDesignId: string | null
  /** 已删除作品的 id「墓碑」：同步回填时永远跳过，杜绝删了又被服务器拉回来复活 */
  deletedIds: string[]
  getDesignById: (id: string) => Design | undefined
  createDesign: (name: string, mode?: 'guided' | 'free', origin?: 'explicit' | 'automatic') => string
  deleteDesign: (id: string) => void
  setActiveDesignId: (id: string | null) => void
  getActiveDesign: () => Design | undefined
  clearAll: () => void
  /** 从后端拉回的设计合并进本地（按 id upsert，本地较新则不覆盖）——跨设备还原 */
  importServerDesigns: (incoming: Design[]) => void
  // --- Part CRUD ---
  addPartToActiveDesign: (part: Omit<PartInstance, 'instanceId'>) => boolean
  removePartFromActiveDesign: (instanceId: string) => void
  updatePartInActiveDesign: (instanceId: string, updates: Partial<PartInstance>) => void
  connectParts: (childId: string, ownId: string, parentId: string, targetId: string, resolve: ConnectorResolver) => void
  disconnectPart: (instanceId: string) => void
  // --- Guided build flow ---
  advanceStep: () => boolean
  goBackStep: () => boolean
  /** 直接跳到某个「已到达」的步骤（点击顶部进度条上已完成/当前的步骤）。锁定的未来步骤不允许。 */
  goToStep: (step: BuildStep) => boolean
  canAdvance: () => boolean
  getStepAdvanceReason: () => string | undefined
  resetCurrentStep: () => void
  // --- Interaction state ---
  selectedInstanceId: string | null
  ghostPart: { partId: string; position: [number, number, number] } | null
  highlightedSocket: { instanceId: string; socketId: string; plugId: string } | null
  draggingPartId: string | null
  setSelectedInstanceId: (id: string | null) => void
  setGhostPart: (ghost: { partId: string; position: [number, number, number] } | null) => void
  setHighlightedSocket: (socket: { instanceId: string; socketId: string; plugId: string } | null) => void
  setDraggingPartId: (partId: string | null) => void
  /** 成功写入当前设计时返回 true；约束、资源或连接点不满足时返回 false。 */
  addPartSmart: (partId: string, target?: SnapTarget) => Promise<boolean>
}

export const useDesignStore = create<DesignState>()(
  persist(
    (set, get) => ({
      designs: [],
      activeDesignId: null,
      deletedIds: [],
      selectedInstanceId: null,
      ghostPart: null,
      highlightedSocket: null,
      draggingPartId: null,
      getDesignById: (id) => get().designs.find((d) => d.id === id),
      createDesign: (name, mode = 'guided', origin = 'explicit') => {
        const newId = `design-${crypto.randomUUID()}`
        const newDesign: Design = {
          schemaVersion: 1,
          id: newId,
          name,
          updatedAt: new Date().toISOString(),
          buildMode: mode,
          currentStep: 'HUB',
          stepReached: 0,
          parts: [],
        }
        set((state) => ({ designs: [...state.designs, newDesign] }))
        trackEvent('design_created', { designId: newId, origin, mode })
        return newId
      },
      deleteDesign: (id) => {
        set((state) => ({
          designs: state.designs.filter((d) => d.id !== id),
          deletedIds: state.deletedIds.includes(id) ? state.deletedIds : [...state.deletedIds, id],
        }))
      },
      setActiveDesignId: (id) => set({ activeDesignId: id }),
      // 注意：不清 deletedIds——「墓碑」要跨退出登录长期保留，否则退出再登回来、
      // 服务器那份（万一没删干净）又会被同步拉回来复活。墓碑只是一串 id，留着无害。
      clearAll: () => set({ designs: [], activeDesignId: null, selectedInstanceId: null, ghostPart: null, highlightedSocket: null, draggingPartId: null }),
      importServerDesigns: (incoming) => {
        set((state) => {
          const byId = new Map(state.designs.map((d) => [d.id, d]))
          for (const remote of incoming) {
            if (!remote?.id || !Array.isArray(remote.parts)) continue
            if (state.deletedIds.includes(remote.id)) continue // 已删的「墓碑」——服务器即便还在，也不许复活
            const local = byId.get(remote.id)
            // 本地不存在，或后端更新更晚 → 采用后端版本；否则保留本地（离线工作副本优先）
            const remoteNewer =
              !local || new Date(remote.updatedAt).getTime() > new Date(local.updatedAt).getTime()
            if (remoteNewer) byId.set(remote.id, migrateDesign(remote))
          }
          return { designs: Array.from(byId.values()) }
        })
      },
      getActiveDesign: () => {
        const activeId = get().activeDesignId
        if (!activeId) return undefined
        const design = get().designs.find((d) => d.id === activeId)
        if (!design) return undefined
        // RFC-022 兼容：渲染前再兜一次底，确保 currentStep/stepReached 始终有效（防旧存档崩溃）
        return migrateDesign(design)
      },
      // --- 新增方法实现 ---
      addPartToActiveDesign: (part) => {
        const newInstance: PartInstance = {
          ...part,
          instanceId: `inst-${crypto.randomUUID()}`,
        }
        const design = get().getActiveDesign()
        if (!design) return false
        const parsed = DroneDesignSnapshotSchema.safeParse({ ...design, parts: [...design.parts, newInstance], updatedAt: new Date().toISOString() })
        if (!parsed.success) return false
        set(state => ({ designs: state.designs.map(d => d.id === design.id ? parsed.data : d) }))
        trackEvent('assembly_part_added', { designId: design.id, source: part.source?.kind === 'custom' ? 'custom' : 'official', mode: design.buildMode })
        trackEvent('design_edit_started', { designId: design.id, area: 'assembly' }, { onceKey: `edit:assembly:${design.id}` })
        return true
      },
      removePartFromActiveDesign: (instanceId) => {
        set((state) => {
          const activeId = state.activeDesignId
          if (!activeId) return state
          const design = state.designs.find(d => d.id === activeId)
          if (!design) return state
          const removed = dependentPartIds(design.parts, new Set([instanceId]))
          return {
            selectedInstanceId: state.selectedInstanceId && removed.has(state.selectedInstanceId) ? null : state.selectedInstanceId,
            designs: state.designs.map((d) =>
              d.id === activeId
                ? afterPartsRemoved(d, removed)
                : d,
            ),
          }
        })
      },
      connectParts: (childId, ownId, parentId, targetId, resolve) => {
        const design = get().getActiveDesign()
        if (!design) throw new Error('作品不存在')
        const parts = connectAssembly(design.parts, childId, ownId, parentId, targetId, resolve)
        const next = DroneDesignSnapshotSchema.parse({ ...design, parts, updatedAt: new Date().toISOString() })
        set(state => ({ designs: state.designs.map(d => d.id === design.id ? next : d) }))
      },
      disconnectPart: instanceId => {
        const design = get().getActiveDesign()
        if (!design) return
        set(state => ({ designs: state.designs.map(d => d.id !== design.id ? d : {
          ...d, updatedAt: new Date().toISOString(), parts: d.parts.map(p => p.instanceId !== instanceId ? p : { ...p, attachedTo: null, activeConnectorId: undefined }),
        }) }))
      },
      updatePartInActiveDesign: (instanceId, updates) => {
        const before = get().getActiveDesign()
        const previousPart = before?.parts.find(part => part.instanceId === instanceId)
        set((state) => {
          const activeId = state.activeDesignId
          if (!activeId) return state
          return {
            designs: state.designs.map((d) =>
              d.id === activeId
                ? {
                    ...d,
                    parts: (() => {
                      const original = d.parts.find(p => p.instanceId === instanceId)
                      if (!original) return d.parts
                      const hasCustomConnection = d.parts.some(p => p.attachedTo && (p.source || d.parts.find(parent => parent.instanceId === p.attachedTo!.parentInstanceId)?.source))
                      if (hasCustomConnection && original.attachedTo && (updates.position || updates.rotation || updates.scale)) return d.parts
                      const moved = !original.attachedTo && (updates.position || updates.rotation)
                        ? moveAssemblyTree(d.parts, instanceId, { position: updates.position ?? original.position, rotation: updates.rotation ?? original.rotation }) : d.parts
                      return moved.map(p => p.instanceId === instanceId ? { ...p, ...updates } : p)
                    })(),
                    updatedAt: new Date().toISOString(),
                  }
                : d,
            ),
          }
        })
        if (before && previousPart && Object.entries(updates).some(([key, value]) => JSON.stringify(previousPart[key as keyof PartInstance]) !== JSON.stringify(value))) {
          trackEvent('design_edit_started', { designId: before.id, area: 'assembly' }, { onceKey: `edit:assembly:${before.id}` })
        }
      },
      // --- Guided build flow ---
      advanceStep: () => {
        const design = get().getActiveDesign()
        if (!design || design.buildMode !== 'guided') return false

        const hubPart = design.parts.find(p => p.category === 'mainboard')
        const hubEntry = hubPart ? partsData.find(pd => pd.id === hubPart.partId) : undefined
        const hubLayer = hubEntry?.layer ?? 'single'

        const next = getNextStep(design.currentStep)
        if (!next) return false

        const buildState = {
          currentStep: design.currentStep,
          parts: design.parts.map(p => ({ partNumber: p.partId, category: p.category, position: p.position, rotation: p.rotation })),
          hubLayer,
        }
        const { canAdvance } = canAdvanceStep(buildState)
        if (!canAdvance) return false

        set(state => ({
          designs: state.designs.map(d =>
            d.id === design.id
              ? { ...d, currentStep: next, stepReached: Math.max(d.stepReached, BUILD_STEPS.indexOf(next)), updatedAt: new Date().toISOString() }
              : d
          ),
        }))
        trackEvent('assembly_step_completed', { designId: design.id, step: BUILD_STEPS.indexOf(design.currentStep) }, { onceKey: `step:${design.id}:${design.currentStep}` })
        return true
      },

      goBackStep: () => {
        const design = get().getActiveDesign()
        if (!design || design.buildMode !== 'guided') return false

        const prev = getPrevStep(design.currentStep)
        if (!prev) return false

        set(state => ({
          designs: state.designs.map(d =>
            d.id === design.id
              ? { ...d, currentStep: prev, updatedAt: new Date().toISOString() }
              : d
          ),
        }))
        return true
      },

      goToStep: (step) => {
        const design = get().getActiveDesign()
        if (!design || design.buildMode !== 'guided') return false
        const targetIdx = BUILD_STEPS.indexOf(step)
        if (targetIdx < 0) return false
        // 只允许跳到「已到达」的步骤（已完成或当前），锁定的未来步骤不允许
        if (targetIdx > design.stepReached) return false
        if (step === design.currentStep) return true
        set(state => ({
          designs: state.designs.map(d =>
            d.id === design.id
              ? { ...d, currentStep: step, updatedAt: new Date().toISOString() }
              : d
          ),
        }))
        return true
      },

      canAdvance: () => {
        const design = get().getActiveDesign()
        if (!design) return false
        if (design.buildMode === 'free') return true

        const hubPart = design.parts.find(p => p.category === 'mainboard')
        const hubEntry = hubPart ? partsData.find(pd => pd.id === hubPart.partId) : undefined
        const hubLayer = hubEntry?.layer ?? 'single'

        const buildState = {
          currentStep: design.currentStep,
          parts: design.parts.map(p => ({ partNumber: p.partId, category: p.category, position: p.position, rotation: p.rotation })),
          hubLayer,
        }
        return canAdvanceStep(buildState).canAdvance
      },

      getStepAdvanceReason: () => {
        const design = get().getActiveDesign()
        if (!design) return undefined

        const hubPart = design.parts.find(p => p.category === 'mainboard')
        const hubEntry = hubPart ? partsData.find(pd => pd.id === hubPart.partId) : undefined
        const hubLayer = hubEntry?.layer ?? 'single'

        const buildState = {
          currentStep: design.currentStep,
          parts: design.parts.map(p => ({ partNumber: p.partId, category: p.category, position: p.position, rotation: p.rotation })),
          hubLayer,
        }
        return canAdvanceStep(buildState).reason
      },

      resetCurrentStep: () => {
        const design = get().getActiveDesign()
        if (!design || design.buildMode !== 'guided') return

        const allowedCategories = STEP_CATEGORIES[design.currentStep] || []
        const removed = dependentPartIds(design.parts, new Set(design.parts.filter(p => allowedCategories.includes(p.category)).map(p => p.instanceId)))

        set(state => ({
          selectedInstanceId: state.selectedInstanceId && removed.has(state.selectedInstanceId) ? null : state.selectedInstanceId,
          designs: state.designs.map(d =>
            d.id === design.id
              ? afterPartsRemoved(d, removed)
              : d
          ),
        }))
      },

      setSelectedInstanceId: (id) => set({ selectedInstanceId: id }),
      setGhostPart: (ghost) => set({ ghostPart: ghost }),
      setHighlightedSocket: (socket) => set({ highlightedSocket: socket }),
      setDraggingPartId: (partId) => set({ draggingPartId: partId }),
      addPartSmart: async (partId, target) => {
        const state = get()
        let activeDesign = state.getActiveDesign()
        if (!activeDesign) return false

        const partData = partsData.find((p) => p.id === partId)
        if (!partData) {
          return false
        }
        if (checkBeforeAdd(partData.category, partId, activeDesign.parts)) return false

        // 规则 1：第一个机身可以独立放置，第二个机身必须连接到现有零件
        if (partData.category === 'mainboard') {
          // 检查是否已存在机身
          const existingHub = activeDesign.parts.find((inst) => {
            const p = partsData.find((pd) => pd.id === inst.partId)
            return p?.category === 'mainboard'
          })

          if (!existingHub) {
            // 第一个机身独立放置，第二个机身继续走合法连接点匹配。
            return state.addPartToActiveDesign({
              partId,
              category: partData.category,
              position: [0, 0, 0],
              rotation: [0, 0, 0],
            })
          }
        }

        // 规则 2：非 hub 必须先有机身
        const hasHub = activeDesign.parts.some((inst) => {
          const p = partsData.find((pd) => pd.id === inst.partId)
          return p?.category === 'mainboard'
        })
        if (!hasHub) {
          // 引导流程会先要求放主板，这里只做静默兜底
          return false
        }

        // 3D 引擎和模型解析只在用户实际添加子件时加载，避免状态层把 Three/GLTF
        // 带进首页启动包。动态依赖仍集中在此动作边界，不改变 store 的持久化形状。
        const [connectorModule, threeModule, snapModule, connectionModule] = await Promise.all([
          import('../hooks/usePartConnectors'),
          import('three'),
          import('../components/design/snap'),
          import('../utils/connectionRules'),
        ])
        const { getCachedPartConnectors, prefetchAndExtractConnectors } = connectorModule
        const THREE = threeModule
        const { computePerpendicularSnap, quaternionToEuler } = snapModule
        const { isConnectionAllowed, computeOccupiedConnectors } = connectionModule

        // 只加载当前操作需要的模型。此前由 App 启动时批量加载全部零件，既拖慢任意页面，
        // 又让这里隐式依赖全局副作用；现在在选中零件时加载子件和当前设计中的父件。
        const designId = activeDesign.id
        const modelUrls = new Set([
          partData.modelUrl,
          ...activeDesign.parts.flatMap((instance) => {
            const placedPart = partsData.find((candidate) => candidate.id === instance.partId)
            return placedPart ? [placedPart.modelUrl] : []
          }),
        ])
        await Promise.all([...modelUrls].map(prefetchAndExtractConnectors))

        // 加载期间用户可能切换或修改设计；后续吸附必须基于最新的同一份设计。
        const latestDesign = get().getActiveDesign()
        if (!latestDesign || latestDesign.id !== designId) return false
        activeDesign = latestDesign
        if (checkBeforeAdd(partData.category, partId, activeDesign.parts)) return false
        if (!activeDesign.parts.some(p => p.category === 'mainboard')) return false

        // 寻找第一个空闲且合法的连接点（遍历所有零件）
        // 首先确定新零件的连接器（优先 plug，如果没有则用 socket）
        const childConns = getCachedPartConnectors(partData.modelUrl)
        const childPlugConnector = childConns.find((c) => c.type === 'plug')
        const childSocketConnector = childConns.find((c) => c.type === 'socket')
        const childConnector = target
          ? childConns.find(c => c.id === target.plugId)
          : childPlugConnector || childSocketConnector

        if (!childConnector) {
          return false
        }

        // 计算已占用的连接点（父件 + 子件两侧都算占用）
        const occupiedSockets = computeOccupiedConnectors(activeDesign.parts)

        // 遍历所有已放置的零件，寻找可用连接点
        let targetParent: PartInstance | null = null
        let targetSocketId: string | null = null

        const parentCandidates = [...activeDesign.parts]
        if (!target && partData.category === 'guard') {
          const guardCount = (parent: PartInstance) => activeDesign.parts.filter(p => p.category === 'guard' && p.attachedTo?.parentInstanceId === parent.instanceId).length
          parentCandidates.sort((a, b) => guardCount(a) - guardCount(b))
        }
        for (const inst of parentCandidates) {
          if (target && inst.instanceId !== target.instanceId) continue
          const instPartData = partsData.find((p) => p.id === inst.partId)
          if (!instPartData) continue

          // 检查连接规则
          if (!isConnectionAllowed(partData.category, instPartData.category)) {
            continue
          }

          const connectors = getCachedPartConnectors(instPartData.modelUrl)

          // 根据子零件连接器类型过滤目标连接点
          // - 如果子零件是 plug：可以连接到 socket 或 plug
          // - 如果子零件是 socket：只能连接到 plug（禁止 socket-to-socket）
          const availableConnectors = connectors.filter((c) => {
            if (childConnector.type === 'plug') {
              return c.type === 'socket' || c.type === 'plug'
            } else {
              return c.type === 'plug'
            }
          })

          // 自动放置起落架时优先远离已有安装点，避免按文件顺序连续占用同一侧。
          // 只安排视觉布局；不作为结构强度或真实飞行安全判断。
          if (!target && partData.category === 'landing') {
            const used = activeDesign.parts
              .filter(p => p.category === 'landing' && p.attachedTo?.parentInstanceId === inst.instanceId)
              .flatMap(p => connectors.filter(c => c.id === p.attachedTo?.parentConnectorId))
            if (used.length > 0) {
              const spacing = (candidate: typeof connectors[number]) => Math.min(...used.map(c => c.position.distanceToSquared(candidate.position)))
              availableConnectors.sort((a, b) => {
                const difference = spacing(b) - spacing(a)
                return Math.abs(difference) < 1e-10 ? 0 : difference
              })
            }
          }

          for (const connector of availableConnectors) {
            if (target && connector.id !== target.socketId) continue
            const key = `${inst.instanceId}::${connector.id}`
            if (!occupiedSockets.has(key)) {
              targetParent = inst
              targetSocketId = connector.id
              break
            }
          }

          if (targetParent && targetSocketId) break
        }

        if (!targetParent || !targetSocketId) {
          return false
        }

        // ✅ 对齐计算：使用 computeSnapTransform 函数
        const parentPart = partsData.find((p) => p.id === targetParent.partId)
        if (!parentPart) {
          return false
        }
        const parentConns = getCachedPartConnectors(parentPart.modelUrl)
        const parentConnector = parentConns.find((c) => c.id === targetSocketId)
        if (!parentConnector) {
          return false
        }

        // 计算父连接器的世界坐标变换
        const parentPos = new THREE.Vector3(...targetParent.position)
        const parentQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...targetParent.rotation))
        const parentConnectorWorldPosition = parentConnector.position.clone().multiply(new THREE.Vector3(...(targetParent.scale ?? [1, 1, 1]))).applyQuaternion(parentQuat).add(parentPos)
        let parentConnectorWorldQuaternion = parentQuat.clone().multiply(parentConnector.quaternion.clone())

        // Plug-to-plug fix: flip parent plug 180° around X to act as socket
        const isPlugToPlug = parentConnector.type === 'plug' && childConnector.type === 'plug'
        if (isPlugToPlug) {
          const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
          parentConnectorWorldQuaternion = parentConnectorWorldQuaternion.clone().multiply(flip)
        }

        // 子连接器的本地变换
        const childConnectorLocalPosition = childConnector.position.clone()
        const childConnectorLocalQuaternion = childConnector.quaternion.clone()

        // Direct perpendicular snap — works for all model conventions
        const { position: newPosition, quaternion: newQuaternion } = computePerpendicularSnap({
          socketWorldPosition: parentConnectorWorldPosition,
          socketWorldQuaternion: parentConnectorWorldQuaternion,
          plugLocalPosition: childConnectorLocalPosition,
          plugLocalQuaternion: childConnectorLocalQuaternion,
        })

        return state.addPartToActiveDesign({
          partId,
          category: partData.category,
          position: [newPosition.x, newPosition.y, newPosition.z],
          rotation: quaternionToEuler(newQuaternion),
          activeConnectorId: childConnector.id,
          attachedTo: {
            parentInstanceId: targetParent.instanceId,
            parentConnectorId: targetSocketId,
          },
        })
      },
    }),
    {
      name: STORAGE_KEYS.DESIGN_STORE,
      partialize: state => ({ designs: state.designs, activeDesignId: state.activeDesignId, deletedIds: state.deletedIds }),
      // 从 localStorage 还原时，把每份设计过一遍 migrateDesign：删步之前存的旧设计
      // （currentStep='MOTOR' 等）在进入内存前就被归一，从源头杜绝设计页崩溃。
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DesignState>
        const designs = Array.isArray(p.designs) ? (p.designs as Design[]).map(migrateDesign) : current.designs
        return {
          ...current,
          designs,
          activeDesignId: typeof p.activeDesignId === 'string' ? p.activeDesignId : null,
          deletedIds: Array.isArray(p.deletedIds) ? p.deletedIds.filter((id): id is string => typeof id === 'string') : [],
          selectedInstanceId: null,
          ghostPart: null,
          highlightedSocket: null,
          draggingPartId: null,
        }
      },
    },
  ),
)

/** Standalone function to clear design store — used by authStore on logout to avoid circular deps */
export function clearDesignStore() {
  useDesignStore.getState().clearAll()
}
