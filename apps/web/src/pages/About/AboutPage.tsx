import { useEffect } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { Footer } from '../../components/layout/Footer'
import { ContactSection } from './ContactSection'

// Verified organizer records; years and award levels are not inferred from launch dates.
// Source notes and unresolved company/team facts: CURRENT_STATUS.md, 2026-09-13 About page.
const awards = [
  { name: '红点设计概念奖', detail: '2025 · Red Dot Award: Design Concept', href: 'https://www.red-dot.org/project/flightwood-x-83079', source: '红点官网' },
  { name: 'iF 设计奖', detail: 'Flight Wood X 木质无人机课程服务系统', href: 'https://ifdesign.com/en/winner-ranking/project/flight-wood-xwooden-drone-course-service-system/742980', source: 'iF 官网' },
  { name: '深圳环球设计大奖「鲲鹏奖」', detail: '2025 · 工业设计概念组金奖', href: 'https://www.k-p-a.design/news/1448.html', source: '鲲鹏奖官网' },
  { name: 'IDA 国际设计奖', detail: '2025 · 教育游戏与玩具类铜奖', href: 'https://www.idesignawards.com/books/IDA2025-ebook-PRODUCT.pdf', source: 'IDA 官方年册（PDF）' },
]

export function AboutPage() {
  const { hash, key } = useLocation()

  useEffect(() => {
    const previousTitle = document.title
    document.title = '关于我们 | FlightWoodX'
    return () => { document.title = previousTitle }
  }, [])

  useEffect(() => {
    // Route navigation does not perform native hash scrolling. Reserve image dimensions
    // below so slow image loading cannot move the contact target after this scroll.
    const frame = requestAnimationFrame(() => {
      if (hash === '#contact') {
        const contact = document.getElementById('contact')
        contact?.scrollIntoView({ block: 'start', behavior: 'instant' })
        contact?.focus({ preventScroll: true })
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' })
        document.getElementById('about-title')?.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [hash, key])

  return (
    <>
      <header className="relative overflow-hidden border-b border-sky-200 bg-sky-100">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[640px] w-[640px] rounded-full border border-sky-300/60" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-4 px-5 pb-8 pt-12 sm:grid-cols-2 sm:gap-8 sm:px-8 sm:py-14 lg:py-16">
          <div>
            <p className="text-sm font-semibold tracking-widest text-sky-700">FlightWoodX</p>
            <h1 id="about-title" tabIndex={-1} className="mt-5 font-display text-5xl leading-tight text-sky-900 outline-none sm:text-6xl lg:text-7xl">关于我们</h1>
            <p className="mt-6 text-xl font-medium leading-9 text-sky-900 sm:text-2xl">翼想飞木无人机搭建平台</p>
            <p className="mt-3 max-w-md text-base leading-8 text-sky-800 sm:text-lg">我们开发木质无人机、在线设计工具与配套课程，为学生提供设计、拼装和编程的实践内容。</p>
            <Link to="/about#contact" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-700 px-5 py-3 text-base font-medium text-white transition-colors hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700">
              联系我们 <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <img src="/optimized/picture/UI/web_1.webp" alt="FlightWoodX 木质无人机" width={1396} height={1127} fetchPriority="high" decoding="async" className="mx-auto w-full max-w-md object-contain lg:max-w-lg" />
        </div>
      </header>

      <section aria-labelledby="company-title" className="mx-auto grid max-w-6xl gap-7 px-5 py-14 sm:px-8 sm:py-20 md:grid-cols-[1fr_2fr] md:gap-16">
        <h2 id="company-title" className="font-display text-3xl text-sky-900 sm:text-4xl">公司介绍</h2>
        <div className="space-y-5 text-base leading-8 text-sky-800 sm:text-lg sm:leading-9">
          <p className="text-xl font-semibold text-sky-900 sm:text-2xl">芬奇答奥（重庆）科技有限公司</p>
          <p>我们是一家在重庆注册的科技企业，围绕木质无人机开展产品设计、软件开发与教育应用。</p>
          <p>公司开发和维护 FlightWoodX 翼想飞木无人机搭建平台。学生可以在网站上绘制零件、拼装机体、编写积木程序、查看模拟运行结果，并保存和管理自己的作品。</p>
          <p>线下内容包括木质结构拼装与无人机课程。</p>
        </div>
      </section>

      <section aria-labelledby="team-title" className="bg-sky-50 px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-7 md:grid-cols-[1fr_2fr] md:gap-16">
            <h2 id="team-title" className="font-display text-3xl text-sky-900 sm:text-4xl">我们的团队</h2>
            <p className="text-base leading-8 text-sky-800 sm:text-lg sm:leading-9">团队的木质无人机项目起步于高校设计实践。我们围绕零件设计、榫卯结构、电子组件、在线工具和课程内容开展工作，将设计方案制作成实物，持续调整产品与学习流程。</p>
          </div>
          <figure className="mt-10">
            <img src="/optimized/picture/about/team.webp" alt="FlightWoodX 团队与木质无人机作品合影" width={1440} height={942} loading="lazy" decoding="async" className="block h-auto w-full object-contain" />
            <figcaption className="mt-4 text-center text-sm leading-6 text-sky-700">团队与木质无人机作品合影</figcaption>
          </figure>
        </div>
      </section>

      <section aria-labelledby="awards-title" className="mx-auto grid max-w-6xl gap-7 px-5 py-14 sm:px-8 sm:py-20 md:grid-cols-[1fr_2fr] md:gap-16">
        <div>
          <h2 id="awards-title" className="font-display text-3xl text-sky-900 sm:text-4xl">作品获奖</h2>
          <p className="mt-5 text-base leading-8 text-sky-800">Flight Wood X 木质无人机课程服务系统的部分获奖记录。</p>
        </div>
        <ul className="divide-y divide-sky-200 border-y border-sky-200">
          {awards.map(award => (
            <li key={award.name} className="py-6 first:pt-5">
              <h3 className="text-lg font-semibold leading-8 text-sky-900 sm:text-xl">{award.name}</h3>
              <p className="mt-1 text-sm leading-7 text-sky-800 sm:text-base">{award.detail}</p>
              <a href={award.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-sky-700 underline decoration-sky-300 underline-offset-4 hover:text-sky-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700">
                {award.source} <span className="sr-only">（新窗口打开）</span><ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <ContactSection />
      <Footer />
    </>
  )
}
