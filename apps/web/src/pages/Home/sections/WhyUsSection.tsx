import { ScrollReveal } from '../../../components/common/ScrollReveal'
import { SectionHeading } from '../components/SectionHeading'

const cards = [
  {
    img: '/optimized/picture/flight_png/untitled.160.webp',
    title: '自主设计',
    subtitle: '绘制零件，规划结构',
    desc: '在浏览器中绘制零件、选择部件并调整三维布局，保存自己的无人机设计。',
  },
  {
    img: '/optimized/picture/learning_kids/EX4A6148.webp',
    title: '木质拼接',
    subtitle: '连接木件，组装机架',
    desc: '通过榫卯连接木质零件，逐步组装无人机机架。观察各部件的位置与连接关系，理解机体的基本结构。',
  },
  {
    img: '/resource/picture/flight-testing-neutral.webp',
    title: '飞行测试',
    subtitle: '编排动作，模拟运行',
    desc: '用图形化积木编排飞行动作，在模拟环境中查看运行过程并调整程序。',
  },
]

export function WhyUsSection() {
  return (
    <section className="home-features site-section">
      <div className="site-container">
        <ScrollReveal className="site-section-intro">
          <SectionHeading
            eyebrow="功能介绍"
            title="平台功能"
            lead="绘制零件、拼装机体，并用积木程序进行模拟测试。"
          />
        </ScrollReveal>

        <div className="home-feature-grid">
          {cards.map((card, i) => (
            <ScrollReveal key={card.title} delay={i * 100}>
              <div className="home-feature group h-full">
                <div className="home-feature-image">
                  <img
                    src={card.img}
                    alt={card.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                    }}
                  />
                </div>
                <h3 className="font-display text-2xl font-semibold text-sky-900">{card.title}</h3>
                <p className="mt-1 text-sm font-medium text-sky-500">{card.subtitle}</p>
                <p className="mt-3 text-base leading-relaxed text-sky-700">{card.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
