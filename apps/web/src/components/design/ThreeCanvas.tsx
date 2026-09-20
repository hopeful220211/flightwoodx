import { Suspense, useEffect, useLayoutEffect, useCallback } from 'react'
import { AssemblyConnectorMarkers } from '../../features/partStudio/AssemblyConnectorMarkers'
import { useCustomPlacementTargets } from '../../features/partStudio/useCustomPlacementTargets'
import { useRepairMixedConnections } from '../../features/partStudio/useRepairMixedConnections'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, Html, Bounds, useBounds } from '@react-three/drei'
import * as THREE from 'three'
import { SceneContent } from './SceneContent'
import { SceneLighting } from './SceneLighting'
import { useDesignStore } from '../../stores/designStore'
import { ActionMenu } from './ActionMenu'
import { SocketHighlights } from './SocketHighlights'
import { CameraController, type CameraView } from './CameraController'
import { partsData } from '../../data/parts'
import { getCachedPartConnectors } from '../../hooks/usePartConnectors'
import { checkBeforeAdd } from '../../utils/realtimeChecks'

// 点击检测阈值（像素）
const CLICK_THRESHOLD = 5

import { isConnectionAllowed, computeOccupiedConnectors } from './../../utils/connectionRules'

// 全局指针位置追踪（用于区分点击和拖拽）
let pointerDownPosition: { x: number; y: number } | null = null

interface ThreeCanvasProps {
  cameraView?: CameraView | null
  onCameraViewChanged?: () => void
}

export function ThreeCanvas({ cameraView = null, onCameraViewChanged }: ThreeCanvasProps = {}) {
  useRepairMixedConnections()
  const setSelectedInstanceId = useDesignStore((state) => state.setSelectedInstanceId)

  const handlePointerMissed = useCallback((e: MouseEvent) => {
    // 检查是否是真正的点击（而非拖拽）
    if (pointerDownPosition) {
      const dx = Math.abs(e.clientX - pointerDownPosition.x)
      const dy = Math.abs(e.clientY - pointerDownPosition.y)
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < CLICK_THRESHOLD) {
        setSelectedInstanceId(null)
      }
    }
    pointerDownPosition = null
  }, [setSelectedInstanceId])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownPosition = { x: e.clientX, y: e.clientY }
  }, [])

  return (
    <Canvas
      aria-label="无人机三维拼装画布"
      shadows
      camera={{
        position: [0.3, 0.3, 0.4],
        fov: 50,
        near: 0.01,
        far: 1000,
      }}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMissed={handlePointerMissed}
    >
      {/* 固定三点布光（世界坐标固定，不随相机/零件转动）→ 任意视角零件边界分明 */}
      <SceneLighting castShadow />

      {/* 相机控制器 */}
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={0.06}
        maxDistance={10}
        target={[0, 0, 0]}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
        }}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />

      {/* 参考网格地面 */}
      <Grid
        position={[0, -0.08, 0]}
        args={[10, 10]}
        cellSize={0.01}
        cellThickness={0.5}
        cellColor={'#e2e8f0'}
        sectionSize={0.1}
        sectionThickness={1}
        sectionColor={'#cbd5e1'}
        fadeDistance={2}
        infiniteGrid
      />

      <Suspense fallback={<Html center><div role="status" className="whitespace-nowrap rounded-xl bg-white/95 px-4 py-2 text-sm text-gray-600 shadow">正在加载零件…</div></Html>}>
        <Bounds margin={1.5} maxDuration={0.25}>
          <SceneContent />
          <FitDesignView />
        </Bounds>
        <DragHandler />
        <SocketHighlights />
        <AssemblyConnectorMarkers />
        <CameraController view={cameraView} onViewChanged={onCameraViewChanged} />
        {/* ActionMenu 需要在 Canvas 内部以访问 useThree */}
        <ActionMenu />
      </Suspense>
    </Canvas>
  )
}

function FitDesignView() {
  const bounds = useBounds()
  const { size } = useThree()
  const designId = useDesignStore(state => state.activeDesignId)
  const partCount = useDesignStore(state => state.getActiveDesign()?.parts.length ?? 0)
  useLayoutEffect(() => {
    if (partCount > 0) bounds.refresh().clip().fit()
  }, [bounds, designId, partCount, size.width, size.height])
  return null
}

// 距离阈值（屏幕像素），小于此距离时高亮插座
const SOCKET_HIGHLIGHT_THRESHOLD = 80

