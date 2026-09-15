# FlightWoodX 后端镜像（RFC-024 §4.8）。多阶段、省内存（目标 2C2G ECS）。
# build context 必须是仓库根（pnpm workspace）：
#   docker build -f apps/api/Dockerfile -t fwx-api .
# 或经 deploy/docker-compose.yml（context: ..）自动构建。

# ---- Stage 1: builder —— 装全量依赖 + 构建共享包 CJS（这些产物不进最终镜像）----
FROM node:22-slim AS builder
# 原生模块(bcrypt)需编译工具；node 头文件走国内镜像，避免 nodejs.org 在国内拉不动
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV npm_config_disturl=https://npmmirror.com/mirrors/node \
    npm_config_registry=https://registry.npmmirror.com
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# 先只拷依赖清单，最大化利用 Docker 层缓存
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY patches ./patches
COPY apps/api/package.json ./apps/api/
COPY packages/geometry/package.json ./packages/geometry/
COPY packages/parts-schema/package.json ./packages/parts-schema/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --filter api... --frozen-lockfile

# 拷源码，构建 api 运行时 require 的 CJS 契约（shared / parts-schema / geometry）
COPY packages/parts-schema ./packages/parts-schema
COPY packages/geometry ./packages/geometry
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @fwx/shared build:cjs \
 && pnpm --filter @fwx/parts-schema build:cjs \
 && pnpm --filter @fwx/geometry build:cjs

# ---- Stage 2: runtime —— 只装生产依赖 + 拷源码与已构建 CJS ----
FROM node:22-slim AS runtime
# 运行时 --prod 安装同样会编译 bcrypt，需相同编译工具与 node 头文件镜像
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV npm_config_disturl=https://npmmirror.com/mirrors/node \
    npm_config_registry=https://registry.npmmirror.com
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY patches ./patches
COPY apps/api/package.json ./apps/api/
COPY packages/geometry/package.json ./packages/geometry/
COPY packages/parts-schema/package.json ./packages/parts-schema/
COPY packages/shared/package.json ./packages/shared/
# 只装生产依赖（不含 tsup 等构建期工具）——省内存、缩小镜像
RUN pnpm install --filter api... --prod --frozen-lockfile

# 拷源码 + 从 builder 拷已构建的 dist-cjs（被 .gitignore，但运行时必需）
COPY apps/api ./apps/api
COPY packages/geometry/src ./packages/geometry/src
COPY packages/parts-schema/src ./packages/parts-schema/src
COPY packages/shared/src ./packages/shared/src
COPY --from=builder /app/packages/parts-schema/dist-cjs ./packages/parts-schema/dist-cjs
COPY --from=builder /app/packages/geometry/dist-cjs ./packages/geometry/dist-cjs
COPY --from=builder /app/packages/shared/dist-cjs ./packages/shared/dist-cjs

WORKDIR /app/apps/api
EXPOSE 3000

# 复用健康检查端点（同时反映 DB 连接状态）
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
