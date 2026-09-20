// src/components/design/SocketHighlights.tsx
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDesignStore } from '../../stores/designStore'
import { partsData } from '../../data/parts'
import { getCachedPartConnectors } from '../../hooks/usePartConnectors'
import { useCustomPlacementTargets } from '../../features/partStudio/useCustomPlacementTargets'

import { isConnectionAllowed, computeOccupiedConnectors } from '../../utils/connectionRules'

interface SocketInfo {
  instanceId: string
  socketId: string
  worldPosition: THREE.Vector3
}

export function SocketHighlights() {
  const customTargets = useCustomPlacementTargets()
  const draggingPartId = useDesignStore((state) => state.draggingPartId)
  const activeDesign = useDesignStore((state) => state.getActiveDesign())
  // NOTE: do NOT subscribe to highlightedSocket here — it changes 60x/sec
  // during drag, which would re-render ALL indicators and restart animations.
  // Each SocketIndicator subscribes to its own highlight state instead.

  // 计算所有可用的插座位置
  const availableSockets = useMemo<SocketInfo[]>(() => {
    if (!draggingPartId || !activeDesign) return []

    const draggingPart = partsData.find((p) => p.id === draggingPartId)
    if (!draggingPart) return []

    // 检查是否是第一个机身（第一个机身不需要连接点）
    if (draggingPart.category === 'mainboard') {
      const existingHub = activeDesign.parts.find((inst) => {
        const p = partsData.find((pd) => pd.id === inst.partId)
        return p?.category === 'mainboard'
      })

      if (!existingHub && customTargets.length === 0) {
        // 第一个机身不需要连接点
        return []
      }
      // 第二个机身需要显示连接点，继续执行
    }

    // 查找拖拽零件的连接器（优先 plug，如果没有则用 socket）
    const draggingConnectors = getCachedPartConnectors(draggingPart.modelUrl)
    const draggingPlugConnector = draggingConnectors.find((c) => c.type === 'plug')
    const draggingSocketConnector = draggingConnectors.find((c) => c.type === 'socket')
    const draggingConnector = draggingPlugConnector || draggingSocketConnector

    if (!draggingConnector) return []

    // 计算已占用的连接点（父件 + 子件两侧都算占用）
    const occupiedSockets = computeOccupiedConnectors(activeDesign.parts)

    const sockets: SocketInfo[] = [...customTargets]

    // 遍历场景中的所有零件，找出可用的连接点（socket 和 plug）
    for (const inst of activeDesign.parts) {
      const partData = partsData.find((p) => p.id === inst.partId)
      if (!partData) continue

      // 检查连接规则
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

        // 计算连接点的世界坐标
        const worldPos = connector.position.clone().multiply(new THREE.Vector3(...(inst.scale ?? [1, 1, 1]))).applyQuaternion(instQuat).add(instPos)
        sockets.push({
          instanceId: inst.instanceId,
          socketId: connector.id,
          worldPosition: worldPos,
        })
      }
    }

    return sockets
  }, [draggingPartId, activeDesign, customTargets])

  if (!draggingPartId || availableSockets.length === 0) {
    return null
  }

  return (
    <group>
      {availableSockets.map((socket) => (
        <SocketIndicator
          key={`${socket.instanceId}-${socket.socketId}`}
          position={socket.worldPosition}
          instanceId={socket.instanceId}
          socketId={socket.socketId}
        />
      ))}
    </group>
  )
}

interface SocketIndicatorProps {
  position: THREE.Vector3
  instanceId: string
  socketId: string
}

function SocketIndicator({ position, instanceId, socketId }: SocketIndicatorProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshStandardMaterial>(null)
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  // Track highlight via ref to avoid React re-renders entirely
  const currentOpacity = useRef(0.8)
  const currentEmissive = useRef(0.5)
  const currentScale = useRef(1)

  // All visual updates happen in useFrame via lerp — no instant jumps
  useFrame((state) => {
    if (!materialRef.current || !meshRef.current) return

    // Read highlight state directly from store (no React re-render)
    const hl = useDesignStore.getState().highlightedSocket
    const highlighted = hl?.instanceId === instanceId && hl?.socketId === socketId

    const time = state.clock.getElapsedTime()

    // Target values
    const targetOpacity = highlighted ? 1.0 : 0.8 + (Math.sin(time * 0.8) + 1) / 2 * 0.15
    const targetEmissive = highlighted ? 1.5 : 0.5 + (Math.sin(time * 0.8) + 1) / 2 * 0.15
    const targetScale = highlighted ? 1.3 : 1.0

    // Smooth lerp (never instant)
    currentOpacity.current += (targetOpacity - currentOpacity.current) * 0.12
    currentEmissive.current += (targetEmissive - currentEmissive.current) * 0.12
    currentScale.current += (targetScale - currentScale.current) * 0.12

    materialRef.current.emissiveIntensity = currentEmissive.current
    materialRef.current.opacity = currentOpacity.current
    meshRef.current.scale.setScalar(currentScale.current)

    // Ring visible only when close to highlighted
    if (ringRef.current) {
      ringRef.current.visible = currentScale.current > 1.15
      if (ringRef.current.visible) {
        ringRef.current.rotation.z = time * 1.5
      }
    }
    if (ringMaterialRef.current) {
      ringMaterialRef.current.opacity = Math.max(0, (currentScale.current - 1.15) * 4)
    }
  })

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.0015, 10, 10]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#4AADE8"
          emissive="#4AADE8"
          emissiveIntensity={0.5}
          transparent
          opacity={0.8}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.0024, 0.0036, 20]} />
        <meshBasicMaterial
          ref={ringMaterialRef}
          color="#4AADE8"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
