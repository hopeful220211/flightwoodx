const express = require('express')
const rateLimit = require('express-rate-limit')
const { AnalyticsConfigSchema, AnalyticsConsentRequestSchema, AnalyticsConsentResponseSchema, AnalyticsBatchSchema, AnalyticsReportQuerySchema, AnalyticsReportSchema } = require('@fwx/shared/runtime-cjs')
const { optionalAuthenticate, authenticate } = require('../middleware/auth')
const { requireRole } = require('../middleware/requireRole')
const requireAdminAccessKey = require('../middleware/adminAccessKey')
const { RECEIPT_HEADER, DAY_MS, excluded, resolveConsent, grantConsent, revokeConsent, persistEvents } = require('../lib/analytics')
const { analyticsSummary, summaryCsv } = require('../lib/analyticsReport')

function createAnalyticsRouter(config) {
  const router = express.Router()
  const limiter = (windowMs, limit) => config.rateLimitEnabled ? rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: '统计请求过于频繁，请稍后重试' } }) : (_req, _res, next) => next()
  router.use(limiter(60000, 180))
  router.use(express.json({ limit: 24 * 1024 }))
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  const safe = handler => async (req, res) => {
    try { await handler(req, res) } catch (error) {
      if (![400, 401, 403, 409, 503].includes(error.status)) console.warn('[analytics] request unavailable')
      res.status([400, 401, 403, 409, 503].includes(error.status) ? error.status : 503).json({ error: [400, 401, 403, 409].includes(error.status) ? error.message : '使用统计暂不可用' })
    }
  }
  router.get('/config', (_req, res) => res.json(AnalyticsConfigSchema.parse({ enabled: config.analytics.enabled, noticeVersion: 1, retentionDays: 90, environment: config.analytics.environment })))
  // Withdrawal remains available while collection is disabled, including expired receipts.
  router.delete('/consent', optionalAuthenticate, safe(async (req, res) => {
    if (!config.analytics.secret) return res.status(503).json({ error: '使用统计暂不可用' })
    await revokeConsent(config, req.headers[RECEIPT_HEADER], req.userId)
    res.json({ deleted: true })
  }))
  router.post('/consent', limiter(15 * 60000, 30), optionalAuthenticate, safe(async (req, res) => {
    if (!config.analytics.enabled) return res.status(503).json({ error: '使用统计未开启' })
    const parsed = AnalyticsConsentRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: '统计授权格式无效' })
    if (excluded(config, req.userId, req.authUser?.role)) return res.status(403).json({ error: '此账号不参与使用统计' })
    res.status(201).json(AnalyticsConsentResponseSchema.parse(await grantConsent(config, parsed.data, req.userId)))
  }))
  router.post('/events', optionalAuthenticate, safe(async (req, res) => {
    if (!config.analytics.enabled) return res.status(503).json({ error: '使用统计未开启' })
    const consent = await resolveConsent(config, req.headers[RECEIPT_HEADER], req.userId)
    if (excluded(config, req.userId, req.authUser?.role)) return res.status(403).json({ error: '此账号不参与使用统计' })
    const parsed = AnalyticsBatchSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: '统计事件格式无效' })
    const now = Date.now()
    if (parsed.data.events.some(event => {
      const time = Date.parse(event.occurredAt)
      return time < now - DAY_MS || time > now + 5 * 60000 || time < new Date(consent.createdAt).getTime() - 5000
    })) return res.status(400).json({ error: '统计事件时间无效' })
    await persistEvents(config, consent, parsed.data.events, 'client')
    res.status(202).json({ accepted: parsed.data.events.length })
  }))
  router.use(['/summary', '/export.csv'], authenticate, requireRole('admin'), (req, res, next) => req.app.locals.rateLimits.adminKey(req, res, next), requireAdminAccessKey)
  const report = csv => safe(async (req, res) => {
    const parsed = AnalyticsReportQuerySchema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: '统计查询格式无效' })
    const summary = AnalyticsReportSchema.parse(await analyticsSummary(config, parsed.data))
    if (csv) res.type('text/csv').set('Content-Disposition', 'attachment; filename="flightwoodx-analytics.csv"').send(summaryCsv(summary))
    else res.json(summary)
  })
  router.get('/summary', report(false))
  router.get('/export.csv', report(true))
  return router
}
module.exports = { createAnalyticsRouter }
