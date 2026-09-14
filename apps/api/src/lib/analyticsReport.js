const Event = require('../models/AnalyticsEvent')
const { DAY_MS } = require('./analytics')

async function analyticsSummary(config, query) {
  const to = query.to ? new Date(query.to) : new Date()
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * DAY_MS)
  if (to <= from || to.getTime() - from.getTime() > 90 * DAY_MS || to > new Date(Date.now() + 60000)) {
    const error = new Error('统计范围需在90天以内'); error.status = 400; throw error
  }
  const environment = query.environment || config.analytics.environment
  const now = new Date()
  const filter = { environment, occurredAt: { $gte: from, $lt: to }, expiresAt: { $gt: now } }
  const creative = { $or: [
    { eventName: { $in: ['design_edit_started', 'program_edited', 'sketch_shape_committed', 'assembly_part_added'] } },
    { eventName: 'simulation_run', 'properties.phase': 'start' },
    { eventName: 'design_saved', 'properties.nonempty': true, 'properties.change': { $in: ['created', 'edited'] } },
    { eventName: 'custom_part_saved' },
  ] }
  const activeConsent = [
    { $lookup: { from: 'analyticsconsents', localField: 'consentId', foreignField: '_id', as: 'consent' } },
    { $unwind: '$consent' },
    { $match: { 'consent.revokedAt': null, 'consent.expiresAt': { $gt: now } } },
    { $project: { consent: 0 } },
  ]
  const distinctCount = (match, field) => [{ $match: match }, { $group: { _id: field } }, { $count: 'count' }]
  const [result, first] = await Promise.all([
    Event.aggregate([{ $match: filter }, ...activeConsent, { $facet: {
      events: [{ $group: { _id: '$eventName', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      registered: distinctCount({ ...creative, actorKind: 'account' }, '$actorHash'),
      guests: distinctCount({ ...creative, actorKind: 'guest' }, '$actorHash'),
      designs: distinctCount({ eventName: 'design_saved', 'properties.nonempty': true }, '$properties.designId'),
      parts: distinctCount({ eventName: 'custom_part_saved' }, '$properties.partId'),
    } }]).option({ maxTimeMS: 5000 }),
    Event.aggregate([{ $match: { environment, expiresAt: { $gt: now } } }, { $sort: { receivedAt: 1 } }, ...activeConsent, { $limit: 1 }, { $project: { receivedAt: 1 } }]).option({ maxTimeMS: 5000 }),
  ])
  const values = result[0]
  const events = values.events
  const total = name => values[name][0]?.count || 0
  return { environment, from: from.toISOString(), to: to.toISOString(), firstCollectedAt: first[0]?.receivedAt.toISOString() || null, events: events.map(item => ({ eventName: item._id, count: item.count })), registeredActiveCreators: total('registered'), guestActiveBrowsers: total('guests'), uniqueSavedDesigns: total('designs'), uniqueSavedParts: total('parts'), totalEvents: events.reduce((sum, item) => sum + item.count, 0) }
}
function summaryCsv(summary) {
  // All cells are server enums, ISO dates or integers, never free-form user strings.
  const rows = [['metric', 'value'], ['environment', summary.environment], ['from', summary.from], ['to', summary.to], ['first_collected_at', summary.firstCollectedAt || ''], ['registered_active_creators', summary.registeredActiveCreators], ['guest_active_browsers', summary.guestActiveBrowsers], ['unique_saved_designs', summary.uniqueSavedDesigns], ['unique_saved_parts', summary.uniqueSavedParts], ['total_events', summary.totalEvents], ...summary.events.map(item => [item.eventName, item.count])]
  return rows.map(row => row.join(',')).join('\r\n') + '\r\n'
}
module.exports = { analyticsSummary, summaryCsv }
