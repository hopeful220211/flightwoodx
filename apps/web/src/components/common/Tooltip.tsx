import { cloneElement, useEffect, useId, useState, type ReactElement } from 'react'
import { cn } from '../../utils/cn'

export interface TooltipProps {
  content: string
  children: ReactElement<{ 'aria-describedby'?: string }>
  className?: string
  placement?: 'top' | 'bottom'
}

export function Tooltip({ content, children, className, placement = 'bottom' }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [open])

  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClickCapture={() => setOpen(false)}
    >
      {cloneElement(children, { 'aria-describedby': open ? [children.props['aria-describedby'], id].filter(Boolean).join(' ') : children.props['aria-describedby'] })}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn('pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1.5 text-xs font-medium text-white shadow-sm', placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2')}
        >
          {content}
        </span>
      ) : null}
    </span>
  )
}
