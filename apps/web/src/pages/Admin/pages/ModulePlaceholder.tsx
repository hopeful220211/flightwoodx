import { Construction } from 'lucide-react'

/** 模块占位页（对应 Phase 1~4 逐步实现）。 */
export function ModulePlaceholder({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-8">
      <h1 className="text-h3 font-semibold tracking-tight text-sky-900">{title}</h1>
      <div className="flex flex-col items-center justify-center rounded-card border-2 border-dashed border-sky-200 bg-surface-white py-20 text-center">
        <Construction size={36} className="mb-4 text-sky-300" />
        <p className="text-title-sm font-medium text-sky-700">{title}暂未开放</p>
        <p className="mt-2 max-w-sm text-body text-sky-500">{desc}</p>
      </div>
    </div>
  )
}

export const AdminCoursesPage = () => <ModulePlaceholder title="课程管理" desc="当前不能新增、编辑或发布课程。" />
export const AdminPartsPage = () => <ModulePlaceholder title="零件管理" desc="官方零件可在设计工作台使用。后台零件审核、发布和采购清单管理暂未开放。" />
export { AdminAuditPage } from './AuditPage'
