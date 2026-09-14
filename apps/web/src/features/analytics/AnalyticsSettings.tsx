import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useLocation } from 'react-router'
import { analyticsAttribution } from '@fwx/shared'
import { getAnalyticsClient } from './client'

type Client = ReturnType<typeof getAnalyticsClient>
const buttonStyle = 'min-h-10 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-45'

/** Optional statistics never traps focus or prevents using the product. */
export function AnalyticsSettings({ client = getAnalyticsClient(), mode = 'banner' }: { client?: Client; mode?: 'banner' | 'page' }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot)
  const { pathname } = useLocation()
  const [ageChoice, setAgeChoice] = useState({ revision: state.contextRevision, checked: false })
  const ageConfirmed = ageChoice.revision === state.contextRevision && ageChoice.checked
  const setAgeConfirmed = (checked: boolean) => setAgeChoice({ revision: state.contextRevision, checked })
  const [withdrawn, setWithdrawn] = useState(false)
  const titleId = useId()
  const ageId = useId()
  useEffect(() => { void client.initialize() }, [client])

  if (!state.ready || !state.enabled) return mode === 'page' ? <div className="rounded-xl border border-sky-100 bg-sky-50 p-4 text-slate-700">
    <p role="status">{state.ready ? '当前未启用使用统计，不会新增采集。' : '正在读取隐私设置…'}</p>
    {state.decision === 'granted' && <button type="button" className={`${buttonStyle} mt-3`} onClick={async () => { setWithdrawn(true); await client.withdrawConsent() }}>撤回并删除统计记录</button>}
    {(state.error || withdrawn || state.deletionPending) && <p role="status" className="mt-2">{state.error || (state.deletionPending ? '已停止统计，正在删除历史记录。' : '本次授权的历史统计记录已删除。')}</p>}
    {state.deletionPending && <button type="button" className={`${buttonStyle} mt-3`} onClick={() => void client.retryDeletion()}>重试删除统计记录</button>}
  </div> : null
  if (mode === 'banner' && (pathname.startsWith('/privacy') || state.decision !== 'unknown')) return null
  return <aside aria-labelledby={titleId} data-testid="analytics-notice" className={mode === 'banner'
    ? 'fixed inset-x-3 bottom-3 z-40 max-h-[min(60dvh,420px)] overflow-y-auto rounded-xl border border-sky-200 bg-white p-4 text-sm text-slate-700 shadow-lg md:inset-x-6 md:flex md:items-center md:gap-6 md:px-6'
    : 'rounded-xl border border-sky-200 bg-white p-5 text-sm text-slate-700'}>
      <div className="min-w-0 flex-1">
      <h2 id={titleId} className="mb-1 text-base font-semibold text-sky-950">{mode === 'page' ? '使用统计设置' : '隐私与Cookie'}</h2>
      <p className="leading-relaxed">我们使用本地存储保存登录状态和草稿。经你允许，也会记录功能使用情况，帮助改进体验。不允许统计不影响绘制、保存和其他功能。</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-sky-800">
        <Link to="/privacy/policy" className="underline underline-offset-2">隐私政策</Link>
        <Link to="/privacy/cookies" className="underline underline-offset-2">Cookie及类似技术</Link>
        <Link to="/privacy/data" className="underline underline-offset-2">收集哪些数据</Link>
        <Link to="/privacy" className="underline underline-offset-2">全部说明</Link>
      </div>
      {mode === 'page' && <>
        <p className="mt-3 leading-relaxed">运营方：芬奇答奥（重庆）科技有限公司。统计记录存放在我们管理的服务器，最多保留 90 天。仅记录功能事件和必要标识，不采集作品正文和联系方式。<Link to="/about#contact" className="ml-1 text-sky-800 underline">联系我们</Link></p>
        <p className="mt-2 font-medium" role="status">当前选择：{state.decision === 'granted' ? '允许使用统计' : state.decision === 'declined' ? '不允许' : '尚未选择'}</p>
      </>}
      </div>
      <div className="mt-3 shrink-0 md:mt-0 md:max-w-sm">
      {state.decision === 'granted' ? <button type="button" className={`${buttonStyle} mt-3 w-full`} onClick={async () => { setAgeConfirmed(false); setWithdrawn(true); await client.withdrawConsent() }}>撤回并删除统计记录</button> : <>
        <label htmlFor={ageId} className="mt-3 flex min-h-10 cursor-pointer items-center gap-2">
          <input id={ageId} type="checkbox" checked={ageConfirmed} onChange={event => setAgeConfirmed(event.target.checked)} className="h-4 w-4 accent-sky-600" />我已满14周岁
        </label>
        <p className="mb-2 text-xs leading-relaxed text-slate-500">未满14周岁不启用统计。<Link to="/privacy/children" className="text-sky-800 underline">儿童隐私说明</Link></p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={buttonStyle} onClick={async () => { setAgeConfirmed(false); await client.withdrawConsent() }}>不允许</button>
          <button type="button" className={buttonStyle} disabled={!ageConfirmed || state.busy || state.deletionPending} onClick={async () => { if (await client.grantConsent(ageConfirmed)) { setAgeConfirmed(false); setWithdrawn(false) } }}>{state.busy ? '正在开启…' : '允许使用统计'}</button>
        </div>
      </>}
      {(state.error || withdrawn || state.deletionPending) && <p role="status" className="mt-3 text-xs leading-relaxed text-slate-600">{state.error || (state.deletionPending ? '已停止统计，正在删除历史记录。' : '已停止统计，本次授权的历史记录已删除。')}</p>}
      {state.deletionPending && <button type="button" className={`${buttonStyle} mt-2`} onClick={() => void client.retryDeletion()}>重试删除</button>}
      </div>
  </aside>
}

export function AnalyticsRuntime({ client = getAnalyticsClient() }: { client?: Client }) {
  const location = useLocation()
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot)
  const previousNavigation = useRef<string | null>(null)
  useEffect(() => {
    client.refreshConsent()
    if (state.decision !== 'granted') { previousNavigation.current = null; return }
    // Only retain the router key for StrictMode deduplication, never persist URLs.
    if (previousNavigation.current === location.key) return
    previousNavigation.current = location.key
    const width = window.innerWidth
    client.trackEvent('page_viewed', { ...analyticsAttribution(location.search), device: width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop' })
  }, [client, location.key, location.search, state.decision])
  useEffect(() => {
    const visibility = () => { client.refreshConsent(); if (document.visibilityState === 'hidden') void client.flush(true) }
    const focus = () => client.refreshConsent()
    const pageHide = () => { void client.flush(true) }
    const online = () => { void client.retryDeletion(); void client.flush() }
    const storage = (event: StorageEvent) => client.handleStorageChange(event.key)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', pageHide)
    window.addEventListener('online', online)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', focus)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', pageHide)
      window.removeEventListener('online', online)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', focus)
    }
  }, [client])
  return <AnalyticsSettings client={client} />
}
