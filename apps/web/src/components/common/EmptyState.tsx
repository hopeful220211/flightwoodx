import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { Button, type ButtonProps } from './Button'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void; buttonProps?: Omit<ButtonProps, 'onClick' | 'children'> }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-black/10 bg-white p-8 text-center dark:border-white/15 dark:bg-slate-900',
        className,
      )}
    >
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-wood-100 text-wood-800 dark:bg-slate-800 dark:text-slate-50">
          {icon}
        </div>
      ) : null}
      <div className="text-base font-semibold">{title}</div>
      {description ? <div className="max-w-md text-sm text-slate-600 dark:text-slate-300">{description}</div> : null}
      {action ? (
        <Button onClick={action.onClick} {...action.buttonProps}>
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}
