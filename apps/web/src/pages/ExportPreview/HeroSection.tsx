import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, OrbitControls } from '@react-three/drei'
import { ScrollReveal } from '../../components/common/ScrollReveal'
import { AssembledDrone } from '../../components/design/AssembledDrone'
import type { Design } from '../../types/design'

interface HeroSectionProps {
  design: Design
}

export function ExportHeroSection({ design }: HeroSectionProps) {
  const title = design.name || '未命名无人机'
  const date = new Date(design.updatedAt).toLocaleDateString('zh-CN')

  return (
    <section className="py-10 lg:py-14">
      <div className="mx-auto max-w-5xl px-4 text-center">
        <ScrollReveal>
          <h1 className="text-[28px] font-semibold leading-8 tracking-[-.03em] text-ink-900 sm:text-[32px] sm:leading-9">结构审核</h1>
          <p className="mt-3 text-base leading-6 text-ink-600">{title} · 更新于 {date}</p>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="mx-auto mt-8 h-[300px] max-w-3xl overflow-hidden rounded-lg border border-sky-200 bg-sky-50 sm:h-[400px] lg:h-[480px]" aria-label="作品三维展示">
            {design.parts.length === 0 ? <div className="flex h-full items-center justify-center px-4 text-sm text-ink-600">暂无零件，返回工作台添加后查看。</div> : <Canvas
              camera={{ position: [0.4, 0.3, 0.4], fov: 45, near: 0.01, far: 100 }}
              gl={{ antialias: true, alpha: true }}
              dpr={[1, 2]}
            >
              <ambientLight intensity={1.2} />
              <directionalLight position={[3, 3, 2]} intensity={1.8} color="#F5E6D3" />
              <directionalLight position={[-2, 1, -1]} intensity={0.5} />
              <Suspense fallback={null}>
                <Bounds fit clip observe margin={1.5}>
                  <AssembledDrone parts={design.parts} autoRotate={false} />
                </Bounds>
              </Suspense>
              <OrbitControls makeDefault enableZoom={false} enablePan={false} />
            </Canvas>}
          </div>
        </ScrollReveal>

      </div>
    </section>
  )
}
