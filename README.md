# 运行 Crazy Talk Demo 与业务版

同一套界面提供独立 Demo 与业务入口。Demo 保存浏览器样本，标准演示使用 36 名学员、10 名老师，业务时刻固定为 2026-10-31 18:00（UTC+8）；业务版使用真实 API、PostgreSQL 和当前业务日期。

## 启动

使用 Node 20 或更新版本，以及 pnpm。

```sh
pnpm install
pnpm dev
```

打开 http://127.0.0.1:5173/。老师端使用 http://127.0.0.1:5173/teacher，与后台共享同源数据。

独立运行老师端时执行 `pnpm dev:teacher`，打开 http://127.0.0.1:5174/。独立端口的数据与后台隔离。

## 本地业务入口

API 和数据库初始化见 [apps/api/README.md](apps/api/README.md)。运行 `pnpm db:up`、`pnpm dev:api`，再运行 `pnpm dev:business` 打开 `http://127.0.0.1:5175/`。业务老师端运行 `pnpm --filter @crazytalk/teacher dev:business`，地址 `http://127.0.0.1:5176/`。API 默认 3011，两个业务入口代理同一后端。

首次登录账号通过服务端 bootstrap 初始化，老师登录账号明确绑定 teacherId。业务模式不加载 Demo 样本，也不提供演示身份切换和数据重置。公开问卷链接允许未登录家长填写。

本地自动验收入口为 `pnpm test:business:api`、`pnpm test:business:ui`。完整领域和组件回归可运行 `pnpm test --maxWorkers=4`。已执行结果、外部阻塞和限制见 [实施进度](docs/业务版本实施进度.md)、[验收覆盖](docs/业务版本验收覆盖.md)及 [ClassIn联调记录](docs/ClassIn联调记录.md)。当前未部署公网服务。

## 体验关键任务

1. 在学员中心建档并购买 72 课时，查看档案余额和流水，刷新后复核。
2. 在排课管理选择已核实 ClassIn 账号及余额的待排课学员，找老师并按计划安排课程。
3. 在上课记录确认正常课程，10 秒内撤销并检查恢复。
4. 在「薪资」选择 2026/10/16–10/31。打开 T. Erika 的工资单可核对课酬、迟到扣款、学员缺席、好评奖和复购奖。T. Destiny 展示固定课时底薪和迟到扣款，T. Glyzel 可直接体验确认薪资，T. Nora 可查看离职固定课时老师的计薪截止日。T. Carol 和 T. Kathy 保留待核案例。切换到 10/01–10/15 可查看 Erika 已发放的工资单和培训补贴。
5. 在设置查看角色，预览权限差异。用户菜单也可切换演示身份。
6. 在老师端结课，填写教材进度、评分和评语，切换中英文。

## 恢复演示场景

打开右上用户菜单，选择“恢复演示数据”，确认恢复初始数据。本浏览器当前 Demo 中的新增记录会被清除；普通刷新会保留编辑。标准 Demo 使用独立的浏览器存储，启动时不导入本地学员工作簿。

## 验证改动

```sh
pnpm check
pnpm doctor
```

`check` 包含工作区类型检查、领域与页面测试，以及 UI token 和双语键检查。浏览器专项路径见 [.agents/skills/verify-crazytalk/SKILL.md](.agents/skills/verify-crazytalk/SKILL.md)，实际结果见 [验证记录](docs/verification.md)。

## 当前边界

- Demo 使用浏览器数据，演示同步状态不能证明真实 ClassIn 完成。
- 业务版通过真实数据库事务及会话权限处理数据；附件暂用本地磁盘，生产对象存储和部署尚未配置。
- 业务版基于按范围投影的状态 DTO 复用页面，尚未改为资源分页查询接口。没有执行容量压测，不能据此声明生产容量。
- ClassIn SID/密钥只读校验通过。成员查询、未知结果恢复契约、真实课程写入和公网回调仍按联调清单处理。未自动替换成会创建账号的接口。
- 工资发放状态由人工登记，不对接银行付款；退款外部候课名单及权限停用范围待确认。
- Demo 与业务版保留相同表单、排课、反馈、课时和薪资规则；不因外部卡点删减交互。

## 字体资源

字体自托管于 apps/admin/public/fonts，老师端开发服务复用此目录。HarmonyOS Sans SC 为 Regular、Medium、Bold 的业务文本子集。整理来源为 https://github.com/IKKI2000/harmonyos-fonts 。Inter 来自 https://github.com/rsms/inter 。正式上线前按项目要求核对授权和补充完整字体许可文件。

业务版最新验收与联调材料：

- [模块验收覆盖](docs/业务版本验收覆盖.md)
- [ClassIn真实联调待测清单](docs/ClassIn真实联调待测清单.md)（用户已要求暂不执行真实账号操作）
- [ClassIn契约与阻塞](docs/ClassIn接口契约核对与阻塞清单.md)
- [正式运行准备](docs/正式运行准备与上线验收.md)
- 隔离浏览器验收：`node tests/e2e/run-isolated.mjs`，自动清理测试schema，不操作真实ClassIn账号。
