/**
 * @fwx/parts-schema
 * FlightWoodX 零件类型定义，前后端共享。
 * 详细规格见 docs/03-parts-system.md
 */
import { z } from 'zod';

// Physical part categories (determined by folder, not filename)
export const PartCategoryEnum = z.enum([
  'mainboard', 'landing', 'guard', 'joint', 'MOTOR', 'PROP',
]);
export type PartCategory = z.infer<typeof PartCategoryEnum>;

// Legacy aliases for backwards compatibility
export const CATEGORY_ALIASES: Record<string, PartCategory> = {
  HUB: 'mainboard', core: 'mainboard',
  ARM: 'landing', arm: 'landing',
  PLATE: 'guard', JOINT: 'guard', LAND: 'guard',
  DECO: 'joint', deco: 'joint',
};

export const SnapPointSchema = z.object({
  id: z.string().trim().min(1).max(80),
  position: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  normal: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  type: z.enum(['arm-mount', 'guard-mount', 'deco-mount', 'motor-mount']),
  mirrorOf: z.string().optional(),
});
export type SnapPoint = z.infer<typeof SnapPointSchema>;

export const PartSchema = z.object({
  partNumber: z.string().regex(/^FW-[A-Z]+-\d{3}$/),
  category: PartCategoryEnum,
  name: z.object({ zh: z.string(), en: z.string() }),
  description: z.object({ zh: z.string(), en: z.string() }),
  asset: z.object({
    glbPath: z.string(),
    thumbnailPath: z.string(),
    previewPath: z.string().optional(),
  }),
  geometry: z.object({
    boundingBox: z.object({
      min: z.tuple([z.number(), z.number(), z.number()]),
      max: z.tuple([z.number(), z.number(), z.number()]),
    }),
    volumeCm3: z.number().finite().nonnegative(),
    estimatedWeightG: z.number().finite().nonnegative(),
  }),
  snapPoints: z.array(SnapPointSchema),
  compatibility: z.object({
    requiresCategory: z.array(PartCategoryEnum).optional(),
    acceptsCategory: z.array(PartCategoryEnum).optional(),
    minQuantity: z.number().int().nonnegative().optional(),
    maxQuantity: z.number().int().positive().optional(),
    symmetryRequired: z.boolean().optional(),
  }),
  layer: z.enum(['single', 'double']).optional(),
  // RFC-024 §4.3：官方零件重量（g）与在 BOM/装配说明里的角色。可选以兼容存量 registry
  // （registry 现用 PartEntry.weightG / geometry.estimatedWeightG）；结构检查与导出用 massG。
  massG: z.number().nonnegative().optional(),
  boMRole: z.string().optional(),
  tags: z.array(z.string()),
  deprecated: z.boolean().optional(),
});
export type Part = z.infer<typeof PartSchema>;

// 当前内置 94 个展示零件使用的轻量 registry 形状。它与上面的完整可拼装 PartSchema
// 是不同成熟度的数据层，但仍必须有运行时校验，避免只靠 TypeScript interface。
export const PartRegistryEntrySchema = z.object({
  partNumber: z.string().regex(/^FW-[A-Z]+-\d{3}$/),
  id: z.string().trim().min(1).max(120),
  category: PartCategoryEnum,
  name: z.object({ zh: z.string().trim().min(1), en: z.string().trim().min(1) }).strict(),
  modelPath: z.string().regex(/^\/models\/[a-z0-9_-]+\/[a-z0-9_-]+\.glb$/i),
  thumbnailFile: z.string().regex(/^[a-z0-9_-]+\.(png|webp|jpe?g)$/i),
  weightG: z.number().finite().nonnegative().max(10_000),
  tags: z.array(z.string().trim().min(1).max(80)).max(50),
}).strict();
export type PartRegistryEntry = z.infer<typeof PartRegistryEntrySchema>;

// ===== 用户零件（UserPart v2）契约 — RFC-024 §4.3（冻结基线）=====
// 木质激光切割件天然是「2D 轮廓 + 固定厚度」。这份 zod 是前后端单一事实来源：
// 前端按此实时挤出 3D / 落库，后端按此存档与复核。存的是 JSON，不是 3D 文件。坐标单位 mm。
// 用户零件只允许结构件；MOTOR/PROP 不属于本契约。

