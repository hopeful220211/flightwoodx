import { useEffect, useRef, useState } from 'react'
import { Copy, Phone } from 'lucide-react'
import { trackEvent } from '../../features/analytics/client'

const wechatId = 'ccccckd0211'

export function ContactSection() {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'success' | 'error'>('idle')
  const mounted = useRef(false)
  const copying = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function copyWechat() {
    if (copying.current) return
    copying.current = true
    setCopyState('copying')
    try {
      await navigator.clipboard.writeText(wechatId)
      trackEvent('contact_action', { action: 'wechat_copied' })
      if (mounted.current) setCopyState('success')
    } catch {
      if (mounted.current) setCopyState('error')
    } finally {
      copying.current = false
    }
  }

  return (
    <section id="contact" aria-labelledby="contact-title" tabIndex={-1} className="site-contact site-section scroll-mt-20 outline-none">
      <div className="site-container">
        <h2 id="contact-title" className="font-display text-3xl text-sky-900 sm:text-4xl">联系我们</h2>
        <p className="mt-4 text-base leading-8 text-sky-800 sm:text-lg">平台使用、课程与产品咨询，可通过电话或微信联系。</p>
        <dl className="mt-8 grid gap-8 sm:grid-cols-2 sm:gap-12">
          <div>
            <dt className="mb-3 text-sm text-sky-800">联系电话</dt>
            <dd>
              <a href="tel:+8618393648803" onClick={() => trackEvent('contact_action', { action: 'phone_clicked' })} className="inline-flex min-h-11 items-center gap-3 rounded-sm text-xl font-semibold tabular-nums hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700 sm:text-2xl">
                <Phone size={22} aria-hidden="true" className="shrink-0" />
                +86 18393648803
              </a>
            </dd>
          </div>
          <div>
            <dt className="mb-3 text-sm text-sky-800">微信号</dt>
            <dd className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <span className="select-text text-xl font-semibold sm:text-2xl">{wechatId}</span>
              <button type="button" onClick={() => { void copyWechat() }} disabled={copyState === 'copying'} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-sky-700 px-4 py-2 text-sm font-medium text-sky-900 transition-colors hover:bg-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700 disabled:cursor-wait disabled:opacity-60">
                <Copy size={16} aria-hidden="true" />
                复制微信号
              </button>
            </dd>
            <dd role="status" aria-live="polite" aria-atomic="true" className="mt-2 min-h-6 text-sm leading-6 text-sky-800">
              {copyState === 'success' ? '已复制微信号' : copyState === 'error' ? '复制失败，请长按或选中微信号复制。' : ''}
            </dd>
          </div>
        </dl>
        <p className="mt-8 border-t border-sky-300 pt-6 text-base leading-8 text-sky-800">如果有合作意向，请联系我们。</p>
      </div>
    </section>
  )
}
