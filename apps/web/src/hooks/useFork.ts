import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '../utils/api'
import { trackOperationFailure } from '../utils/productEvents'

/**
 * 复用（fork）一个开放复用的社区作品。
 * 调 POST /community/posts/:id/fork，后端整份克隆设计+程序为「我的」新私密项目，
 * 返回新项目 id。无缓存需失效；跳转交给调用方（ReuseButton）。
 */
export function useForkPost() {
  return useMutation({
    mutationFn: async (postId: string): Promise<{ projectId: string }> => {
      let failureStatus: number | undefined
      try {
        const res = await apiFetch<{ projectId: string }>(`/community/posts/${postId}/fork`, { method: 'POST' })
        if (!res.success || !res.data?.projectId) {
          failureStatus = res.status
          throw new Error(res.error || '复用失败')
        }
        return { projectId: res.data.projectId }
      } catch (error) {
        trackOperationFailure('remix', failureStatus)
        throw error
      }
    },
  })
}
