import { CirclePlay } from 'lucide-react'

export function VideoPreviewSection({ onPlay }: { onPlay: () => void }) {
  return (
    <section aria-label="产品视频" className="relative flow-root bg-sky-50/40 px-4 sm:px-6">
      <button
        type="button"
        aria-label="播放视频"
        onClick={onPlay}
        className="group relative z-10 mx-auto -mt-[var(--home-video-overlap)] block aspect-video w-full max-w-6xl overflow-hidden rounded-2xl bg-sky-950 shadow-[0_12px_36px_rgba(15,45,75,0.22)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-sky-600"
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
    </section>
  )
}
