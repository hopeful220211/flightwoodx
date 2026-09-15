const test = require('node:test')
const assert = require('node:assert/strict')
const CustomPart = require('../src/models/CustomPart')
const { validateAssemblyPayload } = require('../src/lib/assemblyConnections')
const { customConnectors, connectAssembly } = require('@fwx/geometry/runtime-cjs')
const id = 'a'.repeat(24), ownerId = 'b'.repeat(24), updatedAt = new Date('2026-09-15T00:00:00Z')
const source = { _id: id, ownerId, version: 1, updatedAt, category: 'guard', geometry: { contour: 'M0 0 L20 0 L20 20 L0 20 L0 11 L10 11 L10 9 L0 9 Z', holes: [], thicknessMm: 2, bboxMm: { w:20,h:20 } }, jointGuides: [{ id:'edge',kind:'edge-slot',x:0,y:9,lengthMm:10,axis:'x',entry:'start' }] }
const instance = (instanceId) => ({ instanceId, partId:`custom_${id}`,category:'guard',position:[0,0,0],rotation:[0,0,0],source:{kind:'custom',id,version:1,updatedAt:updatedAt.toISOString()} })
test('assembly writes resolve owner-held revisions and reject fabricated or stale endpoints', async t => {
  let record = source, queried
  t.mock.method(CustomPart, 'find', filter => { queried = filter; return { lean: async () => record ? [record] : [] } })
  const parts = connectAssembly([instance('a'),instance('b')],'b','joint:edge','a','joint:edge',() => customConnectors(source))
  assert.equal(await validateAssemblyPayload({designData:{parts}},ownerId), null)
  assert.equal(queried.ownerId,ownerId)
  assert.match(await validateAssemblyPayload({parts:parts.map(p => p.instanceId==='b'?{...p,position:[1,1,1]}:p)},ownerId), /对齐/)
  record = { ...source, version:2 }
  assert.match(await validateAssemblyPayload({designData:{parts}},ownerId), /修改/)
  record = null
  assert.match(await validateAssemblyPayload({designData:{parts}},ownerId), /不存在/)
})
