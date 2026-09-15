// 用户零件（UserPart v2 / RFC-024 §4.3）控制器。
// - 鉴权后所有查询强制带 ownerId: req.userId，杜绝越权读/改别人的零件。
// - 入参校验复用 @fwx/parts-schema 冻结的 v2 zod 契约（与前端类型同源，不另写一套）。
// - 增/改/删经 lib/audit 落痕；信封对齐 RFC-014 的 { success, data }。
// 板厚锁死 2mm 已由契约（geometry.thicknessMm = literal 2）保证，controller 不再单独核对材料表。
const mongoose = require('mongoose')
const { recordPartSaved } = require('../lib/analytics')
const CustomPart = require('../models/CustomPart')
const { writeAudit } = require('../lib/audit')
// 单一事实来源：从 @fwx/parts-schema 的 CJS 构建消费 v2 契约，不在 api 内重复定义
const { UserPartDefSchema, UserPartCategoryEnum } = require('@fwx/parts-schema/runtime-cjs')
const { svgGeometryToPart2D, validateJointGuides } = require('@fwx/geometry/runtime-cjs')

// Mongoose 文档（lean 或实体）→ 前端契约 UserPartDTO。形状 = @fwx/parts-schema 的 UserPart（v2）。
function toUserPartDTO(doc) {
  const toIso = (d) => (d instanceof Date ? d : new Date(d)).toISOString()
  const g = doc.geometry || {}
  const m = doc.manufacturability
  const rv = doc.review
  return {
    id: String(doc._id),
    ownerId: String(doc.ownerId),
    name: doc.name,
    category: doc.category,
    geometry: {
      contour: g.contour,
      holes: g.holes || [],
      thicknessMm: g.thicknessMm,
      bboxMm: g.bboxMm ? { w: g.bboxMm.w, h: g.bboxMm.h } : undefined,
    },
    sockets: (doc.sockets || []).map((s) => ({ type: s.type, x: s.x, y: s.y, rotation: s.rotation })),
    ...(doc.jointGuides === undefined ? {} : {
      jointGuides: doc.jointGuides.map((guide) => ({
        id: guide.id, kind: guide.kind, x: guide.x, y: guide.y,
        lengthMm: guide.lengthMm, axis: guide.axis, entry: guide.entry,
      })),
    }),
    manufacturability: m
      ? { closed: m.closed, minFeatureMm: m.minFeatureMm, withinBoard: m.withinBoard, passed: m.passed }
      : undefined,
    flightImpact: { massG: (doc.flightImpact && doc.flightImpact.massG) || 0 },
    assets: { thumbnailUrl: doc.assets && doc.assets.thumbnailUrl, dxfUrl: doc.assets && doc.assets.dxfUrl },
    status: doc.status,
    review: rv
      ? {
          reviewerId: rv.reviewerId ? String(rv.reviewerId) : undefined,
          reason: rv.reason,
          at: rv.at ? toIso(rv.at) : undefined,
        }
      : undefined,
    origin: doc.origin && doc.origin.forkedFrom ? { forkedFrom: String(doc.origin.forkedFrom) } : undefined,
    stats: { uses: (doc.stats && doc.stats.uses) || 0, likes: (doc.stats && doc.stats.likes) || 0 },
    version: doc.version,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  }
}

// 校验请求体 → 返回 { ok:true, data } 或 { ok:false, message, issues }。
// category 限五种结构类、geometry 闭合轮廓 + 厚度锁 2mm、sockets/manufacturability/flightImpact 合法 —— 全在 v2 zod 契约里。
function validateDef(body, preservedJointGuides) {
  const parsed = UserPartDefSchema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, message: '零件定义不合法（请检查类别是否为结构件、轮廓/厚度/卡扣是否合法）', issues: parsed.error.issues.slice(0, 3) }
  }
  let verifiedGeometry = null
  try {
    verifiedGeometry = svgGeometryToPart2D(parsed.data.geometry)
  } catch (_) {
    // 解析器异常也按非法输入处理，不能让未复核几何进入持久层。
  }
  if (!verifiedGeometry) {
    return { ok: false, message: '零件几何不合法（轮廓和孔必须闭合、无自交且孔位于轮廓内）' }
  }

  const guides = parsed.data.jointGuides === undefined ? preservedJointGuides : parsed.data.jointGuides
  if (guides !== undefined) {
    if (parsed.data.jointGuides === undefined && !UserPartDefSchema.safeParse({ ...parsed.data, jointGuides: guides }).success) {
      return { ok: false, message: '原插槽指引格式不合法，请重新确认插槽指引' }
    }
    const checked = validateJointGuides(verifiedGeometry, guides)
    if (!checked.ok) return { ok: false, message: '插槽指引与零件几何不一致，请检查位置和插入方向' }
  }

  // 闭合性已由服务端复核；最小筋宽和板材边界尚未实现服务端复核，不能信任客户端的通过结论。
  return {
    ok: true,
    data: {
      ...parsed.data,
      manufacturability: {
        ...parsed.data.manufacturability,
        closed: true,
        passed: false,
      },
    },
  }
}

// GET /api/custom-parts — 列我的自制件（分页，复用 RFC-014 Paginated/PaginationQuery）。
exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20))

    const filter = { ownerId: req.userId }
    if (req.query.category !== undefined) {
      if (!UserPartCategoryEnum.safeParse(req.query.category).success) return res.status(400).json({ error: '零件类别无效' })
      filter.category = req.query.category === 'joint' ? { $in: ['joint', 'deco'] } : req.query.category
    }
    const total = await CustomPart.countDocuments(filter)
    const docs = await CustomPart.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()

    res.json({ success: true, data: { items: docs.map(toUserPartDTO), total, page, pageSize } })
  } catch (error) {
    console.error('[custom-parts] List error:', error)
    res.status(500).json({ error: '获取自制零件列表失败' })
  }
}

