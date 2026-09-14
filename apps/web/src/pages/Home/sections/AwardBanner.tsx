// Organizer records checked 2026-09-14; retain the exact award categories.
const awardLinks = [
  { name: '红点设计概念奖', href: 'https://www.red-dot.org/project/flightwood-x-83079', prefix: '已获' },
  { name: 'iF 设计奖', href: 'https://ifdesign.com/en/winner-ranking/project/flight-wood-xwooden-drone-course-service-system/742980', prefix: '、' },
  { name: '鲲鹏奖工业设计概念组金奖', href: 'https://www.k-p-a.design/news/1448.html', prefix: '及' },
] as const

export function AwardBanner() {
  return (
    <section id="home-award-banner" aria-label="作品获奖" className="relative isolate w-full overflow-hidden bg-sky-700">
      {/* Quiet, cropped part outlines leave the centre clear for the statement. */}
      <svg aria-hidden="true" focusable="false" viewBox="0 0 1440 280" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full">
        <circle cx="-40" cy="190" r="252" fill="#2b88db" opacity=".34" />
        <path d="M1240 0H1440V280H1110Z" fill="#2b88db" opacity=".28" />
        <g fill="none" stroke="#b9dbfe" strokeWidth="2" opacity=".22">
          <g transform="translate(18 -62) rotate(22 95 110)">
            <path d="M63 84 26 47M127 84l37-37M63 146l-37 37M127 146l37 37" />
            <rect x="60" y="79" width="70" height="74" rx="19" />
            <circle cx="18" cy="39" r="35" /><circle cx="172" cy="39" r="35" />
            <circle cx="18" cy="191" r="35" /><circle cx="172" cy="191" r="35" />
            <path d="M82 95h26v42H82z" />
          </g>
          <g transform="translate(1330 122) rotate(-28)">
            <path d="M-70-88H70V-30H48V-10H70V88H-70V10H-48V-10H-70Z" />
            <rect x="-32" y="-56" width="64" height="16" rx="8" />
            <rect x="-32" y="40" width="64" height="16" rx="8" />
            <path d="M-100-108V108M-110-108h20M-110 108h20" strokeDasharray="5 7" />
          </g>
        </g>
      </svg>

      <p className="relative mx-auto max-w-[1160px] px-6 py-12 text-center font-sans sm:px-10 sm:py-14 lg:py-16">
        <span className="block text-lg font-medium leading-relaxed text-white/90 sm:text-[22px] lg:text-2xl">
          <span className="whitespace-nowrap">FlightWoodX</span> 木质无人机课程服务系统
        </span>
        <span className="mt-3 block text-[22px] leading-[1.8] text-white sm:text-[28px] lg:text-[32px]">
          {awardLinks.map(({ name, href, prefix }) => (
            <span key={name} className="inline-block">
              {prefix}<a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${name}（主办方记录，新窗口打开）`} className="rounded-sm font-semibold underline decoration-white/35 decoration-1 underline-offset-8 transition-colors hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">{name}</a>
            </span>
          ))}。
        </span>
      </p>
    </section>
  )
}
