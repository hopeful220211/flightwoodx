const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const { randomBytes } = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const mongoose = require('mongoose')
const { createConfig } = require('../src/config/env')
const { createApp } = require('../src/app')
const User = require('../src/models/User')
const Competition = require('../src/models/Competition')

// Run against a real, local disposable MongoDB, never a configured production URI.
// FWX_TEST_MONGO_URI=mongodb://127.0.0.1:27028 node --test test/real-api-flow.test.js
const mongoUri = process.env.FWX_TEST_MONGO_URI

test('real MongoDB: identity, owned design/part persistence, profile and admin boundaries', { skip: !mongoUri }, async (t) => {
  assert.match(mongoUri, /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+(\/[^?]*)?$/)
  const dbName = `fwx_api_test_${randomBytes(8).toString('hex')}`
  await mongoose.connect(mongoUri, { dbName })
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fwx-api-flow-'))
  const server = createApp(createConfig({
    NODE_ENV: 'test', JWT_SECRET: randomBytes(32).toString('hex'),
    ADMIN_ACCESS_KEY: 'local-api-test-admin-key', RATE_LIMIT_DISABLED: 'true', STORAGE_DRIVER: 'disk', UPLOAD_DIR: uploadDir,
  })).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api`
  const send = async (path, { method = 'GET', token, body, adminKey } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(adminKey ? { 'X-Admin-Access-Key': adminKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() }
  }
  let owner
  let other
  let design
  let part
  let post
  let collection
  try {
    await Promise.all(Object.values(mongoose.models).map(model => model.init()))
    await t.test('registration, normalized login, reload and invalid submissions', async () => {
      const invalid = await send('/auth/register', { method: 'POST', body: { username: 'ab', email: 'invalid', password: 'password' } })
      assert.equal(invalid.status, 400)
      owner = (await send('/auth/register', { method: 'POST', body: { username: 'owner', email: 'OWNER@example.com ', password: 'password-123', role: 'admin' } })).body
      assert.equal(owner.user.role, 'student')
      assert.equal(typeof owner.user.id, 'string')
      assert.equal(owner.user.email, 'owner@example.com')
      other = (await send('/auth/register', { method: 'POST', body: { username: 'other', email: 'other@example.com', password: 'password-123' } })).body
      const login = await send('/auth/login', { method: 'POST', body: { email: ' OWNER@EXAMPLE.COM ', password: 'password-123' } })
      assert.equal(login.status, 200)
      assert.equal(login.body.user.id, owner.user.id)
      const reloaded = await send('/auth/me', { token: owner.token })
      assert.equal(reloaded.body.user.id, owner.user.id)
      assert.equal(reloaded.body.user.password, undefined)
      assert.equal(reloaded.body.user.tokenVersion, undefined)
      const duplicate = await send('/auth/register', { method: 'POST', body: { username: 'new-name', email: ' OWNER@example.com ', password: 'password-123' } })
      assert.equal(duplicate.status, 400)
    })
    await t.test('profile edit survives reload without clearing omitted fields or changing roles', async () => {
      assert.equal((await send('/auth/profile', { method: 'PATCH', token: owner.token, body: { profile: { displayName: '评审同学', grade: '三年级', school: '测试学校' } } })).status, 200)
      const changed = await send('/auth/profile', { method: 'PATCH', token: owner.token, body: { profile: { displayName: '更新昵称' }, role: 'admin' } })
      assert.equal(changed.body.user.profile.grade, '三年级')
      const reloaded = await send('/auth/me', { token: owner.token })
      assert.equal(reloaded.body.user.nickname, '更新昵称')
      assert.equal(reloaded.body.user.profile.school, '测试学校')
      assert.equal(reloaded.body.user.role, 'student')
      assert.equal((await send('/auth/profile', { method: 'PATCH', token: owner.token, body: { username: 'other' } })).status, 400)
    })
    await t.test('design upsert is retryable, refreshable and isolated between users', async () => {
      const payload = { localId: ' local-design-1 ', name: '评审作品', designData: {
        id: 'local-design-1', name: '评审作品', updatedAt: new Date().toISOString(),
        buildMode: 'guided', currentStep: 'HUB', stepReached: 0, parts: [],
      } }
      const saved = await send('/drone-designs', { method: 'PUT', token: owner.token, body: payload })
      assert.equal(saved.status, 200)
      design = saved.body.design
      const retried = await send('/drone-designs', { method: 'PUT', token: owner.token, body: { ...payload, name: '改名后作品' } })
      assert.equal(retried.status, 200)
      assert.equal(retried.body.design.id, design.id)
      assert.equal(retried.body.design.name, '改名后作品')
      const list = await send('/drone-designs', { token: owner.token })
      assert.equal(list.body.total, 1)
      assert.equal(list.body.items[0].localId, 'local-design-1')
      assert.equal((await send(`/drone-designs/${design.id}`, { token: owner.token })).body.design.designData.id, 'local-design-1')
      assert.equal((await send(`/drone-designs/${design.id}`, { token: other.token })).status, 404)
      assert.equal((await send(`/drone-designs/${design.id}`, { method: 'PATCH', token: other.token, body: { name: 'stolen' } })).status, 404)
      assert.equal((await send(`/drone-designs/${design.id}`, { method: 'DELETE', token: other.token })).status, 404)
      assert.equal((await send(`/drone-designs/${design.id}`, { method: 'PATCH', token: owner.token, body: { status: 'bad-status' } })).status, 400)
      assert.equal((await send('/drone-designs', { token: other.token })).body.total, 0)
      assert.equal((await send('/drone-designs')).status, 401)
    })
    await t.test('custom parts persist, retry and reject cross-user read, update and deletion', async () => {
      const payload = {
        name: '本地测试零件', category: 'guard',
        geometry: { contour: 'M 0 0 L 40 0 L 40 40 L 0 40 Z', holes: [], thicknessMm: 2, bboxMm: { w: 40, h: 40 } },
        sockets: [], manufacturability: { closed: true, minFeatureMm: 2, withinBoard: true, passed: true },
        flightImpact: { massG: 1 }, assets: {},
      }
      const created = await send('/custom-parts', { method: 'POST', token: owner.token, body: payload })
      assert.equal(created.status, 201)
      part = created.body.data
      assert.equal(part.manufacturability.passed, false)
      assert.equal((await send(`/custom-parts/${part.id}`, { token: owner.token })).body.data.id, part.id)
      assert.equal((await send(`/custom-parts/${part.id}`, { method: 'PUT', token: owner.token, body: { ...payload, name: '修改后零件' } })).status, 200)
      assert.equal((await send('/custom-parts', { token: owner.token })).body.data.total, 1)
      assert.equal((await send(`/custom-parts/${part.id}`, { token: other.token })).status, 404)
      assert.equal((await send(`/custom-parts/${part.id}`, { method: 'PUT', token: other.token, body: payload })).status, 404)
      assert.equal((await send(`/custom-parts/${part.id}`, { method: 'DELETE', token: other.token })).status, 404)
      assert.equal((await send('/custom-parts', { token: other.token })).body.data.total, 0)
    })
    await t.test('2mm custom mainboards persist and retry without bypassing identity or geometry boundaries', async () => {
      const payload = {
        name: '测试主板', category: 'mainboard',
        geometry: { contour: 'M0 0 L120 0 L120 120 L0 120 Z', holes: ['M50 50 L50 70 L70 70 L70 50 Z'], thicknessMm: 2, bboxMm: { w: 120, h: 120 } },
        sockets: [], manufacturability: { closed: true, minFeatureMm: 2, withinBoard: true, passed: true },
        flightImpact: { massG: 1 }, assets: {},
      }
      assert.equal((await send('/custom-parts', { method: 'POST', body: payload })).status, 401)
      for (const invalid of [
        { ...payload, category: 'MOTOR' },
        { ...payload, category: 'PROP' },
        { ...payload, geometry: { ...payload.geometry, thicknessMm: 3 } },
        { ...payload, geometry: { ...payload.geometry, contour: 'M0 0 L120 0 L120 120' } },
      ]) assert.equal((await send('/custom-parts', { method: 'POST', token: owner.token, body: invalid })).status, 400)
      const created = await send('/custom-parts', { method: 'POST', token: owner.token, body: payload })
      assert.equal(created.status, 201)
      const mainboard = created.body.data
      assert.equal(mainboard.ownerId, owner.user.id)
      assert.equal(mainboard.category, 'mainboard')
      assert.equal(mainboard.geometry.thicknessMm, 2)
      assert.deepEqual(mainboard.geometry.holes, payload.geometry.holes)
      assert.deepEqual(mainboard.sockets, [])
      assert.equal(mainboard.manufacturability.passed, false)
      const updated = { ...payload, name: '修改后主板' }
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await send(`/custom-parts/${mainboard.id}`, { method: 'PUT', token: owner.token, body: updated })
        assert.equal(result.status, 200)
        assert.equal(result.body.data.id, mainboard.id)
      }
      const reloaded = await send(`/custom-parts/${mainboard.id}`, { token: owner.token })
      assert.equal(reloaded.body.data.name, updated.name)
      assert.equal(reloaded.body.data.category, 'mainboard')
      assert.equal((await send('/custom-parts', { token: owner.token })).body.data.items.filter(item => item.id === mainboard.id).length, 1)
      assert.equal((await send(`/custom-parts/${mainboard.id}`, { token: other.token })).status, 404)
      assert.equal((await send(`/custom-parts/${mainboard.id}`, { method: 'PUT', token: other.token, body: updated })).status, 404)
      assert.equal((await send(`/custom-parts/${mainboard.id}`, { method: 'DELETE', token: other.token })).status, 404)
      assert.equal((await send(`/custom-parts/${mainboard.id}`, { token: owner.token })).body.data.name, updated.name)
      const instance = {
        instanceId: 'custom-mainboard-instance', partId: `custom_${mainboard.id}`, category: 'mainboard',
        position: [0, 0, 0], rotation: [0, 0, 0],
        source: { kind: 'custom', id: mainboard.id, version: reloaded.body.data.version, updatedAt: reloaded.body.data.updatedAt },
      }
      const designPayload = { localId: 'custom-mainboard-design', name: '自制主板作品', designData: {
        id: 'custom-mainboard-design', name: '自制主板作品', updatedAt: new Date().toISOString(),
        buildMode: 'free', currentStep: 'HUB', stepReached: 0, parts: [instance],
      } }
      const savedDesign = await send('/drone-designs', { method: 'PUT', token: owner.token, body: designPayload })
      assert.equal(savedDesign.status, 200)
      const mainboardDesignId = savedDesign.body.design.id
      const readDesign = await send(`/drone-designs/${mainboardDesignId}`, { token: owner.token })
      assert.deepEqual(readDesign.body.design.designData.parts[0], instance)
      for (const invalidDesignData of [
        { ...designPayload.designData, buildMode: 'guided' },
        { ...designPayload.designData, parts: [{ ...instance, activeConnectorId: 'invented' }] },
      ]) assert.equal((await send('/drone-designs', { method: 'PUT', token: owner.token, body: { ...designPayload, designData: invalidDesignData } })).status, 400)
      assert.equal((await send(`/drone-designs/${mainboardDesignId}`, { token: other.token })).status, 404)
      assert.equal((await send(`/drone-designs/${mainboardDesignId}`, { method: 'DELETE', token: owner.token })).status, 200)
      assert.equal((await send(`/custom-parts/${mainboard.id}`, { method: 'DELETE', token: owner.token })).status, 200)
    })
    await t.test('community publication, comments, favorites, following and reuse use persisted designs', async () => {
      const programmed = await send('/programs', { method: 'POST', token: owner.token, body: {
        name: 'fixture program', blocklyXml: '<xml/>', commandProgram: {
          version: '1.0', metadata: { name: 'fixture program', author: 'owner', createdAt: new Date().toISOString() }, commands: [],
        },
      } })
      assert.equal(programmed.status, 201)
      const program = programmed.body.program
      assert.equal((await send(`/programs/${program.id}`, { token: owner.token })).status, 200)
      assert.equal((await send(`/programs/${program.id}`, { token: other.token })).status, 404)
      assert.equal((await send(`/drone-designs/${design.id}`, { method: 'PATCH', token: owner.token, body: { visibility: 'public', reusable: true, programId: program.id } })).status, 200)
      const published = await send('/community/posts', { method: 'POST', token: owner.token, body: { designId: design.id, title: '公开评审作品' } })
      assert.equal(published.status, 201)
      post = published.body.post
      assert.equal((await send('/community/posts', { method: 'POST', token: owner.token, body: { designId: design.id } })).body.post.id, post.id)
      assert.equal((await send(`/community/posts/${post.id}`)).status, 200)
      const publicAuthor = (await send(`/community/users/${owner.user.id}`)).body.author
      assert.equal(publicAuthor.school, undefined)
      assert.equal(publicAuthor.profile, undefined)
      assert.equal((await send(`/community/posts/${post.id}/like`, { method: 'POST', token: other.token })).body.likeCount, 1)
      assert.equal((await send(`/community/posts/${post.id}/like`, { method: 'POST', token: other.token })).body.likeCount, 1)
      const comment = await send(`/community/posts/${post.id}/comments`, { method: 'POST', token: other.token, body: { body: '这个作品的结构很清楚' } })
      assert.equal(comment.status, 201)
      assert.equal((await send(`/community/posts/${post.id}/comments`)).body.total, 1)
      assert.equal((await send(`/community/comments/${comment.body.comment.id}`, { method: 'DELETE', token: owner.token })).status, 403)
      assert.equal((await send('/community/reports', { method: 'POST', token: owner.token, body: { targetType: 'comment', targetId: comment.body.comment.id, reason: '其他' } })).status, 200)
      assert.equal((await send(`/community/posts/${post.id}/comments`)).body.total, 1)
      collection = (await send('/community/collections', { method: 'POST', token: other.token, body: { name: '评审收藏', isPublic: true } })).body.collection
      assert.equal((await send(`/community/collections/${collection.id}/items`, { method: 'POST', token: other.token, body: { postId: post.id } })).status, 200)
      assert.equal((await send(`/community/collections/${collection.id}`)).body.collection.items.length, 1)
      assert.equal((await send(`/community/users/${owner.user.id}/follow`, { method: 'POST', token: other.token })).status, 200)
      assert.equal((await send('/community/feed', { token: other.token })).body.items.length, 1)
      const fork = await send(`/community/posts/${post.id}/fork`, { method: 'POST', token: other.token })
      assert.equal(fork.status, 201)
      assert.equal((await send(`/community/posts/${post.id}/fork`, { method: 'POST', token: other.token })).body.projectId, fork.body.projectId)
      assert.equal((await send('/community/posts?q=%5B')).status, 200)
    })
    await t.test('competitions register and submit owned works idempotently without fabricated scores', async () => {
      const comp = await Competition.create({ name: '临时接口验证赛', rulesDescription: '仅用于自动测试',
        trackConfig: { name: '本地测试' }, scoringRules: { design: 25, programming: 25, creativity: 25, taskCompletion: 25 },
        startTime: new Date(Date.now() - 60000), endTime: new Date(Date.now() + 3600000), status: 'running' })
      const id = String(comp._id)
      assert.equal((await send(`/competitions/${id}`)).status, 200)
      assert.equal((await send(`/competitions/${id}/submit`, { method: 'POST', token: owner.token, body: { projectId: post.projectId } })).status, 403)
      const registrations = await Promise.all([1, 2].map(() => send(`/competitions/${id}/register`, { method: 'POST', token: owner.token })))
      for (const registration of registrations) assert.equal(registration.status, 200)
      const submitted = await send(`/competitions/${id}/submit`, { method: 'POST', token: owner.token, body: { projectId: post.projectId } })
      assert.equal(submitted.status, 201)
      assert.equal((await send(`/competitions/${id}/submit`, { method: 'POST', token: owner.token, body: { projectId: post.projectId } })).body.submission.id, submitted.body.submission.id)
      assert.equal((await send(`/competitions/${id}/leaderboard`)).body.total, 0)
      await Competition.updateOne({ _id: comp._id }, { $set: { status: 'closed' } })
      assert.equal((await send(`/competitions/${id}/register`, { method: 'POST', token: other.token })).status, 409)
      assert.equal((await send('/competitions/invalid-id')).status, 404)
    })
    await t.test('making a published design private withdraws it from every public community entry', async (nested) => {
      assert.equal((await send(`/drone-designs/${design.id}`, { method: 'PATCH', token: owner.token, body: { visibility: 'private' } })).status, 200)
      for (const [path, readItems] of [
        ['/community/posts', body => body.items],
        ['/community/trending', body => body.items],
        [`/community/users/${owner.user.id}`, body => body.posts.items],
        ['/community/feed', body => body.items],
        [`/community/collections/${collection.id}`, body => body.collection.items],
      ]) await nested.test(path, async () => {
        const result = await send(path, { token: other.token })
        assert.equal(result.status, 200)
        assert.equal(readItems(result.body).some(item => item.id === post.id), false)
      })
      await nested.test('direct post and comments return 404', async () => {
        assert.equal((await send(`/community/posts/${post.id}`)).status, 404)
        assert.equal((await send(`/community/posts/${post.id}/comments`)).status, 404)
        assert.equal((await send(`/community/posts/${post.id}/like`, { method: 'POST', token: other.token })).status, 404)
      })
      await nested.test('legacy public project gallery respects canonical design visibility', async () => {
        const gallery = await send('/projects/public')
        assert.equal(gallery.status, 200)
        assert.equal(gallery.body.items.some(item => item.id === post.projectId), false)
      })
    })
    await t.test('cover upload is readable, survives reopening and is removed with its owned design', async () => {
      const upload = await fetch(`${base}/drone-designs/${design.id}/cover`, {
        method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'image/png' },
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9u0AAAAASUVORK5CYII=', 'base64'),
      })
      assert.equal(upload.status, 200)
      const { coverUrl } = await upload.json()
      const uploadedPath = new URL(coverUrl).pathname
      assert.equal((await send(`/drone-designs/${design.id}`, { token: owner.token })).body.design.coverUrl, coverUrl)
      const read = await fetch(new URL(uploadedPath, base))
      assert.equal(read.status, 200)
      assert.match(read.headers.get('content-type'), /^image\/png/)
      assert.equal((await send(`/drone-designs/${design.id}`, { method: 'DELETE', token: owner.token })).status, 200)
      assert.equal((await fetch(new URL(uploadedPath, base))).status, 404)
      assert.equal((await send(`/custom-parts/${part.id}`, { method: 'DELETE', token: owner.token })).status, 200)
    })
    await t.test('admin read-only routes require both an administrator and the configured access key', async () => {
      assert.equal((await send('/admin/users')).status, 401)
      assert.equal((await send('/admin/users', { token: owner.token, adminKey: 'local-api-test-admin-key' })).status, 403)
      // Only this temporary test account is promoted in the generated disposable database.
      await User.updateOne({ _id: other.user.id }, { $set: { role: 'admin' } })
      assert.equal((await send('/admin/users', { token: other.token })).status, 401)
      const users = await send('/admin/users?role=student', { token: other.token, adminKey: 'local-api-test-admin-key' })
      assert.equal(users.status, 200)
      assert.equal(users.body.data.total, 1)
      assert.equal(users.body.data.items[0].id, owner.user.id)
      assert.equal(users.body.data.items[0].email, undefined)
      assert.equal((await send('/admin/overview', { token: other.token, adminKey: 'local-api-test-admin-key' })).status, 200)
      assert.equal((await send('/admin/users?q=%5B', { token: other.token, adminKey: 'local-api-test-admin-key' })).status, 200)
    })
    await t.test('password change revokes the old session and the new session remains usable', async () => {
      const changed = await send('/auth/change-password', { method: 'POST', token: owner.token, body: { oldPassword: 'password-123', newPassword: 'password-456' } })
      assert.equal(changed.status, 200)
      assert.equal((await send('/auth/me', { token: owner.token })).status, 401)
      assert.equal((await send('/auth/me', { token: changed.body.token })).status, 200)
      assert.equal((await send('/auth/login', { method: 'POST', body: { email: 'owner@example.com', password: 'password-123' } })).status, 401)
      assert.equal((await send('/auth/login', { method: 'POST', body: { email: 'owner@example.com', password: 'password-456' } })).status, 200)
    })
  } finally {
    server.close()
    await once(server, 'close')
    assert.equal(mongoose.connection.name, dbName)
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    await fs.rm(uploadDir, { recursive: true, force: true })
  }
})