// 用户零件类别：允许主板与原有四种结构件。独立枚举，与官方 6 类 PartCategoryEnum 解耦；
// deco 是独立用户类别（不走 DECO→joint 旧 alias）。
export const UserPartCategoryEnum = z.enum(['mainboard', 'guard', 'joint', 'deco', 'landing']);
export type UserPartCategory = z.infer<typeof UserPartCategoryEnum>;

// SVG path 的 d 字符串（可含曲线）。外轮廓与内孔都用它承载，取代旧的点多边形。
export const SvgPathDataSchema = z.string().trim().min(1).max(200_000);
export type SvgPathData = z.infer<typeof SvgPathDataSchema>;

// 卡扣印章类型：与官方 SnapPoint.type 同一套，保证用户件能对上官方卡扣兼容规则。
export const UserPartSocketTypeEnum = z.enum([
  'arm-mount', 'guard-mount', 'deco-mount', 'motor-mount',
]);
export type UserPartSocketType = z.infer<typeof UserPartSocketTypeEnum>;

// 卡扣印章实例：官方标准孔位/榫口图章，落在轮廓上的绝对坐标 + 旋转（度）。
// 取代旧 connectors 的「第几条边 + 边上 0..1」相对定位。
// 业务规则：≥1 个才可装配（在装配/提交时校验，非类型硬约束，草稿可为 0）。
export const UserPartSocketSchema = z.object({
  type: UserPartSocketTypeEnum,
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite(), // 度
});
export type UserPartSocket = z.infer<typeof UserPartSocketSchema>;

// 板厚锁死为 2mm 单一板材（自绘/上传一律 2mm）。字面量常量，非枚举。
export const USER_PART_THICKNESS_MM = 2 as const;

// 几何：外轮廓 + 内孔（镂空）+ 固定厚度 + 包围盒。
export const UserPartGeometrySchema = z.object({
  contour: SvgPathDataSchema,                       // 外轮廓（须封闭，封闭性由可制造性检查判定）
  holes: z.array(SvgPathDataSchema).max(100).default([]),    // 内孔镂空
  thicknessMm: z.literal(USER_PART_THICKNESS_MM),   // 锁死 2mm
  bboxMm: z.object({
    w: z.number().finite().positive().max(2_000),
    h: z.number().finite().positive().max(2_000),
  }),
});
export type UserPartGeometry = z.infer<typeof UserPartGeometrySchema>;

// 可制造性自检结果（§4.4 五项检查的落库位；确定性、浏览器端算，Phase 2 后端复核）。
export const ManufacturabilitySchema = z.object({
  closed: z.boolean(),                     // 轮廓封闭且无自交
  minFeatureMm: z.number().finite().nonnegative(),  // 实测最小筋宽
  withinBoard: z.boolean(),                // 尺寸在板材幅面内
  passed: z.boolean(),                     // 综合是否通过
}).superRefine((value, ctx) => {
  if (value.passed && (!value.closed || !value.withinBoard || value.minFeatureMm <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['passed'],
      message: '只有轮廓闭合、位于板材内且已测得最小特征时才能标记为通过',
    });
  }
});
export type Manufacturability = z.infer<typeof ManufacturabilitySchema>;

// 对结构统计的影响：由面积×厚度×材料密度自动算出的重量（g）。
export const FlightImpactSchema = z.object({
  massG: z.number().finite().nonnegative().max(10_000),
});
export type FlightImpact = z.infer<typeof FlightImpactSchema>;

// 生成的资产 URL（缩略图 / DXF）。GLB 不落盘，运行时挤出。
export const UserPartAssetsSchema = z.object({
  thumbnailUrl: z.string().optional(),
  dxfUrl: z.string().optional(),
});
export type UserPartAssets = z.infer<typeof UserPartAssetsSchema>;

// 生命周期状态机（提交/审核接口在 Phase 3 落地，此处只冻结形状）。
export const UserPartStatusEnum = z.enum(['draft', 'private', 'pending', 'approved', 'rejected']);
export type UserPartStatus = z.infer<typeof UserPartStatusEnum>;

// 审核记录（审核动作 Phase 3 落地）。
export const UserPartReviewSchema = z.object({
  reviewerId: z.string().optional(),
  reason: z.string().optional(),
  at: z.string().optional(), // ISO 时间字符串
});
export type UserPartReview = z.infer<typeof UserPartReviewSchema>;

// remix 血缘：从哪个零件 fork 而来。
export const UserPartOriginSchema = z.object({
  forkedFrom: z.string().optional(), // 源零件 id
});
export type UserPartOrigin = z.infer<typeof UserPartOriginSchema>;

