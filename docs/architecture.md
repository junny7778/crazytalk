# Demo 架构选择

业务页面通过 useDemo 读取快照，通过 act 提交业务命令。一次命令统一处理影响的学员、课次、流水、反馈或薪资。页面只拥有筛选、选择与未提交表单。

## 调用方式

```ts
const { data, act } = useDemo();
act({ type: 'credit.add', studentId, units: 24, kind: '续费', note: '' });
const result = act({ type: 'lesson.resolve', ids, decision: '扣课', reason: '正常上完' });
```

## 选择依据

独立候选 A 为规范化快照及原子命令，候选 B 为模拟仓库及查询缓存。以 A 的短调用与集中规则为基础，采用 B 的 React Query 读取、私有仓库与可替换的数据访问边界。没有另行启动独立裁判，主 Agent 阅读并比较两个候选。

按跨页面一致性、调用接口大小、后端接入边界、实现复杂度比较。A 在命令集中与复杂度上合适，B 提供更清晰的数据访问边界。不采用分页面状态副本，也不引入完整模拟 HTTP 服务。

## 模块

- packages/shared/model 定义状态、命令和持久化校验。
- packages/shared/domain 集中业务转换，输入快照、输出新快照，没有 React 依赖。
- packages/shared/repository 唯一持久化入口，版本检查及撤销反向流水。
- packages/shared/react 连接 React Query 和页面。
- packages/ui 定义 token、基础组件及浮层交互。
- apps/admin 与 apps/teacher 分别组织运营后台和老师界面。

浏览器演示数据不提供正式鉴权及多窗口事务保证。正式服务接入时需实现后端权威校验。固定日期为 2026-10-31。不同端口独立存储；后台 /teacher 入口与后台共享同源演示数据。

先实现课时增加、排课与确认扣课，再验证跨页面一致性。业务状态由枚举表达，转换只有一个入口。撤销产生反向流水，保留其间发生的续费等操作。
