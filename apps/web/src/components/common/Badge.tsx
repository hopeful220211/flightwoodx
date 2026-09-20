import { cn } from '../../utils/cn'

export type BadgeVariant = 'draft' | 'completed' | 'featured'

export interface BadgeProps {
  variant: BadgeVariant
  className?: string
  children: React.ReactNode
}

export function Badge({ variant, className, children }: BadgeProps) {
  const v =
    variant === 'completed'
      ? 'bg-success/15 text-success ring-success/20'
      : variant === 'draft'
        ? 'bg-warning/15 text-warning ring-warning/20'
        : 'bg-sky-500/15 text-sky-700 ring-sky-400/25 dark:text-sky-200'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
        v,
        className,
      )}
    >
      {children}
    </span>
  )
}
