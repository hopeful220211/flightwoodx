import { useParams } from 'react-router'
import { Wifi, Smartphone } from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import { Breadcrumb } from '../../components/common/Breadcrumb'
import { Card } from '../../components/common/Card'

export function FlyPage() {
  const { id } = useParams()

  return (
    <PageContainer className="py-8 space-y-6">
      <Breadcrumb items={[
        { label: '工作台', to: '/dashboard' },
        { label: '项目详情', to: `/projects/${id}` },
        { label: '实机控制说明' },
      ]} />

      <h1 className="text-2xl font-bold text-ink-900">实机控制与模拟说明</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card hoverable={false}>
          <div className="flex flex-col items-center py-10 text-center">
            <Wifi size={40} className="text-sky-400 mb-3" />
            <h3 className="font-semibold text-ink-900">实机连接与控制</h3>
            <p className="text-sm text-ink-400 mt-1">当前不支持连接或控制真实无人机。</p>
            <p className="text-xs text-ink-400 mt-4">此功能尚未开放；网站中的程序运行仅用于模拟。</p>
          </div>
        </Card>
        <Card hoverable={false}>
          <div className="flex flex-col items-center py-10 text-center">
            <Smartphone size={40} className="text-accent-leaf mb-3" />
            <h3 className="font-semibold text-ink-900">摄像头模拟（AR）</h3>
            <p className="text-sm text-ink-400 mt-1">将虚拟无人机叠加到摄像头画面，不控制实机。</p>
            <p className="text-xs text-ink-400 mt-4">此页未接入启动入口。</p>
          </div>
        </Card>
      </div>
    </PageContainer>
  )
}
