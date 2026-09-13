// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { ProductDemoSection } from './ProductDemoSection'

afterEach(() => vi.unstubAllGlobals())

it('replaces only the workbench screenshot with the combined silent loop', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter><ProductDemoSection /></MemoryRouter>)
  const video = container.querySelector('video')
  expect(video).not.toBeNull()
  expect(video?.getAttribute('src')).toBe('/resource/videos/design-workbench-loop.mp4')
  expect(video?.getAttribute('poster')).toBe('/resource/videos/design-workbench-loop.webp')
  expect(video?.hasAttribute('loop')).toBe(true)
  expect(video?.hasAttribute('muted')).toBe(true)
  expect(video?.hasAttribute('playsinline')).toBe(true)
  expect(video?.getAttribute('preload')).toBe('none')
  expect(video?.hasAttribute('controls')).toBe(false)
  expect(container.querySelector('img[src="/optimized/picture/UI/design_ui.webp"]')).toBeNull()
  expect(container.textContent).toContain('浏览零件、调整位置并预览三维结构。登录后可保存作品、继续编程或导出设计记录。目前不提供切割图。')
  expect(container.textContent).toContain('结构规则检查与设计数据导出')
  expect(container.textContent).toContain('登录平台')
})
