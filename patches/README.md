# 前端依赖补丁

状态：本地应用，随锁文件安装；未发布
更新时间：2026-09-15
适用范围：Web 三维画布初始化与依赖安装输入
替代关系：仅修正下述版本的迟到初始化，不替代上游 API 或项目架构。

## @react-three/fiber 9.6.0：画布卸载期间的异步初始化

2026-09-15 在真实 Chrome 的自制件绘制、拼装、预览及切页路径复现
`Cannot read properties of null (reading 'addEventListener')`。
堆栈指向 Canvas 的 `onCreated` → `events.connect`。

该版本的 [Canvas 源码](https://github.com/pmndrs/react-three-fiber/blob/v9.6.0/packages/fiber/src/web/Canvas.tsx)
等待 `configure()` 后直接渲染；若等待期间 DOM 已卸载，渲染会重启旧场景，
随后尝试连接已清空的 `divRef.current`。

补丁在继续渲染前核对同一个 canvas 仍由组件持有。只取消已卸载画布的迟到任务，
保留挂载期间的场景、交互、原卸载清理和错误传播，不吞掉异常。
ESM、CommonJS 开发及生产入口采用相同修正；不升级版本或改变其他依赖。

`pnpm install --frozen-lockfile` 通过锁文件中记录的摘要自动应用补丁。
即使仅安装 API 依赖，pnpm 仍会读取根补丁摘要；因此 API 镜像两个安装阶段均先复制
`patches/`。本地按相同清单建立的隔离安装曾因缺文件失败，补齐后离线锁定安装通过。
这只保证构建输入完整，不修改 API 运行逻辑；真实容器构建仍由 CI 验证。
回归测试为 `apps/web/src/components/design/CanvasLifecycle.test.tsx`，使用真实 Fiber
初始化与事件管理器，仅模拟无浏览器环境中的尺寸与 GPU 边界；原版本在卸载测试中
稳定抛出同一异常。升级 Fiber 时先核对上游修正，再用该测试及真实三维流程确认能否移除补丁。
