# claude-marketplace

本仓库同时承担两个角色：

1. **Claude Code 插件市场**：仓库根部的 `.claude-plugin/marketplace.json` 是市场清单，用户可以执行
   `claude plugin marketplace add maixai/claude-marketplace` 注册本市场。
2. **市场展示站点**：`site/` 下的 Vue 3 + TypeScript 站点，构建产物由 nginx 托管在 Docker 容器中。

## 目录结构

```text
claude-marketplace/
├── .claude-plugin/
│   └── marketplace.json        # 市场清单（路径固定，不可移动）
├── plugins/                    # 本市场内的插件
│   └── <plugin-name>/
│       ├── .claude-plugin/
│       │   └── plugin.json     # 插件清单（可选，但建议提供）
│       ├── skills/             # 技能：skills/<name>/SKILL.md
│       ├── commands/           # 斜杠命令（新插件优先用 skills/）
│       ├── agents/             # 子代理
│       ├── hooks/hooks.json    # hooks
│       └── .mcp.json           # MCP server 定义
├── site/                       # Vue 3 + TypeScript 站点
│   ├── scripts/collect-plugins.ts # 构建期采集插件元数据为站点数据
│   ├── src/
│   └── package.json
├── build/
│   ├── Dockerfile              # 两阶段构建：Node 构建 + nginx 托管
│   └── nginx.conf              # 站点容器内的 nginx 配置
├── deploy/docker/
│   └── docker-compose.yml      # 单服务编排（dev / prod 共用）
├── Makefile                    # 镜像构建与运行入口
├── .dockerignore
└── package.json                # npm workspace 根
```

## 新增插件

1. 在 `plugins/<plugin-name>/` 下放置插件文件，组件目录直接位于插件根部（不要放进 `.claude-plugin/`）。
2. 在 `.claude-plugin/marketplace.json` 的 `plugins` 数组登记：

   ```json
   {
     "name": "plugin-name",
     "source": "./plugins/plugin-name",
     "description": "插件说明",
     "category": "development",
     "tags": ["typescript"]
   }
   ```

3. 确保条目 `name` 与插件 `.claude-plugin/plugin.json` 的 `name` 完全一致。
4. 校验：

   ```bash
   claude plugin validate .
   ```

> `source` 的相对路径以仓库根目录为基准；`plugins` 中每个条目都会被单独校验，单个条目非法不会让整个市场失效。

## 本地开发

```bash
npm install          # 安装根 workspace 依赖（含 site）
npm run dev          # 启动 Vite 开发服务器
npm run catalog      # 仅重新生成站点数据
npm run build        # 构建站点到 site/dist
```

站点数据由 `site/scripts/collect-plugins.ts` 在 `dev` / `build` 前自动生成到 `site/src/generated/catalog.json`（已 gitignore）。

采集脚本会：

- 读取 `.claude-plugin/marketplace.json`，只接受 `./` 开头的本地 `source`；
- 读取每个插件的 `.claude-plugin/plugin.json`、`README.md`（渲染为 HTML）；
- 汇总组件清单：`skills/`、`commands/`、`agents/`、`hooks/hooks.json`、`.mcp.json`、`.lsp.json`；
- 严格校验：条目命名、重名、目录存在性、`plugin.json` 的 `name` 与条目一致；任一失败即非零退出，CI 会中断。

## 构建与运行

### Make

```bash
make info                 # 查看镜像名与 tag（默认 ghcr.io/maixai/claude-marketplace）
make build-image          # 构建镜像
make run-image PORT=8080  # 运行容器，访问 http://localhost:8080
make push-image           # 推送到 GHCR（需先 docker login ghcr.io）
```

镜像 tag 只使用 commit id：`<commit8>[-dirty]`。`develop` 分支使用独立的 `-dev` 镜像名，`main` 与 `develop` 都会额外打 `latest`。需要推送到其他仓库时覆盖 `IMAGE` 或 `REGISTRY`。

### 镜像发布

push 到 `main` 或 `develop`、或手动触发时，`.github/workflows/publish-image.yml` 会构建并推送镜像：

| 分支 | 镜像 | tag |
| --- | --- | --- |
| `main` | `ghcr.io/<owner>/claude-marketplace` | `<commit8>`、`latest` |
| `develop` | `ghcr.io/<owner>/claude-marketplace-dev` | `<commit8>`、`latest` |

生产环境拉取私有包前需登录：

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <github-username> --password-stdin
```

### Docker Compose

开发与生产共用同一份 `deploy/docker/docker-compose.yml`，通过环境变量区分。以下命令均在仓库根目录执行：

```bash
# dev：本地构建并启动
HOST_PORT=8080 docker compose -f deploy/docker/docker-compose.yml up -d --build

# prod：使用已推送的镜像
IMAGE=ghcr.io/maixai/claude-marketplace TAG=<immutable-tag> \
  docker compose -f deploy/docker/docker-compose.yml pull && \
IMAGE=ghcr.io/maixai/claude-marketplace TAG=<immutable-tag> \
  docker compose -f deploy/docker/docker-compose.yml up -d

# 停止
docker compose -f deploy/docker/docker-compose.yml down
```

站点缓存与安全响应头由 `build/nginx.conf` 设置：`/assets/*`（文件名带 hash）长期缓存，HTML 每次回源校验。路由采用 SPA fallback，未知路径会渲染站内 404 页面（HTTP 状态码为 200）。
