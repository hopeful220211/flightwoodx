import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Bookmark, FolderHeart, Images, Lock, Plus, Sparkles } from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import { Button } from '../../components/common/Button'
import { Input } from '../../components/common/Input'
import { Modal } from '../../components/common/Modal'
import { useToast } from '../../components/common/Toast'
import { useAuthStore } from '../../stores/authStore'
import { CommunityShell } from '../../components/features/community/CommunityShell'
import { useCreateCollection, useMyCollections, type CollectionDTO } from '../../hooks/useCollections'

const EASE = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'

export function CollectionsPage() {
  const nav = useNavigate()
  const toast = useToast()
  const isLoggedIn = useAuthStore((s) => !!s.token && !s.user?.isGuest)

  const { data: collections, isLoading, isError, refetch } = useMyCollections(isLoggedIn)
  const createCollection = useCreateCollection()

  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const resetForm = () => {
    setName('')
    setDescription('')
    setIsPublic(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    resetForm()
  }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.push('warning', '请输入合集名称')
      return
    }
    createCollection.mutate(
      { name: trimmed, description: description.trim() || undefined, isPublic },
      {
        onSuccess: (created) => {
          toast.push('success', '合集已创建')
          closeModal()
          nav(`/collections/${created.id}`)
        },
        onError: (err) => toast.push('error', err instanceof Error ? err.message : '创建合集失败'),
      },
    )
  }

  // 未登录：友好引导
  if (!isLoggedIn) {
    return (
      <CommunityShell>
        <PageContainer className="py-10 lg:py-14">
          <Hero />
          <div className="rounded-2xl border border-dashed border-sky-200 bg-white/50 py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
              <FolderHeart size={24} className="text-sky-400" />
            </div>
            <p className="text-black/55">登录后即可创建合集、收藏喜欢的作品</p>
            <button
              onClick={() => nav('/login')}
              className={`mt-4 inline-flex items-center rounded-full bg-sky-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sky-glow transition-all hover:bg-sky-600 ${EASE}`}
            >
              去登录
            </button>
          </div>
        </PageContainer>
      </CommunityShell>
    )
  }

  return (
    <CommunityShell>
      <PageContainer className="py-10 lg:py-14">
      <Hero
        action={
          !!collections && collections.length > 0 ? (
            <button
              onClick={() => setModalOpen(true)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sky-glow transition-all hover:bg-sky-600 ${EASE}`}
            >
              <Plus size={16} /> 新建合集
            </button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-white ring-1 ring-sky-100">
              <div className="aspect-[4/3] animate-pulse bg-sky-50" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-sky-50" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-sky-50" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-dashed border-sky-200 bg-white/50 py-20 text-center">
          <p className="text-black/55">收藏夹加载失败了</p>
          <button
            onClick={() => refetch()}
            className="mt-3 rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-sky-600"
          >
            重试
          </button>
        </div>
      ) : !collections || collections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sky-200 bg-white/50 py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
            <FolderHeart size={24} className="text-sky-300" />
          </div>
          <p className="text-black/55">暂无合集。新建合集后，可以收藏社区作品。</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <button
              onClick={() => setModalOpen(true)}
              className={`inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sky-glow transition-all hover:bg-sky-600 ${EASE}`}
            >
              <Plus size={16} /> 新建合集
            </button>
            <button
              onClick={() => nav('/community')}
              className="inline-flex items-center rounded-full border border-sky-200 bg-white px-5 py-2.5 text-sm font-semibold text-black/75 shadow-soft transition hover:border-sky-300 hover:bg-sky-50"
            >
              查看社区作品
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {collections.map((c: CollectionDTO) => (
            <BoardCard key={c.id} collection={c} onOpen={() => nav(`/collections/${c.id}`)} />
          ))}

          {/* 新建合集占位卡 */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={`group flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 p-4 text-center transition-all hover:-translate-y-1.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 motion-reduce:hover:translate-y-0 ${EASE}`}
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-white text-sky-500 shadow-soft ring-1 ring-sky-100 transition-transform group-hover:scale-110 motion-reduce:transition-none ${EASE}`}>
              <Plus size={22} />
            </span>
            <span className="text-sm font-semibold text-black/75">新建合集</span>
          </button>
        </div>
      )}

      {/* 新建合集弹窗 */}
      <Modal
        open={modalOpen}
        title="新建合集"
        onClose={closeModal}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={closeModal}>
              取消
            </Button>
            <Button size="sm" loading={createCollection.isPending} onClick={submit}>
              创建
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="合集名称"
            placeholder="例如：我最喜欢的飞机"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoFocus
          />
          <Input
            label="描述（可选）"
            placeholder="填写合集内容或用途"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-black/75 select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-sky-300 text-sky-500 focus:ring-sky-400"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            公开这个合集（其他人也能看到）
          </label>
        </div>
      </Modal>
      </PageContainer>
    </CommunityShell>
  )
}

/** 页面 hero：eyebrow + 标题 + 副标题，可选右侧操作（与社区广场风格一致）。 */
function Hero({ action }: { action?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4 lg:mb-10">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-500 ring-1 ring-sky-100 backdrop-blur">
          <Sparkles size={12} /> 我的收藏夹
        </span>
        <h1 className="fwx-display mt-4 text-4xl font-semibold tracking-tight text-black/90 lg:text-5xl">我的收藏</h1>
        <p className="mt-3 max-w-xl text-black/55">
          将社区作品按主题保存到合集，方便查找和再次查看。可以设置合集为公开或私密。
        </p>
      </div>
      {action}
    </header>
  )
}

/** 单个合集封面卡：封面图或柔和天蓝渐变占位，hover 上浮。 */
function BoardCard({ collection, onOpen }: { collection: CollectionDTO; onOpen: () => void }) {
  return (
    <article
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-sky-100 transition-all hover:-translate-y-1.5 hover:shadow-lift hover:ring-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 motion-reduce:hover:translate-y-0 ${EASE}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-sky-100 to-sky-50">
        {collection.coverUrl ? (
          <img
            src={collection.coverUrl}
            alt={collection.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transition-none"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Images size={26} className="text-sky-300/80" />
          </div>
        )}
        {!collection.isPublic && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium text-black/55 shadow-soft backdrop-blur-md">
            <Lock size={11} /> 私密
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="truncate font-semibold text-black/90">{collection.name}</h3>
        <p className="mt-1 inline-flex items-center gap-1 text-sm text-black/45">
          <Bookmark size={12} /> {collection.itemCount} 件作品
        </p>
      </div>
    </article>
  )
}
