const express = require('express')
const { recordBusinessEvent } = require('../lib/analytics')
const mongoose = require('mongoose')
const { authenticate, optionalAuthenticate } = require('../middleware/auth')
const CommunityPost = require('../models/CommunityPost')
const Project = require('../models/Project')
const Reaction = require('../models/Reaction')
const DroneDesign = require('../models/DroneDesign')
const { publicPostStages, countPublicPosts, isPublicPost } = require('../lib/communityVisibility')
const { isInvalidDocument } = require('../lib/persistenceErrors')

const router = express.Router()

const TARGET = 'communityPost'

/**
 * 找-或-建「桥接 Project」（作品库合一 · RFC-024 方案 A）。
 * 作品库合一后 DroneDesign 是「作品」的唯一真相源；Project 退化为 CommunityPost 的指针。
 * 发布一个 design 时，确保存在一条指向它的 Project（幂等：按 ownerId+designId 定位），
 * 其展示字段镜像自 design（可见性 / 复用等权威仍在 design，此处只是发布链路需要一个 projectId）。
 */
async function ensureBridgeProject(design, ownerId) {
  const mirror = {
    name: design.name,
    coverUrl: design.coverUrl || design.thumbnailUrl,
    visibility: design.visibility || 'private',
    reusable: design.reusable === true,
  }
  if (design.programId) mirror.programId = design.programId
  return Project.findOneAndUpdate(
    { ownerId, designId: design._id },
    { $set: mirror, $setOnInsert: { ownerId, designId: design._id } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).select('+forkFromPostId')
}

// 作者公开信息（只暴露展示用字段）
function authorDTO(u) {
  if (!u) return null
  return {
    id: String(u._id),
    username: u.username,
    avatar: u.profile?.avatar || u.avatar || undefined,
  }
}

// 列表卡片 DTO（关联 Project 只取封面/引用，不复制内容）
// 形状对齐集成清单 §8 PostCard：含 authorId + favoriteCount，供 A 瀑布流 / 合集 / 作者页统一消费。
function postCardDTO(row, likedSet) {
  return {
    id: String(row._id),
    title: row.title,
    description: row.description || '',
    authorId: String(row.authorId),
    author: authorDTO(row.author),
    projectId: String(row.projectId),
    coverUrl: row.project?.coverUrl || undefined,
    forkFromId: row.forkFromId ? String(row.forkFromId) : undefined,
    likeCount: row.likeCount || 0,
    favoriteCount: row.favoriteCount || 0,
    likedByMe: likedSet ? likedSet.has(String(row._id)) : false,
    createdAt: row.createdAt,
  }
}

// 统计当前用户对一批 post 的点赞集合（一次查询，非 N+1）
async function likedSetFor(userId, ids) {
  if (!userId || !ids.length) return new Set()
  const mine = await Reaction.find({
    userId,
    targetType: TARGET,
    type: 'like',
    targetId: { $in: ids },
  }).distinct('targetId')
  return new Set(mine.map(String))
}

/**
 * GET /api/community/posts — 社区作品分页列表（公域，可选鉴权）。
 * query: page, pageSize, sort=new|hot, q
 * 返回 Paginated<PostCard>：{ items, total, page, pageSize }
 * 点赞数用 Reaction 聚合（列表级一次聚合，避免逐条 countDocuments 的 N+1）。
 */
router.get('/posts', optionalAuthenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20))
    const sort = req.query.sort === 'hot' ? 'hot' : 'new'
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
    const match = q ? { title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}

    const total = await countPublicPosts(match)

    const rows = await CommunityPost.aggregate([
      { $match: match },
      ...publicPostStages(),
      // 每条 post 的点赞数（lookup reactions 计数）
      {
        $lookup: {
          from: 'reactions',
          let: { pid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$targetType', TARGET] },
                    { $eq: ['$targetId', '$$pid'] },
                    { $eq: ['$type', 'like'] },
                  ],
                },
              },
            },
            { $count: 'c' },
          ],
          as: '_la',
        },
      },
      { $addFields: { likeCount: { $ifNull: [{ $arrayElemAt: ['$_la.c', 0] }, 0] } } },
      { $sort: sort === 'hot' ? { likeCount: -1, createdAt: -1 } : { createdAt: -1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      { $lookup: { from: 'users', localField: 'authorId', foreignField: '_id', as: 'author' } },
      { $addFields: { author: { $arrayElemAt: ['$author', 0] } } },
      { $lookup: { from: 'projects', localField: 'projectId', foreignField: '_id', as: 'project' } },
      { $addFields: { project: { $arrayElemAt: ['$project', 0] } } },
      // 收藏数（favorite Reaction 聚合，与点赞同口径；供卡片展示）
      {
        $lookup: {
          from: 'reactions',
          let: { pid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$targetType', TARGET] },
                    { $eq: ['$targetId', '$$pid'] },
                    { $eq: ['$type', 'favorite'] },
                  ],
                },
              },
            },
            { $count: 'c' },
          ],
          as: '_fa',
        },
      },
      { $addFields: { favoriteCount: { $ifNull: [{ $arrayElemAt: ['$_fa.c', 0] }, 0] } } },
      {
        $project: {
          title: 1, description: 1, authorId: 1, projectId: 1, forkFromId: 1, createdAt: 1,
          likeCount: 1, favoriteCount: 1,
          'author._id': 1, 'author.username': 1, 'author.avatar': 1, 'author.profile.avatar': 1,
          'project.coverUrl': 1,
        },
      },
    ])

    const likedSet = await likedSetFor(req.userId, rows.map((r) => r._id))
    const items = rows.map((r) => postCardDTO(r, likedSet))
    res.json({ items, total, page, pageSize })
  } catch (error) {
    console.error('[community] List error:', error)
    res.status(500).json({ error: '获取社区作品失败' })
  }
})

