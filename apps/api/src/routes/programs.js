const express = require('express')
const { authenticate } = require('../middleware/auth')
const Program = require('../models/Program')
const { withStringId } = require('../lib/documentResponse')
const { recordProgramSaved } = require('../lib/analytics')
// IR 后端校验（RFC-014 W9）：从 @fwx/shared 的 CJS 构建消费，单一事实来源，不重复定义
const { CommandProgramSchema } = require('@fwx/shared/runtime-cjs')

const router = express.Router()
router.use(authenticate)

/** GET /api/programs — list user's programs（RFC-014 W3：统一分页信封） */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20))

    const filter = { ownerId: req.userId }
    const total = await Program.countDocuments(filter)
    const items = await Program.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()

    res.json({ items: items.map(withStringId), total, page, pageSize })
  } catch (error) {
    console.error('[programs] List error:', error)
    res.status(500).json({ error: '获取程序列表失败' })
  }
})

/** GET /api/programs/:id */
router.get('/:id', async (req, res) => {
  try {
    const program = await Program.findOne({ _id: req.params.id, ownerId: req.userId }).lean()
    if (!program) return res.status(404).json({ error: '程序不存在' })
    res.json({ program: withStringId(program) })
  } catch (error) {
    console.error('[programs] Get error:', error)
    res.status(500).json({ error: '获取程序失败' })
  }
})

/** POST /api/programs — create (stores blocklyXml + compiled IR) */
router.post('/', async (req, res) => {
  try {
    const { name, blocklyXml, commandProgram } = req.body
    if (!name) return res.status(400).json({ error: '程序名称不能为空' })
    if (!blocklyXml) return res.status(400).json({ error: '缺少 blocklyXml' })
    if (!commandProgram) return res.status(400).json({ error: '缺少 commandProgram' })
    const parsed = CommandProgramSchema.safeParse(commandProgram)
    if (!parsed.success) {
      return res.status(400).json({ error: '指令协议(IR)格式非法', details: parsed.error.issues.slice(0, 3) })
    }

    const program = new Program({ ownerId: req.userId, name, blocklyXml, commandProgram })
    await program.save()
    recordProgramSaved(req, program)
    res.status(201).json({ program: withStringId(program) })
  } catch (error) {
    console.error('[programs] Create error:', error)
    res.status(500).json({ error: '创建程序失败' })
  }
})

/** PATCH /api/programs/:id */
router.patch('/:id', async (req, res) => {
  try {
    const allowedFields = ['name', 'blocklyXml', 'commandProgram']
    const updates = {}
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }
    if (updates.commandProgram !== undefined) {
      const parsed = CommandProgramSchema.safeParse(updates.commandProgram)
      if (!parsed.success) {
        return res.status(400).json({ error: '指令协议(IR)格式非法', details: parsed.error.issues.slice(0, 3) })
      }
    }

    const program = await Program.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.userId },
      updates,
      { new: true, runValidators: true },
    ).lean()

    if (!program) return res.status(404).json({ error: '程序不存在' })
    recordProgramSaved(req, program)
    res.json({ program: withStringId(program) })
  } catch (error) {
    console.error('[programs] Update error:', error)
    res.status(500).json({ error: '更新程序失败' })
  }
})

/** DELETE /api/programs/:id */
router.delete('/:id', async (req, res) => {
  try {
    const result = await Program.deleteOne({ _id: req.params.id, ownerId: req.userId })
    if (result.deletedCount === 0) return res.status(404).json({ error: '程序不存在' })
    res.json({ message: '已删除' })
  } catch (error) {
    console.error('[programs] Delete error:', error)
    res.status(500).json({ error: '删除程序失败' })
  }
})

module.exports = router
