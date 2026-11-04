# 后台导航与新建学员修复

2026-10-31，针对老师菜单进入老师端，以及新建学员导致页面无响应的专项修复。

## 模块核对

| 入口 | 路径 | 应显示 |
| --- | --- | --- |
| 数据看板 | / | 运营总览和老师利用率 |
| 学员 | /students | 学员列表及档案入口 |
| 排班管理 | /schedule | 老师时间、找老师和排课 |
| 上课记录 | /lessons | 课后确认及全部记录 |
| 反馈 | /feedback | 工单及处理措施 |
| 老师 | /teachers | 老师管理列表及六个详情页签 |
| 薪资 | /payroll | 月度薪资及单价 |
| 顶栏设置 | /settings | 后台设置 |
| 老师端 | /teacher | 独立的老师 H5 首页 |

## 复现和日志

读取了正在运行的 Vite 开发服务日志，未见这两次操作对应的编译错误或服务崩溃。用户 Chrome 标签的调试连接超时，因此通过同一服务的内置浏览器重新复现。

点击老师菜单后 URL 为 /teachers，DOM 却显示 Hi Carol 和 Close lesson。点击新建学员后，浏览器输入和调试请求超时，表现为页面卡死，无法取得可靠的异常堆栈。

新增实际 App 交互回归。修复前两项失败：老师列表标题缺失，学员建档触发持续重复渲染。测试用 Profiler 的有限提交看门狗中止循环，以免测试进程也被卡死。其断言仍是可见页面、表单输入和列表可操作性。

## 根因与改动

App 原先用 pathname.startsWith('/teacher') 识别老师端，连同 /teachers 和 /teachers/:id 一起匹配。现改为 /teacher 本身或 /teacher/ 子路径。后台菜单选中判断也遵循路径段边界。

学员列表原先每次渲染都重新 filter 数据。表格检测到新数据后自动重置内部分页，再触发一次渲染，形成循环。现缓存筛选结果，并设置 manualPagination，因为实际分页已经由页面 URL 管理。

## 验证

运行 `pnpm exec vitest run apps/admin/src/__tests__/navigation-and-students.test.tsx`，13 项通过，覆盖七个菜单、设置、老师详情、独立老师端、列表与顶栏的连续新建，以及保存后衔接加课时。

运行 `pnpm --filter @crazytalk/admin typecheck`，通过。

真实浏览器验证老师列表和 Carol 详情均保留后台导航；连续五次打开新建学员、输入和取消，列表仍响应，控制台无 error。

截图保存在 docs/evidence/fix-teacher-management.png。未执行全量业务回归、生产构建或部署。此前的验收漏掉了这两个实际入口，本次补入可重复执行的交互回归。
