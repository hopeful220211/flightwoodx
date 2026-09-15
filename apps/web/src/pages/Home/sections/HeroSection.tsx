import { useNavigate } from 'react-router'
import { ArrowRight, Play, ChevronDown } from 'lucide-react'
import { Button } from '../../../components/common/Button'
import { HeroHonors } from './hero/HeroHonors'
import { HeroDrone3D } from './hero/HeroDrone3D'
import { trackEvent } from '../../../features/analytics/client'

const brandStyle = { fontSize: 'clamp(64px, 9vw, 130px)', fontFamily: 'Montserrat, "Arial Black", Arial, sans-serif', fontWeight: 900, fontSynthesis: 'none' } as const

export function HeroSection({ onWatchVideo }: { onWatchVideo: () => void }) {
  const navigate = useNavigate()
  return (
    <section id="home-hero" className="home-hero">
      <div className="home-hero-copy">
        <div className="home-brand-title">
          <h1 style={brandStyle}>FLIGHT</h1>
          <h1 style={brandStyle}>WOOD X</h1>
        </div>
        <p className="font-display home-hero-subtitle">翼想飞木无人机搭建平台</p>
        <p className="home-hero-description">
          在这里设计、制作、测试你的第一架无人机<br />
          设计 ｜ 搭建 ｜ 导出 ｜ 社区分享
        </p>
        <div className="home-hero-actions">
          <Button onClick={() => { trackEvent('home_cta_clicked', { placement: 'hero', destination: 'design' }); navigate('/design') }} rightIcon={<ArrowRight size={14} />}>开始设计</Button>
          <Button variant="outline" onClick={onWatchVideo} leftIcon={<Play size={14} />}>观看视频</Button>
        </div>
      </div>
      <div className="home-hero-product"><HeroDrone3D /></div>
      <div className="home-hero-honors"><HeroHonors /></div>
      <div className="home-scroll-hint" aria-hidden="true"><span>向下滚动</span><ChevronDown size={14} /></div>
    </section>
  )
}
