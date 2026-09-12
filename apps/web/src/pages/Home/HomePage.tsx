import { useState } from 'react'
import { VideoModal } from '../../components/common/VideoModal'
import { HeroSection } from './sections/HeroSection'
import { VideoPreviewSection } from './sections/VideoPreviewSection'
import { WhyUsSection } from './sections/WhyUsSection'
import { ProductDemoSection } from './sections/ProductDemoSection'
import { CurriculumSection } from './sections/CurriculumSection'
import { ForWhoSection } from './sections/ForWhoSection'
import { LovedBySection } from './sections/LovedBySection'
import { FinalCTASection } from './sections/FinalCTASection'
import { Footer } from '../../components/layout/Footer'

export function HomePage() {
  const [showVideo, setShowVideo] = useState(false)

  return (
    <div className="min-h-screen [--home-video-overlap:clamp(3rem,12vw,10rem)]">
      <HeroSection onWatchVideo={() => setShowVideo(true)} />
      <VideoPreviewSection onPlay={() => setShowVideo(true)} />
      <WhyUsSection />
      <ProductDemoSection />
      <CurriculumSection />
      <ForWhoSection />
      <LovedBySection />
      <FinalCTASection />
      <Footer />
      <VideoModal
        open={showVideo}
        onClose={() => setShowVideo(false)}
        videoUrl="/resource/videos/flightwoodx-introduction.mp4"
        title="FlightWoodX 产品演示"
      />
    </div>
  )
}
