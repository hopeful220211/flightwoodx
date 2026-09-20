import { afterEach, expect, it } from 'vitest'
import { useUIStore, safeLoginTarget } from './uiStore'

afterEach(() => useUIStore.getState().closeLoginModal())

it('remembers a login destination once and clears it on cancel', () => {
  useUIStore.getState().openLoginModal('/design')
  expect(useUIStore.getState().loginReturnTo).toBe('/design')
  useUIStore.getState().closeLoginModal()
  expect(useUIStore.getState().loginReturnTo).toBeNull()
  useUIStore.getState().openLoginModal()
  expect(useUIStore.getState().loginReturnTo).toBeNull()
})

it('consumes the destination only for the still-open login request', () => {
  useUIStore.getState().openLoginModal('/design/abc')
  const request = useUIStore.getState().loginIntentId
  expect(useUIStore.getState().completeLogin(request)).toBe('/design/abc')
  expect(useUIStore.getState().loginModalOpen).toBe(false)
  expect(useUIStore.getState().completeLogin(request)).toBeNull()
  useUIStore.getState().openLoginModal('/dashboard')
  expect(useUIStore.getState().completeLogin(request)).toBeNull()
  expect(useUIStore.getState().loginModalOpen).toBe(true)
})

it('accepts only internal product destinations, never external URLs or login loops', () => {
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/%2f%2fevil.example', '/auth', '/register', '/login', {}, null]) {
    expect(safeLoginTarget(path)).toBeNull()
  }
  expect(safeLoginTarget('/part-studio?design=abc')).toBe('/part-studio?design=abc')
})
