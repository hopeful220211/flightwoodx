import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'

/** Original artwork: foreground moves farther; distant aircraft drift more slowly. */
export function HeroDrone3D() {
  const stage = useRef<HTMLDivElement>(null)
  const inView = useInView(stage, { amount: 0.1 })
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return (
    <div ref={stage} className="home-drone-stage" data-animating={inView && visible}>
      <img src="/optimized/picture/UI/web_3-320.webp" srcSet="/optimized/picture/UI/web_3-320.webp 320w, /optimized/picture/UI/web_3-640.webp 640w, /optimized/picture/UI/web_3-960.webp 960w" sizes="(max-width: 767px) calc(23vw - 3px), (max-width: 901px) calc(27vw - 3px), 240px" width={1224} height={472} alt="远处无人机" className="home-drone-back" loading="lazy" fetchPriority="low" decoding="async" draggable={false} />
      <img src="/optimized/picture/UI/web_2-320.webp" srcSet="/optimized/picture/UI/web_2-320.webp 320w, /optimized/picture/UI/web_2-640.webp 640w, /optimized/picture/UI/web_2-960.webp 960w" sizes="(max-width: 767px) calc(27vw - 3px), (max-width: 979px) calc(30vw - 4px), 290px" width={1424} height={912} alt="中间无人机" className="home-drone-middle" loading="lazy" fetchPriority="low" decoding="async" draggable={false} />
      <img src="/optimized/picture/UI/web_1-640.webp" srcSet="/optimized/picture/UI/web_1-360.webp 360w, /optimized/picture/UI/web_1-640.webp 640w, /optimized/picture/UI/web_1-720.webp 720w, /optimized/picture/UI/web_1.webp 1396w" sizes="(max-width: 655px) calc(84vw - 10px), (max-width: 767px) 540px, (max-width: 843px) calc(65vw - 8px), 540px" width={1396} height={1127} alt="主无人机" className="home-drone-main" loading="eager" fetchPriority="high" decoding="async" draggable={false} />
    </div>
  )
}
