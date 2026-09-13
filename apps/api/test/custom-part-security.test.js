const test = require('node:test')
const assert = require('node:assert/strict')
const customPartController = require('../src/controllers/customPartController')
const CustomPart = require('../src/models/CustomPart')
const { UserPartCategoryEnum } = require('@fwx/parts-schema/runtime-cjs')

function partDef(contour) {
  return {
    name: '测试零件',
    category: 'guard',
    geometry: {
      contour,
      holes: [],
      thicknessMm: 2,
      bboxMm: { w: 20, h: 20 },
    },
    sockets: [],
    manufacturability: {
      closed: true,
      minFeatureMm: 2,
      withinBoard: true,
      passed: true,
    },
    flightImpact: { massG: 1 },
    assets: {},
  }
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

test('server validates SVG geometry and never trusts a client passed flag', () => {
  const valid = customPartController._validateDef(partDef('M0 0 L20 0 L20 20 L0 20 Z'))
  assert.equal(valid.ok, true)
  assert.equal(valid.data.manufacturability.closed, true)
  assert.equal(valid.data.manufacturability.passed, false)

  const selfIntersecting = customPartController._validateDef(partDef('M0 0 L20 20 L0 20 L20 0 Z'))
  assert.equal(selfIntersecting.ok, false)
  assert.match(selfIntersecting.message, /几何不合法/)
})

test('server rejects malformed paths and actual geometry limit bypasses before create or update', async () => {
  const circlePath = (count) => `${Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * 2 / count
    return `${i === 0 ? 'M' : 'L'}${10 + 5 * Math.cos(angle)} ${10 + 5 * Math.sin(angle)}`
  }).join(' ')} Z`
  const rectangle = partDef('M0 0 H20 V20 H0 Z')
  const invalidBodies = [
    partDef('M0 0 L20 0 @L20 20 L0 20 Z'),
    partDef('M0 0 L20 0 M20 20 L0 20 Z'),
    partDef('L0 0 H20 V20 H0 Z'),
    partDef('M0 0 H2001 V20 H0 Z'),
    partDef('M1000001 0 h20 v20 h-20 Z'),
    partDef(circlePath(2001)),
    { ...rectangle, geometry: { ...rectangle.geometry, holes: [circlePath(1997)] } },
    { ...rectangle, geometry: { ...rectangle.geometry, bboxMm: { w: 19, h: 20 } } },
  ]
  for (const body of invalidBodies) {
    assert.equal(customPartController._validateDef(body).ok, false)
    const createResponse = responseRecorder()
    await customPartController.create({ body, userId: 'user-1' }, createResponse)
    assert.equal(createResponse.statusCode, 400)
    const updateResponse = responseRecorder()
    await customPartController.update({ body, userId: 'user-1', params: { id: '507f1f77bcf86cd799439011' } }, updateResponse)
    assert.equal(updateResponse.statusCode, 400)
  }
  const legacyRelative = partDef('m0,0 20,0 0,20 -20,0 z')
  assert.equal(customPartController._validateDef(legacyRelative).ok, true)
})

test('persistence uses the shared structural categories including mainboards without widening thickness', () => {
  assert.deepEqual(CustomPart.schema.path('category').enumValues, UserPartCategoryEnum.options)
  const payload = { ...partDef('M0 0 L20 0 L20 20 L0 20 Z'), category: 'mainboard' }
  const document = new CustomPart({ ownerId: '507f1f77bcf86cd799439011', ...payload })
  assert.equal(document.validateSync(), undefined)
  assert.equal(customPartController._validateDef(payload).ok, true)
  assert.equal(document.geometry.thicknessMm, 2)
  assert.deepEqual(document.sockets.toObject(), [])
  for (const category of ['MOTOR', 'PROP']) {
    assert.ok(new CustomPart({ ...document.toObject(), category }).validateSync().errors.category)
  }
  assert.ok(new CustomPart({ ...document.toObject(), geometry: { ...payload.geometry, thicknessMm: 3 } }).validateSync().errors['geometry.thicknessMm'])
})

test('create and update return 400 before persistence for invalid SVG geometry', async () => {
  const invalidBody = partDef('M0 0 L20 0 L20 20')

  const createResponse = responseRecorder()
  await customPartController.create({ body: invalidBody, userId: 'user-1' }, createResponse)
  assert.equal(createResponse.statusCode, 400)

  const updateResponse = responseRecorder()
  await customPartController.update({
    body: invalidBody,
    userId: 'user-1',
    params: { id: '507f1f77bcf86cd799439011' },
  }, updateResponse)
  assert.equal(updateResponse.statusCode, 400)
})
