// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LovedBySection } from './LovedBySection'
import { CurriculumSection } from './CurriculumSection'

let root: Root
let container: HTMLDivElement
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<><CurriculumSection /><LovedBySection /></>))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('restores all five owner-confirmed public testimonials verbatim with their original attribution', async () => {
  const testimonials = [
    ['小宇', '五年级学生', '我以前觉得无人机就是大人买的那种玩具，飞起来就完了。但自己拼出来之后，我才知道每个零件是干嘛的——为什么机臂要这么长、电机装在哪里才不会打到螺旋桨。飞起来的时候感觉完全不一样，因为是我自己做的。'],
    ['周女士', '小学四年级学生家长', '孩子回家不再只盯着 iPad 是最直观的变化。他会主动跟我讲榫卯是什么、为什么老木匠不用钉子——这些话我这个当妈的都答不上来。FlightWoodX 让"动手"这件事重新变得有分量。'],
    ['小雨', '三年级学生', '最喜欢的是电脑上设计完，真的能飞起来那一刻。我设计的第一架飞歪了，我自己找到是因为一边机臂长了一点——然后自己改过来就飞直了。感觉像科学家。'],
    ['林先生', '初中一年级学生父亲，IT 行业', '作为程序员，我见过太多"编程启蒙"产品——大部分是把语法包装成卡通。FlightWoodX 不一样，它让孩子直接面对真实的工程问题：结构、力学、空气动力学。这是我花钱买不到的东西。'],
    ['陈老师', '市级重点小学科学教师，12 年教龄', '我带过很多 STEAM 产品进课堂，学生 3 天就腻了。FlightWoodX 是第一个让学生主动要求延长课时的——因为他们想亲眼看到自己设计的那架飞起来。这个"亲手造"的过程是无法被 App 替代的。'],
  ]
  expect(container.querySelector('#home-testimonials h2')?.textContent).toBe('用户评价')
  expect(container.querySelector('#home-testimonials')?.textContent).not.toMatch(/操作说明|使用帮助/)
  for (const [index, [name, identity, quote]] of testimonials.entries()) {
    const dot = container.querySelector<HTMLButtonElement>(`button[aria-label="查看第 ${index + 1} 条反馈"]`)
    expect(dot).not.toBeNull()
    await act(async () => dot!.click())
    expect(container.querySelector('blockquote')?.textContent).toBe(`“${quote}”`)
    expect(container.querySelector('#home-testimonials')?.textContent).toContain(name)
    expect(container.querySelector('#home-testimonials')?.textContent).toContain(identity)
    expect(dot?.getAttribute('aria-current')).toBe('true')
  }
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="下一条"]')!.click())
  expect(container.querySelector('#home-testimonials')?.textContent).toContain('小宇')
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="上一条"]')!.click())
  expect(container.querySelector('#home-testimonials')?.textContent).toContain('陈老师')
})

it('keeps the real usage-steps destination when restoring the feedback section', async () => {
  const section = container.querySelector('#home-usage-steps')!
  const scroll = vi.fn()
  section.scrollIntoView = scroll
  const button = [...container.querySelectorAll('button')].find(item => item.textContent === '查看使用步骤')
  expect(button).toBeDefined()
  await act(async () => button!.click())
  expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth' })
})

it('keeps automatic rotation and stops its timer on unmount', async () => {
  expect(container.querySelector('#home-testimonials')?.textContent).toContain('小宇')
  await act(async () => vi.advanceTimersByTime(3000))
  expect(container.querySelector('#home-testimonials')?.textContent).toContain('周女士')
  await act(async () => root.render(null))
  expect(vi.getTimerCount()).toBe(0)
})
