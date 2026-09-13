import { useNavigate } from 'react-router'
import { GitFork } from 'lucide-react'
import { Button } from '../../common/Button'
import { useToast } from '../../common/Toast'
import { useAuthStore } from '../../../stores/authStore'
import { useForkPost } from '../../../hooks/useFork'

interface ReuseButtonProps {
  /** 源作品 id（用于 fork 接口与发布血缘 ?forkedFrom） */
  postId: string
  /** 源作品所属项目 id（仅用于判断/展示，跳转用的是克隆出的新项目 id） */
  projectId: string
  /** 作者是否开放复用；false 时按钮禁用并解释原因 */
  reusable: boolean
}

/**
 * 「复用这个设计」按钮（RFC-017 P1 / 开源复用闭环）。
 * - 作者未开放复用 → 禁用，悬停说明原因。
 * - 已开放复用 → 登录用户点击即克隆该作品为「我的」新项目，跳转编辑器改造；
 *   游客提示登录；克隆中禁用并显示「复用中…」。
 */
export function ReuseButton({ postId, projectId, reusable }: ReuseButtonProps) {
  const nav = useNavigate()
  const toast = useToast()
  const isLoggedIn = useAuthStore((s) => !!s.token && !s.user?.isGuest)
  const fork = useForkPost()

  // projectId 当前仅用于语义完整（来源项目）；跳转目标是克隆出的新项目，故标记已读。
  void projectId

  if (!reusable) {
    return (
      <Button size="sm" variant="outline" className="!rounded-full" leftIcon={<GitFork size={14} />} disabled title="作者未开放复用">
        复用这个设计
      </Button>
    )
  }

  const onReuse = () => {
    if (!isLoggedIn) {
      toast.push('info', '登录后才能复用')
      return
    }
    if (fork.isPending) return
    fork.mutate(postId, {
      onSuccess: ({ projectId: newProjectId }) => {
        toast.push('success', '已复制到你的作品，可继续编辑')
        nav(`/design/${newProjectId}?forkedFrom=${postId}`)
      },
      onError: (e) => toast.push('error', e instanceof Error ? e.message : '复用失败'),
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="!rounded-full"
      leftIcon={<GitFork size={14} />}
      onClick={onReuse}
      disabled={fork.isPending}
    >
      {fork.isPending ? '复用中…' : '复用这个设计'}
    </Button>
  )
}
