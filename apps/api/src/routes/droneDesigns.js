const express = require('express')
const mongoose = require('mongoose')
const { authenticate } = require('../middleware/auth')
const DroneDesign = require('../models/DroneDesign')
const User = require('../models/User')
const { putObject, bestEffortDeleteObject } = require('../lib/storage')
const { parseDesignPayload } = require('../lib/designSnapshot')
const { validateAssemblyPayload } = require('../lib/assemblyConnections')
const { validateProjectReferences } = require('../lib/projectReferences')
const { isInvalidDocument } = require('../lib/persistenceErrors')
const { recordDesignSaved } = require('../lib/analytics')

const router = express.Router()

function coverUploadLimit(req, res, next) {
  return req.app.locals.rateLimits.coverUpload(req, res, next)
}

function parseCoverBody(req, res, next) {
  return express.raw({
    type: ['image/png', 'image/webp', 'image/jpeg'],
    limit: req.app.locals.config.storage.maxCoverBytes,
  })(req, res, next)
}

/** 归一化：lean/toObject 的文档只有 _id，补一个字符串 id，供前端发布/封面按 id 调用（防 undefined id）。 */
const withId = (d) => (d && d._id ? { ...d, id: String(d._id) } : d)

// Only call after the database query has established this design's owner.
const coverPrefix = (design) => `covers/${String(design._id)}`

/**
 * GET /api/drone-designs/public
 * 公开作品画廊（作品库合一后取代 /api/projects/public）：匿名访客可读，
 * 必须放在 authenticate 之前以绕过 JWT。只返回 visibility === 'public' 的设计，
 * 且严格字段白名单——只出轻量展示字段，绝不泄露 ownerId / designData / parts 等。
 * 「能飞」徽章要靠服务端 @fwx/flight-check 复核，属 Phase 3，本期不带。
 */
router.get('/public', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20))

    const filter = { visibility: 'public' }
    const total = await DroneDesign.countDocuments(filter)
    const docs = await DroneDesign.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select('name coverUrl thumbnailUrl reuseCount ownerId updatedAt')
      .lean()

    // 批量解析作者展示名：一次查出涉及的 User，避免 N+1。
    const ownerIds = [...new Set(docs.map((d) => String(d.ownerId)))]
    const users = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } })
          .select('username profile.displayName')
          .lean()
      : []
    const nameById = new Map(
      users.map((u) => [String(u._id), (u.profile && u.profile.displayName) || u.username || 'FlightWoodX 用户']),
    )

    const items = docs.map((d) => ({
      id: String(d._id),
      name: d.name,
      coverUrl: d.coverUrl || d.thumbnailUrl,
      reuseCount: d.reuseCount || 0,
      updatedAt: d.updatedAt,
      authorDisplayName: nameById.get(String(d.ownerId)) || 'FlightWoodX 用户',
    }))

    res.json({ items, total, page, pageSize })
  } catch (error) {
    console.error('[drone-designs] Public list error:', error)
    res.status(500).json({ error: '获取公开作品列表失败' })
  }
})

// 其余 drone-design 路由都要鉴权
router.use(authenticate)

router.param('id', (req, res, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id)) return res.status(400).json({ error: '设计 id 无效' })
  return next()
})

/**
 * GET /api/drone-designs
 * List current user's drone designs (newest first)。
 * RFC-014 W3：统一分页信封 { items, total, page, pageSize }。
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20))

    const filter = { ownerId: req.userId }
    const total = await DroneDesign.countDocuments(filter)
    const items = await DroneDesign.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()

    res.json({ items: items.map(withId), total, page, pageSize })
  } catch (error) {
    console.error('[drone-designs] List error:', error)
    res.status(500).json({ error: '获取设计列表失败' })
  }
})

/**
 * GET /api/drone-designs/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const design = await DroneDesign.findOne({
      _id: req.params.id,
      ownerId: req.userId,
    }).lean()

    if (!design) {
      return res.status(404).json({ error: '设计不存在' })
    }

    res.json({ design: withId(design) })
  } catch (error) {
    console.error('[drone-designs] Get error:', error)
    res.status(500).json({ error: '获取设计失败' })
  }
})

/**
 * POST /api/drone-designs
 * Create a new drone design. Accepts the full parametric body params
 * and the parts list from the client-side design store.
 */
