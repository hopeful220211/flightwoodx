require('dotenv').config()
const { createConfig } = require('./config/env')
const { createApp } = require('./app')
const { connectDatabase, disconnectDatabase } = require('./db')

async function startServer() {
  const config = createConfig(process.env)
  await connectDatabase(config)
  const app = createApp(config)
  const server = app.listen(config.port, () => {
    console.log(`Server is running on http://localhost:${config.port}`)
    console.log(`Health check: http://localhost:${config.port}/api/health`)
  })

  let stopping = false
  async function shutdown(signal) {
    if (stopping) return
    stopping = true
    console.log(`${signal} received — shutting down gracefully`)
    const forced = setTimeout(() => {
      console.error('Could not close connections in time — forcing exit')
      process.exit(1)
    }, 10000)
    forced.unref()

    server.close(async () => {
      try {
        await app.locals.analytics.drain()
        await disconnectDatabase()
        clearTimeout(forced)
        console.log('Closed out connections')
        process.exit(0)
      } catch (error) {
        console.error('Shutdown error:', error.message)
        process.exit(1)
      }
    })
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))
  return { app, server, shutdown }
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('API startup failed:', error.message)
    process.exit(1)
  })
}

module.exports = { startServer }
