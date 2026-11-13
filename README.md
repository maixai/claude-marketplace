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
│   ├── public/_headers         # Workers 响应头（与 nginx 保持一致）
│   ├── scripts/collect-plugins.ts # 构建期采集插件元数据为站点数据
│   ├── src/
│   └── package.json
├── build/
│   ├── Dockerfile              # 两阶段构建：Node 26.13 + nginx 1.31.8
│   └── nginx.conf              # 站点容器内的 nginx 配置
├── deploy/
│   ├── cloudflare/wrangler.jsonc  # Workers 静态资源配置
│   └── docker/docker-compose.yml  # 单服务编排（dev / prod 共用）
├── scripts/check-headers.mjs   # 校验 _headers 与 nginx 响应头一致
├── .github/workflows/
│   ├── deploy-workers.yml      # main → Cloudflare Workers
│   └── publish-image.yml       # main / develop → GHCR
├── Makefile                    # 镜像与 Workers 的操作入口
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

### 页面内容与组件说明

- 插件展示名称、简介、分类、关键词、组件说明和配置项说明统一使用简明中文。组件说明用一句话写清用途，详细流程留在组件正文；技术名称、命令、字段名和模型名保持原样。
- 卡片和详情页的关键词标签读取插件 `plugin.json` 的 `keywords`，不将市场条目的 `category` / `tags` 混入其中。
- 安装步骤由采集脚本根据插件名、市场名自动生成，组件介绍从组件源文件采集；站点使用公共 `PluginInstallation` / `PluginComponents` 模板统一呈现。**插件 README 只维护实际用法、示例与注意事项，不再重复安装命令、组件清单或开发目录树。**
- README 不执行自动内容删改；新增插件应按以上约定组织文档，现有 demo 已迁移。

当前采集范围为既有的六类标准目录 / 配置文件（含根目录单技能和 `agents/` 子目录），本次未扩展到自定义组件路径、内联声明或其它组件类型。

| 类型 | 说明来源与校验 |
| --- | --- |
| Skills | `skills/<name>/SKILL.md` 或根部 `SKILL.md` 的 YAML `description`；缺失、空白或非字符串时报错 |
| Agents | `agents/**/*.md` 的 YAML `description`；缺失、空白或非字符串时报错 |
| Commands | `commands/*.md` 的 YAML `description`；缺失、空白或非字符串时报错 |
| Hooks | `hooks/hooks.json` 顶层可选 `description`，整份配置作为一组展示，附带触发事件；不将配置说明重复冒充各事件的说明 |
| MCP / LSP | 分别读取 `.mcp.json` 的 `mcpServers` 映射和 `.lsp.json` 根映射，展示类型与名称，不要求非官方 `description` 字段 |

这里对 Skills / Commands 的必填校验是**本市场的展示质量约定**，不是声称 Claude Code 官方将这些字段全部设为必填。标准 YAML 解析支持多行说明；生成失败会列出缺失说明的组件路径并非零退出，不覆盖已有目录数据。

```bash
node --test site/scripts/collect-plugins.test.mjs
```

### 插件更新时间

卡片的“更新于”取该插件 `source` 目录最后一次 Git 提交的 **committer 时间**，代码与文档修改均计入；不使用整个仓库 HEAD 的时间、文件 mtime 或站点构建时间。未提交的本地修改不会改变此日期。

- `scripts/plugin-update-times.mjs` 读取完整 Git 历史。默认输出 UTC ISO 时间映射；`--metadata` 输出每个插件的 `{ updatedAt, status }`，区分 `committed`、`uncommitted` 和 `unavailable`。页面按浏览器时区显示日期，卡片悬停可查看精确时间与时区。
- 新插件目录尚无 Git 提交时，卡片和详情页显示“尚未提交”，不会使用 mtime 或构建时间补值。只有无完整 Git 历史等确实无法判断的情况，才显示“更新时间不可用”。已有插件的未提交修改不改变其最后提交时间。
- 本地 `make run` 启动前采集一次，`make build` 构建前重新采集。开发服务运行期间提交了插件后，可执行 `npm run catalog` 更新数据，或重启 `make run`；不把旧的构建快照当作实时 Git 查询。
- `make build-image` / `make run-image` 通过 `scripts/plugin-update-times.sh` 在只读挂载仓库的 Debian Node 容器中采集时间及状态，再经 `MARKETPLACE_PLUGIN_UPDATED_AT` 构建参数传入；不依赖宿主 Node，不把 `.git` 复制进镜像。已知“尚未提交”状态可以用于本地镜像，未知状态会阻止镜像构建。
- 直接执行 `docker build` 必须显式传入上述元数据；缺少参数、缺少插件条目或含不可用状态时构建失败，不再生成所有日期为空的镜像。建议使用 Make 入口；有宿主 Node 时，也可用下面的命令构建本地镜像。
- 两条发布 CI 均获取完整 Git 历史，并要求每个插件有提交时间；本地 `make deploy-workers` 和 `make push-image` 也执行提交时间检查。无历史、浅克隆或新插件尚未提交会阻止发布，不通过伪造日期绕过。
- 旧的字符串/null 时间映射仍可读取；其中 null 仅表示未知，不能据此推断“尚未提交”，因此不满足镜像的已知状态要求。