router.post('/', async (req, res) => {
  try {
    const { name, params, parts, weightG, status, glbUrl, thumbnailUrl, localId, designData,
      coverUrl, visibility, reusable, programId } = req.body

    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
      return res.status(400).json({ error: '设计名称不能为空' })
    }
    if (localId !== undefined && (typeof localId !== 'string' || !localId.trim() || localId.length > 120)) {
      return res.status(400).json({ error: 'localId 无效' })
    }
    const parsedPayload = parseDesignPayload({ designData, parts })
    if (!parsedPayload.ok) return res.status(400).json({ error: parsedPayload.error })
    const assemblyError = await validateAssemblyPayload(parsedPayload, req.userId)
    if (assemblyError) return res.status(400).json({ error: assemblyError })
    const referenceCheck = await validateProjectReferences({ programId }, req.userId)
    if (!referenceCheck.ok) return res.status(400).json({ error: referenceCheck.error })

    const design = new DroneDesign({
      ownerId: req.userId,
      name: name.trim(),
      params: params || undefined, // RFC-013：params 可选，新设计走 designData
      weightG: weightG || 0,
      status: status || 'draft',
      glbUrl,
      thumbnailUrl,
      // 作品库合一：展示 / 发布字段（缺省走 schema 默认 private / false）
      ...(coverUrl !== undefined ? { coverUrl } : {}),
      ...(visibility !== undefined ? { visibility } : {}),
      ...(reusable !== undefined ? { reusable } : {}),
      ...(programId !== undefined ? { programId } : {}),
    })

    // RFC-013 方案 B：前端 Design 完整快照（后端原样存取）
    if (designData !== undefined) {
      design.set('designData', parsedPayload.designData)
    }
    // Store parts array as a mixed field for flexibility（向后兼容）
    if (parts) {
      design.set('parts', parsedPayload.parts)
    }
    // Store localId so the client can map server ↔ local
    if (localId) {
      design.set('localId', localId)
    }

    await design.save()
    recordDesignSaved(req, design, true)
    res.status(201).json({ design: withId(design.toObject()) })
  } catch (error) {
    if (isInvalidDocument(error)) return res.status(400).json({ error: '设计字段格式无效' })
    if (error && error.code === 11000) return res.status(409).json({ error: '该作品已存在，请刷新后重试保存' })
    console.error('[drone-designs] Create error:', error)
    res.status(500).json({ error: '创建设计失败' })
  }
})

/**
 * PUT /api/drone-designs
 * 幂等 upsert：按 (ownerId, localId) 创建或更新（RFC-013）。
 * 前端无论保存多少次、是否重试，同一 localId 只对应一条记录 —— 抗重复、抗弱网重试。
 */
router.put('/', async (req, res) => {
  try {
    const { localId, name, designData, weightG, thumbnailUrl, status,
      coverUrl, visibility, reusable, programId } = req.body
    if (typeof localId !== 'string' || !localId.trim() || localId.length > 120) {
      return res.status(400).json({ error: '缺少或无效的 localId' })
    }
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
      return res.status(400).json({ error: '设计名称不能为空' })
    }
    const parsedPayload = parseDesignPayload({ designData })
    if (!parsedPayload.ok) return res.status(400).json({ error: parsedPayload.error })
    const assemblyError = await validateAssemblyPayload(parsedPayload, req.userId)
    if (assemblyError) return res.status(400).json({ error: assemblyError })
    const referenceCheck = await validateProjectReferences({ programId }, req.userId)
    if (!referenceCheck.ok) return res.status(400).json({ error: referenceCheck.error })

    const update = {
      ownerId: req.userId,
      localId: localId.trim(),
      name: name.trim(),
      designData: parsedPayload.designData ?? null,
      weightG: weightG ?? 0,
    }
    if (thumbnailUrl !== undefined) update.thumbnailUrl = thumbnailUrl
    if (status !== undefined) update.status = status
    // 展示 / 发布字段：仅在前端明确带上时才写 —— 自动保存（只发 name/designData/weightG）
    // 不会误清空封面 / 可见性 / 复用开关。首次插入时走 schema 默认（private / false）。
    if (coverUrl !== undefined) update.coverUrl = coverUrl
    if (visibility !== undefined) update.visibility = visibility
    if (reusable !== undefined) update.reusable = reusable
    if (programId !== undefined) update.programId = programId

    const result = await DroneDesign.findOneAndUpdate(
      { ownerId: req.userId, localId },
      { $set: update },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, includeResultMetadata: true },
    ).lean()
    const design = result.value
    recordDesignSaved(req, design, !result.lastErrorObject.updatedExisting)
    res.json({ design: withId(design) })
  } catch (error) {
    // 并发下唯一索引可能抛 E11000：再读一次返回既有记录，保持幂等
    if (error && error.code === 11000) {
      const existing = await DroneDesign.findOne({ ownerId: req.userId, localId: req.body.localId }).lean()
      if (existing) return res.json({ design: withId(existing) })
    }
    if (isInvalidDocument(error)) return res.status(400).json({ error: '设计字段格式无效' })
    console.error('[drone-designs] Upsert error:', error)
    res.status(500).json({ error: '保存设计失败' })
  }
})

