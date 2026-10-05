# dsh-ui-progress —— DSH 会话进度看板

[English](README.en.md) · 简体中文

[![npm](https://img.shields.io/npm/v/dsh-ui-progress)](https://www.npmjs.com/package/dsh-ui-progress)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

跨工作空间的会话进度看板：侧边栏新增「进度看板」入口，图标角标 = **进行中 + 已完成未查看**；点开为整页看板：「全部」（默认，仅进行中 + 已完成未查看，已确认的历史会话只留在「已完成」栏）、「进行中」、「已完成」三个分栏，加一个工作空间筛选器。

## 界面

- **进行中**：所有正在运行的顶层会话，等待交互（审批 / 提问 / 计划评审）的排在最前并以橙色警示标记；卡片含工作空间标签、运行中子代理数、最近活跃时间。
- **已完成**：跑完且尚未查看的会话置顶（绿色标记）；其余汇入「最近完成」（最新在前，默认显示 10 条，可「显示更多」展开）。
- **角标颜色三级**：仅有运行中 = 蓝色；有已完成未读 = 绿色；有会话等待你处理 = 橙色（最高优先）。
- **工作空间筛选器**：一个下拉同时过滤所有分栏（含「未分组」）。它是筛选器而非第三个分栏——原生侧边栏已经负责按工作空间分组浏览。
- 点击卡片直接打开对应会话（`ctx.uiWorkspace.openSession`）。

看板全部数据推导自 root 框架快照（`useSessions` / `useSessionStatus` / `useWorkspaces`），角标与页面共用同一纯函数 `deriveBoard`，两者永不失配。完成历史是会话查看状态，持久化在浏览器 `localStorage`（上限 50 条 / 30 天），会话被归档或被宿主遗忘时自动修剪。

## 安装

**npm（推荐）**——在 DeepSeek Harness 的插件市场搜索 `dsh-ui-progress`，或命令行：

```sh
dsh plugin --profile desktop add dsh-ui-progress
```

**源码安装**——克隆本仓库后以本地链接挂接：

```sh
git clone https://github.com/sdynasty/dsh-ui-progress.git
dsh plugin --profile desktop add link:<克隆目录的绝对路径>
```

安装后刷新 Web 界面，侧边栏出现「进度看板」图标即可使用。

## 已知限制

- 卡片暂无 todo / 目标进度条：这些数据是会话级的，需要宿主新增 `SessionProjectionMap` 成员才能暴露给 root 级面板，是后续的最佳接缝。
- 完成历史保存在本机 `localStorage`，不随账户跨设备；客户端未打开期间完成的会话，会在下次启动时按「未查看」补记。
- `approval` / `question` / `plan-review` 之外的等待类型显示通用「等待处理」。

## 参与开发

`src/` 与 `tests/` 是完整源码（TypeScript + React，遵循 dsh client 插件规范）。`lib/` 是已构建产物，无需构建即可直接安装使用；修改源码后的重建流程见 [BUILD.md](BUILD.md)。`lib/client.js` 的外部依赖仅为宿主基线模块（`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives`）。

问题与建议请提 [Issue](https://github.com/sdynasty/dsh-ui-progress/issues)。

## 许可证

[MIT](LICENSE) © sdynasty
