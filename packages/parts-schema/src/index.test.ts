import { describe, expect, it } from 'vitest'
import {
  DroneDesignSnapshotSchema,
  PART_REGISTRY,
  PartRegistryEntrySchema,
  UserPartCategoryEnum,
  UserPartDefSchema,
  UserPartSchema,
} from './index'

const validUserPart = {
  name: '连接件',
  category: 'joint',
  geometry: {
    contour: 'M 0 0 L 20 0 L 20 20 L 0 20 Z',
    holes: [],
    thicknessMm: 2,
    bboxMm: { w: 20, h: 20 },
  },
  sockets: [],
  manufacturability: { closed: true, minFeatureMm: 2, withinBoard: true, passed: true },
  flightImpact: { massG: 0.48 },
  assets: {},
} as const

describe('官方零件注册表', () => {
  it('所有条目都符合统一 schema，零件号不重复', () => {
    for (const part of PART_REGISTRY) expect(PartRegistryEntrySchema.safeParse(part).success).toBe(true)
    const partNumbers = PART_REGISTRY.map((part) => part.partNumber)
    expect(new Set(partNumbers).size).toBe(partNumbers.length)
  })
})

describe('用户零件契约', () => {
  it('接受主板与原有四类结构件，全部固定为 2mm 且不生成卡扣', () => {
    expect(UserPartCategoryEnum.options).toEqual(['mainboard', 'guard', 'joint', 'deco', 'landing'])
    for (const category of ['mainboard', 'guard', 'joint', 'deco', 'landing']) {
      const parsed = UserPartDefSchema.parse({ ...validUserPart, category })
      expect(parsed.category).toBe(category)
      expect(parsed.geometry.thicknessMm).toBe(2)
      expect(parsed.sockets).toEqual([])
    }
  })

  it('主板扩展不允许电机、螺旋桨或非 2mm 板厚', () => {
    for (const category of ['MOTOR', 'PROP', 'motor', 'prop', 'unknown']) {
      expect(UserPartDefSchema.safeParse({ ...validUserPart, category }).success).toBe(false)
    }
    for (const thicknessMm of [0, 1, 3, 20, 0.002]) {
      expect(UserPartDefSchema.safeParse({
        ...validUserPart, category: 'mainboard', geometry: { ...validUserPart.geometry, thicknessMm },
      }).success).toBe(false)
    }
  })

  it('接受通过完整制造检查的结构件', () => {
    expect(UserPartDefSchema.safeParse(validUserPart).success).toBe(true)
  })

  it('拒绝没有真实检查却声称通过的结构件', () => {
    const unsafe = {
      ...validUserPart,
      manufacturability: { closed: true, minFeatureMm: 0, withinBoard: true, passed: true },
    }
    expect(UserPartDefSchema.safeParse(unsafe).success).toBe(false)
  })

  it('拒绝重复卡扣、零尺寸和无效版本/日期', () => {
    const socket = { type: 'arm-mount', x: 5, y: 5, rotation: 0 }
    expect(UserPartDefSchema.safeParse({ ...validUserPart, sockets: [socket, socket] }).success).toBe(false)
    expect(
      UserPartDefSchema.safeParse({
        ...validUserPart,
        geometry: { ...validUserPart.geometry, bboxMm: { w: 0, h: 20 } },
      }).success,
    ).toBe(false)
    expect(
      UserPartSchema.safeParse({
        ...validUserPart,
        id: 'part-id',
        ownerId: 'owner-id',
        version: -1,
        createdAt: 'not-a-date',
        updatedAt: 'not-a-date',
      }).success,
    ).toBe(false)
  })
})