/**
 * PATCH /api/drone-designs/:id
 * Update an existing drone design.
 */
router.patch('/:id', async (req, res) => {
  try {
    const allowedFields = ['name', 'params', 'parts', 'designData', 'weightG', 'status', 'glbUrl', 'thumbnailUrl',
      'coverUrl', 'visibility', 'reusable', 'programId']
    const updates = {}
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key]
      }
    }
    if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || !updates.name.trim() || updates.name.trim().length > 80) {
        return res.status(400).json({ error: '设计名称不能为空' })
      }
      updates.name = updates.name.trim()
    }
    const parsedPayload = parseDesignPayload(updates)
    if (!parsedPayload.ok) return res.status(400).json({ error: parsedPayload.error })
    const assemblyError = await validateAssemblyPayload(parsedPayload, req.userId)
    if (assemblyError) return res.status(400).json({ error: assemblyError })
    if (updates.designData !== undefined) updates.designData = parsedPayload.designData
    if (updates.parts !== undefined) updates.parts = parsedPayload.parts
    const referenceCheck = await validateProjectReferences({ programId: updates.programId }, req.userId)
    if (!referenceCheck.ok) return res.status(400).json({ error: referenceCheck.error })

    const design = await DroneDesign.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.userId },
      updates,
      { new: true, runValidators: true },
    ).lean()

    if (!design) {
      return res.status(404).json({ error: '设计不存在' })
    }

    recordDesignSaved(req, design)
    res.json({ design: withId(design) })
  } catch (error) {
    if (isInvalidDocument(error)) return res.status(400).json({ error: '设计字段格式无效' })
    console.error('[drone-designs] Update error:', error)
    res.status(500).json({ error: '更新设计失败' })
  }
})

/**
 * POST /api/drone-designs/:id/cover
 * 上传作品封面（前端把 3D 画面截图传上来）。用 express.raw 直接收图片二进制，
 * 避开 JSON body 体积限制，零额外依赖。存储后把 URL 写进 design.coverUrl。
 * （作品库合一后取代 POST /api/projects/:id/cover。）
 */
router.post(
  '/:id/cover',
  coverUploadLimit,
  parseCoverBody,
  async (req, res) => {
    let uploadedUrl = null
    let ownedPrefix = null
    try {
      if (!req.body || !req.body.length) {
        return res.status(400).json({ error: '未收到图片数据' })
      }
      const design = await DroneDesign.findOne({ _id: req.params.id, ownerId: req.userId })
      if (!design) return res.status(404).json({ error: '设计不存在' })

      const previousUrl = design.coverUrl
      const contentType = req.headers['content-type'] || 'image/png'
      ownedPrefix = coverPrefix(design)
      uploadedUrl = await putObject(ownedPrefix, req.body, contentType, req.app.locals.config)

      design.coverUrl = uploadedUrl
      await design.save()
      await bestEffortDeleteObject(previousUrl, req.app.locals.config, ownedPrefix)

      res.json({ coverUrl: uploadedUrl })
    } catch (error) {
      if (uploadedUrl) await bestEffortDeleteObject(uploadedUrl, req.app.locals.config, ownedPrefix)
      // Do not log SDK/database error objects: they may contain credentials or data.
      console.error('[drone-designs] Cover upload failed')
      if (error.status === 413) return res.status(413).json({ error: '上传内容过大' })
      res.status(500).json({ error: '封面上传失败' })
    }
  },
)

/**
 * DELETE /api/drone-designs/by-local/:localId
 * 按 localId 删除（与 PUT 的 upsert-by-localId 对称）。前端只持有 localId，删除作品时调它，
 * 避免"本地删了、服务器还在 → 下次同步又被拉回来复活"。幂等：本来就没有也算删成功。
 */
router.delete('/by-local/:localId', async (req, res) => {
  try {
    const design = await DroneDesign.findOneAndDelete({
      ownerId: req.userId,
      localId: req.params.localId,
    })
    if (design) await bestEffortDeleteObject(design.coverUrl, req.app.locals.config, coverPrefix(design))
    res.json({ message: '已删除' })
  } catch (error) {
    console.error('[drone-designs] Delete by localId error:', error)
    res.status(500).json({ error: '删除设计失败' })
  }
})

/**
 * DELETE /api/drone-designs/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const design = await DroneDesign.findOneAndDelete({
      _id: req.params.id,
      ownerId: req.userId,
    })

    if (!design) {
      return res.status(404).json({ error: '设计不存在' })
    }

    await bestEffortDeleteObject(design.coverUrl, req.app.locals.config, coverPrefix(design))

    res.json({ message: '已删除' })
  } catch (error) {
    console.error('[drone-designs] Delete error:', error)
    res.status(500).json({ error: '删除设计失败' })
  }
})

module.exports = router
