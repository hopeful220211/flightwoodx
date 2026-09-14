/**
 * PublishModal — 把一个项目发布到社区（RFC-017 P0）。
 *
 * 流程：填标题/描述 → 发布。后端强校验「项目属本人且 visibility=public」，
 * 若项目仍为私密，后端拒绝，本弹窗给出「公开项目并发布」二次确认按钮
 * （会改 Project.visibility=public，文案点明该副作用），不在前端绕过校验。
 * 发布幂等：同一项目重复发布返回既有作品。
 */
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Modal } from '../../common/Modal'
import { Button } from '../../common/Button'
import { Input } from '../../common/Input'
import { useToast } from '../../common/Toast'
import { createCommunityPost, updateProject } from '../../../utils/api'
import { trackOperationFailure } from '../../../utils/productEvents'

interface PublishModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  defaultTitle?: string
}

export function PublishModal({ open, onClose, projectId, defaultTitle }: PublishModalProps) {
  const nav = useNavigate()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  // 若本项目是「复用」别人作品后改造而来，URL 上会带 ?forkedFrom=源作品id；
  // 发布时透传给后端，落地为作品血缘（forkFromId），让详情页显示「基于 …… 再创作」。
  const forkFromPostId = searchParams.get('forkedFrom') || undefined
  const [title, setTitle] = useState(defaultTitle || '')
  const [description, setDescription] = useState('')
  // 开源复用开关：作者勾选后，别的同学才能在社区「复用这个设计」（默认关）。
  const [reusable, setReusable] = useState(false)
  const [needPublic, setNeedPublic] = useState(false)
  const [busy, setBusy] = useState(false)

  const doPublish = async () => {
    const res = await createCommunityPost({
      projectId,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      // 只在勾选时发送 reusable=true：重复发布一个「已开放复用」的作品时不会把它悄悄关掉
      ...(reusable ? { reusable: true } : {}),
      forkFromPostId,
    })
    if (res.success && res.data) {
      toast.push('success', res.data.alreadyPublished ? '该作品已在社区，已为你打开' : '已发布到社区！')
      onClose()
      nav(`/community/${res.data.post.id}`)
      return
    }
    // 项目还是私密 → 引导公开
    if ((res.error || '').includes('公开')) {
      trackOperationFailure('publish', res.status ?? 400)
      setNeedPublic(true)
      return
    }
    trackOperationFailure('publish', res.status)
    toast.push('error', res.error || '发布失败')
  }

  const handlePublish = async () => {
    setBusy(true)
    try {
      await doPublish()
    } catch (error) {
      trackOperationFailure('publish')
      throw error
    } finally {
      setBusy(false)
    }
  }

  const handlePublicAndPublish = async () => {
    setBusy(true)
    try {
      const up = await updateProject(projectId, { visibility: 'public' })
      if (!up.success) {
        trackOperationFailure('publish', up.status)
        toast.push('error', up.error || '公开项目失败')
        return
      }
      setNeedPublic(false)
      await doPublish()
    } catch (error) {
      trackOperationFailure('publish')
      throw error
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="发布到社区">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">作品标题</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入作品名称" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">作品介绍（可选）</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="介绍使用的零件、结构或设计方法"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-ink-900 outline-none focus:border-sky-400"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-sky-50 p-3 ring-1 ring-sky-100">
          <input
            type="checkbox"
            checked={reusable}
            onChange={(e) => setReusable(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-sky-500"
          />
          <span className="text-sm">
            <span className="font-medium text-ink-800">允许其他用户复制并编辑我的设计</span>
            <span className="mt-0.5 block text-xs text-ink-400">开启后，其他用户可将此设计复制到自己的作品中，修改不会影响原作品。</span>
          </span>
        </label>

        {needPublic ? (
          <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-sm text-amber-700">这个项目目前是<strong>私密</strong>的。发布到社区会让它<strong>公开可见</strong>。</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>取消发布</Button>
              <Button size="sm" onClick={handlePublicAndPublish} disabled={busy}>公开项目并发布</Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
            <Button onClick={handlePublish} disabled={busy}>{busy ? '发布中…' : '发布'}</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
