const { createHmac, randomUUID } = require('node:crypto')
const jwt = require('jsonwebtoken')
const { AnalyticsServerEventSchema } = require('@fwx/shared/runtime-cjs')
const Consent = require('../models/AnalyticsConsent')
const Event = require('../models/AnalyticsEvent')
const Revision = require('../models/AnalyticsRevision')
const indexBarriers = new Map()
const savedDesignProperties = AnalyticsServerEventSchema.options.find(schema => schema.shape.eventName.value === 'design_saved').shape.properties

const DAY_MS = 86400000
const RECEIPT_HEADER = 'x-fwx-analytics-consent'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function fail(status, message) { const error = new Error(message); error.status = status; return error }
function ensureAnalyticsIndexes() {
  const database = Event.db.name
  if (!database || Event.db.readyState !== 1) return Promise.reject(fail(503, '使用统计暂不可用'))
  if (!indexBarriers.has(database)) {
    const ready = Promise.all([Consent.createIndexes(), Event.createIndexes(), Revision.createIndexes()]).catch(error => {
      indexBarriers.delete(database)
      throw error
    })
    indexBarriers.set(database, ready)
  }
  return indexBarriers.get(database)
}
function hash(config, value) { return createHmac('sha256', config.analytics.secret).update(value).digest('hex') }
function excluded(config, userId, role) { return role === 'admin' || config.analytics.excludedUserIds.includes(String(userId)) }
function decodeReceipt(config, token, ignoreExpiration = false) {
  if (typeof token !== 'string' || token.length > 2048) throw fail(401, '请先选择是否允许使用统计')
  try {
    const decoded = jwt.verify(token, config.analytics.secret, { algorithms: ['HS256'], audience: 'fwx-analytics', issuer: 'fwx', ignoreExpiration })
    if (!decoded || typeof decoded.cid !== 'string' || !UUID.test(decoded.cid)) throw new Error('invalid receipt')
    return decoded.cid
  } catch { throw fail(401, '使用统计授权已失效') }
}
async function resolveConsent(config, token, userId, { deletion = false } = {}) {
  const cid = decodeReceipt(config, token, deletion)
  const consent = await Consent.findById(cid).maxTimeMS(2000).lean()
  if (!consent) {
    if (deletion) return { _id: cid }
    throw fail(401, '使用统计授权已失效')
  }
  if (deletion && !userId) return consent // The signed receipt is a deletion-only capability.
  if ((userId ? 'account' : 'guest') !== consent.actorKind || (userId && hash(config, `account:${userId}`) !== consent.actorHash)) throw fail(401, '使用统计授权与当前账号不一致')
  if (!deletion && (consent.revokedAt || consent.expiresAt <= new Date())) throw fail(401, '使用统计授权已失效')
  return consent
}
async function grantConsent(config, body, userId) {
  await ensureAnalyticsIndexes()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + config.analytics.retentionDays * DAY_MS)
  const id = randomUUID()
  const actorKind = userId ? 'account' : 'guest'
  await Consent.create({ _id: id, actorHash: hash(config, `${actorKind}:${userId || body.anonymousId}`), actorKind, noticeVersion: body.noticeVersion, createdAt: now, expiresAt })
  return { receipt: jwt.sign({ cid: id }, config.analytics.secret, { algorithm: 'HS256', audience: 'fwx-analytics', issuer: 'fwx', expiresIn: config.analytics.retentionDays * 86400 }), expiresAt: expiresAt.toISOString() }
}
async function revokeConsent(config, token, userId) {
  const consent = await resolveConsent(config, token, userId, { deletion: true })
  await Consent.updateOne({ _id: consent._id }, { $set: { revokedAt: new Date() } }).maxTimeMS(2000)
  await Event.deleteMany({ consentId: consent._id }).maxTimeMS(3000)
  await Revision.deleteMany({ consentId: consent._id }).maxTimeMS(3000)
}
async function persistEvents(config, consent, events, source) {
  await ensureAnalyticsIndexes()
  const now = new Date()
  // Receipt expiry also bounds event retention. Never retain behavior beyond its consent record.
  const expiresAt = new Date(Math.min(now.getTime() + config.analytics.retentionDays * DAY_MS, new Date(consent.expiresAt).getTime()))
  const digests = new Map(events.map(event => [event.eventId, hash(config, JSON.stringify(canonical(event)))]))
  if (digests.size !== events.length) {
    for (const event of events) if (digests.get(event.eventId) !== hash(config, JSON.stringify(canonical(event)))) throw fail(409, '重复的统计事件编号对应不同内容')
  }
  const operations = events.map(event => ({ updateOne: { filter: { consentId: consent._id, eventId: event.eventId }, update: { $setOnInsert: { ...event, payloadDigest: digests.get(event.eventId), consentId: consent._id, actorHash: consent.actorHash, actorKind: consent.actorKind, source, environment: config.analytics.environment, occurredAt: new Date(event.occurredAt), receivedAt: now, expiresAt } }, upsert: true } }))
  let active
  try { await Event.bulkWrite(operations, { ordered: false, maxTimeMS: 3000 }) } catch (error) {
    // Concurrent retries may both race to insert the unique key. Other failures are not success.
    if (!error.writeErrors?.length || error.writeErrors.some(item => item.code !== 11000)) throw error
  } finally {
    // Unordered bulk writes can persist some rows and then throw. Withdrawal
    // cleanup must run on that path too, not just after successful writes.
    active = await Consent.exists({ _id: consent._id, revokedAt: null, expiresAt: { $gt: new Date() } }).maxTimeMS(2000)
    if (!active) {
      await Event.deleteMany({ consentId: consent._id }).maxTimeMS(3000)
      await Revision.deleteMany({ consentId: consent._id }).maxTimeMS(3000)
    }
  }
  if (!active) throw fail(401, '使用统计授权已撤回')
  const stored = await Event.find({ consentId: consent._id, eventId: { $in: [...digests.keys()] } }).select('eventId payloadDigest').maxTimeMS(2000).lean()
  if (stored.some(item => item.payloadDigest !== digests.get(item.eventId))) throw fail(409, '重复的统计事件编号对应不同内容')
}
function createAnalyticsService(config) {
  let pending = 0
  let tail = Promise.resolve()
  let lastWarning = 0
  function warn() {
    if (Date.now() - lastWarning > 60000) { lastWarning = Date.now(); console.warn('[analytics] event collection unavailable; business operation unaffected') }
  }
  function record(req, eventName, properties, options = {}) {
    if (!config.analytics.enabled || !req.headers[RECEIPT_HEADER] || excluded(config, req.userId || options.authUserId, req.authUser?.role || options.authRole)) return
    if (pending >= 100) { warn(); return }
    const token = req.headers[RECEIPT_HEADER]
    const userId = req.userId
    const sessionId = UUID.test(req.headers['x-fwx-analytics-session'] || '') ? req.headers['x-fwx-analytics-session'] : undefined
    const parsed = AnalyticsServerEventSchema.safeParse({ eventId: options.key ? hash(config, `${eventName}:${options.key}`) : randomUUID(), occurredAt: new Date().toISOString(), eventName, route: options.route || 'other', release: 'server', properties, ...(sessionId ? { sessionId } : {}) })
    if (!parsed.success) { warn(); return }
    pending++
    tail = tail.then(async () => {
      const consent = await resolveConsent(config, token, userId)
      let revisionId
      if (options.revision) {
        const id = hash(config, `${consent.actorHash}:${options.revision.entity}`)
        const previous = await Revision.findById(id).maxTimeMS(2000).lean()
        if (previous?.digest === options.revision.digest) return
        if (previous && previous.observedAt > new Date(parsed.data.occurredAt)) return
        if (previous && eventName === 'design_saved') parsed.data.properties.change = 'edited'
        revisionId = id
      }
      await persistEvents(config, consent, [parsed.data], 'server')
      if (revisionId) {
        await Revision.updateOne({ _id: revisionId }, { $set: { consentId: consent._id, digest: options.revision.digest, observedAt: new Date(parsed.data.occurredAt), expiresAt: consent.expiresAt } }, { upsert: true, maxTimeMS: 2000 })
        // A withdrawal can race the revision write after event persistence.
        if (!await Consent.exists({ _id: consent._id, revokedAt: null, expiresAt: { $gt: new Date() } }).maxTimeMS(2000)) await Revision.deleteMany({ consentId: consent._id }).maxTimeMS(2000)
      }
    }).catch(warn).finally(() => { pending-- })
  }
  return { record, drain: () => tail }
}
function recordBusinessEvent(req, eventName, properties, options) { req.app?.locals.analytics?.record(req, eventName, properties, options) }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
function recordContentSaved(req, eventName, properties, entity, content) {
  if (!req.app?.locals.config.analytics.enabled || !req.headers[RECEIPT_HEADER]) return
  const digest = hash(req.app.locals.config, JSON.stringify(canonical(content)))
  recordBusinessEvent(req, eventName, properties, { revision: { entity, digest } })
}
function recordDesignSaved(req, design, created = false) {
  const parts = design.designData?.parts || design.parts || []
  const params = design.params ? Object.fromEntries(['hubType', 'layer', 'armCount', 'armLengthMm', 'guardStyle'].map(key => [key, design.params[key]])) : null
  // Without a prior observed digest we cannot claim an existing work was edited.
  const properties = { designId: String(design._id), change: created ? 'created' : 'observed', nonempty: parts.length > 0 }
  // The browser's opaque ID joins workflow events to this saved database ID.
  // Legacy free-form local IDs are omitted using the shared whitelist.
  const linked = savedDesignProperties.safeParse({ ...properties, localDesignId: design.localId })
  recordContentSaved(req, 'design_saved', linked.success ? linked.data : properties, `design:${design._id}`, { parts, params })
}
function recordProgramSaved(req, program) {
  if (!program.commandProgram?.commands?.length) return
  recordContentSaved(req, 'program_saved', { programId: String(program._id) }, `program:${program._id}`, { xml: program.blocklyXml, commands: program.commandProgram.commands })
}
function recordPartSaved(req, part) {
  const category = ({ mainboard: 'body', landing: 'landing', guard: 'guard', joint: 'connector', deco: 'decoration' })[part.category] || 'other'
  recordContentSaved(req, 'custom_part_saved', { partId: String(part.id || part._id), category }, `part:${part.id || part._id}`, { geometry: part.geometry, jointGuides: part.jointGuides, sockets: part.sockets })
}
module.exports = { DAY_MS, RECEIPT_HEADER, hash, excluded, resolveConsent, grantConsent, revokeConsent, persistEvents, createAnalyticsService, recordBusinessEvent, recordDesignSaved, recordProgramSaved, recordPartSaved }
