// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createAnalyticsClient } from './client'

const config = { enabled: true, noticeVersion: 1, retentionDays: 90, environment: 'test' }
const receipt = 'signed-consent-receipt'
let calls: { url: string; init?: RequestInit }[]
let token: string | null
let accountId: string | null
let failEvents: boolean
let failDelete: boolean
let pathname: string
let transport: typeof fetch
const clients: ReturnType<typeof createAnalyticsClient>[] = []

function makeClient() {
  const client = createAnalyticsClient({
    baseUrl: '/api', fetch: transport, storage: localStorage,
    getAuth: () => ({ token, accountId }), getPathname: () => pathname,
    release: 'test-release',
  })
  clients.push(client)
  return client
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  calls = []; token = null; accountId = null; failEvents = false; failDelete = false; pathname = '/'
  transport = vi.fn(async (input, init) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.endsWith('/config')) return Response.json(config)
    if (init?.method === 'DELETE') return new Response(null, { status: failDelete ? 503 : 200 })
    if (url.endsWith('/consent')) return Response.json({ receipt, expiresAt: new Date(Date.now() + 86400000).toISOString() })
    return Response.json({}, { status: failEvents ? 503 : 200 })
  }) as typeof fetch
})

afterEach(() => { clients.splice(0).forEach(client => client.dispose()); vi.useRealTimers() })

it('does not create identifiers, store behavior or send events before explicit consent', async () => {
  const client = makeClient()
  await client.initialize()
  client.trackEvent('page_viewed', {})
  await client.flush()
  expect(calls.map(call => call.url)).toEqual(['/api/analytics/config'])
  expect(localStorage.length).toBe(0)
  expect(client.getHeaders()).toEqual({})
  expect(client.getSnapshot().decision).toBe('unknown')
})

it('deduplicates initialization and fails closed for disabled config', async () => {
  transport = vi.fn(async () => Response.json({ ...config, enabled: false })) as typeof fetch
  const client = makeClient()
  await Promise.all([client.initialize(), client.initialize()])
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await client.grantConsent(false)).toBe(false)
  expect(await client.grantConsent(true)).toBe(false)
  expect(client.getSnapshot().enabled).toBe(false)
  expect(localStorage.length).toBe(0)
})

it('requires affirmative age choice and validates event fields before enqueueing', async () => {
  const client = makeClient()
  await client.initialize()
  expect(await client.grantConsent(false)).toBe(false)
  expect(calls).toHaveLength(1)
  expect(await client.grantConsent(true)).toBe(true)
  expect(client.getHeaders()).toMatchObject({ 'X-FWX-Analytics-Consent': receipt })
  client.trackEvent('page_viewed', {}, { onceKey: 'same-navigation' })
  client.trackEvent('page_viewed', {}, { onceKey: 'same-navigation' })
  client.trackEvent('page_viewed', { email: 'private@example.test' } as never)
  await client.flush()
  const sent = calls.filter(call => call.url.endsWith('/events'))
  expect(sent).toHaveLength(1)
  const body = JSON.parse(String(sent[0].init?.body))
  expect(body.events).toHaveLength(1)
  expect(body.events[0]).toMatchObject({ eventName: 'page_viewed', route: 'home', properties: {} })
  expect(String(sent[0].init?.body)).not.toContain('private@example.test')
  expect(localStorage.getItem('fwx-analytics-consent-v1')).not.toContain('page_viewed')
})

it('sends at most20 events per batch and retries identical event IDs with a bounded queue', async () => {
  const client = makeClient()
  await client.initialize(); await client.grantConsent(true)
  failEvents = true
  for (let i = 0; i < 150; i++) client.trackEvent('page_viewed', {})
  await client.flush()
  const first = JSON.parse(String(calls.at(-1)?.init?.body))
  expect(first.events).toHaveLength(20)
  failEvents = false
  await client.flush()
  const events = calls.filter(call => call.url.endsWith('/events'))
  expect(JSON.parse(String(events[1].init?.body)).events).toEqual(first.events)
  for (let i = 0; i < 8; i++) await client.flush()
  const unique = new Set(calls.filter(call => call.url.endsWith('/events')).flatMap(call => JSON.parse(String(call.init?.body)).events.map((event: { eventId: string }) => event.eventId)))
  expect(unique.size).toBeLessThanOrEqual(100)
})

