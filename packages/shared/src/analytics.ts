import { z } from 'zod'

/** First-party product analytics v1. Never accept arbitrary payloads or URLs. */
export const ANALYTICS_NOTICE_VERSION = 1
export const ANALYTICS_RETENTION_DAYS = 90
export const ANALYTICS_MAX_BATCH_SIZE = 20
export const AnalyticsEnvironmentSchema = z.enum(['production', 'development', 'test'])
export const AnalyticsRouteSchema = z.enum([
  'home', 'about', 'auth', 'dashboard', 'projects', 'project', 'design', 'code',
  'simulator', 'community', 'community_post', 'collections', 'author', 'part_studio',
  'export', 'fly', 'me', 'profile', 'feed', 'leaderboard', 'admin', 'other',
])
export type AnalyticsRoute = z.infer<typeof AnalyticsRouteSchema>

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_:-]+$/)
const release = z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/).default('unknown')
const count = z.number().int().min(0).max(100000)
const duration = z.number().finite().min(0).max(86400000)
const source = z.enum(['direct', 'xiaohongshu', 'bilibili', 'douyin', 'wechat', 'school', 'search', 'community', 'other'])
// Campaigns are intentionally enumerated: never forward free-form UTM values.
const campaign = z.enum(['launch_2026', 'teacher_pilot', 'community_share'])
const common = {
  schemaVersion: z.literal(1).default(1),
  eventId: z.string().uuid(), sessionId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }), route: AnalyticsRouteSchema, release,
}
function clientEvent<N extends string, S extends z.ZodTypeAny>(eventName: N, properties: S) {
  return z.object({ ...common, eventName: z.literal(eventName), properties }).strict()
}
const previewReason = z.enum(['outside-reference', 'disconnected', 'empty-result', 'invalid-shape', 'invalid-sketch', 'no-solid', 'joint-invalid', 'none'])
const binding = z.discriminatedUnion('destination', [
  z.object({ designId: id, programId: id, destination: z.literal('account') }).strict(),
  z.object({ designId: id, programId: id.optional(), destination: z.literal('local') }).strict(),
])

export const AnalyticsClientEventSchema = z.discriminatedUnion('eventName', [
  clientEvent('page_viewed', z.object({ source: source.optional(), campaign: campaign.optional(), device: z.enum(['mobile', 'tablet', 'desktop']).optional() }).strict()),
  clientEvent('home_cta_clicked', z.object({ placement: z.enum(['hero', 'demo', 'final', 'audience']), destination: z.enum(['login', 'dashboard', 'part_studio', 'design']) }).strict()),
  clientEvent('auth_started', z.object({ method: z.enum(['register', 'login']) }).strict()),
  clientEvent('design_created', z.object({ designId: id, origin: z.enum(['explicit', 'automatic']), mode: z.enum(['guided', 'free']) }).strict()),
  clientEvent('design_opened', z.object({ designId: id }).strict()),
  clientEvent('design_edit_started', z.object({ designId: id.optional(), area: z.enum(['assembly', 'sketch', 'program']) }).strict()),
  clientEvent('sketch_shape_committed', z.object({ shapeKind: z.enum(['rect', 'circle', 'polygon', 'freehand']), operation: z.enum(['add', 'subtract']), jointKind: z.enum(['edge', 'internal', 'none']).optional() }).strict()),
  clientEvent('sketch_preview_state_changed', z.object({ state: z.enum(['blocked', 'recovered']), reason: previewReason }).strict()),
  clientEvent('assembly_part_added', z.object({ designId: id, source: z.enum(['official', 'custom']), mode: z.enum(['guided', 'free']) }).strict()),
  clientEvent('assembly_step_completed', z.object({ designId: id, step: z.number().int().min(0).max(20) }).strict()),
  clientEvent('assembly_check_completed', z.object({ designId: id, outcome: z.enum(['passed', 'blocked']) }).strict()),
  clientEvent('operation_failed', z.object({ operation: z.enum(['auth', 'design_save', 'part_save', 'program_save', 'publish', 'remix', 'export', 'editor_load']), reason: z.enum(['network', 'unauthorized', 'validation', 'server', 'unknown']) }).strict()),
  clientEvent('program_edited', z.object({ designId: id }).strict()),
  clientEvent('program_bound', binding),
  clientEvent('simulation_run', z.object({ runId: z.string().uuid(), designId: id.optional(), phase: z.enum(['start', 'finish']), outcome: z.enum(['success', 'collision', 'error', 'stopped']).optional(), durationMs: duration.optional() }).strict()),
  clientEvent('community_link_copied', z.object({ postId: id }).strict()),
  clientEvent('export_prepared', z.object({ designId: id.optional(), availableCount: count, missingCount: count }).strict()),
  clientEvent('contact_action', z.object({ action: z.enum(['phone_clicked', 'wechat_copied']) }).strict()),
  clientEvent('local_design_saved', z.object({ designId: id, nonempty: z.boolean() }).strict()),
  clientEvent('app_problem', z.object({ phase: z.enum(['load', 'runtime', 'resource']), reason: z.enum(['network', 'unsupported', 'unknown']), durationMs: duration.optional() }).strict()),
])
export type AnalyticsClientEvent = z.infer<typeof AnalyticsClientEventSchema>
export type AnalyticsClientEventName = AnalyticsClientEvent['eventName']
export type AnalyticsClientEventProperties<N extends AnalyticsClientEventName> = Extract<AnalyticsClientEvent, { eventName: N }>['properties']

