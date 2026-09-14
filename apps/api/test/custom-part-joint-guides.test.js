const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const { randomBytes } = require('node:crypto')
const mongoose = require('mongoose')
const { createConfig } = require('../src/config/env')
const { createApp } = require('../src/app')
const controller = require('../src/controllers/customPartController')
const CustomPart = require('../src/models/CustomPart')

const throughGuide = { id: 'through-1', kind: 'through-slot', x: 5, y: 5, lengthMm: 10, axis: 'x', entry: 'front' }
const edgeGuide = { id: 'edge-1', kind: 'edge-slot', x: 0, y: 9, lengthMm: 10, axis: 'x', entry: 'start' }
function partDef(kind = 'through') {
  return {
    name: '插槽指引测试', category: 'guard',
    geometry: {
      contour: kind === 'edge' ? 'M0 0 L20 0 L20 20 L0 20 L0 11 L10 11 L10 9 L0 9 Z' : 'M0 0 L20 0 L20 20 L0 20 Z',
      holes: kind === 'edge' ? [] : ['M5 5 L15 5 L15 7 L5 7 Z'],
      thicknessMm: 2, bboxMm: { w: 20, h: 20 },
    },
    sockets: [], jointGuides: [{ ...(kind === 'edge' ? edgeGuide : throughGuide) }],
    manufacturability: { closed: true, minFeatureMm: 0, withinBoard: true, passed: false },
    flightImpact: { massG: 0 }, assets: {},
  }
}

test('joint guides retain only validated generic slot intent, without assembly sockets', () => {
  for (const kind of ['through', 'edge']) {
    const payload = partDef(kind)
    const result = controller._validateDef(payload)
    assert.equal(result.ok, true)
    assert.deepEqual(result.data.jointGuides, payload.jointGuides)
    assert.deepEqual(result.data.sockets, [])
    assert.equal(result.data.manufacturability.passed, false)
  }
  const legacy = partDef()
  delete legacy.jointGuides
  assert.equal(Object.hasOwn(controller._validateDef(legacy).data, 'jointGuides'), false)
})

test('joint guide malformed fields and fabricated positions fail before persistence', () => {
  const payload = partDef()
  const invalidGuides = [
    { ...throughGuide, id: '' }, { ...throughGuide, id: 'a'.repeat(81) },
    { ...throughGuide, id: 'bad/id' }, { ...throughGuide, kind: 'arm-mount' },
    { ...throughGuide, x: Infinity }, { ...throughGuide, y: 2001 },
    { ...throughGuide, lengthMm: 1 }, { ...throughGuide, lengthMm: 2001 },
    { ...throughGuide, axis: 'z' }, { ...throughGuide, entry: 'start' },
    { ...throughGuide, unknown: true }, { ...throughGuide, x: 6 },
    { ...throughGuide, lengthMm: 9 },
  ]
  for (const guide of invalidGuides) {
    assert.equal(controller._validateDef({ ...payload, jointGuides: [guide] }).ok, false, JSON.stringify(guide))
  }
  for (const jointGuides of [null, {}, [throughGuide, throughGuide], Array.from({ length: 33 }, (_, i) => ({ ...throughGuide, id: `guide-${i}` }))]) {
    assert.equal(controller._validateDef({ ...payload, jointGuides }).ok, false)
  }
  assert.equal(controller._validateDef({ ...payload, geometry: { ...payload.geometry, holes: [] } }).ok, false)
  assert.equal(controller._validateDef({ ...partDef('edge'), jointGuides: [{ ...edgeGuide, entry: 'end' }] }).ok, false)
  const omitted = { ...payload }
  delete omitted.jointGuides
  assert.equal(controller._validateDef(omitted, [{ ...throughGuide, axis: 'z' }]).ok, false)
})

test('omitted guides guard the checked stored revision and retain data on a conflicting edit', async (t) => {
  const payload = partDef()
  delete payload.jointGuides
  const updatedAt = new Date('2026-09-14T00:00:00.000Z')
  t.mock.method(CustomPart, 'findOne', () => ({ select: () => ({ lean: async () => ({ jointGuides: [throughGuide], updatedAt }) }) }))
  let writtenFilter
  let writtenOptions
  t.mock.method(CustomPart, 'findOneAndUpdate', (filter, _update, options) => {
    writtenFilter = filter
    writtenOptions = options
    return { lean: async () => null }
  })
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  await controller.update({ body: payload, userId: '507f1f77bcf86cd799439010', params: { id: '507f1f77bcf86cd799439011' } }, response)
  assert.equal(response.statusCode, 409)
  assert.equal(writtenFilter.ownerId, '507f1f77bcf86cd799439010')
  assert.equal(writtenFilter.updatedAt, updatedAt)
  assert.deepEqual(writtenFilter.jointGuides, [throughGuide])
  assert.equal(writtenOptions.upsert, false)
})

