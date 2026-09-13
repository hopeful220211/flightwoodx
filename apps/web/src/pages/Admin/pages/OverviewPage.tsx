import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Users, BookOpen, Boxes, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { realAdminApi } from '../../../api/admin/realClient'
import { BigStat } from '../../../components/common/BigStat'
import { Button } from '../../../components/common/Button'

export function AdminOverviewPage() {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => {
      const res = await realAdminApi.getOverview()
      if (!res.success) throw new Error(res.error.message)
      return res.data
    },
    retry: false,
  })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-h3 font-semibold tracking-tight text-sky-900">概览</h1>
        <Button variant="outline" size="sm" onClick={() => { void refetch() }} disabled={isFetching} leftIcon={<RefreshCw size={14} />}>刷新</Button>
      </div>

      {isLoading ? (
        <div role="status" className="flex items-center justify-center py-16 text-sky-400">
          <Loader2 size={22} className="animate-spin" />
          <span className="ml-2 text-sm">加载中…</span>
        </div>
      ) : error || !data ? (
        <div role="alert" className="flex flex-col items-center justify-center rounded-card border border-sky-100 bg-surface-white py-12 text-center">
          <AlertCircle size={28} className="mb-2 text-error" />
          <p className="text-body text-sky-700">{error instanceof Error ? error.message : '加载失败'}</p>
          <Button className="mt-4" variant="outline" size="sm" onClick={() => { void refetch() }}>重试</Button>
        </div>
      ) : (
        <>
          {/* 统计卡 */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-card border border-sky-100 bg-surface-white p-6">
              <div className="mb-4 flex items-center gap-2 text-sky-500">
                <Users size={16} />
                <span className="text-label uppercase">用户</span>
              </div>
              <BigStat value={data.users.total} label={`学生 ${data.users.students} · 教师 ${data.users.teachers} · 管理员 ${data.users.admins}`} />
              <Link to="/admin/users" className="mt-4 inline-block text-sm text-sky-700 underline">查看用户</Link>
            </div>
            <div className="rounded-card border border-sky-100 bg-surface-white p-6">
              <div className="mb-4 flex items-center gap-2 text-sky-500">
                <BookOpen size={16} />
                <span className="text-label uppercase">课程</span>
              </div>
              <BigStat value={data.courses.total ?? '—'} label={data.courses.published === null ? '课程管理暂未开放' : `已发布 ${data.courses.published}`} />
              <Link to="/admin/courses" className="mt-4 inline-block text-sm text-sky-700 underline">查看课程模块</Link>
            </div>
            <div className="rounded-card border border-sky-100 bg-surface-white p-6">
              <div className="mb-4 flex items-center gap-2 text-sky-500">
                <Boxes size={16} />
                <span className="text-label uppercase">零件</span>
              </div>
              <BigStat value={data.parts.total} label="采购清单条目" />
              <p className="mt-3 text-sm text-slate-500">{data.parts.pendingReview === null ? '零件审核暂未开放' : `待审核 ${data.parts.pendingReview}`}</p>
            </div>
          </div>

          {/* 最近审计 */}
          <div className="rounded-card border border-sky-100 bg-surface-white p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-title-sm font-semibold text-sky-900">最近操作</h2>
              <Link to="/admin/audit" className="text-sm text-sky-700 underline">查看全部日志</Link>
            </div>
            {!data.recentAudit.length && <p className="py-6 text-center text-sm text-slate-500">暂无已记录的后台操作</p>}
            <ul className="divide-y divide-sky-50">
              {data.recentAudit.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="min-w-0 break-all text-sky-700">
                    <span className="font-medium">{a.actor}</span> · {a.action} · {a.target}
                  </span>
                  <span className="shrink-0 font-grotesk text-xs text-sky-400">{a.at.slice(0, 16).replace('T', ' ')}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
