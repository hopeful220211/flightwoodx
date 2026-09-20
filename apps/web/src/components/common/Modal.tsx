import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface ModalProps {
  open: boolean
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
}

export function Modal({ open, title, children, footer, onClose }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ;(dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? dialogRef.current)?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab') {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0)
        const first = controls[0]
        const last = controls.at(-1)
        if (!first) { e.preventDefault(); dialogRef.current?.focus() }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previous?.focus() }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative mx-auto flex h-full max-w-2xl items-center justify-center px-4">
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : '对话框'} tabIndex={-1} className="site-modal max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-xl border border-black/10 bg-white shadow-lift dark:border-white/10 dark:bg-slate-950">
          <div className={cn('flex items-center justify-between gap-3 p-4', title ? 'border-b border-black/5 dark:border-white/10' : '')}>
            {title ? <div id={titleId} className="text-base font-semibold">{title}</div> : <div />}
            <button
              type="button"
              className="touch-target inline-flex items-center justify-center rounded-md hover:bg-wood-50 dark:hover:bg-slate-900"
              aria-label="关闭模态框"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-4">{children}</div>
          {footer ? <div className="border-t border-black/5 p-4 dark:border-white/10">{footer}</div> : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
