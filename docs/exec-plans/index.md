# 执行计划索引

> 状态：生效中的计划导航与格式规则
>
> 更新时间：2026-09-15
>
> 适用范围：跨文件、跨模块或需要独立验证记录的仓库工作
>
> 替代关系：新增执行计划入口，不替代 RFC、产品规格、`CURRENT_STATUS.md` 或任务中的负责人决定

## 当前计划

- [`active/2026-09-07-review-readiness.md`](./active/2026-09-07-review-readiness.md)：评审前现有官网功能、界面与线上验证修复。

进行中的计划放在 `docs/exec-plans/active/`，结束后按实际结果移入 `completed/`。目录位置不能替代文档状态和验证证据。

## 已结束记录

- [`completed/2026-09-20-custom-joint-alignment.md`](./completed/2026-09-20-custom-joint-alignment.md)：自制与官方件接口对齐、真实板面方向、自动添加/鼠标触控拖入和旧连接修复；1,028项自动测试、5项最终构建浏览器流程通过，未发布。

- [`completed/2026-09-20-editor-auth-ux.md`](./completed/2026-09-20-editor-auth-ux.md)：登录返回、钢笔与平滑手绘、手动圆角、快捷键及清空确认；1,016项自动测试、38项最终构建浏览器验收通过，未发布。

- [`completed/2026-09-15-free-assembly.md`](./completed/2026-09-15-free-assembly.md)：显式模式选择、两种模式使用自制件、真实接口连接、账号保存恢复及三尺寸验收；981项自动测试、3项真实浏览器主流程通过，未发布。

- [`completed/2026-09-14-combined-release.md`](./completed/2026-09-14-combined-release.md)：两项任务的插接口、工具提示、首页、使用统计及隐私页面合并上线；正式前端71697fc、API4b05017，959项自动测试、92项云端浏览器用例和公网三尺寸验收通过。当前上线结果以本条为准，下列未发布表述为各轮历史。
- [`completed/2026-09-14-product-analytics.md`](./completed/2026-09-14-product-analytics.md)：第一方可选统计、成功结果、授权撤回与管理员汇总/CSV；845项自动测试和实际浏览器验收通过，已随合并发布上线。
- [`completed/2026-09-14-privacy-pages.md`](./completed/2026-09-14-privacy-pages.md)：隐私政策目录、完整说明、精简提示与身份隔离；861项自动测试、6项Chrome用例通过，已随合并发布上线。
- [`completed/2026-09-14-release-efficiency.md`](./completed/2026-09-14-release-efficiency.md)：固定发布规则和命令、同提交CI复用、并行检查及计时，827项当轮自动测试通过；已启用云端复用，实测生产流程91秒、上传切换39秒。
- [`completed/2026-09-14-all-pending-release.md`](./completed/2026-09-14-all-pending-release.md)：此前一轮正式发布c7b69d7；备份恢复、API11步及公网三尺寸36组验收通过，最新上线结果见71697fc合并发布记录。
- [`completed/2026-09-14-concise-contextual-copy.md`](./completed/2026-09-14-concise-contextual-copy.md)：全站简短功能文案、按需错误反馈和导出结果折叠，748项自动测试及72项全站浏览器回归通过，未发布。
- [`completed/2026-09-14-part-studio-selection.md`](./completed/2026-09-14-part-studio-selection.md)：固定绘制参数区与画布、细选框和鼠标/触控缩放，634项自动测试及49项全站浏览器回归通过，未发布。
- [`completed/2026-09-13-part-studio-dimensioned-editor.md`](./completed/2026-09-13-part-studio-dimensioned-editor.md)：毫米规则绘图、参考范围、真实2mm板厚与共享木纹、主机身类别及保存恢复；599项自动测试和14项浏览器回归通过，未发布，实物配合未验证。
- [`completed/2026-09-13-plain-site-copy.md`](./completed/2026-09-13-plain-site-copy.md)：冻结首页顶部，其余页面改为功能说明；文案规则、局部换行修正、505项自动测试、19项浏览器回归及27次页面尺寸检查通过，未发布。
- [`completed/2026-09-08-automated-web-release.md`](./completed/2026-09-08-automated-web-release.md)：受限 GitHub→ECS 前端发布、首次安装、真实权限检查、三奖更正上线及受控回退恢复验收。
- [`completed/2026-08-15-harness-foundation.md`](./completed/2026-08-15-harness-foundation.md)：建立分层规则、知识入口、项目 Skill、静态门禁并完成本地工程基线重验；未重验产品浏览器路径或目标环境。
- [`completed/2026-08-17-github-handoff.md`](./completed/2026-08-17-github-handoff.md)：建立详细项目手册、重验工程基线，并把当前 tree 作为不扩散本机祖先的 GitHub 快照交付。

## 计划与其他文档的关系

- 产品规格和 RFC：说明目标、边界与决策原因。
- 执行计划：说明本轮范围、步骤、风险、验证和回滚。
- `CURRENT_STATUS.md`：只记录已有证据的当前完成度。
- completed 记录：保存本轮实际结果和遗留项，不自动证明功能、发布或整个项目完成。

## 最低内容

每份计划至少包含：

1. 状态、更新时间、适用范围和替代关系。
2. 目标与不在范围内的内容。
3. 使用的当前事实、规格和决策来源。
4. 将修改的边界及不允许修改的内容。
5. 有顺序的步骤、风险、回滚或停止条件。
6. 自动化、人工、目标环境及外部证据的验收方法。
7. 实际结果、未通过项和后续责任。

只有计划范围内的步骤与验证完成后才能写“已完成”；被明确排除或仍待验证的内容必须继续列出。
