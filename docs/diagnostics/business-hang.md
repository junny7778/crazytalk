# 业务版卡死取证

当前根因未确定。以下是诊断工具，不是业务修复。

## 启动

在仓库根目录执行：

```sh
node scripts/capture-business-hang.mjs 'http://127.0.0.1:5175/settings?tab=classin'
```

工具打开独立 Chrome 配置，不操作原标签页。登录后执行原故障操作；卡死时保留窗口，并记录操作及时间。Ctrl-C 结束采集并关闭该诊断窗口，先保存未提交业务表单。日志位于终端显示的 `~/.crazytalk/logs/hang-*` 私有目录，浏览器配置包含登录状态，不应提交或共享。

记录包括每秒页面心跳、JS 堆、Chrome PID/CPU/RSS、DOM/布局等 CDP 指标、每约十秒一段性能轨迹，以及持续 V8 CPU 采样。进程采样独立于页面/CDP。前台心跳超过四秒未到记录 stall；这只是疑似卡死信号，系统休眠、暂停调试或系统资源压力也可能造成同样现象，需结合进程与轨迹确认。系统 CPU 百分比不等于瞬时采样值。

轨迹 JSONL 每行是一个 Chrome trace event，可转换为 `{"traceEvents": [...]}` 后导入 DevTools Performance。可能包含脚本地址、函数名等诊断信息；共享前检查脱敏。CDP 停止轨迹超过五秒会记录失败，完全卡死时仍需依靠已保存分段和独立 V8/OS 数据，不能保证最后一段可导出。

## 专项自测

```sh
node scripts/capture-business-hang.mjs --self-test
```

在独立测试页制造八秒主线程阻塞，必须捕获 stall 和恢复后才打印通过。合成自测不算复现业务故障。

## 本地生产构建对照

```sh
pnpm --filter @crazytalk/admin build:business --outDir "$HOME/.crazytalk/business-preview-dist"
pnpm --filter @crazytalk/admin exec vite preview --mode business --host 127.0.0.1 --port 4175 --strictPort --outDir "$HOME/.crazytalk/business-preview-dist"
node scripts/capture-business-hang.mjs http://127.0.0.1:4175
```

仅本地运行；API 代理沿用业务模式配置。先验证开发版同操作可复现，再以同版本 Chrome、同账号/数据/操作对比生产构建。独立配置与用户原配置仍是不同环境，不能用未复现直接排除原故障。不要同时更换浏览器版本、数据和应用构建。

## 当前验证

2026-11-18：脚本语法检查通过；合成阻塞捕获 stall/recovered、进程样本、约 3.3 MB trace 和非空 V8 日志。业务生产构建成功；4175 HTML 返回 200，未登录 /api/me 返回 401。尚未完成登录后的生产场景验收，尚未捕获本脚本下的真实业务卡死。

## 2026-11-18 23:34 故障定位与修复

真实现场证据保存在 `~/.crazytalk/logs/hang-1795015176969/incident-233447`。两个页面于 23:34:48 在转换后的 shared/react.tsx:97 报错，该位置为“业务页面缺少登录上下文”；随后心跳停止。V8 样本集中于 React 错误处理和 React Router 默认错误页。同期 API 曾拒绝连接，但隔离复现无需停止 API，说明接口中断并不是触发此卡死所必需的条件。

在 `/tmp/ct-hang-repro-2334` 独立源码副本、5187 独立 Vite 服务中，仅追加 model.ts 注释触发真实 HMR：未修复入口约十五秒产生 155924 条 pageerror/console-error 事件，最后三秒零心跳；还出现同一个容器重复 createRoot 警告。热更新重新执行入口时，旧 React root 和 router 没有释放。旧树与更新后的业务 Context 失配后，错误恢复持续占用主线程。修复入口 HMR dispose：先 router.dispose()，再 root.unmount()，随后由重新执行的入口创建新实例。

同一隔离触发步骤，加入清理后心跳最后三秒为 12 次，没有上下文错误或重复 root 警告，返回工作台及学员中心导航通过。回归脚本：

```sh
node scripts/verify-business-hmr.mjs /tmp/ct-hang-repro-2334 http://127.0.0.1:5187
```

脚本针对已准备好的隔离源码副本和独立 Vite 服务，拒绝对当前工作目录运行。它打开两个页面，执行两轮模型热更新，检查两页心跳、运行错误、重复 root 警告，并验证实际导航；不会修改业务数据。API 使用当前本地服务及本地测试登录配置。

此结论针对已复现的 HMR 卡死，不代表所有历史白屏或导航失效都已解释。已陷入死循环的旧页面不能靠热更新自行恢复，保留取证后需关闭该故障页面并重新打开。未部署。

最终专项结果：两个页面、两轮 HMR 全部通过；两页均无运行错误/重复 root 警告，导航均到达 `/students`。脚本语法检查通过，未执行全量回归。