// GET /api/custom-parts/:id — 取单个（仅本人）。
exports.get = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: '零件不存在' })
    }
    const doc = await CustomPart.findOne({ _id: req.params.id, ownerId: req.userId }).lean()
    if (!doc) return res.status(404).json({ error: '零件不存在' })
    res.json({ success: true, data: toUserPartDTO(doc) })
  } catch (error) {
    console.error('[custom-parts] Get error:', error)
    res.status(500).json({ error: '获取自制零件失败' })
  }
}

// POST /api/custom-parts — 创建。
exports.create = async (req, res) => {
  const v = validateDef(req.body)
  if (!v.ok) return res.status(400).json({ error: v.message, details: v.issues })
  try {
    const doc = await CustomPart.create({ ownerId: req.userId, ...v.data })
    const dto = toUserPartDTO(doc.toObject())

    await writeAudit({
      actor: req.userId,
      action: 'custom-parts:create',
      target: `custom-part#${dto.id}`,
      diffSummary: `创建自制零件「${dto.name}」`,
    })

    recordPartSaved(req, dto)
    res.status(201).json({ success: true, data: dto })
  } catch (error) {
    console.error('[custom-parts] Create error:', error)
    res.status(500).json({ error: '创建自制零件失败' })
  }
}

// PUT /api/custom-parts/:id — 更新（仅本人），幂等 upsert 语义：
// 同一 id 重复提交不产生重复件（§3.3 幂等优先，抗弱网重试）。
exports.update = async (req, res) => {
  // 校验放在 try 外：纯函数不抛错，且让 v 在 catch 的 E11000 重试分支里可用。
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: '无效的零件 id' })
  }
  const v = validateDef(req.body)
  if (!v.ok) return res.status(400).json({ error: v.message, details: v.issues })

  // An older client omitting guides must not erase them or move the geometry
  // underneath unverified guides. Check the same revision that we later update.
  const writeUpdate = async (allowUpsert) => {
    const filter = { _id: req.params.id, ownerId: req.userId }
    let upsert = allowUpsert
    let guarded = false
    if (v.data.jointGuides === undefined) {
      const existing = await CustomPart.findOne(filter).select('jointGuides updatedAt').lean()
      if (!existing && !allowUpsert) return { missing: true }
      if (existing) {
        const checked = validateDef(req.body, existing.jointGuides)
        if (!checked.ok) return { invalid: checked }
        filter.updatedAt = existing.updatedAt
        // Date timestamps have millisecond precision; matching the guide array
        // also prevents two same-millisecond edits from bypassing this check.
        filter.jointGuides = existing.jointGuides === undefined ? { $exists: false } : existing.jointGuides
        upsert = false
        guarded = true
      }
    }
    const doc = await CustomPart.findOneAndUpdate(
      filter,
      { $set: { ownerId: req.userId, ...v.data } },
      { new: true, upsert, runValidators: true, setDefaultsOnInsert: true },
    ).lean()
    if (!doc) return guarded ? { conflict: true } : { missing: true }
    return { doc }
  }
  const sendWriteFailure = (result) => {
    if (result.invalid) return res.status(400).json({ error: result.invalid.message, details: result.invalid.issues })
    if (result.conflict) return res.status(409).json({ error: '零件已被更新，请刷新后重试保存' })
    return res.status(404).json({ error: '零件不存在' })
  }
  try {
    const result = await writeUpdate(true)
    if (!result.doc) return sendWriteFailure(result)

    const dto = toUserPartDTO(result.doc)
    await writeAudit({
      actor: req.userId,
      action: 'custom-parts:update',
      target: `custom-part#${dto.id}`,
      diffSummary: `更新自制零件「${dto.name}」`,
    })

    recordPartSaved(req, dto)
    res.json({ success: true, data: dto })
  } catch (error) {
    // 并发首次 PUT 撞 _id 唯一索引抛 E11000：输掉插入的一方改走「非 upsert 更新」，
    // 把自己的 $set 真正落库（而非返回别人刚插入的旧值，避免丢写）；非本人则 404。
    if (error && error.code === 11000) {
      try {
        const result = await writeUpdate(false)
        if (result.doc) {
          const dto = toUserPartDTO(result.doc)
          await writeAudit({
            actor: req.userId,
            action: 'custom-parts:update',
            target: `custom-part#${dto.id}`,
            diffSummary: `更新自制零件「${dto.name}」`,
          })
          recordPartSaved(req, dto)
          return res.json({ success: true, data: dto })
        }
        return sendWriteFailure(result)
      } catch (retryError) {
        console.error('[custom-parts] Update retry error:', retryError)
        return res.status(500).json({ error: '保存自制零件失败' })
      }
    }
    console.error('[custom-parts] Update error:', error)
    res.status(500).json({ error: '保存自制零件失败' })
  }
}

// DELETE /api/custom-parts/:id — 删除（仅本人）。
exports.remove = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: '零件不存在' })
    }
    const result = await CustomPart.deleteOne({ _id: req.params.id, ownerId: req.userId })
    if (result.deletedCount === 0) return res.status(404).json({ error: '零件不存在' })

    await writeAudit({
      actor: req.userId,
      action: 'custom-parts:delete',
      target: `custom-part#${req.params.id}`,
      diffSummary: `删除自制零件#${req.params.id}`,
    })

    res.json({ success: true, data: { id: req.params.id } })
  } catch (error) {
    console.error('[custom-parts] Delete error:', error)
    res.status(500).json({ error: '删除自制零件失败' })
  }
}

exports._validateDef = validateDef
