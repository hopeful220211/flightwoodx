import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface TableColumn<T> {
  key: string
  header: string
  render: (row: T, index: number) => ReactNode
  className?: string
}

export interface TableProps<T> {
  columns: TableColumn<T>[]
  data: T[]
  rowKey: (row: T, index: number) => string
  emptyText?: string
  className?: string
}

export function Table<T>({ columns, data, rowKey, emptyText = '暂无数据', className }: TableProps<T>) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-sky-100', className)}>
      <table className="site-table w-full text-sm">
        <thead>
          <tr className="border-b border-sky-100 bg-sky-50/60">
            {columns.map((col) => (
              <th key={col.key} className={cn('px-4 py-3 text-left font-medium text-ink-600', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-ink-400">
                {emptyText}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={rowKey(row, i)} className="border-b border-sky-50 transition-colors hover:bg-sky-50/30">
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3', col.className)}>
                    {col.render(row, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
