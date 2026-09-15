const CustomPart = require('../models/CustomPart')
const { customConnectors, officialConnectors, validateAssemblyConnections } = require('@fwx/geometry/runtime-cjs')

/** Resolve connected custom sources under the authenticated owner, never submitted geometry. */
async function validateAssemblyPayload(payload, ownerId) {
  for (const parts of [payload.designData?.parts, payload.parts].filter(Array.isArray)) {
    const connected = new Set()
    for (const part of parts) if (part.attachedTo) {
      connected.add(part.instanceId)
      connected.add(part.attachedTo.parentInstanceId)
    }
    const custom = parts.filter(p => p.source && connected.has(p.instanceId))
    if (!custom.length) continue
    const docs = await CustomPart.find({ _id: { $in: [...new Set(custom.map(p => p.source.id))] }, ownerId }).lean()
    const frames = new Map()
    for (const part of custom) {
      const doc = docs.find(d => String(d._id) === part.source.id)
      if (!doc) return '连接的原零件不存在或不属于当前账号，请断开后重新选择'
      if (doc.version !== part.source.version || new Date(doc.updatedAt).toISOString() !== part.source.updatedAt ||
          (doc.category === 'deco' ? 'joint' : doc.category) !== part.category) return '连接的原零件已修改，请重新选择零件'
      try { frames.set(part.instanceId, customConnectors(doc)) } catch { return '原零件的插接口与轮廓不符' }
    }
    const error = validateAssemblyConnections(parts, part => part.source ? frames.get(part.instanceId) ?? [] : officialConnectors(part.partId))
    if (error) return error
  }
  return null
}
module.exports = { validateAssemblyPayload }
