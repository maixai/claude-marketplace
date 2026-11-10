# syntax=docker/dockerfile:1

# Stage 1: 构建站点
FROM node:26.13-trixie-slim AS builder

WORKDIR /app

# 先复制依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json ./
COPY site/package.json ./site/package.json
RUN npm ci

# 构建脚本从仓库根读取市场清单与插件
COPY .claude-plugin/ ./.claude-plugin/
COPY plugins/ ./plugins/
COPY site/ ./site/
COPY scripts/plugin-update-times.mjs ./scripts/plugin-update-times.mjs

# 只传递插件时间元数据，不把 Git 历史复制进镜像构建层。
ARG MARKETPLACE_PLUGIN_UPDATED_AT
RUN MARKETPLACE_PLUGIN_UPDATED_AT="$MARKETPLACE_PLUGIN_UPDATED_AT" npm run build

# Stage 2: 运行
FROM nginx:1.31.8-trixie AS runtime

COPY build/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/site/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
