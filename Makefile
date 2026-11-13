# claude-marketplace - Makefile
#
# 镜像命名规则：<image>[-dev]:<commit8>[-dirty]
# develop 分支使用 -dev 后缀的独立镜像名；tag 只使用 commit id。
# 可用 IMAGE 覆盖。
#
# 需要覆盖镜像仓库时：
#   make build-image IMAGE=harbor.example.com/maixai/claude-marketplace
# 或：
#   make build-image REGISTRY=harbor.example.com PROJECT=maixai

# ---- 可覆盖变量 ----------------------------------------------------------
REGISTRY    ?= ghcr.io
PROJECT     ?= maixai
APP         ?= claude-marketplace
IMAGE       ?= $(if $(REGISTRY),$(REGISTRY)/$(PROJECT)/$(APP),$(APP))$(IMAGE_SUFFIX)

SITE_DIR    ?= site
DIST_DIR    ?= $(SITE_DIR)/dist
DOCKERFILE  ?= build/Dockerfile
PORT        ?= 8080

NODE_STAMP  ?= node_modules/.install-stamp

# ---- 版本推导 ------------------------------------------------------------
GIT_COMMIT  := $(shell git rev-parse --short=8 HEAD 2>/dev/null || echo nogit)
GIT_BRANCH  := $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null || echo local)
GIT_DIRTY   := $(shell test -n "$$(git status --porcelain --untracked-files=no 2>/dev/null)" && echo "-dirty")

ifeq ($(GIT_BRANCH),HEAD)
GIT_BRANCH := local
endif

IMAGE_SUFFIX := $(if $(filter develop,$(GIT_BRANCH)),-dev,)
IMAGE_TAG    := $(GIT_COMMIT)$(GIT_DIRTY)

ifneq ($(filter main develop,$(GIT_BRANCH)),)
PUSH_LATEST ?= 1
else
PUSH_LATEST ?= 0
endif

.DEFAULT_GOAL := help
.PHONY: help info install build run build-image push-image run-image clean preview-workers deploy-workers

help: ## 显示帮助
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

info: ## 打印镜像名与 tag
	@echo "IMAGE       = $(IMAGE)"
	@echo "IMAGE_TAG   = $(IMAGE_TAG)"
	@echo "PUSH_LATEST = $(PUSH_LATEST)"

# ---- 本地构建 ------------------------------------------------------------
$(NODE_STAMP): package.json package-lock.json $(SITE_DIR)/package.json
	npm ci
	@touch $(NODE_STAMP)

install: $(NODE_STAMP) ## 安装依赖（npm ci）

build: install ## 构建站点到 site/dist
	npm run build
	@echo ">> built $(DIST_DIR)/ ($$(du -sh $(DIST_DIR) | cut -f1))"

run: install ## 启动 Vite 开发服务器
	npm run dev

preview-workers: install ## 以 Workers 运行时本地预览
	npm run preview:workers

deploy-workers: install ## 构建并部署到 Cloudflare Workers
	npm run check:headers
	node scripts/plugin-update-times.mjs --require-committed >/dev/null
	npm run build
	npm run deploy:workers

# ---- Docker --------------------------------------------------------------
build-image: ## 构建 Docker 镜像
	@updates="$$(bash scripts/plugin-update-times.sh)" && \
		docker build --build-arg "MARKETPLACE_PLUGIN_UPDATED_AT=$$updates" -f $(DOCKERFILE) -t $(IMAGE):$(IMAGE_TAG) .
	@if [ "$(PUSH_LATEST)" = "1" ]; then docker tag $(IMAGE):$(IMAGE_TAG) $(IMAGE):latest; fi
	@echo ">> image built: $(IMAGE):$(IMAGE_TAG)"

push-image: build-image ## 推送镜像（主干分支同时推 latest）
	@bash scripts/plugin-update-times.sh --require-committed >/dev/null
	docker push $(IMAGE):$(IMAGE_TAG)
	@if [ "$(PUSH_LATEST)" = "1" ]; then docker push $(IMAGE):latest; fi
	@echo ">> pushed: $(IMAGE):$(IMAGE_TAG)"

run-image: build-image ## 构建并用容器启动（宿主 $(PORT) -> 容器 80）
	docker run --rm -p $(PORT):80 --name $(APP) $(IMAGE):$(IMAGE_TAG)

# ---- 清理 ----------------------------------------------------------------
clean: ## 删除构建产物
	rm -rf $(DIST_DIR) $(SITE_DIR)/src/generated
	rm -f $(NODE_STAMP)
	@echo ">> cleaned $(DIST_DIR)/, $(SITE_DIR)/src/generated/"
