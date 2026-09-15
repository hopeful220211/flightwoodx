import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '../../utils/cn'

/**
 * PillButton — RFC-020 全圆角胶囊按钮（主行动 / 下一步 / 提交）。
 * - 全圆角 r-pill、min-h 56–64 / min-w 180，主行动用 accent.spark 点睛蓝。
 * - arrow 为真时右侧内嵌 56px 圆形箭头（底色 spark、白色 ArrowRight）。
 * - 同时支持 href（渲染 <a>）或 onClick（渲染 <button>）。
 * - 可键盘聚焦，focus-visible 有环（沿用全局 :focus-visible）。
 */
export type PillButtonVariant = 'primary' | 'ghost'

interface PillButtonBaseProps {
  /** 按钮文案 */
  children: ReactNode
  /** 变体：primary 实心点睛蓝 / ghost 描边幽灵 */
  variant?: PillButtonVariant
  /** 右侧内嵌圆形箭头 */
  arrow?: boolean
  /** 额外类名 */
  className?: string
}

interface PillButtonAnchorProps
  extends PillButtonBaseProps,
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'> {
  /** 提供 href 时渲染为链接 */
  href: string
}

interface PillButtonButtonProps
  extends PillButtonBaseProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  href?: undefined
}

export type PillButtonProps = PillButtonAnchorProps | PillButtonButtonProps

const variantCls: Record<PillButtonVariant, string> = {
  primary: 'bg-accent-spark text-white hover:brightness-110 shadow-sky-glow',
  ghost:
    'bg-transparent text-ink-900 border border-ink-200 hover:border-accent-spark hover:text-accent-spark dark:text-slate-50 dark:border-white/20',
}

export function PillButton({
  children,
  variant = 'primary',
  arrow = false,
  className,
  ...rest
}: PillButtonProps) {
  const base = cn(
    'site-pill-button group inline-flex items-center justify-center gap-3 rounded-pill font-grotesk font-medium',
    'min-h-[56px] min-w-[180px] transition active:translate-y-[1px] active:scale-[0.98]',
    arrow ? 'pl-7 pr-2' : 'px-7',
    'text-base whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60',
    variantCls[variant],
    className,
  )

  // 内嵌 56px 圆形箭头：primary 用反色白底、ghost 用 spark 底
  const arrowEl = arrow ? (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-1',
        variant === 'primary' ? 'bg-white text-accent-spark' : 'bg-accent-spark text-white',
      )}
    >
      <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
    </span>
  ) : null

  if ('href' in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest as PillButtonAnchorProps
    return (
      <a href={href} className={base} {...anchorRest}>
        <span>{children}</span>
        {arrowEl}
      </a>
    )
  }

  const { type = 'button', ...buttonRest } = rest as PillButtonButtonProps
  return (
    <button type={type} className={base} {...buttonRest}>
      <span>{children}</span>
      {arrowEl}
    </button>
  )
}
