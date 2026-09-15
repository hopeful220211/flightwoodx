import { useNavigate } from 'react-router'
import { Layers, Puzzle, Eye, ShieldCheck, ArrowRight } from 'lucide-react'
import { ScrollReveal } from '../../../components/common/ScrollReveal'
import { SectionHeading } from '../components/SectionHeading'
import { Button } from '../../../components/common/Button'
import { useAuthStore } from '../../../stores/authStore'
import { WorkbenchAnimation } from '../components/WorkbenchAnimation'
import { trackEvent } from '../../../features/analytics/client'

const features = [
  { icon: Layers, text: '分步引导与自由拼装' },
  { icon: Puzzle, text: '浏览和选择零件' },
  { icon: Eye, text: '三维结构预览' },
  { icon: ShieldCheck, text: '结构规则检查与设计数据导出' },
]

export function ProductDemoSection() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)

  return (
    <section className="home-demo site-section">
      <div className="site-container">
        <div className="home-demo-layout">

          {/* Left: silent workbench demonstration */}
          <ScrollReveal direction="left" distance={30}>
            <div
              className="home-demo-media"
            >
              <WorkbenchAnimation />
            </div>
          </ScrollReveal>

          {/* Right: text */}
          <ScrollReveal direction="right" distance={20} delay={100}>
            <div className="home-demo-copy">
              <SectionHeading
                align="center"
                eyebrow="在线工具"
                title="设计工作台"
                lead="浏览零件、调整位置并预览三维结构。登录后可保存作品、继续编程或导出设计记录。目前不提供切割图。"
              />

              <ul className="home-demo-features">
                {features.map((f) => (
                  <li key={f.text} className="flex items-center gap-3 text-sky-800">
                    <f.icon size={18} className="text-sky-500 shrink-0" />
                    <span className="text-base">{f.text}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => { trackEvent('home_cta_clicked', { placement: 'demo', destination: isAuthenticated ? 'design' : 'login' }); navigate(isAuthenticated ? '/design' : '/auth') }}
                rightIcon={<ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />}
                className="group mt-2"
              >
                {isAuthenticated ? '打开设计工作台' : '登录平台'}
              </Button>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
