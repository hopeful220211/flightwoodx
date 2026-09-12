import { useNavigate } from 'react-router'
import { ArrowRight, Play, Trophy, Puzzle, ChevronDown, Rocket } from 'lucide-react'
import { Button } from '../../../components/common/Button'
import { HeroHonors } from './hero/HeroHonors'
import { HeroDrone3D } from './hero/HeroDrone3D'
import { CloudLayer } from '../components/CloudLayer'

function AnimatedEntry({ children, delay = 0, className = '' }: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        opacity: 0,
        animation: `fadeInUp 600ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms forwards`,
      }}
    >
      {children}
    </div>
  )
}

export function HeroSection({ onWatchVideo }: { onWatchVideo: () => void }) {
  const navigate = useNavigate()

  return (
      <section id="home-hero" className="relative min-h-dvh bg-sky-hero overflow-x-clip pb-[var(--home-video-overlap)]">
        <CloudLayer />
        <div className="relative z-[1] mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid min-h-[calc(100dvh-64px)] items-center gap-12 pt-[80px] pb-16 lg:grid-cols-[11fr_9fr] lg:gap-8">

            {/* Left column */}
            <div className="z-10 space-y-6">

              {/* Owner-provided award honors */}
              <HeroHonors delay={0} />

              {/* Main title */}
              <div className="space-y-1">
                <AnimatedEntry delay={120}>
                  <h1
                    className="leading-[0.95] tracking-tight text-sky-900"
                    style={{ fontSize: 'clamp(64px, 9vw, 130px)', fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}
                  >
                    FLIGHT
                  </h1>
                </AnimatedEntry>
                <AnimatedEntry delay={220}>
                  <h1
                    className="leading-[0.95] tracking-tight text-sky-500"
                    style={{ fontSize: 'clamp(64px, 9vw, 130px)', fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}
                  >
                    WOOD X
                  </h1>
                </AnimatedEntry>
              </div>

              {/* Chinese subtitle */}
              <AnimatedEntry delay={400}>
                <p className="font-display text-[clamp(26px,3.5vw,38px)] font-medium text-sky-800">
                  动手造，会飞的
                </p>
              </AnimatedEntry>

              {/* Description */}
              <AnimatedEntry delay={520}>
                <p className="max-w-lg text-[17px] leading-relaxed text-sky-900/70">
                  不上一根钉子的榫卯木工，拼一架真能飞的无人机
                  <br />
                  设计 ｜ 搭建 ｜ 导出 ｜ 社区分享
                </p>
              </AnimatedEntry>

              {/* CTA buttons */}
              <AnimatedEntry delay={640} className="flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  onClick={() => navigate('/design')}
                  rightIcon={<ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />}
                  className="group px-8"
                >
                  开始设计
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={onWatchVideo}
                  leftIcon={<Play size={18} />}
                  className="px-8"
                >
                  观看视频
                </Button>
              </AnimatedEntry>

              {/* Real achievement metrics */}
              <AnimatedEntry delay={800}>
                <div className="grid grid-cols-3 gap-6 pt-4">
                  <div className="flex items-start gap-3">
                    <Trophy size={20} className="mt-0.5 text-[#E8B530] shrink-0" />
                    <div>
                      <div className="font-display text-2xl font-semibold text-sky-900">3 项</div>
                      <div className="text-sm text-sky-600/70">全球设计大奖</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Puzzle size={20} className="mt-0.5 text-sky-400 shrink-0" />
                    <div>
                      <div className="font-display text-2xl font-semibold text-sky-900">77 个</div>
                      <div className="text-sm text-sky-600/70">标准化零件</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Rocket size={20} className="mt-0.5 text-sky-400 shrink-0" />
                    <div>
                      <div className="font-display text-2xl font-semibold text-sky-900">5 步搭完</div>
                      <div className="text-sm text-sky-600/70">跟着引导一步步来</div>
                    </div>
                  </div>
                </div>
              </AnimatedEntry>
            </div>

            {/* Right column: drone images */}
            <AnimatedEntry delay={300} className="relative flex w-full items-center justify-center max-w-[400px] mx-auto lg:max-w-none lg:mx-0 lg:h-[500px]">
              <HeroDrone3D />
            </AnimatedEntry>
          </div>
        </div>

        {/* Scroll hint */}
        <div
          className="absolute bottom-[calc(var(--home-video-overlap)+1rem)] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-sky-400"
          style={{
            opacity: 0,
            animation: 'fadeInUp 500ms cubic-bezier(0.2, 0.8, 0.2, 1) 900ms forwards',
          }}
        >
          <span className="text-xs">向下滚动</span>
          <ChevronDown size={16} className="animate-bounce" />
        </div>
      </section>
  )
}
