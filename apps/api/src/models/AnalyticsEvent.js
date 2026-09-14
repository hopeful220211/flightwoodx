const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  eventId: { type: String, required: true },
  payloadDigest: { type: String, required: true },
  consentId: { type: String, required: true },
  actorHash: { type: String, required: true },
  actorKind: { type: String, enum: ['account', 'guest'], required: true },
  source: { type: String, enum: ['client', 'server'], required: true },
  environment: { type: String, enum: ['production', 'development', 'test'], required: true },
  schemaVersion: { type: Number, required: true },
  sessionId: String,
  eventName: { type: String, required: true },
  route: { type: String, required: true },
  release: { type: String, required: true },
  properties: { type: mongoose.Schema.Types.Mixed, required: true },
  occurredAt: { type: Date, required: true },
  receivedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false, bufferCommands: false })
schema.index({ consentId: 1, eventId: 1 }, { unique: true })
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
schema.index({ environment: 1, occurredAt: 1, eventName: 1 })
schema.index({ environment: 1, receivedAt: 1 })
schema.index({ actorHash: 1, occurredAt: 1 })
module.exports = mongoose.model('AnalyticsEvent', schema)