/**
 * GET /api/community/posts/:id — 作品详情（公域，可选鉴权）。
 * 聚合 post + 作者 + 关联 Project（封面/设计/程序引用）+ 点赞数/likedByMe + fork 血缘。
 */
router.get('/posts/:id', optionalAuthenticate, async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: '作品不存在' })
    }
    if (!await isPublicPost(id)) return res.status(404).json({ error: '作品不存在' })

    const post = await CommunityPost.findById(id)
      .populate('authorId', 'username avatar profile.avatar')
      .populate('projectId', 'name coverUrl designId programId visibility reusable ownerId')
      .lean()
    if (!post) return res.status(404).json({ error: '作品不存在' })

    const likeCount = await Reaction.countDocuments({ targetType: TARGET, targetId: id, type: 'like' })
    const favoriteCount = await Reaction.countDocuments({ targetType: TARGET, targetId: id, type: 'favorite' })
    let likedByMe = false
    if (req.userId) {
      likedByMe = !!(await Reaction.exists({
        userId: req.userId, targetType: TARGET, targetId: id, type: 'like',
      }))
    }

    // 设计零件（供完整作品页 3D 预览 + 零件清单 BOM 复用现有组件渲染）。
    // 作品库合一后：可见性 / 复用权威在 DroneDesign，先按 (designId, 作者本人) 取设计，再以 design.visibility 判公开。
    // 属主校验（Codex）：设计必须确属作品作者本人，避免有人把他人 designId 绑到自己公开作品、借此套出非自有零件。
    let dd = null
    if (post.projectId && post.projectId.designId) {
      dd = await DroneDesign.findOne({
        _id: post.projectId.designId,
        ownerId: post.projectId.ownerId,
      }).lean()
    }
    // 权威可见性 / 可复用：优先取 design；无关联 design 的存量作品回退 Project 自身字段。
    const isPublic = dd ? dd.visibility === 'public' : post.projectId?.visibility === 'public'
    const authoritativeReusable = dd ? dd.reusable === true : post.projectId?.reusable === true

    // 仅 public 作品、且有设计时取零件；存量/示例作品无设计则为 null，前端回退封面图。
    let design = null
    if (dd && isPublic) {
      const raw =
        dd.designData && Array.isArray(dd.designData.parts)
          ? dd.designData.parts
          : Array.isArray(dd.parts)
            ? dd.parts
            : []
      // 只返回结构合法的零件（Codex）：挡住 [null] / 脏数据导致前端 3D 组件崩溃（会触发全局边界 localStorage.clear）。
      const parts = raw.filter(
        (p) => p && typeof p === 'object' && typeof p.partId === 'string' && Array.isArray(p.position) && p.position.length === 3,
      )
      design = { parts }
    }

    // fork 血缘（只读展示；fork 写入口属 P1）
    let forkFrom = null
    if (post.forkFromId && await isPublicPost(post.forkFromId)) {
      const src = await CommunityPost.findById(post.forkFromId)
        .populate('authorId', 'username')
        .lean()
      if (src) {
        forkFrom = {
          postId: String(src._id),
          title: src.title,
          authorName: src.authorId?.username,
        }
      }
    }

    res.json({
      post: {
        id: String(post._id),
        title: post.title,
        description: post.description || '',
        author: authorDTO(post.authorId),
        project: post.projectId
          ? {
              id: String(post.projectId._id),
              name: post.projectId.name,
              coverUrl: post.projectId.coverUrl,
              designId: post.projectId.designId ? String(post.projectId.designId) : undefined,
              programId: post.projectId.programId ? String(post.projectId.programId) : undefined,
              // 归一化：可复用权威取 design（合一后），无 design 的存量项目回退项目字段、缺字段按不可复用处理（Codex 评审）
              reusable: authoritativeReusable,
            }
          : null,
        design,
        forkFrom,
        likeCount,
        favoriteCount,
        likedByMe,
        createdAt: post.createdAt,
      },
    })
  } catch (error) {
    console.error('[community] Detail error:', error)
    res.status(500).json({ error: '获取作品详情失败' })
  }
})