it('withdraws immediately, preserves only deletion capability on failure and retries without bearer', async () => {
  const client = makeClient()
  await client.initialize(); await client.grantConsent(true)
  client.trackEvent('page_viewed', {})
  token = 'expired-private-token'; failDelete = true
  expect(await client.withdrawConsent()).toBe(false)
  expect(client.getHeaders()).toEqual({})
  await client.flush()
  expect(calls.some(call => call.url.endsWith('/events'))).toBe(false)
  expect(client.getSnapshot().deletionPending).toBe(true)
  expect(JSON.stringify([...Array(localStorage.length)].map((_, index) => localStorage.getItem(localStorage.key(index)!)))).not.toContain(token)
  failDelete = false
  expect(await client.retryDeletion()).toBe(true)
  expect(client.getSnapshot().deletionPending).toBe(false)
  const deletions = calls.filter(call => call.init?.method === 'DELETE')
  expect(deletions).toHaveLength(2)
  expect(deletions[1].init?.headers).not.toHaveProperty('Authorization')
})

it('drops prior identity queue and consent before another account can send', async () => {
  const client = makeClient()
  await client.initialize(); await client.grantConsent(true)
  client.trackEvent('page_viewed', {})
  client.resetIdentity()
  token = 'new-account-token'; accountId = 'new-account'
  client.trackEvent('page_viewed', {})
  await client.flush()
  expect(client.getHeaders()).toEqual({})
  expect(client.getSnapshot().decision).toBe('unknown')
  expect(calls.some(call => call.url.endsWith('/events'))).toBe(false)
})

it('flushes fast sign-in funnel once with the old receipt and token before identity replacement', async () => {
  token = 'previous-token'; accountId = 'previous-account'
  const client = makeClient()
  await client.initialize(); await client.grantConsent(true)
  const previousHeaders = client.getHeaders()
  client.trackEvent('home_cta_clicked', { placement: 'hero', destination: 'login' })
  client.trackEvent('auth_started', { method: 'login' })
  client.resetIdentity({ flushPending: true })
  token = 'next-token'; accountId = 'next-account'
  await Promise.resolve()
  const sent = calls.filter(call => call.url.endsWith('/events'))
  expect(sent).toHaveLength(1)
  expect(sent[0].init?.keepalive).toBe(true)
  expect(sent[0].init?.headers).toMatchObject({ ...previousHeaders, Authorization: 'Bearer previous-token' })
  expect(JSON.parse(String(sent[0].init?.body)).events.map((item: { eventName: string }) => item.eventName)).toEqual(['home_cta_clicked', 'auth_started'])
  expect(String(sent[0].init?.body)).not.toContain('next-token')
  expect(client.getHeaders()).toEqual({})
  await client.flush()
  expect(calls.filter(call => call.url.endsWith('/events'))).toHaveLength(1)
})

it('bounds the one-off identity flush to20 and does not retry failures', async () => {
  const client = makeClient()
  await client.initialize(); await client.grantConsent(true)
  for (let i = 0; i < 30; i++) client.trackEvent('page_viewed', {})
  failEvents = true
  client.resetIdentity({ flushPending: true })
  await vi.advanceTimersByTimeAsync(60000)
  const sent = calls.filter(call => call.url.endsWith('/events'))
  expect(sent).toHaveLength(1)
  expect(JSON.parse(String(sent[0].init?.body)).events).toHaveLength(20)
  expect(client.getHeaders()).toEqual({})
})

it('cannot resurrect a grant after withdrawal during a delayed response', async () => {
  let finish!: (response: Response) => void
  const original = transport
  transport = vi.fn((input, init) => init?.method === 'POST' && String(input).endsWith('/consent')
    ? new Promise<Response>(resolve => { finish = resolve })
    : original(input, init)) as typeof fetch
  const client = makeClient()
  await client.initialize()
  const granting = client.grantConsent(true)
  await client.withdrawConsent()
  finish(Response.json({ receipt, expiresAt: new Date(Date.now() + 86400000).toISOString() }))
  expect(await granting).toBe(false)
  expect(client.getSnapshot().decision).toBe('declined')
  expect(client.getHeaders()).toEqual({})
  expect(calls.some(call => call.init?.method === 'DELETE')).toBe(true)
})

it('normalizes route without retaining resource IDs or URL queries and uses bearer only as header', async () => {
  token = 'private-token'; accountId = 'account-one'; pathname = '/design/a-private-work'
  const client = makeClient()
  await client.initialize(); await client.grantConsent(true)
  client.trackEvent('page_viewed', {})
  await client.flush(true)
  const sent = calls.find(call => call.url.endsWith('/events'))!
  expect(sent.init?.keepalive).toBe(true)
  expect(sent.init?.headers).toMatchObject({ Authorization: 'Bearer private-token' })
  expect(String(sent.init?.body)).not.toMatch(/private-token|a-private-work|account-one/)
  expect(JSON.parse(String(sent.init?.body)).events[0].route).toBe('design')
})

