FROM node:18.19-alpine AS base

# 依賴階段
FROM base AS deps
WORKDIR /app

# 複製package.json和package-lock.json（如果存在）
COPY package.json package-lock.json* ./

# 智能依賴安裝：如果有 package-lock.json 使用 npm ci，否則使用 npm install
RUN --mount=type=cache,target=/root/.npm \
  if [ -f package-lock.json ]; then \
    echo "Found package-lock.json, using npm ci"; \
    npm ci; \
  else \
    echo "No package-lock.json found, using npm install"; \
    npm install; \
  fi

# 構建階段
FROM base AS builder
WORKDIR /app

# 先複製配置文件
COPY next.config.js ./
COPY postcss.config.mjs ./
COPY tailwind.config.js ./
COPY tsconfig.json ./
COPY public ./public
COPY package.json package-lock.json* ./

# 複製依賴和可能生成的 package-lock.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package-lock.json* ./

# 複製源代碼
COPY src ./src

# 構建並移除開發依賴
RUN npm run build && npm prune --production

# 運行階段
FROM node:18.19-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# 添加系統用戶
RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 nextjs

# 複製構建文件
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 設置用戶
USER nextjs

# 開放端口
EXPOSE 3000

# 設置環境變數
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# 健康檢查
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# 啟動命令
CMD ["node", "server.js"] 
