import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ScrollReveal } from '../../components/common/ScrollReveal'
import { AssembledDrone } from '../../components/design/AssembledDrone'
import type { Design } from '../../types/design'
import { useAuthStore } from '../../stores/authStore'

interface HeroSectionProps {
  design: Design
}

export function ExportHeroSection({ design }: HeroSectionProps) {
  const user = useAuthStore(s => s.user)
  const title = design.name ? `${design.name} · 导出预览` : '设计导出预览'
  const date = new Date(design.updatedAt).toLocaleDateString('zh-CN')

  return (
    <section className="py-12 lg:py-16">
      <div className="mx-auto max-w-5xl px-4 text-center">
        <ScrollReveal>
          <h1 className="font-display text-3xl lg:text-[52px] font-semibold text-ink-900 leading-tight">
            {title}
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="mt-8 mx-auto max-w-3xl h-[320px] lg:h-[480px] bg-sky-100/60 rounded-lg overflow-hidden">
            <Canvas
              camera={{ position: [0.4, 0.3, 0.4], fov: 45, near: 0.01, far: 100 }}
              gl={{ antialias: true, alpha: true }}
              dpr={[1, 2]}
            >
              <ambientLight intensity={1.2} />
              <directionalLight position={[3, 3, 2]} intensity={1.8} color="#F5E6D3" />
              <directionalLight position={[-2, 1, -1]} intensity={0.5} />
              <Suspense fallback={null}>
                <AssembledDrone parts={design.parts} autoRotate autoRotateSpeed={0.52} />
              </Suspense>
              <OrbitControls enableZoom={false} enablePan={false} />
            </Canvas>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={300}>
          <p className="mt-6 text-base text-ink-600">
            当前账号：{user?.username ?? '未登录'} · 设计更新时间：{date}
          </p>
        </ScrollReveal>
      </div>
    </section>
  )
}
