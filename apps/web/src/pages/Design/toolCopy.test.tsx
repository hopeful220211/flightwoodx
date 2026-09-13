import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { StepGuide } from './components/StepGuide'
import { WelcomeEmptyState } from './components/WelcomeEmptyState'
import { EmptyCanvasGuide } from '../Coding/components/EmptyCanvasGuide'
import { FlightPlanPanel } from '../Coding/components/FlightPlanPanel'
import { MaterialPreparation } from '../ExportPreview/MaterialPreparation'
import { SimResultPanel } from '../Simulator/SimResultPanel'
import { FlyPage } from '../Fly/FlyPage'
import { HUD } from '../ARFlight/HUD'
import { MyPartsStrip } from '../../features/partStudio/MyPartsStrip'

vi.mock('../../components/common/ScrollReveal', () => ({ ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</> }))

describe('tool descriptions', () => {
  it('describes the assembly task and saved designs', () => {
    const html = renderToStaticMarkup(<WelcomeEmptyState historyCount={2} onStartNew={() => {}} onViewHistory={() => {}} />)
    expect(html).toContain('无人机拼装')
    expect(html).toContain('按步骤选择零件，查看连接位置并保存设计。')
    expect(html).toContain('查看已有设计（2 个）')
    expect(html).not.toContain('我们会一步步')
  })

  it('describes actual assembly steps without unsupported hardware comparisons', () => {
    const html = ['HUB', 'ARM', 'GUARD', 'DECO', 'REVIEW'].map(step => renderToStaticMarkup(
      <StepGuide currentStep={step as 'HUB' | 'ARM' | 'GUARD' | 'DECO' | 'REVIEW'} canAdvance />,
    )).join('')
    expect(html).toContain('主板用于连接其他零件。选择形状后，在三维视图中查看连接位置。')
    expect(html).toContain('本步骤安装起落架。选择零件后，检查其与主板的连接位置。')
    expect(html).not.toMatch(/圆形稳|6臂更稳|保护最强|更牢固/)
  })

  it('explains how to create a block program without promising real flight', () => {
    const html = renderToStaticMarkup(<EmptyCanvasGuide onLoadExample={() => {}} />)
    expect(html).toContain('编写飞行程序')
    expect(html).toContain('将工具箱中的积木拖入画布并依次连接，设置动作和参数。')
    expect(html).toContain('运行后在模拟场景中查看指令执行过程。')
    expect(html).not.toContain('会飞的程序')
  })

  it('describes the program summary without relying on panel position', () => {
    const html = renderToStaticMarkup(<FlightPlanPanel ir={null} compileError={null} />)
    expect(html).toContain('连接积木后，这里按顺序显示程序步骤。')
    expect(html).toContain('从工具箱拖入积木并设置参数。')
    expect(html).not.toContain('右边会把积木')
  })

  it('labels required drawings and unknown material requirements, not a ready-to-cut export', () => {
    const html = renderToStaticMarkup(<MaterialPreparation estimate={{ dxfFiles: [{ name: '001', count: 2 }], totalCutLengthMm: 160, suggestedBoardSize: '300mm × 200mm', boardCount: 1, cutTimeMinutes: 1 }} />)
    expect(html).toContain('图纸与材料说明')
    expect(html).toContain('当前入口可下载设计记录与零件清单，暂不提供切割图。')
    expect(html).toContain('缺少二维轮廓的零件')
    expect(html).not.toContain('001.dxf')
    expect(html).toContain('切割长度：缺少完整二维轮廓，暂无法计算')
    expect(html).toContain('板材数量：需根据零件尺寸和排版确认')
    expect(html).toContain('加工时间：需根据材料及设备参数确认')
    expect(html).not.toMatch(/160 mm|300mm × 200mm|230 mm/)
    expect(html).toContain('不能直接交给设备加工')
    expect(html).not.toContain('机器会按图纸切出每一片木头')
  })

  it('names simulator completion and collision as simulated results', () => {
    expect(renderToStaticMarkup(<SimResultPanel kind="success" elapsedSec={10} onRerun={() => {}} />)).toContain('模拟运行完成')
    expect(renderToStaticMarkup(<SimResultPanel kind="collision" elapsedSec={2} onRerun={() => {}} />)).toContain('模拟中发生碰撞')
  })

  it('marks unimplemented real-drone control unavailable without internal roadmap labels', () => {
    const html = renderToStaticMarkup(<MemoryRouter><FlyPage /></MemoryRouter>)
    expect(html).toContain('当前不支持连接或控制真实无人机。')
    expect(html).toContain('此页未接入')
    expect(html).not.toMatch(/阶段三|P2 优先级|同一份 IR/)
  })

  it('identifies AR altitude as a simulation value', () => {
    const html = renderToStaticMarkup(<HUD altitude={0.5} onExit={() => {}} onFirstTouch={() => {}} />)
    expect(html).toContain('模拟高度：0.5m')
    expect(html).toContain('退出摄像头模拟')
  })

  it('explains where saved custom parts are listed', () => {
    const html = renderToStaticMarkup(<MyPartsStrip parts={[]} onDelete={() => {}} onUse={() => {}} />)
    expect(html).toContain('登录后保存的零件会列在这里。先绘制闭合轮廓，输入名称并保存。')
  })
})
