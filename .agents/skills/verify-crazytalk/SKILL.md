---
name: verify-crazytalk
description: 验证 Crazy Talk 教务后台和老师端的浏览器流程。复跑 Demo 学员建档购课，或按功能地图选择本地业务版的专项验收。
---

# 验证 Crazy Talk

按本次改动选择 [功能地图](features/README.md)。只需验证一条主流程时，跑 [学员建档与购课](features/students.md)，覆盖建档、购课和刷新后的余额与流水。核对排课、自动扣课和半月工资单时，按[半月薪资专项](features/feedback-payroll.md)复跑真实本地 API，读取双方金额和确认后的快照。验证其他 PostgreSQL 写入或业务登录时，使用 [业务自动验收](features/business.md)。

## Launch

从 `crazytalk-ops` 根目录运行。需要 Node 20+、pnpm 和 Google Chrome。首次使用先运行 `pnpm install --frozen-lockfile`。

有本 checkout 启动的 Demo 服务时，可复用它并记下地址。单独启动时，在一个终端前台运行以下命令。

```sh
pnpm --filter @crazytalk/admin exec vite --host 127.0.0.1 --port 5183 --strictPort
```

等 Vite 打印 `http://127.0.0.1:5183/`。浏览器看到「数据看板」后可操作，脚本会等待该入口可见。若端口已占用，选一个空闲端口，同时更新下一步的 `CT_DEMO_URL`。单独启动的服务在验证结束后按 `Ctrl+C` 退出。

## Doctor

在另一个终端运行。复用服务时，把地址设为已确认属于本 checkout 的 Demo 地址。

```sh
export CT_DEMO_URL=http://127.0.0.1:5183
node scripts/doctor.mjs
```

看到 `/`、`/src/main.tsx` 和 `/fonts/HarmonyOS_Sans_SC_Regular.woff2` 三行 `PASS` 再继续。Demo 无需登录。若启动画面一直停在加载状态，查看页面提示和 Vite 输出。

## Drive

在设置了 `CT_DEMO_URL` 的同一终端执行 `./scripts/verify-student-credit.mjs`。脚本使用项目已有的 Playwright，在全新 Chrome 会话中通过页面按钮建档、购课和复核。每次使用新姓名，浏览器会话之间的数据独立。操作步骤与断言见 [学员建档与购课](features/students.md)。

手动验证地图里的其他功能时，可用 `cua_repl` 打开已确认的本地地址，通过页面可访问名称操作。同源 `/teacher` 与后台共享 Demo 数据，独立端口使用各自的浏览器存储。

## Evidence

脚本打印 `Evidence:` 和 `.playwright/verify-crazytalk/student-credit-*` 下的本次路径。退出码为 0 且末行出现 `PASS` 时，目录包含购买前的弹窗摘要 `before-purchase.aria.txt`、刷新后余额和流水的 `result.txt`，以及流水截图 `ledger.png`。失败时看终端中的断言及对应操作，使用已经写出的证据定位失败步骤。

手动验证也要记录操作和结果。排课看课程和排课进度，扣课看余额和流水，反馈扣款看薪资明细。报告本次使用的环境。主流程证明 Demo 能从浏览器存储重新读回数据。

## Cleanup

脚本退出时关闭本次 Chrome 会话，随之清理本次的浏览器数据。手动验证时关闭本次创建的临时会话。若本次另起了 Vite，在启动终端按 `Ctrl+C`，再确认该端口已释放。证据保留在脚本打印的目录，清理后用 `ls -l` 确认三个文件仍在。

## Helpers

- `node scripts/doctor.mjs` 检查本地入口可用。
- `./scripts/verify-student-credit.mjs` 通过 Chrome 跑建档购课，保存结果证据。
- `pnpm typecheck` 检查四个工作区包。
- `pnpm test` 检查共享业务转换与关键边界。
- `node scripts/check-ui.mjs` 检查页面颜色、圆角和中英文键。

## 历史 Demo 证据（不代表当前业务验收）

2026-10-31 已按学员加课时路径运行，浏览器验证 18→42 并看到 +24 流水；验证批量扣课和撤销、Lucy 固定排课 16 节、反馈判定后 Carol 月薪扣款 50→100。证据见 docs/verification.md。真实 ClassIn、跨浏览器与生产权限未验证。

当前业务实现及测试结果见 `docs/业务版本实施进度.md` 和 `docs/业务版本验收覆盖.md`。界面或入口变化后，用 `/maintain-verification-skill` 校对地图和命令。