export const AnalyticsBatchSchema = z.object({ events: z.array(AnalyticsClientEventSchema).min(1).max(ANALYTICS_MAX_BATCH_SIZE) }).strict()
export type AnalyticsBatch = z.infer<typeof AnalyticsBatchSchema>

function serverEvent<N extends string, S extends z.ZodTypeAny>(eventName: N, properties: S) {
  return z.object({ ...common, eventId: id, sessionId: z.string().uuid().optional(), eventName: z.literal(eventName), properties }).strict()
}
export const AnalyticsServerEventSchema = z.discriminatedUnion('eventName', [
  serverEvent('auth_completed', z.object({ method: z.enum(['register', 'login']) }).strict()),
  serverEvent('design_saved', z.object({ designId: id, localDesignId: id.optional(), change: z.enum(['created', 'edited', 'observed', 'metadata', 'unchanged']), nonempty: z.boolean() }).strict()),
  serverEvent('custom_part_saved', z.object({ partId: id, category: z.enum(['body', 'landing', 'guard', 'connector', 'decoration', 'other']) }).strict()),
  serverEvent('program_saved', z.object({ programId: id }).strict()),
  serverEvent('community_published', z.object({ postId: id }).strict()),
  serverEvent('design_remixed', z.object({ designId: id, sourceId: id }).strict()),
])
export type AnalyticsServerEvent = z.infer<typeof AnalyticsServerEventSchema>
export const AnalyticsConfigSchema = z.object({
  enabled: z.boolean(), noticeVersion: z.literal(1), retentionDays: z.literal(90), environment: AnalyticsEnvironmentSchema,
}).strict()
export const AnalyticsConsentRequestSchema = z.object({
  anonymousId: z.string().uuid(), noticeVersion: z.literal(1), ageConfirmation: z.literal('age_14_or_over'),
}).strict()
export const AnalyticsConsentResponseSchema = z.object({ receipt: z.string().min(16).max(2048), expiresAt: z.string().datetime({ offset: true }) }).strict()

export const AnalyticsReportQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  environment: AnalyticsEnvironmentSchema.optional(),
}).strict()
const eventNames = new Set([
  ...AnalyticsClientEventSchema.options.map((s) => s.shape.eventName.value),
  ...AnalyticsServerEventSchema.options.map((s) => s.shape.eventName.value),
])
export const AnalyticsReportSchema = z.object({
  environment: AnalyticsEnvironmentSchema,
  from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }),
  firstCollectedAt: z.string().datetime({ offset: true }).nullable(),
  events: z.array(z.object({ eventName: z.string().refine((name) => eventNames.has(name as AnalyticsClientEventName)), count: z.number().int().nonnegative() }).strict()).max(100),
  registeredActiveCreators: z.number().int().nonnegative(), guestActiveBrowsers: z.number().int().nonnegative(),
  uniqueSavedDesigns: z.number().int().nonnegative(), uniqueSavedParts: z.number().int().nonnegative(), totalEvents: z.number().int().nonnegative(),
}).strict()

/** Only route categories leave the browser, never user-entered paths or queries. */
export function normalizeAnalyticsRoute(pathname: string): AnalyticsRoute {
  const path = (pathname.split(/[?#]/, 1)[0] ?? '').replace(/\/+$/, '') || '/'
  if (path === '/') return 'home'
  if (/^\/(auth|login|register)$/.test(path)) return 'auth'
  if (/^\/design\/export-preview(?:\/|$)/.test(path)) return 'export'
  if (/^\/design\/ar-flight(?:\/|$)/.test(path)) return 'fly'
  if (path === '/community/leaderboard') return 'leaderboard'
  if (/^\/community\/[^/]+$/.test(path)) return 'community_post'
  if (/^\/projects\/[^/]+$/.test(path)) return 'project'
  if (/^\/u\/[^/]+$/.test(path)) return 'author'
  const segment = path.split('/')[1]
  if (segment === 'part-studio') return 'part_studio'
  const result = AnalyticsRouteSchema.safeParse(segment)
  return result.success ? result.data : 'other'
}

export function analyticsAttribution(search: string): { source?: z.infer<typeof source>; campaign?: z.infer<typeof campaign> } {
  const params = new URLSearchParams(search)
  const src = source.safeParse(params.get('utm_source'))
  const cmp = campaign.safeParse(params.get('utm_campaign'))
  return { ...(src.success ? { source: src.data } : {}), ...(cmp.success ? { campaign: cmp.data } : {}) }
}
