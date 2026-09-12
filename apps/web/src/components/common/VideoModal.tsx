import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface VideoModalProps {
  open: boolean
  onClose: () => void
  videoUrl: string
  title?: string
  poster?: string
}

export function VideoModal({ open, ...props }: VideoModalProps) {
  return open ? <VideoDialog key={props.videoUrl} {...props} /> : null
}

function VideoDialog({ onClose, videoUrl, title = '演示视频', poster }: Omit<VideoModalProps, 'open'>) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // A stable callback captures the outgoing player before React clears its ref,
  // including parent-driven closure, retry, source changes and route unmounts.
  const setVideoRef = useCallback((video: HTMLVideoElement | null) => {
    if (!video) videoRef.current?.pause()
    videoRef.current = video
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current!
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    closeButtonRef.current?.focus()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  const requestClose = () => {
    videoRef.current?.pause()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-0 text-white shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      onCancel={event => { event.preventDefault(); requestClose() }}
      onClick={event => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose()
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-6">
        <h2 id={titleId} className="text-base font-extrabold sm:text-lg">{title}</h2>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={requestClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          aria-label="关闭"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <video
        key={attempt}
        ref={setVideoRef}
        src={videoUrl}
        poster={poster}
        controls
        autoPlay
        playsInline
        preload="none"
        onError={() => setFailed(true)}
        className="block aspect-video max-h-[calc(100dvh-10rem)] w-full bg-black object-contain"
      >
        您的浏览器不支持视频播放。
      </video>
      {failed && (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-3 text-sm text-white">
          <p>视频加载失败，请检查网络后重试。</p>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-sky-700 px-4 font-bold hover:bg-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            onClick={() => { setFailed(false); setAttempt(value => value + 1); closeButtonRef.current?.focus() }}
          >
            重试
          </button>
        </div>
      )}
      <div className="px-4 py-3 text-center text-sm text-slate-400">
        按 ESC 键或点击外部区域关闭
      </div>
    </dialog>
  )
}
