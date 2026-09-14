/**
 * useDesignSync — 将 designStore (localStorage) 的设计同步到后端。
 *
 * 策略：localStorage 提供即时离线草稿，登录账号后由后端提供跨设备持久化。
 * - 保存时：debounced PUT 幂等 upsert（按 localId=design.id），存整份 Design 快照
 * - 进入设计页：loadFromServer 把账号里的设计拉回本地（跨设备/新设备还原）
 * - 游客模式不同步
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getDroneDesigns, putDroneDesign } from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import { useDesignStore } from '../stores/designStore'
import type { Design } from '../types/design'
import { DroneDesignSnapshotSchema } from '@fwx/parts-schema'
import { trackEvent } from '../features/analytics/client'
import { trackOperationFailure } from '../utils/productEvents'

/**
 * Returns `saveToServer`（debounced 幂等保存）和 `loadFromServer`（跨设备回填）。
 */
export function useDesignSync() {
  const token = useAuthStore(s => s.token)
  const isGuest = useAuthStore(s => s.user?.isGuest)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const requestVersionRef = useRef(0)
  const mountedRef = useRef(true)
  const pendingRef = useRef<Design | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved')

  const persist = useCallback(async (design: Design): Promise<boolean> => {
    if (useAuthStore.getState().token !== token) return false
    // 游客和未登录用户的草稿由 designStore 同步保存在本机。
    if (isGuest || !token) {
      setSaveStatus('saved')
      trackEvent('local_design_saved', { designId: design.id, nonempty: Boolean(design.parts?.length) })
      return true
    }

    const requestVersion = ++requestVersionRef.current
    let failureStatus: number | undefined
    if (mountedRef.current) setSaveStatus('saving')
    try {
      const result = await putDroneDesign({
        localId: design.id, // design.id 稳定，跨设备同一份设计始终命中同一条后端记录
        name: design.name,
        designData: design, // 整份快照，原样还原
        weightG: design.safetyCheck?.totalWeightG ?? 0,
      })
      if (!result.success) {
        failureStatus = result.status
        throw new Error(result.error || result.message || '保存失败')
      }
      if (mountedRef.current && useAuthStore.getState().token === token && requestVersion === requestVersionRef.current) {
        setSaveStatus('saved')
      }
      return true
    } catch {
      if (useAuthStore.getState().token === token) trackOperationFailure('design_save', failureStatus)
      if (mountedRef.current && useAuthStore.getState().token === token && requestVersion === requestVersionRef.current) {
        setSaveStatus('error')
      }
      return false
    }
  }, [isGuest, token])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      const pending = pendingRef.current
      pendingRef.current = null
      // Moving to coding or the dashboard must not discard a queued save.
      if (pending) void persist(pending)
    }
  }, [persist])

  /** Debounced save — call this whenever the design changes. */
  const saveToServer = useCallback(
    (design: Design) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (pendingRef.current && pendingRef.current.id !== design.id) void persist(pendingRef.current)
      if (isGuest || !token) {
        setSaveStatus('saved')
        return
      }

      setSaveStatus('saving')
      pendingRef.current = design
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined
        pendingRef.current = null
        void persist(design)
      }, 2000) // 2s debounce — don't spam the server while user is dragging parts
    },
    [isGuest, persist, token],
  )

  /** Immediately persists the latest snapshot and reports whether account sync succeeded. */
  const saveNow = useCallback(async (design: Design): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
    pendingRef.current = null
    return persist(design)
  }, [persist])

  /** 从账号拉回设计并合并进本地（进入设计页时调用一次）。 */
  const loadFromServer = useCallback(async () => {
    if (isGuest || !token) return
    const res = await getDroneDesigns()
    if (useAuthStore.getState().token !== token) return
    if (!res.success || !res.data) return
    const designs = res.data.flatMap((record) => {
      const parsed = DroneDesignSnapshotSchema.safeParse(record.designData)
      return parsed.success ? [parsed.data] : []
    })
    if (designs.length > 0) {
      useDesignStore.getState().importServerDesigns(designs)
    }
  }, [isGuest, token])

  return { saveToServer, saveNow, loadFromServer, isSaving: saveStatus === 'saving', saveStatus }
}
