# Crazy Talk 业务 API

本地基础服务使用 NestJS、Prisma 和独立 PostgreSQL。提供会话登录、按账号范围读取、业务命令、课后撤销、账号设置、问卷、附件及 ClassIn 集成接口。

在工程根目录执行：

```sh
pnpm install
pnpm db:up
```

在 apps/api/.env 配置开发数据库：

```dotenv
DATABASE_URL=postgresql://crazytalk:local-development-only@127.0.0.1:55432/crazytalk_dev
API_PORT=3011
```

继续在工程根目录执行：

```sh
pnpm --filter @crazytalk/api db:generate
pnpm --filter @crazytalk/api db:deploy
pnpm dev:api
```

另开终端运行 `pnpm doctor:api`。检查 /api/health 的应用标识及数据库迁移就绪状态。

本地数据库的服务端口仅绑定 127.0.0.1，数据保存在 crazytalk-local_crazytalk_dev 卷中。结束 API 使用启动它的终端 Ctrl+C。停止本项目数据库使用：

```sh
docker compose -p crazytalk-local -f compose.dev.yaml stop database
```

ClassIn 凭证只配置在服务端，联调结果按功能编号单独记录。

## 初始化登录账号

在 apps/api 工作目录设置 BOOTSTRAP_LOGIN、BOOTSTRAP_PASSWORD（至少 8 位）和可选 BOOTSTRAP_NAME，运行 `pnpm exec tsx src/bootstrap.ts`。已有账号时拒绝重复初始化，不重置现有密码。

老师档案创建后，在同一工作目录设置 TEACHER_ID、ACCOUNT_LOGIN、ACCOUNT_PASSWORD，运行 `pnpm exec tsx src/create-teacher-account.ts`。命令检查老师存在且尚未绑定登录账号，再一次性建立身份和本人范围。密码由操作者明确提供。账号使用相同的登录页面，服务端根据 teacherId 限定本人课表、学员、报告和薪资。

## 自动化数据库验收

`pnpm exec tsx src/business.integration.ts` 创建独立临时数据库 schema，应用全部迁移，启动独立 3191 端口服务并经 HTTP 验证登录、权限、CSRF、重复请求、共享课时、并发购课、排课冲突、课后撤销、反馈、工资冻结及老师身份隔离。另外验证 16 MB 视频上传、分段读取和账号语言隔离。验收服务强制拒绝所有非本机 HTTP 请求，使用独立 ClassIn 配置目录和测试凭证，不读取真实机构配置。结束后清理本次 schema、附件和服务。此脚本只在本地开发数据库使用。

## 后台处理

API 每 30 秒执行到堂状态及课后自动结算，每 5 秒消费一个待处理 ClassIn 任务。多个 API 进程通过数据库锁协调。失败任务需明确发起重试，外部结果不确定的任务不会自动重发。退出时停止计时并等待在途任务结束，再断开数据库。真实 ClassIn 链路验收状态见项目联调记录，不能用本地测试通过替代外部验收。
