// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { UserPartSchema, type UserPart } from '@fwx/parts-schema'
import { useAuthStore } from '../../stores/authStore'
import { MyPartsStrip } from './MyPartsStrip'
import { CustomPartsLibrary } from './CustomPartsLibrary'

const listQuery = vi.hoisted(() => ({ data: { items: [] as UserPart[] }, isError: false, isPending: false, refetch: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => listQuery }))
vi.mock('./PlaceCustomPartDialog', () => ({ PlaceCustomPartDialog: ({ part }: { part: UserPart }) => <div role="dialog">{part.name}</div> }))

const labels = ['主机身', '起落架', '保护板', '连接件', '装饰件']
const parts = ['mainboard', 'landing', 'guard', 'joint', 'deco'].map((category, index) => UserPartSchema.parse({
  id: `part-${index}`, ownerId: 'owner', name: `测试零件${index}`, category,
  geometry: { contour: 'M0 0 L40 0 L40 30 L0 30 Z', holes: ['M10 10 L20 10 L20 20 L10 20 Z'], thicknessMm: 2, bboxMm: { w: 40, h: 30 } },
  sockets: [], manufacturability: { closed: true, minFeatureMm: 0, withinBoard: true, passed: false },
  flightImpact: { massG: 0 }, createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:00:00.000Z',
}))
let root: Root
let container: HTMLDivElement
let previousAuth: ReturnType<typeof useAuthStore.getState>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  previousAuth = useAuthStore.getState()
  useAuthStore.setState({ token: 'local-unit-token', user: { id: 'owner', username: 'Owner', role: 'student' } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  listQuery.data = { items: parts }
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useAuthStore.setState(previousAuth)
  vi.unstubAllGlobals()
})

function expectLabelsAndHoles() {
  for (const label of labels) expect(container.textContent).toContain(label)
  const paths = [...container.querySelectorAll('svg[aria-hidden] path')].filter(path => path.getAttribute('fill')?.startsWith('rgba') || path.getAttribute('fill') === '#d2b48c')
  expect(paths).toHaveLength(parts.length)
  for (const path of paths) {
    expect(path.getAttribute('d')).toBe([parts[0].geometry.contour, ...parts[0].geometry.holes].join(' '))
    expect(path.getAttribute('fill-rule')).toBe('evenodd')
  }
}

it('uses one short sentence for the saved-parts empty state', async () => {
  await act(async () => root.render(<MyPartsStrip parts={[]} onUse={vi.fn()} onDelete={vi.fn()} />))
  expect(container.querySelector('p')?.textContent).toBe('登录后保存的零件会显示在这里。')
})

it('my parts displays all five structural labels and cutout thumbnails without changing use or delete actions', async () => {
  const onUse = vi.fn(), onDelete = vi.fn()
  await act(async () => root.render(<MyPartsStrip parts={parts} onUse={onUse} onDelete={onDelete} />))
  expectLabelsAndHoles()
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="放入作品：测试零件0"]')!.click())
  expect(onUse).toHaveBeenCalledWith(parts[0])
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="删除 测试零件0"]')!.click())
  expect(onDelete).toHaveBeenCalledWith(parts[0].id)
})

it('assembly library shows the same labels and holes and opens placement for a custom mainboard', async () => {
  await act(async () => root.render(<MemoryRouter><CustomPartsLibrary /></MemoryRouter>))
  expectLabelsAndHoles()
  expect(container.textContent).toContain('选择零件，放入当前作品。')
  expect(container.textContent).not.toMatch(/未验证|不代表|仅自由摆放|尚未连接/)
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="放入自由拼装：测试零件0"]')!.click())
  expect(container.querySelector('[role="dialog"]')?.textContent).toBe(parts[0].name)
})
