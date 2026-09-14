const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  actorHash: { type: String, required: true },
  actorKind: { type: String, enum: ['account', 'guest'], required: true },
  noticeVersion: { type: Number, required: true },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { versionKey: false, bufferCommands: false })
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
schema.index({ actorHash: 1 })
module.exports = mongoose.model('AnalyticsConsent', schema)
