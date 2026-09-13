import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'
import { Pause, Play, RotateCcw } from 'lucide-react'

const videoSource = '/resource/videos/design-workbench-loop.mp4'
const posterSource = '/resource/videos/design-workbench-loop.webp'

export function WorkbenchAnimation() {
  const frameRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const inView = useInView(frameRef, { amount: 0.15 })
  const [reducedMotion, setReducedMotion] = useState(true)
  const [choice, setChoice] = useState<'auto' | 'play' | 'pause'>('auto')
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const shouldPlay = inView && pageVisible && !failed && (choice === 'play' || (choice === 'auto' && reducedMotion === false))

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(preference.matches)
    updatePreference()
    preference.addEventListener('change', updatePreference)
    return () => preference.removeEventListener('change', updatePreference)
  }, [])

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    if (shouldPlay) {
      video.muted = true
      void video.play().catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return
        // Autoplay restrictions leave the still frame and manual play button usable.
        if (error instanceof DOMException && error.name === 'NotAllowedError') setChoice('pause')
        else setFailed(true)
      })
    } else video.pause()
    return () => {
      cancelled = true
      video.pause()
    }
  }, [shouldPlay])

  const togglePlayback = () => {
    if (failed) {
      videoRef.current?.load()
      setFailed(false)
      setChoice('play')
    } else setChoice(playing ? 'pause' : 'play')
  }

  const label = failed ? '重新加载演示动画' : playing ? '暂停演示动画' : '播放演示动画'
  const Icon = failed ? RotateCcw : playing ? Pause : Play

  return (
    <div ref={frameRef} role="group" aria-label="设计工作台演示动画" className="relative aspect-[1440/1001] w-full bg-white">
      <video
        ref={videoRef}
        src={videoSource}
        poster={posterSource}
        muted
        loop
        playsInline
        preload="none"
        hidden={failed}
        aria-label="机体拼装与积木编程演示"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => { setPlaying(false); setFailed(true) }}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {failed && (
        <>
          <img src={posterSource} alt="设计工作台演示封面" className="absolute inset-0 h-full w-full object-contain" />
          <p role="status" className="absolute bottom-3 left-3 max-w-[calc(100%-5rem)] rounded bg-white/95 px-2 py-1 text-xs text-sky-950">
            演示加载失败，请重试。
          </p>
        </>
      )}
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={label}
        title={label}
        className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-sky-900 shadow-sm ring-1 ring-sky-200 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
      >
        <Icon size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
