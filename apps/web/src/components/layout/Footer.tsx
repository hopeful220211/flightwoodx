import { Link, NavLink } from 'react-router'

const productLinks = [
  { label: '设计工作台', to: '/design' },
  { label: '社区作品', to: '/community' },
]

const companyLinks = [
  { label: '关于我们', to: '/about' },
  { label: '联系我们', to: '/about#contact' },
  { label: '合作入口', to: '/about#contact' },
]

export function Footer() {
  return (
    <footer role="contentinfo" className="bg-sky-950 py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Brand */}
          <div>
            <h3 className="text-lg font-semibold text-white">FlightWoodX</h3>
            <p className="mt-2 text-sm text-sky-300/70 leading-relaxed">
              木质无人机设计与编程平台。<br/>
              零件绘制 · 拼装 · 模拟 · 作品管理
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-sky-200 mb-3">功能入口</h4>
            <ul className="space-y-2">
              {productLinks.map(link => (
                <li key={link.label}>
                  <NavLink to={link.to} className="text-sm text-sky-400/70 hover:text-white transition-colors">
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold text-sky-200 mb-3">平台信息</h4>
            <ul className="space-y-2">
              {companyLinks.map(link => (
                <li key={link.label}>
                  <Link to={link.to} className="rounded-sm text-sm text-sky-200 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-200">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-sky-800/40 flex flex-col items-center gap-3 text-center text-sm text-sky-200">
          <p>
            © 2026 芬奇答奥（重庆）科技有限公司
          </p>
          <nav aria-label="隐私与数据" className="flex flex-wrap justify-center gap-x-6 gap-y-3">
            <Link to="/privacy" className="underline underline-offset-4 hover:text-white">隐私与数据保护</Link>
            <Link to="/privacy/policy" className="underline underline-offset-4 hover:text-white">隐私政策</Link>
            <Link to="/privacy/settings" className="underline underline-offset-4 hover:text-white">隐私设置</Link>
          </nav>
          <div className="flex flex-col items-center gap-x-6 gap-y-2 sm:flex-row sm:flex-wrap sm:justify-center">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm leading-6 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-200"
            >
              渝ICP备2026006667号-2
            </a>
            <a
              href="https://beian.mps.gov.cn/#/query/webSearch?code=50010502504712"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm leading-6 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-200"
            >
              {/* Official badge source and checksum: CURRENT_STATUS.md, 2026-09-13 filing footer. */}
              <img src="/filing/public-security.png" alt="公安备案图标" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" />
              <span>渝公网安备50010502504712号</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
