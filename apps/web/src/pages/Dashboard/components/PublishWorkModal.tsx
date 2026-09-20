/**
 * PublishWorkModal — 把工作台里的一件作品（设计）发布到社区（RFC-024 §4.2 作品库合一）。
 *
 * 合一后作品的真相源是 DroneDesign（不再是 Project），所以走设计版发布流程：
 *  1. 确保这件作品在服务器有记录（拿到服务器 id）——本地新作品会先 PUT 一次落库；
 *  2. PATCH /drone-designs/:id 设为公开（+ 是否允许复用）；
 *  3. POST /community/posts 带 designId 发帖（幂等，重复发布返回既有作品）。
 *
 * 发布 = 公开，文案已点明该副作用；无需像旧版那样二次确认「公开项目」。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../../components/common/Modal'
import { Button } from '../../../components/common/Button'
import { Input } from '../../../components/common/Input'
import { useToast } from '../../../components/common/Toast'
import { putDroneDesign, updateDroneDesign, createCommunityPost } from '../../../utils/api'
import { MY_DESIGNS_KEY } from '../../../hooks/useMyDesigns'
import type { Design } from '../../../types/design'
import { trackOperationFailure } from '../../../utils/productEvents'

interface PublishWorkModalProps {
  open: boolean
  onClose: () => void
  /** 要发布的本地作品。 */
  design: Design | null
  /** 该作品在服务器的记录 id（已同步过则有；未同步则本弹窗先 PUT 落库拿到）。 */
  serverId?: string
  /** 服务器上已设的「允许复用」，用于回显默认值。 */
  initialReusable?: boolean
}

export function PublishWorkModal({ open, onClose, design, serverId, initialReusable }: PublishWorkModalProps) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [title, setTitle] = useState(design?.name ?? '')
  const [description, setDescription] = useState('')
  const [reusable, setReusable] = useState(initialReusable ?? false)
  const [busy, setBusy] = useState(false)

  const handlePublish = async () => {
    if (!design) return
    setBusy(true)
    try {
      // 1) 确保有服务器 id（本地新作品先落库）
      let id = serverId
      if (!id) {
        const put = await putDroneDesign({
          localId: design.id,
          name: design.name,
          designData: design,
          weightG: design.safetyCheck?.totalWeightG ?? 0,
        })
        if (!put.success || !put.data) {
          trackOperationFailure('publish', put.status)
          toast.push('error', put.error || '保存作品失败，请重试')
          return
        }
        id = put.data.id
      }

      if (!id) {
        trackOperationFailure('publish', 400)
        toast.push('error', '未找到账号中的作品记录，请保存后重试')
        return
      }

      // 2) 设为公开（+ 是否允许复用）
      const patch = await updateDroneDesign(id, { visibility: 'public', reusable })
      if (!patch.success) {
        trackOperationFailure('publish', patch.status)
        toast.push('error', patch.error || '公开作品失败')
        return
      }

      // 3) 发帖（带 designId，幂等）
      const post = await createCommunityPost({
        designId: id,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        // 只在勾选时发送 reusable=true，避免重复发布把已开放的复用悄悄关掉
        ...(reusable ? { reusable: true } : {}),
      })
      if (post.success && post.data) {
        toast.push('success', post.data.alreadyPublished ? '这个作品已在社区，已为你打开' : '已发布到社区！')
        qc.invalidateQueries({ queryKey: MY_DESIGNS_KEY })
        onClose()
        nav(`/community/${post.data.post.id}`)
        return
      }
      trackOperationFailure('publish', post.status)
      toast.push('error', post.error || '发布失败')
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
            className="site-form-control w-full rounded-lg border border-sky-200 px-3 py-2 text-sm text-ink-900 outline-none focus:border-sky-400"
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

        <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700 ring-1 ring-sky-100">
          发布后，所有访问社区的用户都能查看此作品。
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
          <Button onClick={handlePublish} disabled={busy}>{busy ? '发布中…' : '发布'}</Button>
        </div>
      </div>
    </Modal>
  )
}
