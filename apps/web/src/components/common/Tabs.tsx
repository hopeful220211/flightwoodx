import { cn } from '../../utils/cn'

export interface TabItem<TValue extends string> {
  value: TValue
  label: string
  icon?: React.ReactNode
}

export interface TabsProps<TValue extends string> {
  items: Array<TabItem<TValue>>
  value: TValue
  onChange: (value: TValue) => void
  className?: string
}

export function Tabs<TValue extends string>({ items, value, onChange, className }: TabsProps<TValue>) {
  return (
    <div className={cn('site-tabs flex flex-wrap gap-2', className)} role="tablist">
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              'touch-target relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition',
              active
                ? 'bg-wood-200 text-wood-900 dark:bg-slate-800 dark:text-white'
                : 'text-slate-700 hover:bg-wood-100 dark:text-slate-200 dark:hover:bg-slate-900',
            )}
            onClick={() => onChange(it.value)}
          >
            {it.icon ? <span className="inline-flex">{it.icon}</span> : null}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
