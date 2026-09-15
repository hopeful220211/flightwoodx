import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import { ScrollReveal } from '../../../components/common/ScrollReveal'
import { SectionHeading } from '../components/SectionHeading'

interface Testimonial {
  id: string
  name: string
  identity: string
  background: string
  avatarColor: string
  avatarInitial: string
  avatarTextColor: string
  quote: string
}

// The owner confirmed on 2026-09-13 that these original testimonials were
// collected from real users and are approved for public display. Preserve quotes.
const TESTIMONIALS: Testimonial[] = [
  {
    id: 'xiaoyu',
    name: '小宇',
    identity: '五年级学生',
    background: 'rgba(125, 184, 217, 0.2)',
    avatarColor: '#7DB8D9',
    avatarInitial: '宇',
    avatarTextColor: 'white',
    quote: '我以前觉得无人机就是大人买的那种玩具，飞起来就完了。但自己拼出来之后，我才知道每个零件是干嘛的——为什么机臂要这么长、电机装在哪里才不会打到螺旋桨。飞起来的时候感觉完全不一样，因为是我自己做的。',
  },
  {
    id: 'zhou-mother',
    name: '周女士',
    identity: '小学四年级学生家长',
    background: 'rgba(185, 219, 254, 0.45)',
    avatarColor: '#B9DBFE',
    avatarInitial: '周',
    avatarTextColor: '#174A7E',
    quote: '孩子回家不再只盯着 iPad 是最直观的变化。他会主动跟我讲榫卯是什么、为什么老木匠不用钉子——这些话我这个当妈的都答不上来。FlightWoodX 让"动手"这件事重新变得有分量。',
  },
  {
    id: 'xiaoyu-girl',
    name: '小雨',
    identity: '三年级学生',
    background: 'rgba(125, 184, 217, 0.2)',
    avatarColor: '#4AA3F0',
    avatarInitial: '雨',
    avatarTextColor: 'white',
    quote: '最喜欢的是电脑上设计完，真的能飞起来那一刻。我设计的第一架飞歪了，我自己找到是因为一边机臂长了一点——然后自己改过来就飞直了。感觉像科学家。',
  },
  {
    id: 'lin-father',
    name: '林先生',
    identity: '初中一年级学生父亲，IT 行业',
    background: 'rgba(185, 219, 254, 0.45)',
    avatarColor: '#2B88DB',
    avatarInitial: '林',
    avatarTextColor: 'white',
    quote: '作为程序员，我见过太多"编程启蒙"产品——大部分是把语法包装成卡通。FlightWoodX 不一样，它让孩子直接面对真实的工程问题：结构、力学、空气动力学。这是我花钱买不到的东西。',
  },
  {
    id: 'chen-teacher',
    name: '陈老师',
    identity: '市级重点小学科学教师，12 年教龄',
    background: 'rgba(124, 191, 253, 0.18)',
    avatarColor: '#175798',
    avatarInitial: '陈',
    avatarTextColor: '#FAF8F4',
    quote: '我带过很多 STEAM 产品进课堂，学生 3 天就腻了。FlightWoodX 是第一个让学生主动要求延长课时的——因为他们想亲眼看到自己设计的那架飞起来。这个"亲手造"的过程是无法被 App 替代的。',
  },
]

function InitialAvatar({ testimonial }: { testimonial: Testimonial }) {
  return (
    <div
      className="home-review-avatar"
      aria-hidden="true"
    >
      <span className="text-base font-semibold">
        {testimonial.avatarInitial}
      </span>
    </div>
  )
}

const TOTAL = TESTIMONIALS.length
const NORMAL_DELAY = 3000
const MANUAL_DELAY = 6000

export function LovedBySection() {
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<number | null>(null)
  const delayRef = useRef(NORMAL_DELAY)

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    stop()
    const tick = () => {
      timerRef.current = window.setTimeout(() => {
        setCurrent(i => (i + 1) % TOTAL)
        delayRef.current = NORMAL_DELAY
        timerRef.current = window.setTimeout(tick, NORMAL_DELAY)
      }, delayRef.current)
    }
    tick()
  }, [stop])

  // Mount: start the chain. Unmount: stop.
  useEffect(() => {
    start()
    return stop
  }, [start, stop])

  const handleManualChange = useCallback((idx: number) => {
    const normalized = ((idx % TOTAL) + TOTAL) % TOTAL
    setCurrent(normalized)
    delayRef.current = MANUAL_DELAY
    start()
  }, [start])

  const handleMouseEnter = useCallback(() => {
    stop()
  }, [stop])

  const handleMouseLeave = useCallback(() => {
    start()
  }, [start])

  const testimonial = TESTIMONIALS[current]

  const scrollToCurriculum = () => {
    document.getElementById('home-usage-steps')
      ?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section
      id="home-testimonials"
      aria-label="用户评价"
      className="home-reviews site-section"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="mx-auto max-w-4xl px-4">
        <ScrollReveal className="mb-12">
          <SectionHeading
            eyebrow="真实反馈"
            title="用户评价"
            lead="学生、家长和教师分享使用体验。"
          />
        </ScrollReveal>

        {/* Owner-confirmed testimonials; original quotes and attribution. */}
        <div className="relative">
          {/* Avatar — overlapping top of card */}
          <div className="flex justify-center mb-6 relative z-10">
            <div
              key={testimonial.id + '-avatar'}
              style={{
                animation: 'fadeInScale 400ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
              }}
            >
              <InitialAvatar testimonial={testimonial} />
            </div>
          </div>

          {/* Quote content */}
          <div
            key={testimonial.id}
            className="home-review-copy"
          >
            <blockquote
              className="home-review-quote"
              style={{
                animation: 'fadeInLeft 400ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
              }}
            >
              “{testimonial.quote}”
            </blockquote>

            <div
              className="mt-6 text-center"
              style={{
                animation: 'fadeInLeft 400ms cubic-bezier(0.2, 0.8, 0.2, 1) 100ms forwards',
                opacity: 0,
              }}
            >
              <p className="text-base font-semibold text-sky-900">{testimonial.name}</p>
              <p className="text-sm text-sky-700">{testimonial.identity}</p>
            </div>
          </div>

          {/* Bottom row: CTA + indicators + arrows */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            {/* CTA link */}
            <button
              onClick={scrollToCurriculum}
              className="group inline-flex w-fit items-center gap-1 whitespace-nowrap text-sm font-medium text-sky-600 hover:text-sky-700 transition-colors underline underline-offset-2 hover:decoration-2"
            >
              查看使用步骤
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </button>

            {/* Indicators + arrows */}
            <div className="flex items-center gap-4">
              {/* Dots */}
              <div className="flex items-center gap-3">
                {TESTIMONIALS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => handleManualChange(i)}
                    className={`rounded-full transition-colors ${
                      i === current ? 'w-2 h-2 bg-sky-500' : 'w-2 h-2 bg-sky-200 hover:bg-sky-400'
                    }`}
                    aria-label={`查看第 ${i + 1} 条反馈`}
                    aria-current={i === current ? 'true' : undefined}
                  />
                ))}
              </div>

              {/* Arrows */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleManualChange(current - 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-700 transition-colors hover:bg-sky-200"
                  aria-label="上一条"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => handleManualChange(current + 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-800 text-white transition-colors hover:bg-sky-700"
                  aria-label="下一条"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
