import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 变体 */
  variant?: ButtonVariant
  /** 尺寸 */
  size?: ButtonSize
  /** 加载状态 */
  loading?: boolean
  /** 左侧图标 */
  leftIcon?: ReactNode
  /** 右侧图标 */
  rightIcon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  leftIcon,
  rightIcon,
  className,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading

  const sizeCls =
    size === 'sm'
      ? 'min-h-[44px] px-3 text-sm'
      : size === 'lg'
        ? 'min-h-[48px] px-5 text-base'
        : 'min-h-[44px] px-4 text-sm'

  const variantCls =
    variant === 'secondary'
      ? 'bg-wood-100 text-wood-800 hover:bg-wood-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700'
      : variant === 'outline'
        ? 'border border-sky-200 bg-white text-ink-700 hover:bg-sky-50 hover:border-sky-300 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 dark:hover:bg-slate-900'
        : variant === 'ghost'
          ? 'bg-transparent text-ink-700 hover:bg-sky-50 dark:text-slate-100 dark:hover:bg-slate-900'
          : 'bg-sky-500 text-white hover:bg-sky-600 shadow-sky-glow'

  return (
    <button
      type="button"
      data-variant={variant}
      data-size={size}
      className={cn(
        'site-button touch-target inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        sizeCls,
        variantCls,
        className,
      )}
      disabled={isDisabled}
      {...rest}
    >
      {leftIcon ? <span className="inline-flex shrink-0">{leftIcon}</span> : null}
      {loading ? '加载中…' : children}
      {rightIcon ? <span className="inline-flex shrink-0">{rightIcon}</span> : null}
    </button>
  )
}
