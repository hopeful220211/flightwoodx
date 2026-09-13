import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Bookmark, Check, Images, Loader2, Lock, Plus } from 'lucide-react'
import { Button } from '../../common/Button'
import { Input } from '../../common/Input'
import { Modal } from '../../common/Modal'
import { useToast } from '../../common/Toast'
import { useAuthStore } from '../../../stores/authStore'
import {
  useAddToCollection,
  useCollectionMemberships,
  useCreateCollection,
  useMyCollections,
  useRemoveFromCollection,
  type CollectionDTO,
} from '../../../hooks/useCollections'

const EASE = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'

export interface SaveToCollectionButtonProps {
  postId: string
}

/**
 * 「收藏」按钮：点击后（登录态）弹出我的合集清单，每个合集一行带勾选；
 * 勾选 = 该合集已含此作品，切换即加入 / 移出（幂等）。底部内联「＋ 新建合集」（建完即加入）。
 */
export function SaveToCollectionButton({ postId }: SaveToCollectionButtonProps) {
  const nav = useNavigate()
  const toast = useToast()
  const isLoggedIn = useAuthStore((s) => !!s.token && !s.user?.isGuest)

  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: collections, isLoading: loadingCollections } = useMyCollections(open && isLoggedIn)
  const { data: memberIds, isLoading: loadingMembers } = useCollectionMemberships(postId, open && isLoggedIn)

  const addToCollection = useAddToCollection()
  const removeFromCollection = useRemoveFromCollection()
  const createCollection = useCreateCollection()

  const memberSet = useMemo(() => new Set(memberIds ?? []), [memberIds])
  const savedCount = memberSet.size

  const openPopover = () => {
    if (!isLoggedIn) {
      toast.push('info', '请先登录再收藏')
      return
    }
    setOpen(true)
  }

  const toggle = (collectionId: string, contained: boolean) => {
    if (contained) {
      removeFromCollection.mutate(
        { collectionId, postId },
        { onError: (err) => toast.push('error', err instanceof Error ? err.message : '移出失败') },
      )
    } else {
      addToCollection.mutate(
        { collectionId, postId },
        {
          onSuccess: () => toast.push('success', '已收藏'),
          onError: (err) => toast.push('error', err instanceof Error ? err.message : '收藏失败'),
        },
      )
    }
  }

  const submitCreate = () => {
    const trimmed = newName.trim()
    if (!trimmed) {
      toast.push('warning', '请先给合集起个名字')
      return
    }
    createCollection.mutate(
      { name: trimmed },
      {
        onSuccess: (created) => {
          // 建完立即把当前作品加入新合集
          addToCollection.mutate(
            { collectionId: created.id, postId },
            {
              onSuccess: () => toast.push('success', '已创建并收藏'),
              onError: (err) => toast.push('error', err instanceof Error ? err.message : '收藏失败'),
            },
          )
          setCreating(false)
          setNewName('')
        },
        onError: (err) => toast.push('error', err instanceof Error ? err.message : '创建合集失败'),
      },
    )
  }

  const closeModal = () => {
    setOpen(false)
    setCreating(false)
    setNewName('')
  }

  const loading = loadingCollections || loadingMembers
  const isSaved = savedCount > 0
  const boards = collections ?? []

  return (
    <>
      <Button
        size="sm"
        variant={isSaved ? 'primary' : 'outline'}
        className="!rounded-full"
        leftIcon={<Bookmark size={14} fill={isSaved ? 'currentColor' : 'none'} />}
        onClick={openPopover}
        aria-pressed={isSaved}
      >
        {isSaved ? `已收藏${savedCount > 1 ? ` · ${savedCount}` : ''}` : '收藏'}
      </Button>

      <Modal open={open} title="收藏到合集" onClose={closeModal}>
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-black/45">
              <Loader2 size={18} className="animate-spin motion-reduce:animate-none" />
              <span className="text-sm">正在加载你的合集…</span>
            </div>
          ) : (
            <>
              {boards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 py-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
                    <Bookmark size={20} className="text-sky-300" />
                  </div>
                  <p className="text-sm text-black/55">暂无合集。新建合集后可收藏此作品。</p>
                </div>
              ) : (
                <ul className="-mx-1 max-h-80 space-y-1 overflow-y-auto px-1">
                  {boards.map((c: CollectionDTO) => {
                    const contained = memberSet.has(c.id)
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => toggle(c.id, contained)}
                          aria-pressed={contained}
                          className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${EASE} ${
                            contained
                              ? 'border-sky-200 bg-sky-50/70'
                              : 'border-transparent hover:border-sky-100 hover:bg-sky-50/60'
                          }`}
                        >
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-sky-100 to-sky-50">
                            {c.coverUrl ? (
                              <img src={c.coverUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Images size={18} className="text-sky-300/80" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-black/90">{c.name}</span>
                              {!c.isPublic && <Lock size={11} className="shrink-0 text-black/45" aria-label="私密合集" />}
                            </span>
                            <span className="mt-0.5 block text-xs text-black/45">{c.itemCount} 件作品</span>
                          </span>
                          <span
                            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all ${EASE} ${
                              contained ? 'border-sky-500 bg-sky-500 text-white' : 'border-sky-200 text-transparent'
                            }`}
                            aria-hidden="true"
                          >
                            <Check size={14} />
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {/* 内联新建合集 */}
              {creating ? (
                <div className="flex items-center gap-2 border-t border-sky-100 pt-3">
                  <Input
                    placeholder="新合集名称"
                    maxLength={40}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
                    autoFocus
                  />
                  <Button size="sm" loading={createCollection.isPending} onClick={submitCreate}>
                    创建
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className={`flex w-full items-center gap-2 rounded-xl border border-dashed border-sky-200 bg-sky-50/40 px-3 py-2.5 text-sm font-semibold text-sky-600 transition-all hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${EASE}`}
                >
                  <Plus size={16} /> 新建合集
                </button>
              )}

              <div className="flex items-center justify-between border-t border-sky-100 pt-3">
                <button
                  type="button"
                  onClick={() => nav('/collections')}
                  className="rounded text-sm text-black/45 transition-colors hover:text-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  管理我的合集
                </button>
                <Button size="sm" variant="outline" onClick={closeModal}>
                  完成
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}
