// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/common/Toast'
import { useAuthStore } from '../../stores/authStore'
import { useDesignStore } from '../../stores/designStore'
import { RenameDialog } from '../Dashboard/components/RenameDialog'
import { GuidedDesignPage } from './GuidedDesignPage'
import { NameDroneDialog } from './components/NameDroneDialog'

// Naming does not depend on WebGL; keep the actual page, state and save hook.
vi.mock('../../components/design/ThreeCanvas', () => ({ ThreeCanvas: () => null }))

type Entry = 'new design' | 'dashboard rename' | 'guided rename'
let root: Root
let container: HTMLDivElement
const confirmed = vi.fn()
const cancelled = vi.fn()
const originalName = '原始作品'
const chineseName = '正式浏览器六件验收'

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  confirmed.mockReset()
  cancelled.mockReset()
  localStorage.clear()
  useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
  useDesignStore.setState({ designs: [], activeDesignId: null, deletedIds: [] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function openEntry(entry: Entry): Promise<HTMLInputElement> {
  const id = useDesignStore.getState().createDesign(originalName)
  useDesignStore.getState().setActiveDesignId(id)
  await act(async () => root.render(
    <StrictMode>
      {entry === 'new design' ? (
        <NameDroneDialog open onConfirm={confirmed} onCancel={cancelled} />
      ) : entry === 'dashboard rename' ? (
        <RenameDialog current={originalName} onConfirm={confirmed} onCancel={cancelled} />
      ) : (
        <MemoryRouter><ToastProvider><GuidedDesignPage /></ToastProvider></MemoryRouter>
      )}
    </StrictMode>,
  ))
  if (entry === 'guided rename') {
    await act(async () => container.querySelector<HTMLButtonElement>('[title="点一下改名字"]')!.click())
  }
  if (entry === 'new design') {
    await act(async () => document.querySelector<HTMLInputElement>('input[value="guided"]')!.click())
  }
  const input = document.querySelector('input')
  expect(input).toBeInstanceOf(HTMLInputElement)
  return input!
}

async function typeName(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }))
  })
  expect(input.value).toBe(value)
}

async function pressEnter(input: HTMLInputElement, options: KeyboardEventInit = {}) {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13, ...options }))
  })
}

function expectCommitted(entry: Entry) {
  if (entry === 'guided rename') {
    expect(useDesignStore.getState().getActiveDesign()?.name).toBe(chineseName)
    expect(container.querySelector('[title="点一下改名字"]')?.textContent).toBe(chineseName)
  } else if (entry === 'new design') {
    expect(confirmed).toHaveBeenCalledExactlyOnceWith(chineseName, 'guided')
  } else {
    expect(confirmed).toHaveBeenCalledExactlyOnceWith(chineseName)
  }
}

describe.each<Entry>(['new design', 'dashboard rename', 'guided rename'])('%s', entry => {
  it.each([
    { label: 'isComposing', isComposing: true, keyCode: 13 },
    { label: 'legacy keyCode 229', isComposing: false, keyCode: 229 },
  ])('does not submit the IME selection Enter ($label)', async ({ isComposing, keyCode }) => {
    const input = await openEntry(entry)
    await typeName(input, '正式浏览器六件yan')
    await pressEnter(input, { isComposing, keyCode })

    expect(confirmed).not.toHaveBeenCalled()
    expect(useDesignStore.getState().getActiveDesign()?.name).toBe(originalName)
    expect(input.isConnected).toBe(true)

    // The next non-composing Enter submits the completed Chinese name once.
    await typeName(input, chineseName)
    await pressEnter(input)
    expectCommitted(entry)
  })

  it('submits a completed Chinese name with Enter', async () => {
    const input = await openEntry(entry)
    await typeName(input, ` ${chineseName} `)
    await pressEnter(input)
    expectCommitted(entry)
  })

  it('keeps the existing click or blur submission path', async () => {
    const input = await openEntry(entry)
    await typeName(input, chineseName)
    if (entry === 'guided rename') {
      await act(async () => input.blur())
    } else {
      const label = entry === 'new design' ? '开始搭建' : '保存'
      const button = [...document.querySelectorAll('button')].find(item => item.textContent === label)
      expect(button).toBeDefined()
      await act(async () => button!.click())
    }
    expectCommitted(entry)
  })
})

it('requires an explicit assembly mode and can start a free design', async () => {
  await act(async () => root.render(<NameDroneDialog open onConfirm={confirmed} onCancel={cancelled} />))
  const start = [...document.querySelectorAll('button')].find(button => button.textContent === '开始搭建')!
  expect(start.disabled).toBe(true)
  const name = document.querySelector<HTMLInputElement>('input[aria-label="无人机名字"]')!
  await pressEnter(name)
  expect(confirmed).not.toHaveBeenCalled()
  await act(async () => document.querySelector<HTMLInputElement>('input[value="free"]')!.click())
  await act(async () => start.click())
  expect(confirmed).toHaveBeenCalledExactlyOnceWith('', 'free')
})

it('commits guided Enter and blur once without a render-phase store update', async () => {
  const errors = vi.spyOn(console, 'error')
  const input = await openEntry('guided rename')
  await typeName(input, chineseName)
  const changes = vi.fn()
  const unsubscribe = useDesignStore.subscribe((next, previous) => {
    if (next.getActiveDesign()?.name !== previous.designs.find(design => design.id === previous.activeDesignId)?.name) changes()
  })
  try {
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expectCommitted('guided rename')
    expect(changes).toHaveBeenCalledTimes(1)
    expect(errors).not.toHaveBeenCalled()
  } finally {
    unsubscribe()
    errors.mockRestore()
  }
})
