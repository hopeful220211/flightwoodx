import { useNavigate } from 'react-router'
import { User, Trophy, FolderOpen, Heart, Settings } from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import { Card } from '../../components/common/Card'
import { useAuthStore } from '../../stores/authStore'

export function MePage() {
  const nav = useNavigate()
  const user = useAuthStore(s => s.user)

  return (
    <PageContainer className="py-8 space-y-6">
      {/* Profile header */}
      <div className="flex items-center gap-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 shadow-sm">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
          ) : (
            <User size={32} />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{user?.username || user?.nickname || '用户'}</h1>
          <p className="text-sm text-ink-400 mt-0.5">{user?.email || '个人中心'}</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: FolderOpen, label: '我的作品', to: '/dashboard', color: 'bg-sky-100 text-sky-600' },
          { icon: Trophy, label: '我的奖项', to: '#', color: 'bg-accent-gold/20 text-accent-gold' },
          { icon: Heart, label: '我的收藏', to: '/collections', color: 'bg-error/10 text-error' },
          { icon: Settings, label: '账号设置', to: '/profile', color: 'bg-ink-100 text-ink-600' },
        ].map((item) => (
          <Card key={item.label} className={item.to === '#' ? 'opacity-60' : 'cursor-pointer'} onClick={item.to === '#' ? undefined : () => nav(item.to)}>
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}>
                <item.icon size={18} />
              </div>
              <span className="font-medium text-ink-900">{item.label}{item.to === '#' && <span className="ml-2 text-xs font-normal text-ink-400">暂未开放</span>}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Activity placeholder */}
      <Card hoverable={false}>
        <h2 className="text-lg font-semibold text-ink-900 mb-3">最近动态</h2>
        <div className="py-8 text-center text-ink-400">
          <p>动态记录暂未开放</p>
          <p className="text-sm mt-1">已保存的设计可在我的作品中查看。</p>
        </div>
      </Card>
    </PageContainer>
  )
}
