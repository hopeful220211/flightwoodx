// src/components/design/ActionMenu.tsx
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useDesignStore } from '../../stores/designStore'
import { Trash2, FlipVertical2, Repeat, Unlink } from 'lucide-react'
import { partsData } from '../../data/parts'
import { getCachedPartConnectors } from '../../hooks/usePartConnectors'
import { computePerpendicularSnap, quaternionToEuler } from './snap'
import { transformPartTree } from './assemblyTransforms'
import type { PartInstance } from '../../types/design'

export function ActionMenu() {
  const selectedInstanceId = useDesignStore((state) => state.selectedInstanceId)
  const activeDesign = useDesignStore((state) => state.getActiveDesign())
  const removePartFromActiveDesign = useDesignStore((state) => state.removePartFromActiveDesign)
  const setSelectedInstanceId = useDesignStore((state) => state.setSelectedInstanceId)

  if (!selectedInstanceId || !activeDesign) return null

  const instance = activeDesign.parts.find((p) => p.instanceId === selectedInstanceId)
  if (!instance) return null
  const customConnection = !!instance.attachedTo && (!!instance.source || !!activeDesign.parts.find(p => p.instanceId === instance.attachedTo?.parentInstanceId)?.source)

  const updatePartInActiveDesign = (instanceId: string, updates: Partial<PartInstance>) => {
    useDesignStore.setState(state => ({ designs: state.designs.map(design => design.id === state.activeDesignId
      ? { ...design, parts: transformPartTree(design.parts, instanceId, updates), updatedAt: new Date().toISOString() }
      : design) }))
  }

  // Position menu above the selected part
  const menuPosition: [number, number, number] = [
    instance.position[0],
    instance.position[1] + 0.02,
    instance.position[2],
  ]

  const handleDelete = () => {
    removePartFromActiveDesign(selectedInstanceId)
    setSelectedInstanceId(null)
  }

  const handleFlip = () => {
    // 绕连接点的局部Z轴旋转180度
    if (!instance.attachedTo) {
      // 如果没有连接到父零件（如机身），则绕自身Z轴旋转
      const currentRotation = instance.rotation || [0, 0, 0]
      const currentQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(currentRotation[0], currentRotation[1], currentRotation[2])
      )
      const flipQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
      const newQuat = currentQuat.clone().multiply(flipQuat)
      const newEuler = new THREE.Euler().setFromQuaternion(newQuat, 'XYZ')
      updatePartInActiveDesign(selectedInstanceId, {
        rotation: [newEuler.x, newEuler.y, newEuler.z]
      })
      return
    }

    // 获取父零件和连接点信息
    const parentInst = activeDesign.parts.find((p) => p.instanceId === instance.attachedTo?.parentInstanceId)
    const parentPart = parentInst ? partsData.find((p) => p.id === parentInst.partId) : null
    if (!parentInst || !parentPart) return

    const parentConns = getCachedPartConnectors(parentPart.modelUrl) ?? []
    const socket = parentConns.find((c) => c.id === instance.attachedTo?.parentConnectorId) ?? null
    if (!socket) return

    // 计算连接点的世界坐标（作为旋转中心）
    const parentPos = new THREE.Vector3(...parentInst.position)
    const parentQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...parentInst.rotation))
    const pivotPoint = socket.position.clone().multiply(new THREE.Vector3(...(parentInst.scale ?? [1, 1, 1]))).applyQuaternion(parentQuat).add(parentPos)

    // 当前零件的位置和旋转
    const currentPos = new THREE.Vector3(...instance.position)
    const currentRotation = instance.rotation || [0, 0, 0]
    const currentQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(currentRotation[0], currentRotation[1], currentRotation[2])
    )

    // Flip around the socket's -Y world direction (the insertion axis)
    // This keeps the part vertically inserted but rotates it 180° in-place
    let socketWorldQuaternion = parentQuat.clone().multiply(socket.quaternion.clone())
    if (socket.type === 'plug') {
      const pFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
      socketWorldQuaternion = socketWorldQuaternion.clone().multiply(pFlip)
    }
    const insertionAxis = new THREE.Vector3(0, -1, 0).applyQuaternion(socketWorldQuaternion)
    const flipQuat = new THREE.Quaternion().setFromAxisAngle(insertionAxis, Math.PI)

    // 计算新位置：绕零件局部Z轴旋转，以连接点为中心
    // newPos = pivot + flipQuat * (currentPos - pivot)
    const relativePos = currentPos.clone().sub(pivotPoint)
    const rotatedRelativePos = relativePos.applyQuaternion(flipQuat)
    const newPos = pivotPoint.clone().add(rotatedRelativePos)

    // 计算新旋转
    const newQuat = flipQuat.clone().multiply(currentQuat)
    const newEuler = new THREE.Euler().setFromQuaternion(newQuat, 'XYZ')

    updatePartInActiveDesign(selectedInstanceId, {
      position: [newPos.x, newPos.y, newPos.z],
      rotation: [newEuler.x, newEuler.y, newEuler.z],
    })
  }

  const handleSwitchConnector = () => {
    if (!selectedInstanceId || !activeDesign) return
    const inst = activeDesign.parts.find((p) => p.instanceId === selectedInstanceId)
    if (!inst?.attachedTo) return

    const part = partsData.find((p) => p.id === inst.partId)
    const parentInst = activeDesign.parts.find((p) => p.instanceId === inst.attachedTo?.parentInstanceId)
    const parentPart = parentInst ? partsData.find((p) => p.id === parentInst.partId) : null
    if (!part || !parentInst || !parentPart) return

    const childConns = getCachedPartConnectors(part.modelUrl)
    // Prefer plugs; if none (e.g. mainboard has only sockets), use sockets
    const plugs = childConns.filter((c) => c.type === 'plug')
    const occupiedByChildren = new Set(activeDesign.parts.filter(p => p.attachedTo?.parentInstanceId === inst.instanceId).map(p => p.attachedTo!.parentConnectorId))
    const usableConns = (plugs.length > 0 ? plugs : childConns.filter((c) => c.type === 'socket')).filter(c => !occupiedByChildren.has(c.id))
    if (!usableConns.length) return

    const currentId = inst.activeConnectorId ?? usableConns[0]!.id
    const idx = Math.max(0, usableConns.findIndex((p) => p.id === currentId))
    const nextPlug = usableConns[(idx + 1) % usableConns.length]!

    const parentConns = getCachedPartConnectors(parentPart.modelUrl) ?? []
    const socket = parentConns.find((c) => c.id === inst.attachedTo?.parentConnectorId) ?? null
    if (!socket) return

    const parentPos = new THREE.Vector3(...parentInst.position)
    const parentQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...parentInst.rotation))
    const socketWorldPosition = socket.position.clone().multiply(new THREE.Vector3(...(parentInst.scale ?? [1, 1, 1]))).applyQuaternion(parentQuat).add(parentPos)
    let socketWorldQuaternion = parentQuat.clone().multiply(socket.quaternion.clone())
    if (socket.type === 'plug' && nextPlug.type === 'plug') {
      socketWorldQuaternion = socketWorldQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI))
    }

    const { position: newPos, quaternion: newQuaternion } = computePerpendicularSnap({
      socketWorldPosition,
      socketWorldQuaternion,
      plugLocalPosition: nextPlug.position,
      plugLocalQuaternion: nextPlug.quaternion,
    })

    updatePartInActiveDesign(selectedInstanceId, {
      activeConnectorId: nextPlug.id,
      position: [newPos.x, newPos.y, newPos.z],
      rotation: quaternionToEuler(newQuaternion),
    })
  }

  // 使用<Html>组件将2D UI包裹起来，安全地在3D场景中渲染
  return (
    <Html position={menuPosition} center zIndexRange={[100, 0]} style={{ pointerEvents: 'auto' }}>
      <div
        className="flex items-center gap-1 p-1.5 bg-white/95 rounded-full shadow-lg border border-amber-100"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleDelete}
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-red-50 text-gray-600 hover:text-red-500 transition-colors"
          title={activeDesign.parts.some(p => p.attachedTo?.parentInstanceId === instance.instanceId) ? '删除（含已连接的子零件）' : '删除'}
        >
          <Trash2 size={18} />
        </button>
        <button
          onClick={handleFlip}
          disabled={customConnection}
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-amber-50 text-gray-600 hover:text-amber-600 transition-colors"
          title={customConnection ? '先断开连接再翻转' : '翻转'}
        >
          <FlipVertical2 size={18} />
        </button>
        {!instance.source && !customConnection && <button
          onClick={handleSwitchConnector}
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-amber-50 text-gray-600 hover:text-amber-600 transition-colors"
          title="更换连接点"
        >
          <Repeat size={18} />
        </button>}
        {instance.attachedTo && <button onClick={() => useDesignStore.getState().disconnectPart(instance.instanceId)} className="flex h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100" title="断开连接" aria-label="断开连接"><Unlink size={18} /></button>}
      </div>
    </Html>
  )
}
