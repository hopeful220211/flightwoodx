// @ts-check
const path = require('path')

const PLACEHOLDER_SECRET = /^(your-|change-?me|example|test-secret|secret$)/i

function parseInteger(value, fallback, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return parsed
}

function requireValues(name, values) {
  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key)
  if (missing.length > 0) {
    throw new Error(`${name} configuration is incomplete: ${missing.join(', ')}`)
  }
}

function createConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development'
  const jwtSecret = env.JWT_SECRET || ''
  const adminAccessKey = env.ADMIN_ACCESS_KEY || ''
  const storageDriver = env.STORAGE_DRIVER || 'disk'
  const port = parseInteger(env.PORT, 3000, 'PORT', { min: 1, max: 65535 })
  const analyticsEnabled = env.ANALYTICS_ENABLED === 'true'
  const analyticsSecret = env.ANALYTICS_SECRET || ''
  if (analyticsEnabled && (Buffer.byteLength(analyticsSecret) < 32 || PLACEHOLDER_SECRET.test(analyticsSecret) || analyticsSecret === jwtSecret)) {
    throw new Error('ANALYTICS_SECRET must be an independent non-placeholder secret of at least 32 bytes')
  }
  if (env.ANALYTICS_ENABLED && !['true', 'false'].includes(env.ANALYTICS_ENABLED)) throw new Error('ANALYTICS_ENABLED must be true or false')
  const excludedAnalyticsUsers = (env.ANALYTICS_EXCLUDED_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
  if (excludedAnalyticsUsers.some(id => !/^[a-f0-9]{24}$/i.test(id))) throw new Error('ANALYTICS_EXCLUDED_USER_IDS must contain MongoDB user IDs')

  if (nodeEnv !== 'test') {
    if (Buffer.byteLength(jwtSecret) < 32 || PLACEHOLDER_SECRET.test(jwtSecret)) {
      throw new Error('JWT_SECRET must be a non-placeholder secret of at least 32 bytes')
    }
    if (adminAccessKey && (Buffer.byteLength(adminAccessKey) < 16 || PLACEHOLDER_SECRET.test(adminAccessKey))) {
      throw new Error('ADMIN_ACCESS_KEY must be at least 16 bytes when configured')
    }
  }

  if (!['disk', 's3', 'oss'].includes(storageDriver)) {
    throw new Error('STORAGE_DRIVER must be one of: disk, s3, oss')
  }

  const cdnDomain = (env.CDN_DOMAIN || '').replace(/\/$/, '')
  const publicBaseUrl = (env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '')
  const s3 = {
    endpoint: (env.S3_ENDPOINT || '').replace(/\/$/, ''),
    region: env.S3_REGION || '',
    bucket: env.S3_BUCKET || '',
    accessKeyId: env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
  }
  const oss = {
    region: env.OSS_REGION || '',
    assetsBucket: env.OSS_ASSETS_BUCKET || '',
    accessKeyId: env.OSS_ACCESS_KEY_ID || '',
    secret: env.OSS_SECRET || '',
    stsRoleArn: env.OSS_STS_ROLE_ARN || '',
    stsAccessKeyId: env.OSS_STS_ACCESS_KEY_ID || '',
    stsSecret: env.OSS_STS_SECRET || '',
  }

  if (storageDriver === 's3') {
    requireValues('S3', {
      S3_REGION: s3.region,
      S3_BUCKET: s3.bucket,
      S3_ACCESS_KEY_ID: s3.accessKeyId,
      S3_SECRET_ACCESS_KEY: s3.secretAccessKey,
    })
  }
  if (storageDriver === 'oss') {
    requireValues('OSS', {
      OSS_REGION: oss.region,
      OSS_ASSETS_BUCKET: oss.assetsBucket,
      OSS_ACCESS_KEY_ID: oss.accessKeyId,
      OSS_SECRET: oss.secret,
    })
  }

  const corsOrigins = (env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGIN cannot contain * while credentialed requests are enabled')
  }

  return Object.freeze({
    nodeEnv,
    port,
    mongoUri: env.MONGODB_URI || '',
    jwtSecret,
    adminAccessKey,
    analytics: Object.freeze({
      enabled: analyticsEnabled,
      secret: analyticsSecret,
      environment: ['production', 'test'].includes(nodeEnv) ? nodeEnv : 'development',
      retentionDays: 90,
      excludedUserIds: Object.freeze(excludedAnalyticsUsers),
    }),
    corsOrigins: Object.freeze(corsOrigins),
    // 安全默认是不信任代理。部署在一层反向代理后时显式设 TRUST_PROXY_HOPS=1。
    trustProxyHops: parseInteger(env.TRUST_PROXY_HOPS, 0, 'TRUST_PROXY_HOPS', { min: 0, max: 8 }),
    rateLimitEnabled: env.RATE_LIMIT_DISABLED !== 'true',
    // CAD fallback assets belong to the API deployment. Never read them from apps/web.
    cadPartsDir: path.resolve(
      env.CAD_PARTS_DIR || path.resolve(__dirname, '../../assets/cad/parts'),
    ),
    // 设计快照可能携带旧版内嵌缩略图；显式限制请求体，避免 Express 默认值与契约不一致。
    jsonBodyLimitBytes: parseInteger(
      env.JSON_BODY_MAX_BYTES,
      6 * 1024 * 1024,
      'JSON_BODY_MAX_BYTES',
      { min: 64 * 1024, max: 8 * 1024 * 1024 },
    ),
    storage: Object.freeze({
      driver: storageDriver,
      uploadDir: path.resolve(env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads')),
      publicBaseUrl,
      cdnDomain,
      maxCoverBytes: parseInteger(env.COVER_UPLOAD_MAX_BYTES, 5 * 1024 * 1024, 'COVER_UPLOAD_MAX_BYTES', { min: 1024, max: 10 * 1024 * 1024 }),
      coverUploadsPerHour: parseInteger(env.COVER_UPLOADS_PER_HOUR, 20, 'COVER_UPLOADS_PER_HOUR', { min: 1, max: 100 }),
      stsRequestsPerHour: parseInteger(env.STS_REQUESTS_PER_HOUR, 6, 'STS_REQUESTS_PER_HOUR', { min: 1, max: 60 }),
      s3: Object.freeze(s3),
      oss: Object.freeze(oss),
    }),
  })
}

module.exports = { createConfig }