/**
 * POST /api/community/posts — 发布作品到社区（需鉴权）。
 * body: { projectId, title?, description? }
 * 强约束：project 必须属于本人且 visibility=public（不信前端先 patch）。
 * 幂等：同一作者同一 project 只产生一条（find-or-create + 唯一索引兜底并发）。
 */
router.post('/posts', authenticate, async (req, res) => {
  try {
    const { designId, projectId, title, description, reusable } = req.body
    if ((title !== undefined && (typeof title !== 'string' || title.trim().length > 120))
      || (description !== undefined && (typeof description !== 'string' || description.trim().length > 2000))) {
      return res.status(400).json({ error: '作品标题或描述格式无效或过长' })
    }

    // 作品库合一（RFC-024 方案 A）：新链路走 designId（作品=设计），可见性 / 复用权威在 design；
    // 兼容旧链路仍接受 projectId。无论哪条，最终都落到一个「桥接 Project」供 CommunityPost 指向。
    let project
    if (designId && mongoose.Types.ObjectId.isValid(designId)) {
      const design = await DroneDesign.findOne({ _id: designId, ownerId: req.userId })
      if (!design) return res.status(404).json({ error: '作品不存在或不属于你' })
      // 开源复用开关：随发布写入 design（design 为权威）
      if (typeof reusable === 'boolean' && design.reusable !== reusable) {
        design.reusable = reusable
        await design.save()
      }
      if (design.visibility !== 'public') {
        return res.status(400).json({ error: '请先将作品设为公开，再发布到社区' })
      }
      project = await ensureBridgeProject(design, req.userId)
    } else if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
      project = await Project.findOne({ _id: projectId, ownerId: req.userId }).select('+forkFromPostId')
      if (!project) return res.status(404).json({ error: '项目不存在或不属于你' })
      // 可见性 / 复用权威优先取关联 design；无 design 的存量项目回退项目自身字段。
      const design = project.designId
        ? await DroneDesign.findOne({ _id: project.designId, ownerId: req.userId })
        : null
      if (typeof reusable === 'boolean') {
        if (design) {
          if (design.reusable !== reusable) { design.reusable = reusable; await design.save() }
        } else if (project.reusable !== reusable) {
          project.reusable = reusable; await project.save()
        }
      }
      const authoritativeVisibility = design ? design.visibility : project.visibility
      if (authoritativeVisibility !== 'public') {
        return res.status(400).json({ error: '请先将作品设为公开，再发布到社区' })
      }
    } else {
      return res.status(400).json({ error: '缺少有效的 designId 或 projectId' })
    }

    const effectiveProjectId = project._id

    // fork 血缘只能来自服务端 fork 路由写入的 Project.forkFromPostId；客户端来源参数一律忽略。
    let forkFromId
    if (project.forkFromPostId) {
      const src = await CommunityPost.exists({ _id: project.forkFromPostId })
      if (src) forkFromId = project.forkFromPostId
    }

    let post = await CommunityPost.findOne({ authorId: req.userId, projectId: effectiveProjectId })
    let created = false
    if (!post) {
      try {
        post = await CommunityPost.create({
          authorId: req.userId,
          projectId: effectiveProjectId,
          title: (title && title.trim()) || project.name,
          description: (description && description.trim()) || '',
          ...(forkFromId ? { forkFromId } : {}),
        })
        created = true
      } catch (e) {
        // 并发双提交：唯一索引冲突 → 取既有
        if (e && e.code === 11000) {
          post = await CommunityPost.findOne({ authorId: req.userId, projectId: effectiveProjectId })
        } else {
          throw e
        }
      }
    }

    if (created) recordBusinessEvent(req, 'community_published', { postId: String(post._id) }, { key: `publish:${post._id}`, route: 'community' })
    res.status(created ? 201 : 200).json({
      post: { id: String(post._id), projectId: String(post.projectId), title: post.title },
      alreadyPublished: !created,
    })
  } catch (error) {
    if (isInvalidDocument(error)) return res.status(400).json({ error: '作品发布内容格式无效' })
    console.error('[community] Publish error:', error)
    res.status(500).json({ error: '发布到社区失败' })
  }
})

