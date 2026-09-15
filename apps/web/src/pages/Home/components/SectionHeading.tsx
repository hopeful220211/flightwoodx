import type { ReactNode } from 'react'
import { cn } from '../../../utils/cn'

interface SectionHeadingProps {
  /** 小标签（eyebrow），前缀带「榫卯」互锁记号 */
  eyebrow?: string
  /** 主标题 */
  title: ReactNode
  /** 标题下的引言 */
  lead?: ReactNode
  /** 对齐方式 */
  align?: 'center' | 'left'
  /** 深色背景上使用浅色文字 */
  tone?: 'dark' | 'light'
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'center',
  tone = 'dark',
  className,
}: SectionHeadingProps) {
  const isCenter = align === 'center'

  return (
    <div
      className={cn(
        'site-section-heading flex flex-col',
        tone === 'light' && 'site-section-heading--light',
        isCenter ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      {eyebrow && (
        <div className="site-eyebrow">{eyebrow}</div>
      )}

      <h2
        className={cn(
          'site-section-title',
          tone === 'light' ? 'text-white' : 'text-sky-900',
        )}
      >
        {title}
      </h2>

      {lead && (
        <p
          className={cn(
            'site-section-lead',
            isCenter && 'max-w-2xl',
            tone === 'light' ? 'text-sky-200' : 'text-sky-700',
          )}
        >
          {lead}
        </p>
      )}
    </div>
  )
}
