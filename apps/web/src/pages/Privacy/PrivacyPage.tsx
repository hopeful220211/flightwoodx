import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { Footer } from '../../components/layout/Footer'
import { AnalyticsSettings } from '../../features/analytics/AnalyticsSettings'
import { policies, POLICY_UPDATED } from './policies'
import { terms, TERMS_UPDATED } from './terms'

const linkClass = 'rounded text-sky-800 underline underline-offset-4 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600'

export function PrivacyPage({ documentSlug }: { documentSlug?: 'terms' } = {}) {
  const { document: routeDocument } = useParams()
  const slug = documentSlug ?? routeDocument
  const { pathname } = useLocation()
  const policy = slug === 'terms' ? terms : policies.find(item => item.slug === slug)
  const settings = slug === 'settings'
  const missing = Boolean(slug && !policy && !settings)
  const title = policy?.title || (settings ? '隐私设置' : missing ? '未找到这份说明' : '隐私与数据保护')
  useEffect(() => {
    const previous = document.title
    document.title = `${title} - FlightWoodX`
    window.scrollTo(0, 0)
    return () => { document.title = previous }
  }, [pathname, title])
  return <>
    <div className="mx-auto max-w-6xl px-5 py-10 text-slate-700 sm:px-8 sm:py-14">
      <Link to={slug ? '/privacy' : '/'} className={`${linkClass} text-sm`}>{slug ? '← 全部隐私说明' : '← 返回首页'}</Link>
      <h1 className="mt-6 text-3xl font-semibold leading-tight text-sky-950 sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-slate-500">修订日期：{slug === 'terms' ? TERMS_UPDATED : POLICY_UPDATED} · 芬奇答奥（重庆）科技有限公司</p>
      {!slug && <>
        <p className="mt-6 max-w-3xl leading-8">在这里了解账号、作品和使用统计的数据处理方式。阅读政策不代表同意统计；你可以随时更改选择。</p>
        <div className="mt-7 flex flex-wrap gap-4">
          <Link to="/privacy/settings" className="rounded-lg bg-sky-700 px-5 py-3 font-medium text-white hover:bg-sky-800">管理隐私设置</Link>
          <Link to="/about#contact" className={`${linkClass} self-center`}>联系我们</Link>
          <Link to="/terms" className={`${linkClass} self-center`}>用户使用协议</Link>
        </div>
        <nav aria-label="隐私说明" className="mt-9 divide-y divide-sky-100 border-y border-sky-100">
          {policies.map(item => <Link key={item.slug} to={`/privacy/${item.slug}`} className="flex items-center justify-between gap-4 py-6 hover:bg-sky-50/60">
            <div><h2 className="text-lg font-semibold text-sky-900">{item.title}</h2><p className="mt-1 text-sm leading-6">{item.summary}</p></div><span aria-hidden="true">→</span>
          </Link>)}
        </nav>
      </>}
      {settings && <div className="mt-8 max-w-4xl space-y-5">
        <AnalyticsSettings mode="page" />
        <p className="text-sm leading-7">选择适用于当前浏览器和身份，最多保留90天。换账号、换浏览器或设备、清除本站数据后会重新询问。<Link className={linkClass} to="/privacy/cookies">查看完整提示规则</Link></p>
        <Link className={linkClass} to="/privacy/rights">其他设备的记录、信息删除与账号注销</Link>
      </div>}
      {policy && <div className="mt-8 grid items-start gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="本页目录" className="rounded-xl bg-sky-50 p-5 lg:sticky lg:top-24">
          <h2 className="font-semibold text-sky-950">本页目录</h2>
          <ol className="mt-3 space-y-3 text-sm leading-6">{policy.sections.map((section, index) => <li key={section.title}><a className={linkClass} href={`#section-${index + 1}`}>{section.title}</a></li>)}</ol>
          <Link to="/privacy/settings" className={`${linkClass} mt-5 block border-t border-sky-200 pt-4`}>管理隐私设置</Link>
        </nav>
        <article className="min-w-0 space-y-9 break-words">
          {policy.sections.map((section, index) => <section id={`section-${index + 1}`} key={section.title} className="scroll-mt-24">
            <h2 className="mb-3 text-xl font-semibold text-sky-950">{section.title}</h2>
            {section.paragraphs.map(paragraph => <p key={paragraph} className="mb-3 text-[15px] leading-8">{paragraph}</p>)}
          </section>)}
          <nav aria-label="相关隐私说明" className="flex flex-wrap gap-4 border-t border-sky-100 pt-6 text-sm">
            {policies.filter(item => item.slug !== slug).map(item => <Link key={item.slug} to={`/privacy/${item.slug}`} className={linkClass}>{item.title}</Link>)}
            <Link to="/about#contact" className={linkClass}>联系我们</Link>
          </nav>
        </article>
      </div>}
      {missing && <p className="mt-6">请返回全部隐私说明，选择需要阅读的内容。</p>}
    </div>
    <Footer />
  </>
}
