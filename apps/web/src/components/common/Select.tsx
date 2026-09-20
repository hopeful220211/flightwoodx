import type { SelectHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

export function Select({ label, options, className, id, ...rest }: SelectProps) {
  const selectId = id || label?.replace(/\s/g, '-').toLowerCase()

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'site-form-control w-full rounded-md border border-sky-200 bg-white px-4 py-2.5 text-sm text-ink-900 transition-colors',
          'focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20',
          className,
        )}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
