import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, RefreshCw, Search, Users } from 'lucide-react'
import type { AdminUserListItem } from '@fwx/shared'
import { realAdminApi } from '../../../api/admin/realClient'
import { Button } from '../../../components/common/Button'

const ROLES: Record<AdminUserListItem['role'], string> = { student: '学生', teacher: '教师', parent: '家长', admin: '管理员' }
function formatDate(value?: string) {
  if (!value) return '暂无记录'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '暂无记录' : date.toLocaleDateString('zh-CN')
}

export function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ page: 1, pageSize: 20, role: '', q: '' })
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'users', query],
    queryFn: async () => {
      const result = await realAdminApi.listUsers(query)
      if (!result.success) throw new Error(result.error.message)
      return result.data
    },
    retry: false,
  })
  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    setQuery(value => ({ ...value, q: search.trim(), page: 1 }))
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-h3 font-semibold tracking-tight text-sky-900"><Users size={24} />用户管理</h1>
        <p className="mt-2 text-sm text-slate-500">查看账号信息，按用户名、昵称或角色筛选。</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => { void refetch() }} disabled={isFetching} leftIcon={<RefreshCw size={14} />}>刷新</Button>
    </div>

    <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-3 rounded-xl border border-sky-100 bg-white p-4">
      <label className="w-full text-sm font-medium text-slate-700 sm:min-w-0 sm:w-auto sm:flex-1">
        用户名或昵称
        <input className="site-form-control mt-1.5 block min-h-10 w-full rounded-lg border border-slate-200 px-3 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索用户" />
      </label>
      <label className="text-sm font-medium text-slate-700">
        角色
        <select aria-label="角色" className="site-form-control mt-1.5 block min-h-10 rounded-lg border border-slate-200 bg-white px-3 font-normal" value={query.role} onChange={event => setQuery(value => ({ ...value, role: event.target.value, page: 1 }))}>
          <option value="">全部角色</option>
          {Object.entries(ROLES).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
        </select>
      </label>
      <Button type="submit" size="sm" leftIcon={<Search size={14} />}>搜索</Button>
    </form>

    {isPending ? <div role="status" className="rounded-xl border border-sky-100 bg-white py-16 text-center text-sm text-slate-500">正在加载用户…</div>
      : error ? <div role="alert" className="rounded-xl border border-red-100 bg-white p-8 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={24} />
        <p className="text-sm text-red-700">{error instanceof Error ? error.message : '用户加载失败'}</p>
        <Button className="mt-4" variant="outline" size="sm" onClick={() => { void refetch() }}>重试</Button>
      </div>
      : data && <div className="overflow-hidden rounded-xl border border-sky-100 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">用户账号列表</caption>
            <thead className="border-b border-sky-100 bg-sky-50/60 text-slate-600"><tr>
              {['用户', '角色', '学校', '年级', '注册日期', '最近登录'].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {data.items.map(user => <tr key={user.id} className="hover:bg-sky-50/40">
                <td className="max-w-64 px-4 py-3"><span className="block break-all font-medium">{user.username}</span>{user.nickname && <span className="mt-0.5 block break-all text-xs text-slate-500">{user.nickname}</span>}</td>
                <td className="whitespace-nowrap px-4 py-3"><span className="rounded-full bg-sky-50 px-2 py-1 text-xs text-sky-800">{ROLES[user.role] || user.role}</span></td>
                <td className="max-w-48 break-words px-4 py-3">{user.school || '未填写'}</td>
                <td className="px-4 py-3">{user.grade || '未填写'}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatDate(user.createdAt)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatDate(user.lastLogin)}</td>
              </tr>)}
              {!data.items.length && <tr><td colSpan={6} className="py-16 text-center text-slate-500">没有符合条件的用户</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky-100 px-4 py-3 text-sm text-slate-600">
          <span role="status">共 {data.total} 位用户 · 第 {data.page} / {pages} 页</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={query.page <= 1 || isFetching} onClick={() => setQuery(value => ({ ...value, page: value.page - 1 }))}>上一页</Button>
            <Button size="sm" variant="outline" disabled={query.page >= pages || isFetching} onClick={() => setQuery(value => ({ ...value, page: value.page + 1 }))}>下一页</Button>
          </div>
        </div>
      </div>}
  </div>
}
