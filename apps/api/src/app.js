const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const helmet = require('helmet')
const { createRateLimits } = require('./middleware/rateLimits')
const { notFound, errorHandler } = require('./middleware/errorHandler')
const { getUploadDir } = require('./lib/storage')
const { createAnalyticsService } = require('./lib/analytics')
const { createAnalyticsRouter } = require('./routes/analytics')

function createApp(config) {
  const app = express()
  app.locals.config = config
  app.locals.rateLimits = createRateLimits(config)
  app.locals.analytics = createAnalyticsService(config)
  app.set('trust proxy', config.trustProxyHops)

  app.use((req, res, next) => {
    const start = Date.now()
    res.on('finish', () => {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`)
    })
    next()
  })
  app.use(helmet())
  app.use(cors({ origin: config.corsOrigins, credentials: true }))
  // Independent body/rate budget: analytics cannot consume editor autosave quota.
  app.use('/api/analytics', createAnalyticsRouter(config))
  app.use(app.locals.rateLimits.global)
  app.use(express.json({ limit: config.jsonBodyLimitBytes }))
  app.use(express.urlencoded({ extended: true, limit: config.jsonBodyLimitBytes }))

  app.get(['/api/health', '/healthz'], (_req, res) => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting']
    const dbState = states[mongoose.connection.readyState] || 'unknown'
    const healthy = mongoose.connection.readyState === 1
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'OK' : 'DEGRADED',
      message: 'FlightWoodX Backend',
      db: dbState,
      timestamp: new Date().toISOString(),
    })
  })

  app.use('/api/auth/login', app.locals.rateLimits.auth)
  app.use('/api/auth/register', app.locals.rateLimits.auth)
  app.use('/api/auth/change-password', app.locals.rateLimits.auth)
  app.use('/api/auth', require('./routes/auth'))
  app.use('/api/admin', require('./routes/admin'))
  app.use('/api/designs', require('./routes/designs'))
  app.use('/api/projects', require('./routes/projects'))
  app.use('/api/community', require('./routes/community'))
  app.use('/api/community/trending', require('./routes/communityTrending'))
  app.use('/api/community', require('./routes/comments'))
  app.use('/api/community', require('./routes/reports'))
  app.use('/api/community/collections', require('./routes/collections'))
  app.use('/api/community', require('./routes/follows'))
  app.use('/api/community', require('./routes/forks'))
  app.use('/api/drone-designs', require('./routes/droneDesigns'))
  app.use('/api/programs', require('./routes/programs'))
  app.use('/api/me', require('./routes/me'))
  app.use('/api/growth', require('./routes/growth'))
  app.use('/api/competitions', require('./routes/competitions'))
  app.use('/api/custom-parts', require('./routes/customParts'))
  app.use('/api/uploads', require('./routes/uploads'))
  app.use('/uploads', express.static(getUploadDir(config), {
    setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin'),
  }))

  app.use(notFound)
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
