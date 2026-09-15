const { Schema, model } = require('mongoose')
const { UserPartCategoryEnum } = require('@fwx/parts-schema/runtime-cjs')

// 用户零件（@fwx/parts-schema 的 UserPart v2 / RFC-024 §4.3）。
// 契约唯一事实来源在 @fwx/parts-schema，此处只做持久化落地，不在 api 内另立类型。
// 模型历史注册名 CustomPart、集合 customparts 保持不改名；按根 AGENTS.md，集合改名必须先有迁移、回滚和明确授权。
//    仅字段对齐 v2。存的是参数化 2D 定义（SVG 轮廓 + 孔 + 固定 2mm 厚 + 卡扣印章），不是 3D 文件。
// 坐标单位 mm；category 由 @fwx/parts-schema 约束，不含 MOTOR/PROP。

const BBox = new Schema({
  w: { type: Number, required: true, min: 0 },
  h: { type: Number, required: true, min: 0 },
}, { _id: false })

const Geometry = new Schema({
  contour:     { type: String, required: true },              // SVG path d（外轮廓，封闭）
  holes:       { type: [String], default: [] },               // SVG path d[]（内孔镂空）
  thicknessMm: { type: Number, required: true, enum: [2], default: 2 }, // 锁死 2mm 单一板材
  bboxMm:      { type: BBox, required: true },
}, { _id: false })

// 卡扣印章实例：官方标准图章落在轮廓上的绝对坐标 + 旋转（度）。type 与官方 SnapPoint.type 同一套。
const Socket = new Schema({
  type:     { type: String, enum: ['arm-mount', 'guard-mount', 'deco-mount', 'motor-mount'], required: true },
  x:        { type: Number, required: true },
  y:        { type: Number, required: true },
  rotation: { type: Number, required: true }, // 度
}, { _id: false })

// Slot intent; assembly independently verifies the owned revision, contour and paired endpoints.
const JointGuide = new Schema({
  id:       { type: String, required: true, trim: true, maxlength: 80, match: /^[A-Za-z0-9_-]+$/ },
  kind:     { type: String, required: true, enum: ['edge-slot', 'through-slot'] },
  x:        { type: Number, required: true, min: -2000, max: 2000 },
  y:        { type: Number, required: true, min: -2000, max: 2000 },
  lengthMm: { type: Number, required: true, min: 2, max: 2000 },
  axis:     { type: String, required: true, enum: ['x', 'y'] },
  entry:    { type: String, required: true, enum: ['start', 'end', 'front', 'back'] },
}, { _id: false })

const Manufacturability = new Schema({
  closed:       { type: Boolean, required: true },
  minFeatureMm: { type: Number, required: true, min: 0 },
  withinBoard:  { type: Boolean, required: true },
  passed:       { type: Boolean, required: true },
}, { _id: false })

const Review = new Schema({
  reviewerId: { type: Schema.Types.ObjectId, ref: 'User' },
  reason:     { type: String },
  at:         { type: Date },
}, { _id: false })

const CustomPartSchema = new Schema({
  ownerId:  { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:     { type: String, required: true, maxlength: 40 },
  // 结构类别直接复用共享契约；包含主板，不含 MOTOR/PROP。
  category: { type: String, enum: UserPartCategoryEnum.options, required: true },
  geometry: { type: Geometry, required: true },
  sockets:  { type: [Socket], default: [] },
  // Omission is kept distinct from an explicit [] for older records and clients.
  jointGuides: { type: [JointGuide], default: undefined },
  // 可制造性自检（§4.4 五项）。草稿阶段可缺，故不 required。
  manufacturability: { type: Manufacturability },
  // 对起飞检查的影响：面积×厚度×密度自动算出的重量（g）。
  flightImpact: {
    massG: { type: Number, min: 0, default: 0 },
  },
  // 生成资产 URL（缩略图 / DXF）。GLB 不落盘，运行时挤出。
  assets: {
    thumbnailUrl: { type: String },
    dxfUrl:       { type: String },
  },
  // 生命周期状态机（提交/审核动作 Phase 3 落地，此处只备好字段）。
  status: { type: String, enum: ['draft', 'private', 'pending', 'approved', 'rejected'], default: 'draft' },
  review: { type: Review },
  // remix 血缘：从哪个零件 fork 而来。
  origin: {
    forkedFrom: { type: Schema.Types.ObjectId, ref: 'CustomPart' },
  },
  // 复用/点赞统计。
  stats: {
    uses:  { type: Number, min: 0, default: 0 },
    likes: { type: Number, min: 0, default: 0 },
  },
  version: { type: Number, default: 1 },
}, { timestamps: true }) // createdAt/updatedAt 自动

CustomPartSchema.index({ ownerId: 1, updatedAt: -1 }) // 列“我的零件”按更新倒序

module.exports = model('CustomPart', CustomPartSchema)
