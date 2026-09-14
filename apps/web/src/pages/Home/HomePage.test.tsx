// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'
import { WhyUsSection } from './sections/WhyUsSection'

beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))))
afterEach(() => vi.unstubAllGlobals())

it('describes design, wooden assembly and flight testing without promising real-flight results', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<WhyUsSection />)

  expect(Array.from(container.querySelectorAll('h3'), heading => ({
    title: heading.textContent,
    subtitle: heading.nextElementSibling?.textContent,
    description: heading.nextElementSibling?.nextElementSibling?.textContent,
  }))).toEqual([
    {
      title: '自主设计', subtitle: '绘制零件，规划结构',
      description: '在浏览器中绘制零件、选择部件并调整三维布局，保存自己的无人机设计。',
    },
    {
      title: '木质拼接', subtitle: '连接木件，组装机架',
      description: '通过榫卯连接木质零件，逐步组装无人机机架。观察各部件的位置与连接关系，理解机体的基本结构。',
    },
    {
      title: '飞行测试', subtitle: '编排动作，模拟运行',
      description: '用图形化积木编排飞行动作，在模拟环境中查看运行过程并调整程序。',
    },
  ])
  expect(Array.from(container.querySelectorAll('img'), image => image.getAttribute('src'))).toEqual([
    '/optimized/picture/flight_png/untitled.160.webp',
    '/optimized/picture/learning_kids/EX4A6148.webp',
    '/optimized/picture/learning_kids/EX4A6264 1.webp',
  ])
  expect(container.textContent).not.toMatch(/不是模拟器|真会飞|设计完就能试飞|官方配齐|不用一根钉子|不代表|需要验证|尚未验证/)
})

it('uses the requested hero title and introduction without changing the capability line', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter><HomePage /></MemoryRouter>)

  const hero = container.querySelector('#home-hero')!
  expect(Array.from(hero.querySelectorAll('p'), paragraph => paragraph.textContent)).toEqual([
    '翼想飞木无人机搭建平台',
    '在这里设计、制作、测试你的第一架无人机设计 ｜ 搭建 ｜ 导出 ｜ 社区分享',
  ])
  expect(hero.textContent).not.toMatch(/动手造，会飞的|不上一根钉子的榫卯木工，拼一架真能飞的无人机/)
  expect(Array.from(hero.querySelectorAll('h1'), heading => heading.textContent)).toEqual(['FLIGHT', 'WOOD X'])
})

it('removes the separate award section and offers a video preview without downloading the video', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter><HomePage /></MemoryRouter>)

  expect(container.querySelector('#awards')).toBeNull()
  expect(container.textContent).not.toMatch(/这几个国际设计奖|下面这三个都在手上|其中红点 Best of the Best/)
  const preview = container.querySelector('button[aria-label="播放视频"]')
  expect(preview).not.toBeNull()
  expect(preview?.querySelector('img')?.getAttribute('src')).toBe('/optimized/picture/video/flightwoodx-introduction.webp')
  expect(container.querySelector('section[aria-label="产品视频"] video')).toBeNull()
  expect(container.querySelector('a[href="#awards"], button[aria-label="查看获奖荣誉"]')).toBeNull()
  expect(container.textContent).toContain('平台功能')
})

it('explains homepage features, shared login and operating steps without promotional claims', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter><HomePage /></MemoryRouter>)
  expect(Array.from(container.querySelectorAll('h2'), heading => heading.textContent)).toEqual([
    '平台功能', '设计工作台', '使用步骤', '学生、教师和学校', '用户评价', '创建设计作品',
  ])
  expect(container.textContent).toContain('当前均使用同一登录入口')
  expect(container.textContent).toContain('课程管理尚未开放')
  expect(container.textContent).toContain('学校管理功能尚未开放')
  expect(container.textContent).toContain('结构规则检查与设计数据导出')
  expect(container.textContent).toContain('目前不提供切割图')
  expect(container.textContent).not.toMatch(/各走各的入口|不只是又一个|从想到做到飞|亲手把它送上天|没放修过的宣传图|最早一批用过|免费开始设计|校本课程|师资培训|效果评估/)
  expect(container.querySelectorAll('#home-testimonials blockquote')).toHaveLength(1)
  expect(container.querySelector('#home-testimonials')?.textContent).toContain('小宇')
  expect(Array.from(container.querySelectorAll('button'), button => button.textContent)).not.toContain('联系我们')
})

it('replaces the hero text capsule with the four owner-provided honor images', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter><HomePage /></MemoryRouter>)

  const honors = container.querySelector('[role="group"][aria-label="获奖荣誉"]')
  expect(honors).not.toBeNull()
  expect(Array.from(honors!.querySelectorAll('img'), image => ({
    src: image.getAttribute('src'), alt: image.alt, width: image.width, height: image.height,
  }))).toEqual([
    { src: '/optimized/picture/honors/red-dot.webp', alt: 'Red Dot 获奖荣誉', width: 2298, height: 872 },
    { src: '/optimized/picture/honors/if-design.webp', alt: 'iF Design Award 获奖荣誉', width: 2298, height: 872 },
    { src: '/optimized/picture/honors/idea.webp', alt: 'IDEA 获奖荣誉', width: 2298, height: 872 },
    { src: '/optimized/picture/honors/other-awards.webp', alt: '鲲鹏奖、红棉设计奖、东莞杯、IDA、New Star Award 荣誉', width: 2298, height: 872 },
  ])
  expect(honors?.textContent).toBe('')
  expect(container.textContent).not.toContain('Red Dot 2024 · iF 2026 · IDEA')
  expect(container.querySelector('#home-hero')?.textContent).not.toMatch(/3 项|全球设计大奖|77 个|标准化零件|5 步搭完|跟着引导一步步来/)
  expect(container.textContent).not.toMatch(/g-?mark|10\+/i)
})
