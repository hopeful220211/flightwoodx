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
      <img src="/optimized/picture/UI/web_3.webp" alt="远处无人机" className="home-drone-back" loading="lazy" decoding="async" draggable={false} />
      <img src="/optimized/picture/UI/web_2.webp" alt="中间无人机" className="home-drone-middle" loading="lazy" decoding="async" draggable={false} />
      <img src="/optimized/picture/UI/web_1.webp" alt="主无人机" className="home-drone-main" fetchPriority="high" decoding="async" draggable={false} />
    </div>
  )
}
