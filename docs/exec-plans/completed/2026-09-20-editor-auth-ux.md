# 登录入口与零件绘图交互实施计划

> 执行方式：主代理在当前隔离工作树逐项执行，采用 executing-plans；不另开并行任务。

状态：本地实现与验收完成，未发布；圆角按用户确认改为手动开启
更新时间：2026-09-20
适用范围：首页设计入口、登录返回、零件工坊；账号验证与参数化飞行仅研究方案
替代关系：本轮授权交互与几何修改，取代上一轮仅样式修改的任务范围，不撤回既有设计规范

**Goal:** 修复匿名设计入口，提供可编辑曲线、平滑手绘、手动轮廓圆角及符合桌面习惯的编辑操作。

**Architecture:** 登录使用现有 UI/auth store，返回目标仅保留一次且只接受内部路径。工坊继续输出同一 Part2D，曲线在毫米空间采样，圆角在最终轮廓应用并保护插槽；保存和三维消费相同结果，不增加第二份零件数据。

**Tech Stack:** React、Zustand、Paper.js、现有 geometry/parts-schema、Vitest、Playwright/Chrome。

## 已批准设计与边界

- 未登录点击开始设计先打开登录；成功继续原目标，取消清除目标。游客必须显式选择，不能静默进入。
- 钢笔点按创建角点、拖动产生曲线、点首点闭合；保留平滑手绘。手绘采样不按1mm量化，完成后选择新图形。
- 手动开启外轮廓圆角，初始1mm，按短边和角度限幅。插接口尺寸与标注不变；不修改已有保存件。不改变2mm板厚。
- Cmd/Ctrl+C/V、Z、Shift+Z及Ctrl+Y；Delete/Backspace只作用于画布选中图形，不拦截输入框、文字选择、中文输入或弹窗。
- 清空改用明确清空图标，确认后一次历史提交，允许撤销，不删除零件库。
- 保持白灰/蓝色视觉规范、底部工具条、固定属性框和选择位置稳定。
- 不开通短信/邮件付费服务、不修改生产数据库、不发布、不承诺飞行保证。

## 1. 登录入口（可独立验收）

文件：`apps/web/src/stores/uiStore.ts`、`pages/Home/sections/{HeroSection,FinalCTASection,ProductDemoSection}.tsx`、`pages/Auth/{AuthPage,LoginRedirect}.tsx`、`pages/Auth/components/LoginModal.tsx`、`components/layout/ProtectedRoute.tsx`、`App.tsx`；新增登录目标测试与浏览器回归。

- [x] 先覆盖 `openLoginModal('/design') → closeLoginModal() → target=null`、成功只消费一次、拒绝外部跳转；运行目标测试并确认失败。
- [x] 公共入口检查真实账号；匿名打开带目标弹窗。保护设计路由，显式游客仍可使用；注册通过内部导航状态携带目标，普通登录不强制切页。
- [x] 浏览器验证匿名点击、取消/后退、实际登录及注册后进入原目标、不残留弹窗。

## 2. 编辑操作（可独立验收）

文件：`features/partStudio/PartStudioPage.tsx`，新增 `sketch/clipboard.ts`及测试；工坊浏览器回归。

- [x] 测试复制深拷贝、新id/偏移、剪贴板坏数据；沿用32图形上限；键盘与清空确认先用失败用例定位。
- [x] 剪贴板事件只处理工坊数据；普通文本粘贴不转成图形。复制保持原件，粘贴一次撤销；输入原生快捷键不受影响。
- [x] 确认框使用公共 Modal，默认取消；清空一次可撤销。

## 3. 曲线与手动圆角（可独立验收）

文件：`features/partStudio/{sketch/model.ts,canvas/SketchCanvas.tsx,canvas/sketchToolConfig.ts}`，新增曲线/圆角纯函数及测试；共用现有 Part2D 验证。

- [x] 曲线闭合、节点采样、手绘平滑、复杂度上限、自交拒绝、缩放/移动/复制回归。新增功能按失败测试迭代。
- [x] 钢笔保留归一化锚点/控制点，采样生成现有多边形；实际二维轮廓、三维、保存一致。画布显示节点/控制柄，触控命中区与视觉分离。
- [x] 手动圆角测试凸角、锐角、短边、凹角/孔及插接口保护；失败保留原草图并明确提示，不伪装已处理。
- [x] 三尺寸真实绘制、节点修改、孔槽、圆角、保存/恢复与拼装路径验收。

## 4. 解释与收尾

