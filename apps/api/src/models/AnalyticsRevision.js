const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  consentId: { type: String, required: true },
  digest: { type: String, required: true },
  observedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false, bufferCommands: false })
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
schema.index({ consentId: 1 })
module.exports = mongoose.model('AnalyticsRevision', schema)
