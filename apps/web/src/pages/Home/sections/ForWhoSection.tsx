import { useNavigate } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { ScrollReveal } from '../../../components/common/ScrollReveal'
import { SectionHeading } from '../components/SectionHeading'
import { trackEvent } from '../../../features/analytics/client'

const personas = [
  {
    title: '学生',
    subtitle: '绘制零件、拼装机体、编写程序并保存作品。',
    href: '/auth?type=student',
    img: '/optimized/picture/learning_kids/EX4A6285.webp',
  },
  {
    title: '教师',
    subtitle: '使用设计和模拟工具演示操作。课程管理尚未开放。',
    href: '/auth?type=teacher',
    img: '/optimized/picture/learning_kids/EX4A6264 1.webp',
  },
  {
    title: '学校',
    subtitle: '了解平台的设计与编程工具。学校管理功能尚未开放。',
    href: '/auth?type=school',
    img: '/optimized/picture/learning_kids/EX4A6148.webp',
  },
]

export function ForWhoSection() {
  const navigate = useNavigate()

  return (
    <section className="home-audience site-section">
      <div className="site-container">
        <ScrollReveal className="site-section-intro">
          <SectionHeading
            eyebrow="使用对象"
            title="学生、教师和学校"
            lead="学生可设计作品，教师和学校可了解工具功能。当前均使用同一登录入口。"
          />
        </ScrollReveal>

        <div className="home-audience-grid">
          {personas.map((p, i) => (
            <ScrollReveal key={p.title} delay={i * 100}>
              <button
                type="button"
                onClick={() => { trackEvent('home_cta_clicked', { placement: 'audience', destination: 'login' }); navigate(p.href) }}
                className="home-audience-tile group"
              >
                {/* Background image */}
                <img
                  src={p.img}
                  alt={p.title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-[400ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-[1.06]"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                  }}
                />

                {/* Gradient overlay */}
                <div className="home-audience-shade" />

                {/* Content */}
                <div className="home-audience-copy">
                  <h3 className="font-display text-2xl font-semibold text-white">{p.title}</h3>
                  <p className="mt-1 text-sm text-white/70">{p.subtitle}</p>
                  <div className="mt-4 flex w-fit items-center gap-1 whitespace-nowrap text-sm font-medium text-white/80 transition-transform duration-300 group-hover:translate-x-1">
                    登录平台
                    <ArrowRight size={14} />
                  </div>
                </div>
              </button>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
