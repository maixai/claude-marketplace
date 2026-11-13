# 扩展构建助手

## 创建或维护组件

说明要做什么，并提供目标位置。例如：

```text
/extension-builder:component-builder 在当前项目创建一个会议记录 Skill，先给方案。
```

也可以提供已有 Skill、SubAgent 或 Hook 的路径，说明要修改的内容。

## 创建或维护市场插件

用于 maixai 插件市场，同时检查插件内容与网站展示：

```text
/extension-builder:plugin-builder 在 maixai 插件市场创建一个代码审查插件，先给方案。
```

确认方案后再实施和验证，不会自动安装、提交或发布。

## 文档保存

在插件配置中设置 `docs_base_dir`，默认是任务开始目录下的 `documents`。过程文档按插件、入口和任务分目录保存，不改变组件源码的位置。

继续之前的任务时，提供已有方案文件或任务目录即可。