/**
 * POST /api/community/posts/:id/like — 点赞（需鉴权，幂等 upsert）。
 * DELETE 同路径 — 取消赞（幂等）。
 * 返回当前 { likeCount, likedByMe }。
 */
router.post('/posts/:id/like', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: '作品不存在' })
    const exists = await isPublicPost(id)
    if (!exists) return res.status(404).json({ error: '作品不存在' })

    await Reaction.updateOne(
      { userId: req.userId, targetType: TARGET, targetId: id, type: 'like' },
      { $setOnInsert: { userId: req.userId, targetType: TARGET, targetId: id, type: 'like' } },
      { upsert: true },
    )
    const likeCount = await Reaction.countDocuments({ targetType: TARGET, targetId: id, type: 'like' })
    res.json({ likeCount, likedByMe: true })
  } catch (error) {
    // 并发重复点赞触发唯一索引 → 视作已点赞
    if (error && error.code === 11000) {
      const likeCount = await Reaction.countDocuments({
        targetType: TARGET, targetId: req.params.id, type: 'like',
      })
      return res.json({ likeCount, likedByMe: true })
    }
    console.error('[community] Like error:', error)
    res.status(500).json({ error: '点赞失败' })
  }
})

router.delete('/posts/:id/like', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: '作品不存在' })

    await Reaction.deleteOne({ userId: req.userId, targetType: TARGET, targetId: id, type: 'like' })
    const likeCount = await Reaction.countDocuments({ targetType: TARGET, targetId: id, type: 'like' })
    res.json({ likeCount, likedByMe: false })
  } catch (error) {
    console.error('[community] Unlike error:', error)
    res.status(500).json({ error: '取消点赞失败' })
  }
})

module.exports = router
