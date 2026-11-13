#!/usr/bin/env bash
set -euo pipefail

# 与构建流程一样使用 Debian Node 容器，宿主只需 Docker；仓库以只读方式挂载。
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec docker run --rm \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$repo_root,target=/workspace,readonly" \
  --workdir /workspace \
  node:26.13-trixie \
  node scripts/plugin-update-times.mjs --metadata --require-known "$@"
