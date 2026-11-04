# 教师可用时间与排课优化独立验收

日期：2026-11-01。范围：本地 Crazy Talk 前端 Demo。验收者未参与产品实现，仅新增独立测试和本记录。

**最终结论：PASS。** 首轮发现两项问题，经开发修复后，独立浏览器及专项测试复验通过，无阻塞项。

## 验收依据

老师建档维护按星期、多时间段、分钟精度的常规可用时间，支持休息日、生效日期和说明；排课优先推荐常规时间，其他时间可由教务联系老师确认后安排临时课；临时安排不改变常规时间，确认不能绕过课程或请假冲突；固定课检查完整周期；调课与换师遵守同一规则；修改时间保留现有课程；界面表达简洁，后台和教师端共用数据。

## 首轮发现与复验

1. 排课弹窗调整到其他日期后，保存仍停留在原日历，无法直接看到新课。开发已改为成功后定位首节课程所在周；浏览器实际创建 2026-11-10 18:25 临时课后，日历自动切换 11-09 至 11-15；调课到 11-12 同样更新日期和老师。独立回归测试同时检查新课程按钮出现。
2. 从学员入口 `?student=s4` 点击“找老师”后，日期导航触发副作用，将候选列表切回“待排课”，推荐结果不可见。开发限定为真正切换学员才执行该副作用。独立新增推荐测试首轮失败，修复后通过；真实浏览器复验候选老师和“查看可临时协调的老师”开关均正常。

## 实际验证结果

| 验收项 | 真实结果 | 结论 |
|---|---|---|
| 建档与时间维护 | 真实新建 T. Acceptance，录入周一 16:00–18:00、19:30–21:55，11-02 起使用，保存说明；排班页展示一致，其他星期显示休息 | PASS |
| 常规固定课 | 给 Lucy 创建 11-09 起每周一 16:35、连续 8 周课程；待排课 3→2；老师课表出现 8 节，分钟不被取整 | PASS |
| 临时课确认 | 非常规周二 18:25 未确认时无法提交，确认并填写备注后保存；课程仍为未开始、未扣课；常规时间未被扩大 | PASS |
| 冲突拦截 | 试图重复创建已占用的 Carol 11-12 19:25，勾选老师确认后依然无法提交，提示老师已有课程 | PASS |
| 调课及临时换师 | 将 Acceptance 的临时课调整至 Carol 11-12 19:25，要求重新确认；结果保留临时课性质，详情显示新老师、时间、操作者及沟通说明 | PASS |
| 完整周期推荐 | 独立测试在第 5 周放入冲突，8 周推荐降为部分匹配，缩短为 4 周后恢复全部匹配 | PASS |
| 非常规推荐入口 | 默认优先常规匹配，打开临时协调选项后才展示对应候选，并提示需要老师确认 | PASS |
| 缩减时间保护已排课 | 把 Acceptance 周一结束时间改为 16:40，先列出受影响的 8 节课程；确认保存后，8 节原日期、时间和固定课记录完整保留 | PASS |
| 教师端与后台一致 | 英文教师端把 Carol 周一结束时间保存为 17:55，后台随即显示 17:55；切换中文后时间与文案一致 | PASS |
| 减少重复录入 | 周一多段可复制到工作日，替换周二至周五、周末保留，实际保存测试通过 | PASS |
| 原有数据兼容 | 独立测试验证旧星期/单区间设置迁移为分钟时段，保留学员余额和课程，标记原有设置，不覆盖成新默认时间 | PASS |
| 布局与用语 | 浏览器检查桌面、760px 和 390px；表单与固定底部操作可用，无技术模型字段，时间说明与确认提示清楚 | PASS |

## 执行的检查

独立新增 `apps/admin/src/__tests__/availability-independent.test.tsx`，共 5 项，全部通过。随后独立执行以下 5 文件共 **43 项专项测试，全部通过**：

```sh
pnpm exec vitest run packages/shared/src/availability.test.ts packages/shared/src/domain.test.ts apps/admin/src/__tests__/teacher-availability.test.tsx apps/admin/src/__tests__/schedule-availability.test.tsx apps/admin/src/__tests__/availability-independent.test.tsx
pnpm typecheck
CT_DEMO_URL=http://127.0.0.1:5175 node scripts/doctor.mjs
```

shared、ui、admin、teacher 四包类型检查通过。Doctor 的首页、入口源码、字体 HTTP 检查通过。Vitest 有既有 React Router future flag 提示，不影响本次结果。

浏览器验收使用独立 5175 端口，仅通过正常页面录入和操作，没有直接写 localStorage 或调用内部业务命令替代用户流程；5173 用户原数据未操作。验收结束关闭临时标签页，已恢复视口设置。

## 证据

- `docs/evidence/availability-teacher-saved.png`：老师资料录入。
- `docs/evidence/availability-fixed-confirm.png`：16:35 固定课、8 周提交前确认。
- `docs/evidence/availability-temporary-confirm.png`：非常规临时课确认。
- `docs/evidence/availability-rescheduled.png`：换师后的课程详情和沟通记录。
- `docs/evidence/availability-conflict-blocked.png`：已确认仍阻止重复占用。
- `docs/evidence/availability-recommendation-fixed.png`：学员入口推荐复验。
- `docs/evidence/availability-impact-review.png`：缩减时间前列出 8 节受影响课程。
- `docs/evidence/availability-impact-kept.png`：保存后 8 节课程保留。
- `docs/evidence/availability-teacher-english.png`、`availability-teacher-chinese.png`：教师端双语。
- `docs/evidence/availability-narrow-schedule.png`、`availability-narrow-modal.png`、`availability-mobile-modal.png`：760px/390px 布局。

## 边界

结论针对当前前端 Demo 和本次排课优化；未部署，未执行全仓全量回归，不代表真实 ClassIn 同步、生产鉴权或多用户并发验收通过。
