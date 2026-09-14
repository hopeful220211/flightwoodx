import {
  ANALYTICS_MAX_BATCH_SIZE, ANALYTICS_RETENTION_DAYS, AnalyticsClientEventSchema, AnalyticsConfigSchema,
  AnalyticsConsentResponseSchema, normalizeAnalyticsRoute,
  type AnalyticsClientEvent, type AnalyticsClientEventName, type AnalyticsClientEventProperties,
} from '@fwx/shared'

const CONSENT_KEY = 'fwx-analytics-consent-v1'
const DELETE_KEY = 'fwx-analytics-pending-deletions-v1'
const MAX_QUEUE = 100
const MAX_EVENT_AGE_MS = 30 * 60 * 1000
const FLUSH_DELAY_MS = 10_000

type Consent = { receipt: string; expiresAt: string; anonymousId: string; accountId: string | null }
type Decision = 'unknown' | 'granted' | 'declined'
type StoredDecision = { decision?: Decision; noticeVersion?: number; consent?: Consent; accountId?: string | null; expiresAt?: string }
export type AnalyticsSnapshot = {
  enabled: boolean; ready: boolean; decision: Decision; busy: boolean;
  deletionPending: boolean; error: string | null; contextRevision: number;
}
type ClientOptions = {
  baseUrl: string; fetch: typeof fetch; storage?: Storage;
  getAuth: () => { token: string | null; accountId: string | null };
  getPathname: () => string; release?: string;
}

