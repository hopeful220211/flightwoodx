/**
 * ProjectSettingsModal — 项目设置弹窗（C1 / M5）。
 *
 * 只放「真能用」的设置：改名（乐观更新）、项目信息（只读）、删除（二次确认）。
 * 刻意不放「公开/私密」开关——项目级可见性目前没有任何消费方（社区作品墙用的是
 * 设计而非项目），放了就是假设置。等社区项目流落地再补。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2, AlertTriangle, Hash, Calendar } from 'lucide-react'
import { Modal } from '../../common/Modal'
import { Button } from '../../common/Button'
import { useToast } from '../../common/Toast'
import { useUpdateProject, useDeleteProject } from '../../../hooks/useProjects'
import type { ProjectData } from '../../../utils/api'

interface ProjectSettingsModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  name: string
}

export function ProjectSettingsModal({ open, onClose, projectId, name }: ProjectSettingsModalProps) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const updateMutation = useUpdateProject()
  const deleteMutation = useDeleteProject()

  // 本弹窗在 ProjectHub 里按需挂载（{settingsOpen && <… />}），每次打开都是全新实例，
  // 故 useState 直接用当前值初始化即可，无需 effect 同步。
  const [nameInput, setNameInput] = useState(name)
  const [confirming, setConfirming] = useState(false)

  // 创建时间从已缓存的项目读（详情页已经拉过 ['project', id]）
  const createdAt = qc.getQueryData<ProjectData>(['project', projectId])?.createdAt

  const trimmed = nameInput.trim()
  const nameDirty = trimmed !== '' && trimmed !== name

  const handleSaveName = async () => {
    if (!nameDirty) return
    try {
      await updateMutation.mutateAsync({ id: projectId, data: { name: trimmed } })
      toast.push('success', '项目名已更新')
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(projectId)
      qc.removeQueries({ queryKey: ['project', projectId] }) // 避免返回前详情查询 404 闪一下
      toast.push('success', '项目已删除')
      onClose()
      nav('/dashboard')
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="项目设置">
      {confirming ? (
        // ── 二次确认 ──
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-error/10 p-4">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-error" />
            <div>
              <p className="text-sm font-semibold text-error">删除「{name}」？</p>
              <p className="mt-1 text-sm text-error">删除后无法恢复，这个项目里的设计、程序记录都会一起消失。</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={deleteMutation.isPending}>
              取消
            </Button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-error px-4 py-2 text-sm font-semibold text-white transition hover:bg-error/90 disabled:opacity-60"
            >
              <Trash2 size={15} />
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </button>
          </div>
        </div>
      ) : (
        // ── 设置主体 ──
        <div className="space-y-6">
          {/* 项目名称 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-sky-900">项目名称</label>
            <div className="flex gap-2">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={40}
                placeholder="给项目起个名字"
                className="site-form-control min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-sky-900 outline-none focus:ring-2 focus:ring-sky-200"
              />
              <Button onClick={handleSaveName} disabled={!nameDirty || updateMutation.isPending}>
                {updateMutation.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>

          {/* 项目信息（只读） */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-sky-900">项目信息</p>
            <div className="space-y-1.5 rounded-lg bg-sky-50/70 p-3 text-sm text-sky-600">
              <div className="flex items-center gap-2">
                <Hash size={14} className="text-sky-400" />
                项目编号 {projectId.slice(0, 8)}
              </div>
              {createdAt && (
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-sky-400" />
                  创建于 {new Date(createdAt).toLocaleDateString('zh-CN')}
                </div>
              )}
            </div>
          </div>

          {/* 危险区 */}
          <div className="space-y-2 border-t border-error/15 pt-4">
            <p className="text-sm font-semibold text-error">危险操作</p>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-error">删除后无法恢复，请谨慎操作。</p>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-error/30 px-3 py-1.5 text-sm font-semibold text-error transition hover:bg-error/10"
              >
                <Trash2 size={15} />
                删除项目
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
