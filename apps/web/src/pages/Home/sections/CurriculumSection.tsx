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
    <section id="home-usage-steps" className="home-steps site-section">
      <div className="site-container">
        <ScrollReveal className="site-section-intro">
          <SectionHeading
            eyebrow="操作流程"
            title="使用步骤"
            lead="从零件设计开始，依次进行拼装、编程和模拟。"
          />
        </ScrollReveal>

        {/* Horizontal timeline */}
        <div className="relative">
          {/* Timeline line — desktop only */}
          <div className="hidden">
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
                  <div className="home-step-number">
                    {stage.num}
                  </div>

                  {/* Card */}
                  <div className="home-step-copy">
                    {/* Large watermark number */}
                    <div
                      className="hidden"
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
