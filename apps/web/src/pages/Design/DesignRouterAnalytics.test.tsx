// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DesignPageRouter } from './DesignPageRouter'
import { useDesignStore } from '../../stores/designStore'
import { createAnalyticsClient } from '../../features/analytics/client'
import type { AnalyticsClientEvent } from '@fwx/shared'

type Client = ReturnType<typeof createAnalyticsClient>
const mocks = vi.hoisted(() => ({ client: null as Client | null, load: vi.fn() }))
vi.mock('../../features/analytics/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../../features/analytics/client')>()
  const trackEvent: typeof actual.trackEvent = (name, properties, options) => mocks.client?.trackEvent(name, properties, options)
  return { ...actual, trackEvent, getAnalyticsClient: () => mocks.client!, getAnalyticsHeaders: () => ({}) }
})
vi.mock('../../hooks/useDesignSync', () => ({ useDesignSync: () => ({ loadFromServer: mocks.load }) }))
vi.mock('./DesignPage', () => ({ DesignPage: () => <div>free editor</div> }))
vi.mock('./GuidedDesignPage', () => ({ GuidedDesignPage: () => <div>guided editor</div> }))

const config = { enabled: true, noticeVersion: 1, retentionDays: 90, environment: 'test' }
const receipt = 'consent-unique-capability'
let root: Root
let sent: AnalyticsClientEvent[]
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear(); sent = []
  useDesignStore.setState({ designs: [], activeDesignId: null, deletedIds: [] })
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()); mocks.client?.dispose(); mocks.client = null; vi.unstubAllGlobals() })

function setupClient(configResponse: Promise<Response> = Promise.resolve(Response.json(config))) {
  const client = createAnalyticsClient({ baseUrl: '/api', storage: localStorage, getAuth: () => ({ token: null, accountId: null }), getPathname: () => '/design/current',
    fetch: vi.fn(async (url, options) => {
      if (String(url).endsWith('/config')) return configResponse
      if (String(url).endsWith('/events')) { sent.push(...JSON.parse(String(options?.body)).events); return Response.json({}) }
      return Response.json({ receipt, expiresAt: new Date(Date.now() + 86400000).toISOString() })
    }) as typeof fetch,
  })
  mocks.client = client
  return client
}
async function mount() { await act(async () => root.render(<StrictMode><MemoryRouter><DesignPageRouter /></MemoryRouter></StrictMode>)) }
function create(name: string) { const store = useDesignStore.getState(); const id = store.createDesign(name, 'free'); store.setActiveDesignId(id); return id }

it('observes loaded designs once per session through StrictMode and unchanged rerenders, not missing selection', async () => {
  const client = setupClient(); await client.initialize(); await client.grantConsent(true)
  await mount(); await client.flush()
  expect(sent).toHaveLength(0)
  let id = ''
  await act(async () => { id = create('Private student work') })
  await mount(); await client.flush()
  expect(sent.filter(event => event.eventName === 'design_opened')).toEqual([expect.objectContaining({ properties: { designId: id } })])
  expect(JSON.stringify(sent)).not.toContain('Private student work')
})

it('observes the current loaded design after delayed config restores an existing consent', async () => {
  localStorage.setItem('fwx-analytics-consent-v1', JSON.stringify({ decision: 'granted', noticeVersion: 1, consent: { receipt, expiresAt: new Date(Date.now() + 86400000).toISOString(), anonymousId: crypto.randomUUID(), accountId: null } }))
  let finishConfig!: (value: Response) => void
  const client = setupClient(new Promise(resolve => { finishConfig = resolve }))
  const initialization = client.initialize()
  const id = create('Loaded before config')
  await mount(); await client.flush()
  expect(sent).toHaveLength(0)
  await act(async () => { finishConfig(Response.json(config)); await initialization })
  await client.flush()
  expect(sent).toEqual([expect.objectContaining({ eventName: 'design_opened', properties: { designId: id } })])
})

it('observes only the currently open design after a fresh grant, without replaying earlier creation or navigation', async () => {
  const client = setupClient(); await client.initialize()
  create('Past unconsented work')
  await mount()
  let current = ''
  await act(async () => { current = create('Current work') })
  await client.flush(); expect(sent).toHaveLength(0)
  await act(async () => { expect(await client.grantConsent(true)).toBe(true) })
  await client.flush()
  expect(sent).toEqual([expect.objectContaining({ eventName: 'design_opened', properties: { designId: current } })])
})