it('stops pending events when consent is withdrawn in another tab', async () => {
  const client = makeClient()
  await client.initialize(); await client.grantConsent(true)
  client.trackEvent('page_viewed', {})
  localStorage.setItem('fwx-analytics-consent-v1', JSON.stringify({ decision: 'declined', noticeVersion: 1, accountId: null, expiresAt: new Date(Date.now() + 86400000).toISOString() }))
  client.handleStorageChange('fwx-analytics-consent-v1')
  await client.flush()
  expect(client.getHeaders()).toEqual({})
  expect(client.getSnapshot().decision).toBe('declined')
  expect(calls.some(call => call.url.endsWith('/events'))).toBe(false)
})

it('drops a cross-tab account session without overwriting the other tab consent', async () => {
  const client = makeClient()
  await client.initialize(); await client.grantConsent(true)
  client.trackEvent('page_viewed', {})
  accountId = 'different-account'; token = 'new-token'
  const otherDecision = JSON.stringify({ decision: 'declined', noticeVersion: 1 })
  localStorage.setItem('fwx-analytics-consent-v1', otherDecision)
  client.handleStorageChange('auth-storage')
  expect(client.getHeaders()).toEqual({})
  expect(localStorage.getItem('fwx-analytics-consent-v1')).toBe(otherDecision)
  await client.flush()
  expect(calls.some(call => call.url.endsWith('/events'))).toBe(false)
})

it('never throws into product actions when UUID generation fails', async () => {
  const client = makeClient()
  await client.initialize(); await client.grantConsent(true)
  const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('unavailable') })
  expect(() => client.trackEvent('page_viewed', {})).not.toThrow()
  uuid.mockRestore()
})

it('remembers refusal for the same browser and identity, but not another account', async () => {
  const client = makeClient()
  await client.initialize(); await client.withdrawConsent()
  const same = makeClient(); await same.initialize()
  expect(same.getSnapshot().decision).toBe('declined')
  accountId = 'other-account'; token = 'other-token'
  const other = makeClient(); await other.initialize()
  expect(other.getSnapshot().decision).toBe('unknown')
})

it('asks again when a refusal expires, a notice version changes, or browser storage is cleared', async () => {
  const client = makeClient()
  await client.initialize(); await client.withdrawConsent()
  const saved = JSON.parse(localStorage.getItem('fwx-analytics-consent-v1')!)
  localStorage.setItem('fwx-analytics-consent-v1', JSON.stringify({ ...saved, expiresAt: '2000-01-01T00:00:00Z' }))
  const expired = makeClient(); await expired.initialize()
  expect(expired.getSnapshot().decision).toBe('unknown')
  localStorage.setItem('fwx-analytics-consent-v1', JSON.stringify({ ...saved, noticeVersion: 0 }))
  const outdated = makeClient(); await outdated.initialize()
  expect(outdated.getSnapshot().decision).toBe('unknown')
  localStorage.clear()
  const fresh = makeClient(); await fresh.initialize()
  expect(fresh.getSnapshot().decision).toBe('unknown')
})

it('reuses a valid grant on reload but never on another account or empty browser', async () => {
  const client = makeClient()
  await client.initialize(); await client.grantConsent(true)
  const reloaded = makeClient(); await reloaded.initialize()
  expect(reloaded.getSnapshot().decision).toBe('granted')
  accountId = 'another-account'
  const other = makeClient(); await other.initialize()
  expect(other.getSnapshot().decision).toBe('unknown')
  localStorage.clear()
  const fresh = makeClient(); await fresh.initialize()
  expect(fresh.getSnapshot().decision).toBe('unknown')
})

it('keeps withdrawal possible when the operator disables new collection', async () => {
  const client = makeClient(); await client.initialize(); await client.grantConsent(true)
  const original = transport
  transport = vi.fn((input, init) => String(input).endsWith('/config')
    ? Promise.resolve(Response.json({ ...config, enabled: false })) : original(input, init)) as typeof fetch
  const disabled = makeClient(); await disabled.initialize()
  expect(disabled.getSnapshot().enabled).toBe(false)
  expect(disabled.getSnapshot().decision).toBe('granted')
  expect(disabled.getHeaders()).toEqual({})
  await disabled.withdrawConsent()
  expect(calls.some(call => call.init?.method === 'DELETE')).toBe(true)
})

it('keeps consent disabled and shows a recoverable error if UUID creation fails', async () => {
  const client = makeClient()
  await client.initialize()
  const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('unavailable') })
  await expect(client.grantConsent(true)).resolves.toBe(false)
  expect(client.getSnapshot().decision).toBe('unknown')
  expect(client.getHeaders()).toEqual({})
  uuid.mockRestore()
})