## 2026-11-19 第二次故障：仍未解决

此前“已修复”仅覆盖第一次可复现的重复 React root 故障，不能作为全部卡死问题已解决的结论。第二次故障记录为 00:18:23 后端 watch 因代码变化重启，00:18:23.889 代理拒绝连接，00:18:24.532 后端恢复，00:18:30 页面 watchdog 报告 stall（最后 errors=0）。对应进程采样记录内存 footprint 22.1 GB，但关键 JIT 帧没有函数名。原性能采集在 00:04:57 已报告目标关闭，未覆盖本次故障。证据目录：`~/.crazytalk/logs/incident-20261119-0018`。

进一步调查执行了以下隔离验证，均不构成第二次故障已修复的证明：

- 修正隔离环境差异：移除额外 alias/dedupe 配置，使用原 vite.config.ts 插件和各工作区包的真实解析方式，独立端口 5188。
- 18 轮依次修改 seed/repository、businessReact、react、model、organization、domain，每三轮注入 /api/me 的 500 响应；心跳持续，无持续卡死。
- 有可见窗口、设置页弹窗内存在未保存文本的六轮相同测试；心跳持续，无持续卡死，未保存任何业务数据。
- 通过浏览器扩展直接使用用户当前 Chrome 打开独立端口 5188，追加 seed/repository 注释并让该独立服务 /api/me 失败两秒。页面显示加载失败，点击重新加载恢复项目与渠道页面。原 5175 服务未被故障注入。

测试脚本保留在 `/tmp/ct-hang-repro-2334/stress-exact.mjs`、`stress-dialog.mjs`；临时服务的故障开关是该目录下的 api-offline 文件（测试结束已移除）。这些脚本仅修改独立源码副本。旧 156 helper 可打印版本，但无法作为完整浏览器被 Playwright 启动；该失败不算业务测试。当前浏览器直接验证弥补了该项环境差异。

截至此记录，浏览器工具可见的 5175 标签页已正常响应，之前无响应的原标签页不在列表中，无法从该现场继续获取 JavaScript 调用栈。没有凭以上未复现结果增加重试、强制刷新或修改业务失败处理。第二次故障仍是未完成项。

## 2026-11-19：页面内诊断 v2

普通本地业务页已启用 v2，不依赖独立 Playwright 窗口。已从 5175 实际日志确认 version=2、documentId、request 和 checkpoint 记录落盘。

新增：每个文档的稳定关联 ID（同文档 HMR 保持不变）、热更新开始/结束及源文件更新记录、React 根节点卸载前后、/api/me 与 /api/state 的请求 ID/阶段/状态/耗时/未完成数量、控制台错误分类、最多六个仅包含文件名/行/列的栈帧、每秒超过一百次提交的渲染告警、导航点击与 body 禁止点击/弹窗/遮罩数量。每十五秒写检查点。Worker 只用真正的定时心跳恢复响应状态，错误或渲染循环发出的信号不能掩盖心跳中断。

不保存请求或响应正文、凭证、完整错误消息、表单内容或业务对象。错误栈提取最多每秒一次；Worker 的普通诊断事件最多每秒十条。日志不能在任意已经完全卡死的主线程里即时提取新栈，它保留的是卡死之前的调用线索与卡死期间 Worker 可见的状态。

实际发现并修复诊断模块 HMR 生命周期缺陷：只注册 hot.dispose 不足以处理依赖被重新执行的情况。失败测试中 Worker 从一个变成两个；现在通过 hot.data 保存上一个实例的清理函数，在重新初始化前终止旧 Worker、清理监听器/定时器/PerformanceObserver 并恢复 fetch/console 包装。修复后同一测试始终一个 Worker。该缺陷尚未证明是第二次 22 GB 卡死的根因，不能混为同一个修复。

独立 capture 脚本也增加 page-closed/page-crashed 记录，页面关闭后停止采集，避免把目标已关闭误报成页面卡死。

专项验证入口：

```sh
node scripts/verify-browser-diagnostics.mjs /tmp/ct-hang-repro-2334 http://127.0.0.1:5188
```

已验证请求记录、错误分类及脱敏、错误限频、HMR 后文档关联不变且仅一个 Worker、HMR 结束标记、7.5 秒主线程阻塞的 stall/recovered、日志接口全部返回 204。该合成阻塞仅验证采集器，不是第二次业务故障复现。

代码排查同时检查了 BusinessProvider 初始加载与轮询 effect、App 导航 effect、Settings 草稿同步及离开阻止、业务模式的问卷预填开关。尚未在这些路径中证实造成第二次卡死的无界更新循环，因此未添加业务重试或改动业务状态处理。

admin 类型检查只报告已有 settings-navigation.test.tsx:922 的 Testing Library exact 选项类型错误，本轮诊断文件未报告类型错误；未宣称完整类型检查通过。未部署。
