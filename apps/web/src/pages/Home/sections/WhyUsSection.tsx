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
    img: '/optimized/picture/learning_kids/EX4A6264 1.webp',
    title: '飞行测试',
    subtitle: '编排动作，模拟运行',
    desc: '用图形化积木编排飞行动作，在模拟环境中查看运行过程并调整程序。模拟结果不代表实机飞行表现。',
  },
]

export function WhyUsSection() {
  return (
    <section className="bg-sky-50/40 py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal className="mb-16">
          <SectionHeading
            eyebrow="功能介绍"
            title="平台功能"
            lead="绘制零件、拼装机体，并用积木程序进行模拟测试。"
          />
        </ScrollReveal>

        <div className="grid gap-6 md:grid-cols-3">
          {cards.map((card, i) => (
            <ScrollReveal key={card.title} delay={i * 100}>
              <div className="group h-full rounded-2xl border border-sky-100/70 bg-white p-[30px] shadow-[0_2px_18px_rgba(42,136,219,0.05)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_48px_rgba(42,136,219,0.13)]">
                <div className="h-[200px] rounded-xl overflow-hidden bg-sky-50 mb-5">
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
