import { useNavigate } from 'react-router'
import { Home, ArrowLeft } from 'lucide-react'
import { Button } from '../../components/common/Button'

export function NotFoundPage() {
  const nav = useNavigate()

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="text-8xl font-semibold text-sky-200">404</div>
      <h1 className="mt-4 text-2xl font-semibold text-ink-900">页面未找到</h1>
      <p className="mt-2 text-ink-400 max-w-sm">你访问的页面不存在或已被移除</p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={() => nav(-1)} leftIcon={<ArrowLeft size={16} />}>
          返回上一页
        </Button>
        <Button onClick={() => nav('/')} leftIcon={<Home size={16} />}>
          回到首页
        </Button>
      </div>
    </div>
  )
}
