import type { InputHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, id, ...rest }: InputProps) {
  const inputId = id || label?.replace(/\s/g, '-').toLowerCase()

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'site-form-control w-full rounded-md border border-sky-200 bg-white px-4 py-2.5 text-sm text-ink-900 transition-colors placeholder:text-ink-400',
          'focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20',
          error && 'border-error focus:border-error focus:ring-error/20',
          className,
        )}
        {...rest}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
