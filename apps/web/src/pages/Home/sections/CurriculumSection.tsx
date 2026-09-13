import { ScrollReveal } from '../../../components/common/ScrollReveal'
import { SectionHeading } from '../components/SectionHeading'

const stages = [
  { num: '01', title: '绘制或选择零件', desc: '在零件工坊绘图，或从零件库选择已有部件。' },
  { num: '02', title: '拼装机体', desc: '将零件加入工作台，调整位置并查看三维结构。' },
  { num: '03', title: '编写程序', desc: '用积木安排起飞、移动和降落等动作。' },
  { num: '04', title: '模拟与保存', desc: '查看程序运行过程，调整后保存作品和程序。' },
]

export function CurriculumSection() {
  return (
    <section id="home-usage-steps" className="bg-white py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal className="mb-16">
          <SectionHeading
            eyebrow="操作流程"
            title="使用步骤"
            lead="从零件设计开始，依次进行拼装、编程和模拟。"
          />
        </ScrollReveal>

        {/* Horizontal timeline */}
        <div className="relative">
          {/* Timeline line — desktop only */}
          <div className="hidden lg:block absolute top-[28px] left-[12.5%] right-[12.5%] h-[2px] bg-sky-200">
            <div
              className="h-full bg-sky-500 transition-all duration-1000"
              style={{ width: '100%' }}
            />
          </div>

          {/* Stages */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {stages.map((stage, i) => (
              <ScrollReveal key={stage.num} delay={i * 120}>
                <div className="relative flex flex-col items-center text-center">
                  {/* Timeline dot */}
                  <div className="hidden lg:flex w-14 h-14 rounded-full bg-sky-500 text-white items-center justify-center text-sm font-semibold mb-6 relative z-10">
                    {stage.num}
                  </div>

                  {/* Card */}
                  <div className="w-full h-full rounded-2xl border border-sky-100/70 bg-sky-50/50 p-6 shadow-[0_2px_18px_rgba(42,136,219,0.04)] transition-all duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_18px_48px_rgba(42,136,219,0.12)]">
                    {/* Large watermark number */}
                    <div
                      className="text-[48px] font-semibold leading-none lg:hidden"
                      style={{ color: 'rgba(42, 136, 219, 0.15)' }}
                    >
                      {stage.num}
                    </div>
                    <h3 className="font-display text-[22px] font-semibold text-sky-900 mt-1">
                      {stage.title}
                    </h3>
                    <p className="mt-3 text-sm text-sky-700 leading-relaxed">
                      {stage.desc}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
