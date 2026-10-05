# 构建说明 / Build Notes

`lib/` 是已构建产物，安装使用本插件**不需要**构建。只有修改 `src/` 后才需要按下述流程重建。

English summary: the plugin ships prebuilt artifacts in `lib/`; you only need this document after changing `src/`. The build requires a [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) source checkout because the client bundle compiles against its pnpm workspace.

## 前提

- 一份 deepseek-harness 源码 checkout，且已完成 `pnpm install`（构建在发布时验证于 `0.2.0-rc.2`）；
- Node 满足该仓库要求（`^22.19 || >=24`）。

## 标准流程（网络可用）

下列命令以 `<harness>` 表示 deepseek-harness 源码树路径、`<repo>` 表示本仓库路径：

```sh
# 1. 把本仓库复制进源码树，并切换为 workspace 构建清单
#    （package.json 是独立 bundle 清单；package.workspace.json 才是构建用的）
cp -R <repo> <harness>/packages/client/ui-progress
cd <harness>/packages/client/ui-progress
cp package.workspace.json package.json
rm -rf node_modules lib
cd ../../..

# 2. 三个装配面各加一行（构建完成后必须还原）：
#    - tsconfig.client.json:                    { "path": "./packages/client/ui-progress" }
#    - packages/bundle/web-app/cordis.patch.yml:  - id: ui-progress / name: 'dsh-ui-progress'
#    - packages/bundle/web-app/package.json:      "dsh-ui-progress": "workspace:*"

# 3. 安装、类型检查、测试、打包
cd <harness>
CI=true pnpm install --no-frozen-lockfile --ignore-scripts
pnpm exec tsc -b packages/client/ui-progress
pnpm exec vitest run packages/client/ui-progress
pnpm --filter dsh-ui-progress bundle

# 4. 取回产物，还原源码树
cp packages/client/ui-progress/lib/client.js* <repo>/lib/
rm -rf packages/client/ui-progress
git checkout -- tsconfig.client.json packages/bundle/web-app/cordis.patch.yml \
  packages/bundle/web-app/package.json pnpm-lock.yaml
git status   # 必须干净
```

## 网络不可用时

`pnpm install` 与 `pnpm run/exec` 会卡在 pnpm 的 deps 状态检查（要访问 npm registry）。改为直接调用工具，并逐项核对产物：

```sh
# 若 staged 包缺 node_modules，先手动补 clsx 链接（其余依赖走 tsconfig paths）
mkdir -p <harness>/packages/client/ui-progress/node_modules
ln -sfn "<harness>/node_modules/.pnpm/clsx@2.1.1/node_modules/clsx" \
  <harness>/packages/client/ui-progress/node_modules/clsx
cd <harness>/packages/client/ui-progress && bash ../../../node_modules/.bin/tsdown && cd ../../..
bash <harness>/node_modules/.bin/vitest run packages/client/ui-progress
bash <harness>/node_modules/.bin/oxlint packages/client/ui-progress
```

## 验收清单（每次构建后逐项核对）

1. `grep -c 'require("clsx")' <repo>/lib/client.js` 输出 **0**（clsx 必须内联，它不是宿主基线模块）；
2. `grep -o 'require("[^"]*")' <repo>/lib/client.js | sort -u` 只允许出现：`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives`；
3. `head -3 <repo>/lib/client.js` 的模块 id 为 `dsh-ui-progress`（与 package.json `name`、cordis.patch.yml 行 `name` 一致）；
4. `pnpm exec vitest run packages/client/ui-progress` 全绿（在源码树内、还原前执行）。
