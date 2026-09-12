import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { CirclePlay } from 'lucide-react'

export interface VideoPreviewHandle {
  play: () => void
}

export function VideoPreviewSection({ ref }: { ref?: Ref<VideoPreviewHandle> }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const focusRetryOnFailure = useRef(false)
  const [started, setStarted] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const setVideoRef = useCallback((video: HTMLVideoElement | null) => {
    if (!video) videoRef.current?.pause()
    videoRef.current = video
  }, [])

  useEffect(() => {
    if (failed) {
      if (focusRetryOnFailure.current) retryRef.current?.focus({ preventScroll: true })
    }
    else if (started) videoRef.current?.focus({ preventScroll: true })
  }, [started, failed, attempt])

  const showPlaybackError = () => {
    // Capture focus before hiding the failed player; do not interrupt someone
    // who has already moved to another part of the page while media was loading.
    focusRetryOnFailure.current = frameRef.current?.contains(document.activeElement) ?? false
    videoRef.current?.pause()
    setFailed(true)
  }

  const retry = () => {
    setFailed(false)
    setAttempt(value => value + 1)
  }

  const startPlayback = () => {
    if (!started) {
      setStarted(true)
    } else if (failed) {
      retry()
    } else {
      const video = videoRef.current
      video?.focus({ preventScroll: true })
      void video?.play().catch(error => {
        // Ignore cancellation from replacing/unmounting this player. A real
        // resume failure remains visible and retryable in the same frame.
        if (videoRef.current === video && error?.name !== 'AbortError') showPlaybackError()
      })
    }
  }

  useImperativeHandle(ref, () => ({
    play() {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      frameRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
      startPlayback()
    },
  }))

  return (
    <section aria-label="产品视频" className="relative flow-root bg-sky-50/40 px-4 sm:px-6">
      <div
        ref={frameRef}
        data-testid="home-video-frame"
        className="relative z-10 mx-auto -mt-[var(--home-video-overlap)] aspect-video w-full max-w-[min(605px,calc((100svh-8rem)*16/9))] overflow-hidden rounded-2xl bg-sky-950 shadow-[0_12px_36px_rgba(15,45,75,0.22)] has-[:focus-visible]:outline has-[:focus-visible]:outline-4 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-sky-600"
      >
        {started ? (
          <video
            key={attempt}
            ref={setVideoRef}
            src="/resource/videos/flightwoodx-introduction.mp4"
            poster="/optimized/picture/video/flightwoodx-introduction.webp"
            controls={!failed}
            autoPlay
            playsInline
            preload="none"
            hidden={failed}
            tabIndex={failed ? -1 : 0}
            aria-label="FlightWoodX 产品演示"
            onError={showPlaybackError}
            className="absolute inset-0 h-full w-full bg-black object-contain"
          >
            您的浏览器不支持视频播放。
          </video>
        ) : (
          <button
            type="button"
            aria-label="播放视频"
            onClick={startPlayback}
            className="group absolute inset-0 h-full w-full focus-visible:outline-none"
          >
            <img
              src="/optimized/picture/video/flightwoodx-introduction.webp"
              alt="FlightWoodX 产品演示视频封面"
              width={1920}
              height={1080}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span aria-hidden="true" className="absolute inset-0 bg-black/15 transition-colors group-hover:bg-black/5 motion-reduce:transition-none" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex items-center gap-2 rounded-full bg-[#0078D4] px-6 py-3 text-lg font-semibold text-white shadow-lg transition-colors group-hover:bg-[#006CBD] motion-reduce:transition-none sm:gap-3 sm:px-10 sm:py-4 sm:text-2xl">
                <CirclePlay aria-hidden="true" className="h-7 w-7 sm:h-10 sm:w-10" />
                播放视频
              </span>
            </span>
          </button>
        )}
        {failed && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-sky-950/95 px-4 text-center text-sm text-white">
            <p>视频加载失败，请检查网络后重试。</p>
            <button
              ref={retryRef}
              type="button"
              onClick={retry}
              className="min-h-11 rounded-full bg-[#0078D4] px-6 font-semibold hover:bg-[#006CBD] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              重试
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
