# MaixDev

Maixai 用于构建产品的软件开发 Harness

## 开始开发

调用 `/maixdev:fastdev`，说明你要开发的功能或修复的问题：

```text
/maixdev:fastdev 为订单增加取消操作，已发货订单不能取消。
```

根据提示确认需求并选择开发模式：

- **测试先行**：先编写测试，再逐步实现功能。
- **普通开发**：统一完成业务实现和必要测试。

开发完成后，可以选择是否进行代码审查。

## 检索配置

安装或启用时，按原生配置提示填写 `context7_api_key` 和 `tavily_api_key`。两项均为必填敏感配置，仅用于插件自带 Context7、Tavily 的请求头认证；不要在聊天中提供 Key。完成配置不代表服务已连接，工具可用性会在任务准备时另行检查。

## 文档目录

通过配置项 `docs_base_dir` 指定文档目录，默认是任务开始时工作目录下的 `documents`。每个任务的需求、进度和验收结果保存在独立目录中：

```text
<工作目录>/documents/maixdev/fastdev/<任务标识>/
```

## 继续已有任务

提供原任务文档目录即可续作：

```text
/maixdev:fastdev 继续 /workspace/shop/documents/maixdev/fastdev/order-cancel-01/ 的任务。
```