/** Small first-party collector. Raw behavior stays only in this bounded memory queue. */
export function createAnalyticsClient(options: ClientOptions) {
  let state: AnalyticsSnapshot = { enabled: false, ready: false, decision: 'unknown', busy: false, deletionPending: false, error: null, contextRevision: 0 }
  const listeners = new Set<() => void>()
  let consent: Consent | null = null
  let decisionAccount: string | null = options.getAuth().accountId
  let decisionExpiresAt = 0
  let sessionId: string | null = null
  let queue: { event: AnalyticsClientEvent; attempts: number }[] = []
  const onceKeys = new Set<string>()
  let generation = 0
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let sending: AbortController | null = null
  let initializePromise: Promise<void> | null = null
  let deletePromise: Promise<boolean> | null = null
  let pendingDeletes: string[] = []
  const base = options.baseUrl.replace(/\/+$/, '')
  const release = /^[a-zA-Z0-9._-]{1,64}$/.test(options.release || '') ? options.release : 'unknown'

  function publish(update: Partial<AnalyticsSnapshot>) {
    state = { ...state, ...update }
    listeners.forEach(listener => { try { listener() } catch { /* Optional statistics cannot interrupt product state updates. */ } })
  }
  function read(key: string): unknown {
    try { const value = options.storage?.getItem(key); return value ? JSON.parse(value) : null } catch { return null }
  }
  function write(key: string, value: unknown) {
    try { if (value === null) options.storage?.removeItem(key); else options.storage?.setItem(key, JSON.stringify(value)) } catch { /* Storage denial never blocks the editor. */ }
  }
  function clearQueue() {
    queue = []; onceKeys.clear(); sessionId = null
    if (timer) clearTimeout(timer)
    timer = null
    sending?.abort(); sending = null
  }
  function persistDecision() {
    decisionAccount = options.getAuth().accountId
    decisionExpiresAt = consent ? Date.parse(consent.expiresAt) : Date.now() + ANALYTICS_RETENTION_DAYS * 86400000
    write(CONSENT_KEY, state.decision === 'unknown' ? null : { decision: state.decision, noticeVersion: 1, accountId: decisionAccount, expiresAt: new Date(decisionExpiresAt).toISOString(), ...(consent ? { consent } : {}) })
  }
  function validRefusal(stored: StoredDecision | null) {
    return stored?.decision === 'declined' && stored.noticeVersion === 1
      && stored.accountId === options.getAuth().accountId && Date.parse(stored.expiresAt || '') > Date.now()
  }
  function refreshConsent() {
    if (state.decision !== 'unknown' && (decisionAccount !== options.getAuth().accountId || decisionExpiresAt <= Date.now())) clearContext()
  }
  function clearContext(decision: Decision = 'unknown') {
    generation += 1; clearQueue(); consent = null
    publish({ decision, busy: false, error: null, contextRevision: state.contextRevision + 1 })
  }
  function resetIdentity(resetOptions?: { flushPending?: boolean }) {
    let finalRequest: RequestInit | null = null
    try {
      if (resetOptions?.flushPending && eligible()) {
        const batch = queue.filter(item => Date.now() - Date.parse(item.event.occurredAt) < MAX_EVENT_AGE_MS).slice(0, ANALYTICS_MAX_BATCH_SIZE)
        const token = options.getAuth().token
        if (batch.length) finalRequest = {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ events: batch.map(item => item.event) }), keepalive: true,
        }
      }
    } catch { /* Failure to snapshot statistics must never delay signing in. */ }
    clearContext()
    persistDecision()
    if (finalRequest) {
      try {
        // A one-off old-context request is independent of the cleared queue. It
        // never reads a later account token, retries, or changes the new consent.
        void options.fetch(`${base}/analytics/events`, { ...finalRequest, signal: AbortSignal.timeout(8000) }).catch(() => {})
      } catch { /* Statistics cannot make an otherwise successful login fail. */ }
    }
  }
  function handleStorageChange(key: string | null) {
    // A shared computer can change accounts/permissions in another tab. Never
    // overwrite that tab's decision and never adopt its newly granted receipt.
    if ((key === null || key === 'auth-storage') && (state.busy || decisionAccount !== options.getAuth().accountId)) clearContext()
    if (key === null || key === CONSENT_KEY) {
      const stored = read(CONSENT_KEY) as StoredDecision | null
      if (validRefusal(stored)) {
        decisionAccount = stored!.accountId!; decisionExpiresAt = Date.parse(stored!.expiresAt!)
        clearContext('declined')
      }
      else if (!consent || stored?.consent?.receipt !== consent.receipt) clearContext()
    }
    if (key === null || key === DELETE_KEY) {
      const stored = read(DELETE_KEY)
      pendingDeletes = Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string' && item.length >= 16 && item.length <= 2048).slice(0, 10) : []
      publish({ deletionPending: pendingDeletes.length > 0 })
    }
  }
  function eligible() {
    refreshConsent()
    if (disposed || !state.enabled || state.decision !== 'granted' || !consent) return false
    try {
      if (Date.parse(consent.expiresAt) <= Date.now() || consent.accountId !== options.getAuth().accountId) { clearContext(); return false }
      return true
    } catch { return false }
  }
  function getHeaders(): Record<string, string> {
    if (!eligible() || !consent) return {}
    return { 'X-FWX-Analytics-Consent': consent.receipt, ...(sessionId ? { 'X-FWX-Analytics-Session': sessionId } : {}) }
  }
  function rememberDeletion(receipt: string) {
    if (!pendingDeletes.includes(receipt)) pendingDeletes.push(receipt)
    write(DELETE_KEY, pendingDeletes)
    publish({ deletionPending: pendingDeletes.length > 0 })
  }
  async function retryDeletion(): Promise<boolean> {
    if (deletePromise) return deletePromise
    deletePromise = (async () => {
      while (pendingDeletes.length) {
        const receipt = pendingDeletes[0]
        try {
          // Receipt is a deletion-only capability here; never reuse an expired/new account token.
          const response = await options.fetch(`${base}/analytics/consent`, {
            method: 'DELETE', headers: { 'X-FWX-Analytics-Consent': receipt },
            keepalive: true, signal: AbortSignal.timeout(8000),
          })
          if (!response.ok) throw new Error('delete failed')
          pendingDeletes = pendingDeletes.filter(item => item !== receipt)
          write(DELETE_KEY, pendingDeletes.length ? pendingDeletes : null)
        } catch {
          publish({ deletionPending: true, error: '已停止统计，历史记录删除未完成，请联网后重试。' })
          return false
        }
      }
      publish({ deletionPending: false, error: null })
      return true
    })().finally(() => { deletePromise = null })
    return deletePromise
  }
  async function initialize() {
    if (initializePromise) return initializePromise
    initializePromise = (async () => {
      const rawDeletes = read(DELETE_KEY)
      if (Array.isArray(rawDeletes)) pendingDeletes = rawDeletes.filter((item): item is string => typeof item === 'string' && item.length >= 16 && item.length <= 2048).slice(0, 10)
      publish({ deletionPending: pendingDeletes.length > 0 })
      try {
        const response = await options.fetch(`${base}/analytics/config`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
        if (!response.ok) throw new Error('config failed')
        const parsed = AnalyticsConfigSchema.safeParse(await response.json())
        if (!parsed.success) throw new Error('config invalid')
        const stored = read(CONSENT_KEY) as StoredDecision | null
        publish({ enabled: parsed.data.enabled, ready: true })
        if (validRefusal(stored)) {
          decisionAccount = stored!.accountId!; decisionExpiresAt = Date.parse(stored!.expiresAt!)
          publish({ decision: 'declined' })
        }
        // A stopped collector must still let the user delete a previously granted receipt.
        if (stored?.decision === 'granted' && stored.noticeVersion === 1 && stored.consent) {
          const saved = stored.consent
          if (AnalyticsConsentResponseSchema.safeParse({ receipt: saved.receipt, expiresAt: saved.expiresAt }).success
            && /^[0-9a-f-]{36}$/i.test(saved.anonymousId || '') && Date.parse(saved.expiresAt) > Date.now()
            && saved.accountId === options.getAuth().accountId && !pendingDeletes.length) {
            consent = saved; decisionAccount = saved.accountId; decisionExpiresAt = Date.parse(saved.expiresAt)
            sessionId = crypto.randomUUID(); publish({ decision: 'granted' })
          } else write(CONSENT_KEY, null)
        }
      } catch { publish({ enabled: false, ready: true }) }
      if (pendingDeletes.length) await retryDeletion()
    })()
    return initializePromise
  }
  async function grantConsent(ageConfirmed: boolean): Promise<boolean> {
    if (!ageConfirmed || !state.enabled || !state.ready || state.busy || state.deletionPending || disposed) return false
    const version = ++generation
    publish({ busy: true, error: null })
    try {
      const auth = options.getAuth()
      const anonymousId = crypto.randomUUID()
      const nextSessionId = crypto.randomUUID()
      const response = await options.fetch(`${base}/analytics/consent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}) },
        body: JSON.stringify({ anonymousId, noticeVersion: 1, ageConfirmation: 'age_14_or_over' }),
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) throw new Error('grant failed')
      const parsed = AnalyticsConsentResponseSchema.safeParse(await response.json())
      if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now()) throw new Error('grant invalid')
      if (disposed || version !== generation || options.getAuth().accountId !== auth.accountId) {
        rememberDeletion(parsed.data.receipt); await retryDeletion(); return false
      }
      consent = { ...parsed.data, anonymousId, accountId: auth.accountId }
      decisionAccount = auth.accountId; decisionExpiresAt = Date.parse(consent.expiresAt)
      clearQueue(); sessionId = nextSessionId
      publish({ decision: 'granted', busy: false, error: null }); persistDecision()
      return true
    } catch {
      if (version === generation) publish({ busy: false, error: '未能开启统计，仍保持关闭。请稍后重试。' })
      return false
    }
  }
  async function withdrawConsent(): Promise<boolean> {
    generation += 1
    const receipt = consent?.receipt
    clearQueue(); consent = null
    publish({ decision: 'declined', busy: false, error: null }); persistDecision()
    if (receipt) rememberDeletion(receipt)
    return retryDeletion()
  }
  function schedule() {
    if (timer || !queue.length || disposed) return
    timer = setTimeout(() => { timer = null; void flush() }, FLUSH_DELAY_MS)
  }
  function trackEvent<N extends AnalyticsClientEventName>(eventName: N, properties: AnalyticsClientEventProperties<N> = {} as AnalyticsClientEventProperties<N>, eventOptions?: { onceKey?: string }) {
    try {
      if (!eligible() || !sessionId) return
      if (eventOptions?.onceKey && onceKeys.has(eventOptions.onceKey)) return
      const parsed = AnalyticsClientEventSchema.safeParse({
        schemaVersion: 1, eventId: crypto.randomUUID(), sessionId, eventName, properties,
        occurredAt: new Date().toISOString(), route: normalizeAnalyticsRoute(options.getPathname()), release,
      })
      if (!parsed.success || parsed.data.route === 'admin' || queue.length >= MAX_QUEUE) return
      queue.push({ event: parsed.data, attempts: 0 })
      if (eventOptions?.onceKey) {
        if (onceKeys.size >= 500) onceKeys.delete(onceKeys.values().next().value!)
        onceKeys.add(eventOptions.onceKey)
      }
      schedule()
    } catch { /* Drop unsupported/invalid statistics without blocking editing or saving. */ }
  }
  async function flush(keepalive = false): Promise<void> {
    if (!eligible() || !consent || sending) return
    if (timer) clearTimeout(timer)
    timer = null
    queue = queue.filter(item => Date.now() - Date.parse(item.event.occurredAt) < MAX_EVENT_AGE_MS)
    if (!queue.length) return
    const batch = queue.slice(0, ANALYTICS_MAX_BATCH_SIZE)
    const version = generation
    const controller = new AbortController()
    sending = controller
    const timeout = setTimeout(() => controller.abort(), 8000)
    let retry = false
    try {
      const token = options.getAuth().token
      const response = await options.fetch(`${base}/analytics/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ events: batch.map(item => item.event) }), keepalive, signal: controller.signal,
      })
      if (version !== generation) return
      if (response.status === 401 || response.status === 403) { resetIdentity(); return }
      retry = !response.ok && (response.status === 429 || response.status >= 500)
      if (!response.ok && !retry) queue = queue.filter(item => !batch.includes(item))
      else if (response.ok) queue = queue.filter(item => !batch.includes(item))
    } catch { retry = true }
    finally {
      clearTimeout(timeout)
      if (sending === controller) sending = null
      if (version === generation) {
        if (retry) { batch.forEach(item => { item.attempts += 1 }); queue = queue.filter(item => item.attempts < 3) }
        schedule()
      }
    }
  }
  function dispose() { disposed = true; generation += 1; clearQueue(); listeners.clear() }
  return { initialize, grantConsent, withdrawConsent, retryDeletion, resetIdentity, refreshConsent, handleStorageChange, getHeaders, trackEvent, flush, dispose,
    getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

function browserAuth() {
  try {
    const state = JSON.parse(localStorage.getItem('auth-storage') || 'null')?.state
    return { token: typeof state?.token === 'string' ? state.token : null, accountId: state?.token && !state?.user?.isGuest ? state.user?.id || null : null }
  } catch { return { token: null, accountId: null } }
}
let singleton: ReturnType<typeof createAnalyticsClient> | null = null
export function getAnalyticsClient() {
  if (!singleton) {
    let storage: Storage | undefined
    try { storage = globalThis.localStorage } catch { /* Browser may block storage. */ }
    singleton = createAnalyticsClient({
      baseUrl: import.meta.env.VITE_API_URL || '/api', fetch: (...args) => globalThis.fetch(...args), storage,
      getAuth: browserAuth, getPathname: () => typeof location === 'undefined' ? '/' : location.pathname,
      release: import.meta.env.VITE_ANALYTICS_RELEASE || 'unknown',
    })
  }
  return singleton
}
export function trackEvent<N extends AnalyticsClientEventName>(eventName: N, properties?: AnalyticsClientEventProperties<N>, options?: { onceKey?: string }) {
  getAnalyticsClient().trackEvent(eventName, properties, options)
}
export function getAnalyticsHeaders() { return getAnalyticsClient().getHeaders() }
export function resetAnalyticsIdentity(options?: { flushPending?: boolean }) { singleton?.resetIdentity(options) }
