import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="site-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="site-page-title text-2xl font-semibold tracking-tight text-sky-900 lg:text-3xl">{title}</h1>
        {description && <p className="mt-3 text-base leading-6 text-sky-700">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 sm:shrink-0">{actions}</div>}
    </div>
  )
}
