/**
 * @fwx/shared
 * FlightWoodX 2.0 前后端共享：指令协议 IR、数据模型类型、常量、校验。
 * 详见 docs/rfcs/RFC-011-platform-2.0.md
 *
 * 工程红线：所有跨前后端的类型来自本包，禁止重复定义（RFC-011 §7.2）。
 */
export * from './commandProtocol';
export * from './models';
export * from './api';
export * from './rbac';
export * from './admin';
export * from './growth';
export * from './project';
export * from './social';
export * from './analytics';
