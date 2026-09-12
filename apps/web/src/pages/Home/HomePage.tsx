import { useRef } from 'react'
import { HeroSection } from './sections/HeroSection'
import { VideoPreviewSection, type VideoPreviewHandle } from './sections/VideoPreviewSection'
import { WhyUsSection } from './sections/WhyUsSection'
import { ProductDemoSection } from './sections/ProductDemoSection'
import { CurriculumSection } from './sections/CurriculumSection'
import { ForWhoSection } from './sections/ForWhoSection'
import { LovedBySection } from './sections/LovedBySection'
import { FinalCTASection } from './sections/FinalCTASection'
import { Footer } from '../../components/layout/Footer'

export function HomePage() {
  const videoRef = useRef<VideoPreviewHandle>(null)

  return (
    <div className="min-h-screen [--home-video-overlap:clamp(3rem,10vw,4.6875rem)]">
      <HeroSection onWatchVideo={() => videoRef.current?.play()} />
      <VideoPreviewSection ref={videoRef} />
      <WhyUsSection />
      <ProductDemoSection />
      <CurriculumSection />
      <ForWhoSection />
      <LovedBySection />
      <FinalCTASection />
      <Footer />
    </div>
  )
}
