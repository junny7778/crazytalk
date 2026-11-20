# 本地业务自动验收

## 启动与隔离

复用本地 PostgreSQL 与已有开发服务。缺少服务时运行 `pnpm db:up`、`pnpm dev:api`、`pnpm dev:business`；老师端运行 `pnpm --filter @crazytalk/teacher dev:business`。API 使用本地 `.env`，不要输出凭证。`pnpm doctor:api` 应返回本项目服务和数据库 ready。未知占用端口的进程不得结束。

业务后台默认 5175，老师端 5176，API 3011。公开问卷直接从后台生成链接，在未登录浏览器填写。Demo 默认 5173，使用本地样本，不能用其成功证明真实数据库写入。

## 可重复命令

- `pnpm test:business:api`：创建随机独立 schema、迁移、启动 3191 隔离 API，完成真实 HTTP 和数据库验证，最后删除该测试 schema。测试服务器禁止非 loopback 请求，使用独立凭证和上传目录。
- `pnpm test:business:ui`：Chrome 驱动真实页面。读取本地忽略文件 `apps/api/.env.browser-test.json` 的开发账号，创建有唯一名称的测试资料；不要指向生产地址。
- `pnpm --filter @crazytalk/api exec tsx src/integrations/verify-worker.ts`：独立 schema 与 mock ClassIn 客户端验证 outbox、并发、未知结果和成员变更。
- `pnpm exec vitest run <本次相关测试文件>`：领域及页面控件测试。模块整体验收时执行 `pnpm test` 和 `pnpm typecheck`。

## 观察结果

浏览器需断言提交成功、刷新重读、关联对象及余额／进度，不只检查页面能打开。证据保存 `test-results/`，Playwright 失败保留截图与 trace。数据库测试需覆盖冲突或失败时不留下半笔数据。每次输出按实际执行区分领域测试、真实 API、浏览器及外部联调。

## 外部边界

未配置公网回调时报告阻塞，继续完成本地验证。SID 与密钥通过只读接口不代表建课、改课、取消已验收。真实写入需要明确测试老师 UID、学员 UID、允许创建和修改的测试课程及可达回调地址。账号查询失败不可静默改成可能创建账号的 register。

结果未知的 ClassIn 写入禁止盲重试。先核对外部课程／课节 ID 及状态；读取契约未明确时保留阻塞，不能展示已同步。退款外部候课名单和权限停用范围也需独立确认。


## ClassIn 账号共享余额（2026-11-20）

以同一 UID 为共享单位：在关联账号先核实 UID，查看成员和余额，再确认共享；加课时无独立共享入口。
验证两名学员绑定后显示同一余额；重复绑定不加余额；从任一成员充值、扣课和更正后另一成员同步；预约占用与取消释放不重复计算。
历史导入多份余额不自动求和，成员不一致先核实；禁止单独带走共享余额。正式退费影响同账号全部成员，个人课程与购买流水仍可追溯。
相关测试：studentAccount、sharedOrder、packageLifecycle.acceptance、scheduleCredits、businessEffects，以及 student-forms-v2、shared-credit-detail、schedule-workflows。


## ClassIn 班级与取消后重约（2026-11-20）

规则及实际覆盖见 [实施记录](../../../../docs/ClassIn排课与班级实施记录.md)。`verify-classes.ts` 使用随机独立 schema 和模拟外部客户端，覆盖组合分班、换师、共享换号、成员/班主任失败恢复、人工核实及旧课堂兼容；不能替代真实 ClassIn 验收。
换号仅取消换号学员的未开始预约。原账号还有其他成员时余额全部留原账号；独享账号才继承余额。按原老师定向换师，旧取消确认之前禁止提交新预约。未知结果不能直接重建课堂。