// 拖拽处理器：监听 HTML5 drag and drop 事件
function DragHandler() {
  const customTargets = useCustomPlacementTargets()
  const setGhostPart = useDesignStore((state) => state.setGhostPart)
  const setHighlightedSocket = useDesignStore((state) => state.setHighlightedSocket)
  const setDraggingPartId = useDesignStore((state) => state.setDraggingPartId)
  const addPartSmart = useDesignStore((state) => state.addPartSmart)
  const { camera, gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()

      // 从 store 获取最新状态（dragover 事件中无法通过 dataTransfer.getData 获取数据）
      const currentState = useDesignStore.getState()
      const partId = currentState.draggingPartId
      if (!partId) return

      const currentActiveDesign = currentState.getActiveDesign()
      if (!currentActiveDesign) return

      // 将屏幕坐标转换为3D世界坐标
      const rect = canvas.getBoundingClientRect()

      const vec = new THREE.Vector3(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
        0.5,
      )
      vec.unproject(camera)
      const dir = vec.sub(camera.position).normalize()
      const distance = -camera.position.y / dir.y
      const pos = camera.position.clone().add(dir.multiplyScalar(distance))
      setGhostPart({ partId, position: [pos.x, 0.1, pos.z] })

      const draggingPart = partsData.find((p) => p.id === partId)
      if (!draggingPart) {
        setHighlightedSocket(null)
        return
      }

      // 检查是否是第一个机身（第一个机身不需要连接点）
      if (draggingPart.category === 'mainboard') {
        const existingHub = currentActiveDesign.parts.find((inst) => {
          const p = partsData.find((pd) => pd.id === inst.partId)
          return p?.category === 'mainboard'
        })

        if (!existingHub && customTargets.length === 0) {
          // 第一个机身不需要吸附，直接放置即可
          setHighlightedSocket(null)
          return
        }
        // 第二个机身需要连接到现有零件，继续执行下面的逻辑显示连接点
      }

      // 查找拖拽零件的连接器（优先 plug，如果没有则用 socket）
      const draggingConnectors = getCachedPartConnectors(draggingPart.modelUrl)
      const draggingPlugConnector = draggingConnectors.find((c) => c.type === 'plug')
      const draggingSocketConnector = draggingConnectors.find((c) => c.type === 'socket')
      const draggingConnector = draggingPlugConnector || draggingSocketConnector

      if (!draggingConnector) {
        // 没有任何连接器
        setHighlightedSocket(null)
        return
      }

      // 计算已占用的连接点（父件 + 子件两侧都算占用）
      const occupiedSockets = computeOccupiedConnectors(currentActiveDesign.parts)

      // 计算所有可用插座
      const currentAvailableSockets: Array<{
        instanceId: string
        socketId: string
        plugId: string
        worldPosition: THREE.Vector3
      }> = [...customTargets]

      for (const inst of currentActiveDesign.parts) {
        const partData = partsData.find((p) => p.id === inst.partId)
        if (!partData) continue

        // 检查连接规则：hub和body的插座不能相互连接
        if (!isConnectionAllowed(draggingPart.category, partData.category)) {
          continue
        }

        const connectors = getCachedPartConnectors(partData.modelUrl)

        // 根据拖拽连接器类型过滤目标连接点
        // - 如果拖拽的是 plug：可以连接到 socket 或 plug
        // - 如果拖拽的是 socket：只能连接到 plug（禁止 socket-to-socket）
        const partConnectors = connectors.filter((c) => {
          if (draggingConnector.type === 'plug') {
            // plug 可以连接到 socket 或 plug
            return c.type === 'socket' || c.type === 'plug'
          } else {
            // socket 只能连接到 plug
            return c.type === 'plug'
          }
        })

        const instPos = new THREE.Vector3(...inst.position)
        const instQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...inst.rotation))

        for (const connector of partConnectors) {
          const key = `${inst.instanceId}::${connector.id}`
          if (occupiedSockets.has(key)) continue

          const worldPos = connector.position.clone().multiply(new THREE.Vector3(...(inst.scale ?? [1, 1, 1]))).applyQuaternion(instQuat).add(instPos)
          currentAvailableSockets.push({
            instanceId: inst.instanceId,
            socketId: connector.id,
            plugId: draggingConnector.id,
            worldPosition: worldPos,
          })
        }
      }

      // 计算最近的插座
      if (currentAvailableSockets.length > 0) {
        let nearestSocket: typeof currentAvailableSockets[0] | null = null
        let minScreenDistance = Infinity

        for (const socket of currentAvailableSockets) {
          // 将插座世界坐标转换为屏幕坐标
          const screenPos = socket.worldPosition.clone().project(camera)
          const screenX = (screenPos.x * 0.5 + 0.5) * rect.width + rect.left
          const screenY = (-screenPos.y * 0.5 + 0.5) * rect.height + rect.top

          // 计算鼠标与插座的屏幕距离
          const dx = e.clientX - screenX
          const dy = e.clientY - screenY
          const screenDistance = Math.sqrt(dx * dx + dy * dy)

          if (screenDistance < minScreenDistance) {
            minScreenDistance = screenDistance
            nearestSocket = socket
          }
        }

        // 如果最近的插座在阈值范围内，高亮它
        if (nearestSocket && minScreenDistance < SOCKET_HIGHLIGHT_THRESHOLD) {
          setHighlightedSocket({
            instanceId: nearestSocket.instanceId,
            socketId: nearestSocket.socketId,
            plugId: nearestSocket.plugId,
          })
        } else {
          setHighlightedSocket(null)
        }
      } else {
        setHighlightedSocket(null)
      }
    }

    const clearDrag = () => {
      setGhostPart(null)
      setHighlightedSocket(null)
      setDraggingPartId(null)
    }

    // 所有落点都经过与点击相同的连接/数量校验，防止拖拽绕过规则或覆盖已占用连接点。
    const placePart = async (partId: string, x: number, y: number) => {
      const rect = canvas.getBoundingClientRect()
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        clearDrag()
        return
      }
      const currentState = useDesignStore.getState()
      const design = currentState.getActiveDesign()
      const part = partsData.find(p => p.id === partId)
      const target = currentState.highlightedSocket ?? undefined
      clearDrag()
      if (!design || !part) return
      const violation = checkBeforeAdd(part.category, part.id, design.parts)
      if (violation) {
        window.dispatchEvent(new CustomEvent('fwx-violation', { detail: violation }))
        return
      }
      try {
        if (await addPartSmart(partId, target)) return
      } catch {
        // 网络或模型异常保留已有作品，并显示可恢复错误。
      }
      window.dispatchEvent(new CustomEvent('fwx-violation', { detail: {
        id: 'placement-failed',
        level: 'error',
        message: '零件未添加，请重试',
        hint: '检查网络或选择空闲连接点，也可以点击零件自动放置。',
      } }))
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      const partId = e.dataTransfer?.getData('text/plain')
      if (partId) void placePart(partId, e.clientX, e.clientY)
    }

    const handleDragLeave = (e: DragEvent) => {
      // 只有当真正离开画布时才清除状态
      const rect = canvas.getBoundingClientRect()
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        setGhostPart(null)
        setHighlightedSocket(null)
      }
    }

    // 触控拖拽移动处理
    const handleTouchDragMove = (e: Event) => {
      const customEvent = e as CustomEvent<{ x: number; y: number; partId: string }>
      const { x, y, partId } = customEvent.detail

      const currentState = useDesignStore.getState()
      const currentActiveDesign = currentState.getActiveDesign()
      if (!currentActiveDesign) return

      // 将屏幕坐标转换为3D世界坐标
      const rect = canvas.getBoundingClientRect()

      const vec = new THREE.Vector3(
        ((x - rect.left) / rect.width) * 2 - 1,
        -((y - rect.top) / rect.height) * 2 + 1,
        0.5,
      )
      vec.unproject(camera)
      const dir = vec.sub(camera.position).normalize()
      const distance = -camera.position.y / dir.y
      const pos = camera.position.clone().add(dir.multiplyScalar(distance))
      setGhostPart({ partId, position: [pos.x, 0.1, pos.z] })

      const draggingPart = partsData.find((p) => p.id === partId)
      if (!draggingPart) {
        setHighlightedSocket(null)
        return
      }

      // 检查是否是第一个机身（第一个机身不需要连接点）
      if (draggingPart.category === 'mainboard') {
        const existingHub = currentActiveDesign.parts.find((inst) => {
          const p = partsData.find((pd) => pd.id === inst.partId)
          return p?.category === 'mainboard'
        })

        if (!existingHub && customTargets.length === 0) {
          // 第一个机身不需要吸附，直接放置即可
          setHighlightedSocket(null)
          return
        }
        // 第二个机身需要连接到现有零件，继续执行下面的逻辑显示连接点
      }

      // 查找拖拽零件的连接器（优先 plug，如果没有则用 socket）
      const draggingConnectors = getCachedPartConnectors(draggingPart.modelUrl)
      const draggingPlugConnector = draggingConnectors.find((c) => c.type === 'plug')
      const draggingSocketConnector = draggingConnectors.find((c) => c.type === 'socket')
      const draggingConnector = draggingPlugConnector || draggingSocketConnector

      if (!draggingConnector) {
        // 没有任何连接器
        setHighlightedSocket(null)
        return
      }

      // 计算已占用的连接点（父件 + 子件两侧都算占用）
      const occupiedSockets = computeOccupiedConnectors(currentActiveDesign.parts)

      // 计算所有可用插座
      const currentAvailableSockets: Array<{
        instanceId: string
        socketId: string
        plugId: string
        worldPosition: THREE.Vector3
      }> = [...customTargets]

      for (const inst of currentActiveDesign.parts) {
        const partData = partsData.find((p) => p.id === inst.partId)
        if (!partData) continue

        // 检查连接规则：hub和body的插座不能相互连接
        if (!isConnectionAllowed(draggingPart.category, partData.category)) {
          continue
        }

        const connectors = getCachedPartConnectors(partData.modelUrl)

        // 根据拖拽连接器类型过滤目标连接点
        // - 如果拖拽的是 plug：可以连接到 socket 或 plug
        // - 如果拖拽的是 socket：只能连接到 plug（禁止 socket-to-socket）
        const partConnectors = connectors.filter((c) => {
          if (draggingConnector.type === 'plug') {
            // plug 可以连接到 socket 或 plug
            return c.type === 'socket' || c.type === 'plug'
          } else {
            // socket 只能连接到 plug
            return c.type === 'plug'
          }
        })

        const instPos = new THREE.Vector3(...inst.position)
        const instQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...inst.rotation))

        for (const connector of partConnectors) {
          const key = `${inst.instanceId}::${connector.id}`
          if (occupiedSockets.has(key)) continue

          const worldPos = connector.position.clone().multiply(new THREE.Vector3(...(inst.scale ?? [1, 1, 1]))).applyQuaternion(instQuat).add(instPos)
          currentAvailableSockets.push({
            instanceId: inst.instanceId,
            socketId: connector.id,
            plugId: draggingConnector.id,
            worldPosition: worldPos,
          })
        }
      }

      // 计算最近的插座
      if (currentAvailableSockets.length > 0) {
        let nearestSocket: typeof currentAvailableSockets[0] | null = null
        let minScreenDistance = Infinity

        for (const socket of currentAvailableSockets) {
          const screenPos = socket.worldPosition.clone().project(camera)
          const screenX = (screenPos.x * 0.5 + 0.5) * rect.width + rect.left
          const screenY = (-screenPos.y * 0.5 + 0.5) * rect.height + rect.top

          const dx = x - screenX
          const dy = y - screenY
          const screenDistance = Math.sqrt(dx * dx + dy * dy)

          if (screenDistance < minScreenDistance) {
            minScreenDistance = screenDistance
            nearestSocket = socket
          }
        }

        if (nearestSocket && minScreenDistance < SOCKET_HIGHLIGHT_THRESHOLD) {
          setHighlightedSocket({
            instanceId: nearestSocket.instanceId,
            socketId: nearestSocket.socketId,
            plugId: nearestSocket.plugId,
          })
        } else {
          setHighlightedSocket(null)
        }
      } else {
        setHighlightedSocket(null)
      }
    }

    // 触控拖拽结束处理
    const handleTouchDragEnd = (e: Event) => {
      const { partId, x, y } = (e as CustomEvent<{ x: number; y: number; partId: string }>).detail
      void placePart(partId, x, y)
    }

    window.addEventListener('dragend', clearDrag)
    canvas.addEventListener('dragover', handleDragOver)
    canvas.addEventListener('drop', handleDrop)
    canvas.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('touchDragMove', handleTouchDragMove)
    window.addEventListener('touchDragEnd', handleTouchDragEnd)

    return () => {
      window.removeEventListener('dragend', clearDrag)
      canvas.removeEventListener('dragover', handleDragOver)
      canvas.removeEventListener('drop', handleDrop)
      canvas.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('touchDragMove', handleTouchDragMove)
      window.removeEventListener('touchDragEnd', handleTouchDragEnd)
    }
  }, [camera, gl, setGhostPart, setHighlightedSocket, setDraggingPartId, addPartSmart, customTargets])

  return null
}