const mongoUri = process.env.FWX_TEST_MONGO_URI
test('real MongoDB: slot guides save, reload, preserve omitted fields, validate updates and enforce ownership', { skip: !mongoUri }, async () => {
  assert.match(mongoUri, /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+(\/[^?]*)?$/)
  await mongoose.connect(mongoUri, { dbName: `fwx_joint_guides_test_${randomBytes(8).toString('hex')}` })
  const server = createApp(createConfig({
    NODE_ENV: 'test', JWT_SECRET: randomBytes(32).toString('hex'),
    RATE_LIMIT_DISABLED: 'true', STORAGE_DRIVER: 'disk',
  })).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api`
  const send = async (route, { method = 'GET', token, body } = {}) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }
  try {
    await Promise.all(Object.values(mongoose.models).map(model => model.init()))
    const register = async (username) => {
      const response = await send('/auth/register', { method: 'POST', body: { username, email: `${username}@example.com`, password: 'local-test-password-123' } })
      assert.equal(response.status, 201)
      return response.body
    }
    const owner = await register('guideowner')
    const other = await register('guideother')
    const payload = partDef()
    assert.equal((await send('/custom-parts', { method: 'POST', body: payload })).status, 401)
    const created = await send('/custom-parts', { method: 'POST', token: owner.token, body: { ...payload, ownerId: other.user.id } })
    assert.equal(created.status, 201)
    const id = created.body.data.id
    assert.equal(created.body.data.ownerId, owner.user.id)
    assert.deepEqual(created.body.data.jointGuides, payload.jointGuides)
    assert.deepEqual((await send(`/custom-parts/${id}`, { token: owner.token })).body.data.jointGuides, payload.jointGuides)
    assert.deepEqual((await send('/custom-parts', { token: owner.token })).body.data.items[0].jointGuides, payload.jointGuides)
    const omitted = { ...payload, name: '旧客户端更新' }
    delete omitted.jointGuides
    const updated = await send(`/custom-parts/${id}`, { method: 'PUT', token: owner.token, body: omitted })
    assert.equal(updated.status, 200)
    assert.deepEqual(updated.body.data.jointGuides, payload.jointGuides)
    const invalidGeometry = { ...omitted, geometry: { ...payload.geometry, holes: [] } }
    assert.equal((await send(`/custom-parts/${id}`, { method: 'PUT', token: owner.token, body: invalidGeometry })).status, 400)
    assert.deepEqual((await send(`/custom-parts/${id}`, { token: owner.token })).body.data.geometry, payload.geometry)
    const fabricated = { ...payload, jointGuides: [{ ...throughGuide, x: 6 }] }
    assert.equal((await send('/custom-parts', { method: 'POST', token: owner.token, body: fabricated })).status, 400)
    assert.equal((await send(`/custom-parts/${id}`, { method: 'PUT', token: owner.token, body: fabricated })).status, 400)
    assert.equal((await send(`/custom-parts/${id}`, { token: other.token })).status, 404)
    assert.equal((await send(`/custom-parts/${id}`, { method: 'PUT', token: other.token, body: omitted })).status, 404)
    assert.equal((await send(`/custom-parts/${id}`, { method: 'DELETE', token: other.token })).status, 404)
    const cleared = await send(`/custom-parts/${id}`, { method: 'PUT', token: owner.token, body: { ...invalidGeometry, jointGuides: [] } })
    assert.equal(cleared.status, 200)
    assert.deepEqual(cleared.body.data.jointGuides, [])
    const legacy = await send('/custom-parts', { method: 'POST', token: owner.token, body: omitted })
    assert.equal(legacy.status, 201)
    assert.equal(Object.hasOwn(legacy.body.data, 'jointGuides'), false)
    const freshId = new mongoose.Types.ObjectId().toString()
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await send(`/custom-parts/${freshId}`, { method: 'PUT', token: owner.token, body: partDef('edge') })
      assert.equal(result.status, 200)
      assert.deepEqual(result.body.data.jointGuides, [edgeGuide])
    }
    assert.deepEqual((await send(`/custom-parts/${freshId}`, { token: owner.token })).body.data.jointGuides, [edgeGuide])
  } finally {
    await new Promise(resolve => { server.close(resolve) })
    // Only this test's randomly named, local database is removed.
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  }
})
