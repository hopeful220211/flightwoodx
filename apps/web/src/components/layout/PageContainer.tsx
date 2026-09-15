import type { ReactNode } from 'react'

export interface PageContainerProps {
  /** 页面内容 */
  children: ReactNode
  /** 额外 className */
  className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={['site-page-container mx-auto w-full max-w-[1248px] px-6', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}
