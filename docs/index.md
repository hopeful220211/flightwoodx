# FlightWoodX 文档入口

> 状态：生效中的文档导航
>
> 更新时间：2026-09-08
>
> 适用范围：仓库级事实、产品规格、质量要求、执行计划与历史资料的查找顺序
>
> 替代关系：新增统一导航，不替代 `AGENTS.md`、`ARCHITECTURE.md`、`CURRENT_STATUS.md` 或已批准 RFC；内容冲突时按 `AGENTS.md` 的事实优先级处理

## 查找顺序

| 要回答的问题 | 首先读取 | 边界 |
|---|---|---|
| 项目是什么、怎样在另一台电脑接手、后续功能怎样开发 | [`PROJECT_GUIDE.md`](./PROJECT_GUIDE.md) | 综合交接说明；完成度仍以当前状态和证据为准 |
| 什么不能违反 | [`AGENTS.md`](../AGENTS.md) | 项目治理与冻结边界 |
| 当前系统怎样分层、数据怎样流动 | [`ARCHITECTURE.md`](../ARCHITECTURE.md) | 当前架构，不证明完成度 |
| 当前做到哪里、证据和阻塞是什么 | [`CURRENT_STATUS.md`](../CURRENT_STATUS.md) | 只对文中日期和 commit 有效 |
| 产品主线应满足什么 | [`product-specs/core-flow.md`](./product-specs/core-flow.md) | 目标与验收，不证明已经实现 |
| 如何评估质量、安全、可靠性和债务 | [`quality/`](./quality/) | 质量要求和登记，不替代验证结果 |
| 某轮工作准备怎样执行、实际验证了什么 | [`exec-plans/`](./exec-plans/) | 计划与执行记录，不自动更新当前状态 |
| 为什么曾提出某方案 | [`rfcs/`](./rfcs/) | 目标设计和历史决策，不是完成证据 |

## 当前事实

- [`PROJECT_GUIDE.md`](./PROJECT_GUIDE.md)：技术栈、目录、模块与开发方法的交接说明；8 月正文为历史快照，当前进度和分支先读 `CURRENT_STATUS.md`。
- [`AGENTS.md`](../AGENTS.md)：全仓治理、产品真值、模块边界、安全规则和完成定义。
- [`apps/web/AGENTS.md`](../apps/web/AGENTS.md)、[`apps/api/AGENTS.md`](../apps/api/AGENTS.md)、[`packages/AGENTS.md`](../packages/AGENTS.md)：靠近代码的模块规则；进入相应目录时读取。
- [`ARCHITECTURE.md`](../ARCHITECTURE.md)：当前运行时组件、正式数据来源和主要数据流。
- [`CURRENT_STATUS.md`](../CURRENT_STATUS.md)：最近一次有日期、commit、命令和人工证据的状态快照。
- [`deploy/automation/README.md`](../deploy/automation/README.md)：受保护生产分支、前端发布、回退与凭据维护的操作说明。
- [`deploy/automation/release-procedure.md`](../deploy/automation/release-procedure.md)：每次上传、更新、上线必用的程序入口、证据复用和计时规则。

当前事实只在上述文件更新。其他文档应链接它们，不复制一份并行状态。

## 产品规格

- [`product-specs/core-flow.md`](./product-specs/core-flow.md)：定义核心流程、逐段验收条件和证据边界；未决产品数值仍需负责人确认。

后续规格应写目标行为、非目标和验收方法；实现进度仍写入 `CURRENT_STATUS.md`。

## 质量

- [`quality/HARNESS.md`](./quality/HARNESS.md)：Harness 原则、知识载体和状态推进方式。
- [`quality/QUALITY_SCORE.md`](./quality/QUALITY_SCORE.md)：评分口径和证据要求。
- [`quality/SECURITY.md`](./quality/SECURITY.md)：安全不变量、变更检查和发布证据。
- [`quality/RELIABILITY.md`](./quality/RELIABILITY.md)：可靠性不变量、失败行为和运行验证。
- [`quality/TECH_DEBT.md`](./quality/TECH_DEBT.md)：当前技术与验证债务登记。

## 执行计划

- [`exec-plans/completed/2026-09-14-release-efficiency.md`](./exec-plans/completed/2026-09-14-release-efficiency.md)：固定发布程序、可信同版本产物复用与检查计时的本地验收；云端工作流待上传启用。
- [`exec-plans/index.md`](./exec-plans/index.md)：计划格式、状态规则和索引。
- [`exec-plans/completed/2026-09-08-automated-web-release.md`](./exec-plans/completed/2026-09-08-automated-web-release.md)：受限前端自动发布、首次授权、三奖更正上线及真实回退恢复记录。
- [`exec-plans/active/2026-09-07-review-readiness.md`](./exec-plans/active/2026-09-07-review-readiness.md)：官网、拼装、编程、保存、鉴权与已发布修复的记录；剩余正式业务验收以当前状态为准。
- [`exec-plans/completed/2026-08-17-github-handoff.md`](./exec-plans/completed/2026-08-17-github-handoff.md)：详细手册、完整验证和安全 GitHub 快照交付记录。
- [`exec-plans/completed/2026-08-15-harness-foundation.md`](./exec-plans/completed/2026-08-15-harness-foundation.md)：本轮 Harness 规则、文档、Skill、自动门禁与清理记录。

## 历史、旧规格与 RFC

以下内容可用于理解背景，不得覆盖当前事实：

- 旧主题文档：[`01-codebase-audit.md`](./01-codebase-audit.md)、[`02-guided-build-flow.md`](./02-guided-build-flow.md)、[`03-parts-system.md`](./03-parts-system.md)、[`04-design-system.md`](./04-design-system.md)、[`05-deployment-migration.md`](./05-deployment-migration.md)、[`06-roadmap.md`](./06-roadmap.md)。
- 历史审计：[`audit-report-2026-04-20.md`](./audit-report-2026-04-20.md)、[`backend-readiness-audit-2026-06-16.md`](./backend-readiness-audit-2026-06-16.md)。
- 旧登记与草案契约：[`risk-log.md`](./risk-log.md)、[`contracts/drone-designs.md`](./contracts/drone-designs.md)。其中接口契约仍标为草案，使用前必须与共享契约、当前 API 和测试核对。
- RFC、实现计划、诊断和合并记录：[`rfcs/`](./rfcs/)。文件名中的 `impl`、`plan`、`report` 或阶段编号均不表示当前版本已经完成。

## 新文档最低要求

每份新文档必须写明 `状态`、`更新时间`、`适用范围` 和 `替代关系`。涉及完成度时还必须记录 commit、执行命令、自动化结果、人工路径和未通过项；缺少证据时写“待验证”。