- [x] 记录 Cookie 当前开关与生命周期；提供邮箱/手机开通、统一账号/登录标识/短期验证记录方案，不假称已接通。
- [x] 参数化方案固定动力组合、承力结构、接口和范围，保留外形定制；明确硬件与实飞证据边界。
- [x] 运行受影响测试；最终 `FWX_TEST_MONGO_URI=mongodb://127.0.0.1:27028 pnpm run ci` 通过，再对同一构建完成必要浏览器用例，更新状态。

## 已有证据

- 起点 `34c6887`，复用此前设计工作树，分支 `codex/editor-auth-ux-2026-09-20`，此前样式WIP保留。
- 实际Chrome干净会话：首页开始设计直接进入 `/design`，没有登录弹窗；返回首页自动弹窗暂未复现。
- 手绘原代码每个采样点受1mm吸附量化，是阶梯轮廓的直接原因。
- 公网只读 `/api/analytics/config` 为 enabled=true；本地隔离预览为 false。注册当前是邮箱+密码，无验证码与手机号身份字段。
- 上一轮同基线及样式WIP完整CI994项通过，本轮不重复基线完整CI，先运行新增失败测试。

## 最终验收

- 工作树 `/Users/nesty/Projects/flightwoodx-design-md`，分支 `codex/editor-auth-ux-2026-09-20`，HEAD仍为 `34c6887`，本轮及上一轮样式更新均为未提交修改。预览 `http://127.0.0.1:4192/part-studio`，隔离API数据库 `fwx_design_md_20260920`；正式账号数据没有复制到本地。
- 完整CI 1,016项通过：脚本216、flight-check 6、parts-schema 17、shared 45、geometry 45、API 107、Web 580。Harness、类型检查、API语法、lint、安全检查均通过，无已知依赖漏洞；检查41.4秒，前端构建7.50秒。日志 `/tmp/fwx-editor-auth-ux-ci.log`。
- 最终构建38项浏览器用例通过，Chrome，390×844、768×1024、1440×900。分三组：`editor-auth-ux + part-studio-selection + part-studio-insertion` 18项；`part-studio + part-studio-workspace + part-studio-feedback` 17项；`core-flow` 的desktop/custom-part加`assembly-modes` 3项。各组约1.1分钟。使用 `FWX_E2E_BASE_URL=http://127.0.0.1:4192 FWX_E2E_BROWSER_CHANNEL=chrome pnpm --filter web exec playwright test ...`。
- 实际路径包括匿名CTA/取消/后退、真实注册与登录返回、钢笔节点和控制柄、未闭合草图撤销/重做、平滑手绘、原生复制粘贴、删除/撤销、手动圆角、清空确认、触控缩放、2mm木纹、插接口、曲线零件保存/刷新/放入作品、两种拼装模式、跨设备恢复、编程与仿真。额外失败注入沿用已有测试，成功保存均进入隔离API，不用假成功。
- 浏览器日志分别为 `/tmp/fwx-editor-{ux,geometry,persistence}-final-browser.log`；截图 `/tmp/fwx-editor-ux-{390,768,1440}.png`，已检查桌面与手机版面。
- 三种尺寸均在macOS Chrome切换视口验收，触控由浏览器模拟；未声称Windows实体机或平板硬件实测。Windows快捷键采用标准剪贴板事件及Ctrl分支，相关分支由组件测试覆盖。
- 开发中修正了新文档元数据格式、旧匿名跳转断言、手机工具栏遮挡、尺寸显示截断，以及未闭合草图Shift+Z误撤销。颜色测试改为等待160ms过渡完成后的最终颜色，保留原颜色与布局断言，没有删除检查。

## 边界、后续与回滚

- 保留已确认白灰/蓝色设计规范。此次新增交互和几何按用户授权执行，上一轮只比较样式的内容锁定脚本不适用于本轮功能变更。
- 圆角作用于平面外轮廓，默认关闭；已保存件不追溯修改。曲线编辑数据只在当前草图，服务端仍存现有已验证轮廓格式；不新增后端解析分支。
- Cookie说明、验证注册开通步骤、数据库约束及参数化建议见 `docs/product-specs/account-verification-and-parametric-design.md`。验证码、手机号注册与参数化机架尚未实现；没有服务开通、生产迁移或飞行验证。
- 未提交、推送、合并或发布。保留隔离工作树供验收。撤回本轮时仅撤回登录返回与工坊新代码及测试，保留先前样式工作；不删除账号或零件数据。上线需另按固定发布程序取得授权。
