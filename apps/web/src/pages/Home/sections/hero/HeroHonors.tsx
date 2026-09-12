const honors = [
  { file: 'red-dot', alt: 'Red Dot 获奖荣誉' },
  { file: 'if-design', alt: 'iF Design Award 获奖荣誉' },
  { file: 'idea', alt: 'IDEA 获奖荣誉' },
  { file: 'other-awards', alt: '鲲鹏奖、红棉设计奖、东莞杯、IDA、New Star Award 荣誉' },
] as const

interface HeroHonorsProps {
  onClick?: () => void
  delay?: number
}

export function HeroHonors({ onClick, delay = 0 }: HeroHonorsProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="查看获奖荣誉"
      className="grid w-full min-w-0 grid-cols-2 gap-3 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-800 sm:grid-cols-4 sm:gap-2"
      style={{
        opacity: 0,
        transform: 'translateY(12px)',
        animation: `fadeInUp 500ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms forwards`,
      }}
    >
      {honors.map(({ file, alt }) => (
        <img
          key={file}
          src={`/optimized/picture/honors/${file}.webp`}
          alt={alt}
          width={2298}
          height={872}
          decoding="async"
          className="h-auto w-full min-w-0 object-contain"
        />
      ))}
    </button>
  )
}
