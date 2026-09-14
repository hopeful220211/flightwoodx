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
    <section className="overflow-x-clip bg-white py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid items-center gap-12 lg:grid-cols-[3fr_2fr]">

          {/* Left: silent workbench demonstration */}
          <ScrollReveal direction="left" distance={30}>
            <div
              className="rounded-2xl overflow-hidden shadow-[0_30px_70px_rgba(23,74,126,0.22)] ring-1 ring-sky-100/70"
              style={{ transform: 'perspective(1400px) rotateY(-3deg) rotateX(1deg)' }}
            >
              <WorkbenchAnimation />
            </div>
          </ScrollReveal>

          {/* Right: text */}
          <ScrollReveal direction="right" distance={20} delay={100}>
            <div className="space-y-6">
              <SectionHeading
                align="left"
                eyebrow="在线工具"
                title="设计工作台"
                lead="浏览零件、调整位置并预览三维结构。登录后可保存作品、继续编程或导出设计记录。目前不提供切割图。"
              />

              <ul className="space-y-3">
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