在市场仓库根目录运行，命令中的镜像名可按需替换：

```bash
docker build \
  --build-arg "MARKETPLACE_PLUGIN_UPDATED_AT=$(node scripts/plugin-update-times.mjs --metadata --require-known)" \
  -f build/Dockerfile -t maixai-marketplace:local .
```

本地安装了 Node 时，可运行以下测试，覆盖 Git 时间、未提交状态和无 Git 构建中的元数据透传：

```bash
node --test scripts/plugin-update-times.test.mjs site/scripts/collect-plugins.test.mjs
```

## 构建触发范围

CI 只在与产物相关的路径变更时运行：

| 变更路径 | 镜像发布 | Workers 部署 |
| --- | --- | --- |
| `site/**` | ✓ | ✓ |
| `scripts/plugin-update-times.mjs` | ✓ | ✓ |
| `scripts/plugin-update-times.sh` | ✓ | — |
| `plugins/**` | ✓ | ✓ |
| `.claude-plugin/**` | ✓ | ✓ |
| `package.json` / `package-lock.json` | ✓ | ✓ |
| `build/**` / `.dockerignore` | ✓ | — |
| `deploy/cloudflare/**` | — | ✓ |
| `README.md`、`Makefile`、其余 `scripts/**`、`.github/**`、`deploy/docker/**` | — | — |

`workflow_dispatch` 不受路径过滤影响，可随时手动触发。

## 构建与运行

### Make

```bash
make info                 # 查看镜像名与 tag（默认 ghcr.io/maixai/claude-marketplace）
make build-image          # 构建镜像
make run-image PORT=8080  # 运行容器，访问 http://localhost:8080
make push-image           # 推送到 GHCR（需先 docker login ghcr.io）
make preview-workers      # 以 Workers 运行时本地预览
make deploy-workers       # 构建并部署到 Cloudflare Workers
```

镜像 tag 只使用 commit id：`<commit8>[-dirty]`。`develop` 分支使用独立的 `-dev` 镜像名，`main` 与 `develop` 都会额外打 `latest`。需要推送到其他仓库时覆盖 `IMAGE` 或 `REGISTRY`。

### 构建环境

所有构建都在 Debian 系容器中完成，不依赖宿主机安装 Node：

| 目标 | 镜像 | 说明 |
| --- | --- | --- |
| 插件更新时间采集 | `node:26.13-trixie` | 只读挂载仓库，输出供镜像构建使用的时间元数据 |
| Docker 构建阶段 | `node:26.13-trixie-slim` | `npm ci` + 站点构建 |
| Docker 运行阶段 | `nginx:1.31.8-trixie` | 只包含 nginx 与 `site/dist` |
| Workers 部署 job | `node:26.13-trixie` | 镜像自带 git，Checkout、构建与 `wrangler deploy` 都在容器内完成 |

本地开发直接使用本机 Node（需 `>= 22.12`，当前按 26.13 验证）。

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

### Cloudflare Workers

`main` 分支的站点通过 `.github/workflows/deploy-workers.yml` 部署到 Cloudflare Workers Static Assets，同时仍发布 `main` 镜像。

- 配置：`deploy/cloudflare/wrangler.jsonc`（Worker 名 `maixai-claude-marketplace`）
- 构建：整个 job 运行在 `node:26.13-trixie` 容器内，宿主机无需安装 Node
- 静态产物：`site/dist`
- 路由：SPA fallback，未知路径渲染站内 404 页面（HTTP 200）
- 响应头：`site/public/_headers` 为事实来源，`build/nginx.conf` 保持相同配置；`npm run check:headers` 在 CI 中校验两者一致

需要在仓库配置 secrets：

- `CLOUDFLARE_API_TOKEN`：Edit Cloudflare Workers 模板
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID

本地部署需先让 `wrangler` 读到凭据：

```bash
export CLOUDFLARE_API_TOKEN=<token>
export CLOUDFLARE_ACCOUNT_ID=<account-id>
make deploy-workers
```

### Docker Compose

开发与生产共用同一份 `deploy/docker/docker-compose.yml`，通过环境变量区分。以下命令均在仓库根目录执行：

```bash
# dev：采集插件更新时间，再本地构建并启动；无需宿主安装 Node
MARKETPLACE_PLUGIN_UPDATED_AT=$(bash scripts/plugin-update-times.sh) && \
MARKETPLACE_PLUGIN_UPDATED_AT="$MARKETPLACE_PLUGIN_UPDATED_AT" HOST_PORT=8080 \
  docker compose -f deploy/docker/docker-compose.yml up -d --build

# prod：使用已推送的镜像
IMAGE=ghcr.io/maixai/claude-marketplace TAG=<immutable-tag> \
  docker compose -f deploy/docker/docker-compose.yml pull && \
IMAGE=ghcr.io/maixai/claude-marketplace TAG=<immutable-tag> \
  docker compose -f deploy/docker/docker-compose.yml up -d

# 停止
docker compose -f deploy/docker/docker-compose.yml down
```

站点缓存与安全响应头由 `build/nginx.conf` 设置：`/assets/*`（文件名带 hash）长期缓存，HTML 每次回源校验。路由采用 SPA fallback，未知路径会渲染站内 404 页面（HTTP 状态码为 200）。