describe('作品装配快照契约', () => {
  const snapshot = {
    id: 'design-1',
    name: '测试作品',
    updatedAt: '2026-08-04T00:00:00.000Z',
    buildMode: 'guided',
    currentStep: 'ARM',
    stepReached: 1,
    parts: [
      {
        instanceId: 'hub-1',
        partId: 'FW-HUB-001',
        category: 'mainboard',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
      {
        instanceId: 'arm-1',
        partId: 'FW-LAND-001',
        category: 'landing',
        position: [1, 0, 0],
        rotation: [0, 0, 0],
        attachedTo: { parentInstanceId: 'hub-1', parentConnectorId: 'arm-slot-1' },
      },
    ],
  } as const

  it('补充版本并接受合法的装配树', () => {
    const parsed = DroneDesignSnapshotSchema.parse(snapshot)
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.parts).toHaveLength(2)
  })

  it('迁移旧 MOTOR 步骤并收紧进度范围', () => {
    const parsed = DroneDesignSnapshotSchema.parse({ ...snapshot, currentStep: 'MOTOR', stepReached: 5 })
    expect(parsed.currentStep).toBe('REVIEW')
    expect(parsed.stepReached).toBe(4)
  })

  it('拒绝重复实例、悬空连接和循环关系', () => {
    const duplicate = { ...snapshot, parts: [snapshot.parts[0], snapshot.parts[0]] }
    expect(DroneDesignSnapshotSchema.safeParse(duplicate).success).toBe(false)

    const orphan = {
      ...snapshot,
      parts: [{ ...snapshot.parts[1], attachedTo: { parentInstanceId: 'missing', parentConnectorId: 'slot' } }],
    }
    expect(DroneDesignSnapshotSchema.safeParse(orphan).success).toBe(false)

    const cycle = {
      ...snapshot,
      parts: [
        { ...snapshot.parts[0], attachedTo: { parentInstanceId: 'arm-1', parentConnectorId: 'slot-a' } },
        { ...snapshot.parts[1], attachedTo: { parentInstanceId: 'hub-1', parentConnectorId: 'slot-b' } },
      ],
    }
    expect(DroneDesignSnapshotSchema.safeParse(cycle).success).toBe(false)
  })

  it('拒绝无限数值、超量零件和未知字段', () => {
    expect(
      DroneDesignSnapshotSchema.safeParse({
        ...snapshot,
        parts: [{ ...snapshot.parts[0], position: [Number.POSITIVE_INFINITY, 0, 0] }],
      }).success,
    ).toBe(false)
    expect(DroneDesignSnapshotSchema.safeParse({ ...snapshot, unexpected: true }).success).toBe(false)
    expect(
      DroneDesignSnapshotSchema.safeParse({ ...snapshot, parts: Array.from({ length: 501 }, (_, i) => ({
        ...snapshot.parts[0],
        instanceId: `part-${i}`,
      })) }).success,
    ).toBe(false)
  })

  const custom = {
    instanceId: 'custom-instance',
    partId: 'custom_507f1f77bcf86cd799439011',
    category: 'joint', position: [0, 0, 0], rotation: [0, 0, 0],
    source: { kind: 'custom', id: '507f1f77bcf86cd799439011', version: 1, updatedAt: '2026-09-07T00:00:00.000Z' },
  }

  it('preserves custom source revisions in free placement without copying geometry', () => {
    const parsed = DroneDesignSnapshotSchema.parse({ ...snapshot, buildMode: 'free', parts: [custom] })
    expect(parsed.parts[0]).toMatchObject(custom)
    expect(parsed.parts[0]).not.toHaveProperty('geometry')
  })

  it('accepts custom mainboards only as unconnected free placements with unchanged source provenance', () => {
    const mainboard = { ...custom, category: 'mainboard' }
    const candidate = { ...snapshot, buildMode: 'free', parts: [mainboard] }
    expect(DroneDesignSnapshotSchema.parse(candidate).parts[0]).toMatchObject(mainboard)
    for (const unsafe of [
      { ...candidate, buildMode: 'guided' },
      { ...candidate, parts: [{ ...mainboard, source: undefined }] },
      { ...candidate, parts: [{ ...mainboard, partId: 'core_hub_01' }] },
      { ...candidate, parts: [{ ...mainboard, activeConnectorId: 'invented' }] },
      { ...candidate, parts: [snapshot.parts[0], { ...mainboard, attachedTo: { parentInstanceId: 'hub-1', parentConnectorId: 'invented' } }] },
      { ...candidate, parts: [mainboard, { ...snapshot.parts[1], attachedTo: { parentInstanceId: mainboard.instanceId, parentConnectorId: 'invented' } }] },
    ]) expect(DroneDesignSnapshotSchema.safeParse(unsafe).success).toBe(false)
  })

  it('rejects fabricated custom connections, guided completion, and mismatched provenance', () => {
    for (const candidate of [
      { ...snapshot, parts: [custom] },
      { ...snapshot, buildMode: 'free', parts: [{ ...custom, partId: 'core_hub_01' }] },
      { ...snapshot, buildMode: 'free', parts: [{ ...custom, source: undefined }] },
      { ...snapshot, buildMode: 'free', parts: [{ ...custom, activeConnectorId: 'invented' }] },
      { ...snapshot, buildMode: 'free', parts: [custom, { ...snapshot.parts[1], attachedTo: { parentInstanceId: custom.instanceId, parentConnectorId: 'invented' } }] },
    ]) expect(DroneDesignSnapshotSchema.safeParse(candidate).success).toBe(false)
  })

  it('rejects invalid custom revisions and inline source geometry', () => {
    for (const part of [
      { ...custom, source: { ...custom.source, version: 0 } },
      { ...custom, source: { ...custom.source, updatedAt: 'unknown' } },
      { ...custom, geometry: validUserPart.geometry },
    ]) expect(DroneDesignSnapshotSchema.safeParse({ ...snapshot, buildMode: 'free', parts: [part] }).success).toBe(false)
  })
})
