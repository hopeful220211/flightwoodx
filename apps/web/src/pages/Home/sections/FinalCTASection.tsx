import { useNavigate } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { ScrollReveal } from '../../../components/common/ScrollReveal'
import { SectionHeading } from '../components/SectionHeading'
import { useAuthStore } from '../../../stores/authStore'
import { trackEvent } from '../../../features/analytics/client'

export function FinalCTASection() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)

  return (
    <section className="relative bg-sky-900 py-24 lg:py-32 overflow-hidden">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-800/50 to-sky-950/80" />

      <div className="relative mx-auto max-w-4xl px-4">
        <ScrollReveal>
          <SectionHeading
            tone="light"
            eyebrow="设计与保存"
            title="创建设计作品"
            lead="登录后可保存和管理作品，继续编辑机体结构与积木程序。游客作品仅保存在当前浏览器。"
          />
        </ScrollReveal>

        <ScrollReveal delay={200} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => { trackEvent('home_cta_clicked', { placement: 'final', destination: isAuthenticated ? 'design' : 'login' }); navigate(isAuthenticated ? '/design' : '/auth') }}
            className="group inline-flex w-fit items-center gap-2 whitespace-nowrap rounded-xl bg-white px-8 py-4 text-base font-semibold text-sky-700 shadow-sky-glow transition-all hover:bg-sky-50"
          >
            {isAuthenticated ? '打开设计工作台' : '登录平台'}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </button>
          <button
            onClick={() => { trackEvent('home_cta_clicked', { placement: 'final', destination: 'login' }); navigate('/auth?type=school') }}
            className="inline-flex w-fit items-center gap-2 whitespace-nowrap rounded-xl border border-white/20 px-8 py-4 text-base font-medium text-sky-200 transition-colors hover:bg-white/10"
          >
            教师与学校登录
          </button>
        </ScrollReveal>
      </div>
    </section>
  )
}