// 复用/点赞统计（被用次数驱动飞轮）。
export const UserPartStatsSchema = z.object({
  uses: z.number().int().nonnegative().default(0),
  likes: z.number().int().nonnegative().default(0),
});
export type UserPartStats = z.infer<typeof UserPartStatsSchema>;

// 用户零件定义本体（前端创作 + 提交的部分；不含 id / ownerId / 时间戳，那些由后端补）。
export const UserPartDefSchema = z.object({
  name: z.string().trim().min(1).max(40),
  category: UserPartCategoryEnum,                     // 只允许五种结构类，不含电机/螺旋桨
  geometry: UserPartGeometrySchema,
  sockets: z
    .array(UserPartSocketSchema)
    .max(100)
    .default([])
    .refine(
      (sockets) =>
        new Set(sockets.map((socket) => `${socket.type}:${socket.x}:${socket.y}:${socket.rotation}`)).size ===
        sockets.length,
      '不能重复放置同一个卡扣',
    ),
  manufacturability: ManufacturabilitySchema,
  flightImpact: FlightImpactSchema,
  assets: UserPartAssetsSchema.default({}),
});
export type UserPartDef = z.infer<typeof UserPartDefSchema>;

// 完整用户零件 = 定义本体 + 服务端管理字段。后端 Mongoose「CustomPart」模型与此同源
// （模型历史注册名 CustomPart、集合 customparts 保持不改名，仅字段对齐本契约）。
export const UserPartSchema = UserPartDefSchema.extend({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  status: UserPartStatusEnum.default('draft'),
  review: UserPartReviewSchema.optional(),
  origin: UserPartOriginSchema.optional(),
  stats: UserPartStatsSchema.default({ uses: 0, likes: 0 }),
  version: z.number().int().min(1).default(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type UserPart = z.infer<typeof UserPartSchema>;

// 后端返回给前端的 DTO：即完整用户零件。
export type UserPartDTO = UserPart;

// Step IDs are internal identifiers, NOT category names.
// 'HUB' = mainboard step, 'ARM' = landing step, etc.
// Category names are: mainboard, landing, guard, joint.
// RFC-022：删除 MOTOR 步骤（REVIEW 为最后一步）。MOTOR/PROP 仍是 PartCategory，不是步骤。
export const BuildStepEnum = z.enum([
  'HUB', 'ARM', 'GUARD', 'DECO', 'REVIEW',
]);
export type BuildStep = z.infer<typeof BuildStepEnum>;

// ===== 作品装配快照（Design Snapshot v1）=====
// 设计器与 API 共同使用的运行时契约。Mongo 仍可用 Mixed 存储，但所有 HTTP 写入口必须先解析本 schema。
// schemaVersion 用于后续迁移；旧版 MOTOR 步骤只在输入阶段兼容，持久化时统一迁移为 REVIEW。
const FiniteVector3Schema = z.tuple([
  z.number().finite().min(-100_000).max(100_000),
  z.number().finite().min(-100_000).max(100_000),
  z.number().finite().min(-100_000).max(100_000),
]);

// 自制件仅保留来源引用；几何/所有者/审核状态由鉴权后的原始记录提供，不能复制进作品。
// updatedAt 与 version 一并固定：现有编辑接口尚未提供历史版本，不能静默换成最新轮廓。
export const CustomPartSourceSchema = z.object({
  kind: z.literal('custom'),
  id: z.string().regex(/^[a-f0-9]{24}$/i),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();
export type CustomPartSource = z.infer<typeof CustomPartSourceSchema>;

export const DesignPartInstanceSchema = z.object({
  instanceId: z.string().trim().min(1).max(120),
  partId: z.string().trim().min(1).max(120),
  category: PartCategoryEnum,
  source: CustomPartSourceSchema.optional(),
  position: FiniteVector3Schema,
  rotation: FiniteVector3Schema,
  scale: z.tuple([
    z.number().finite().positive().max(100),
    z.number().finite().positive().max(100),
    z.number().finite().positive().max(100),
  ]).optional(),
  activeConnectorId: z.string().trim().min(1).max(120).optional(),
  attachedTo: z.object({
    parentInstanceId: z.string().trim().min(1).max(120),
    parentConnectorId: z.string().trim().min(1).max(120),
  }).strict().nullable().optional(),
}).strict();
export type DesignPartInstance = z.infer<typeof DesignPartInstanceSchema>;

export const DesignSafetyCheckSchema = z.object({
  totalWeightG: z.number().finite().nonnegative().max(100_000),
  centerOfMassOffset: z.number().finite().nonnegative().max(100_000),
  thrustToWeightRatio: z.number().finite().nonnegative().max(1_000),
  symmetryScore: z.number().finite().min(0).max(100),
  level: z.enum(['green', 'yellow', 'red']),
}).strict();
export type DesignSafetyCheck = z.infer<typeof DesignSafetyCheckSchema>;

const LegacyBuildStepEnum = z.enum(['HUB', 'ARM', 'GUARD', 'DECO', 'MOTOR', 'REVIEW']);

export const DroneDesignSnapshotSchema = z.object({
  schemaVersion: z.literal(1).optional().default(1),
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  thumbnail: z.string().max(5_000_000).optional(),
  updatedAt: z.string().datetime({ offset: true }),
  buildMode: z.enum(['guided', 'free']).optional().default('free'),
  currentStep: LegacyBuildStepEnum.optional().default('HUB'),
  stepReached: z.number().int().nonnegative().max(100).optional().default(0),
  parts: z.array(DesignPartInstanceSchema).max(500),
  safetyCheck: DesignSafetyCheckSchema.optional(),
  exportedAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((snapshot, ctx) => {
  const ids = new Set<string>();
  for (let index = 0; index < snapshot.parts.length; index += 1) {
    const part = snapshot.parts[index];
    if (!part) continue;
    if (ids.has(part.instanceId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parts', index, 'instanceId'],
        message: '零件实例 id 不能重复',
      });
    }
    ids.add(part.instanceId);
    if (part.source) {
      if (snapshot.buildMode !== 'free' || part.partId !== `custom_${part.source.id}` ||
          !['mainboard', 'landing', 'guard', 'joint'].includes(part.category) || part.activeConnectorId || part.attachedTo) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts', index], message: '自制件仅支持保留来源的自由摆放，不能声明连接或作为官方件' });
      }
    } else if (part.partId.startsWith('custom_')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts', index, 'source'], message: '自制件缺少来源引用' });
    }
  }

  const parentByChild = new Map<string, string>();
  for (let index = 0; index < snapshot.parts.length; index += 1) {
    const part = snapshot.parts[index];
    const parentId = part?.attachedTo?.parentInstanceId;
    if (!part || !parentId) continue;
    if (snapshot.parts.some(parent => parent.instanceId === parentId && parent.source)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts', index, 'attachedTo'], message: '自制件尚不支持连接，不能作为连接父件' });
    }
    if (!ids.has(parentId) || parentId === part.instanceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parts', index, 'attachedTo', 'parentInstanceId'],
        message: '连接的父零件不存在或指向自身',
      });
      continue;
    }
    parentByChild.set(part.instanceId, parentId);
  }

  for (const startId of parentByChild.keys()) {
    const visited = new Set<string>();
    let currentId: string | undefined = startId;
    while (currentId) {
      if (visited.has(currentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parts'],
          message: '零件连接关系不能形成循环',
        });
        break;
      }
      visited.add(currentId);
      currentId = parentByChild.get(currentId);
    }
  }
}).transform((snapshot) => ({
  ...snapshot,
  currentStep: snapshot.currentStep === 'MOTOR' ? 'REVIEW' as const : snapshot.currentStep,
  stepReached: Math.min(snapshot.stepReached, BuildStepEnum.options.length - 1),
}));
export type DroneDesignSnapshot = z.output<typeof DroneDesignSnapshotSchema>;
export type DroneDesignSnapshotInput = z.input<typeof DroneDesignSnapshotSchema>;

// Re-export registry and compatibility
export { PART_REGISTRY, STEP_CATEGORIES, BUILD_STEPS, STEP_INFO, CATEGORY_FOLDERS, CATEGORY_LABELS, getPartByNumber, getPartById, getPartsByCategory, getPartsForStep, getPartCategoryInfo, getPopulatedCategories, getCategoryStep } from './registry';
export type { PartEntry, PartCategoryInfo } from './registry';
export { canAddPart, canAdvanceStep, getNextStep, getPrevStep, isCategoryAllowedInStep } from './compatibility';
export type { BuildState, CompatibilityResult, CompatibilityReason } from './compatibility';
