# 学员中心独立验收

验收依据：项目上级目录 `docs/学生课程信息表.xlsx`、`docs/客户反馈.txt`、`docs/Crazy Talk_客户方案及报价_V1.0.md` 的3.1、3.7—3.9节，以及本轮确认的前端Demo范围。验收者未参与实现；仅新增独立测试与本报告。

**最终结论：PASS。** 首轮及后续复验发现的4项问题均已返工，独立复测通过。此结论针对本轮确认的本地前端Demo。

## 首轮结论：REJECT

1. 覆盖导入老师信息造成档案与列表不一致。对Jayden原档案覆盖导入T. Destiny，导入成功且teacherName更新，但列表和筛选仍由旧teacherId显示T. Carol。老师调整还涉及后续课，不能悄悄替换或忽略。要求安全拒绝并指引换师操作，或者明确区分原表信息与当前安排，并保证列表指定原表口径与筛选一致。
2. 今天已完成的课程不能提交进度。老师端今日课程设为已完成、尚未提交报告，打开课程详情没有“结课”按钮，因为入口只允许日期早于演示日。要求今天完成的课程可立即提交教材页码；未来课程不能提前结课。
3. 排课页面仍把25分钟固定称1课时、50分钟称2课时，55分钟详情用四舍五入显示2课时；时长选择没有原表存在的55分钟。要求按分钟排课，只展示明确确认过的扣课数，并承接55分钟时长。
4. 后续复验发现：已结课学生补记历史补偿也会被自动恢复为“在读／正常”。独立测试以2026-10-01补偿业务日复现。最终采用保守口径：课时登记均不隐式复课，续费只更新是否续课；恢复教学服务由“办理复课”明确执行。

前两项通过独立UI测试复现。第三项经源码定位后加入55分钟选项和详情专项验证。测试文件：`apps/admin/src/__tests__/student-acceptance-review.test.tsx`。

## 已验证证据

- 直接读取真实xlsx两层表头并独立提取55位学生全部27列，逐行与导入/导出业务值比较通过；跳过2行仅序号空记录。Excel日期按真实序列转换，未猜测7月年份。
- 已有专项6文件46测试通过，覆盖9列列表、27字段默认详情、无编号建档、表单编辑、导入导出、0与空白、充值业务日期金额、补偿反馈关联、转介绍关系、待办、退款停用和人工确认扣课。
- admin、shared、teacher三个受影响包类型检查均通过。
- 只读打开实际开发站点列表与默认详情，核对真实渲染的9列列表、5页签与默认27字段7分组；未修改真实浏览器存储。

## 返工复测

| 关卡 | 返工后证据 | 结果 |
| --- | --- | --- |
| 覆盖导入老师一致性 | 老师实际变更时整批原子拒绝，明确提示先办理换老师；旧资料和课表不变。普通原表字段更新保留余额、其他月份与流水 | 通过 |
| 今天结课与进度联动 | 今日已完成课可从真实老师页面进入结课，只填教材与页码即可提交；学生教材与页码同步，未自行扣课。未来、未开始、取消课均拒绝提前提交 | 通过 |
| 排课时长与计量 | 下拉支持25/50/55/120分钟，55分钟固定课8节与临时课1节经真实表单保存，均不自行确认扣课数量；未核实课程详情不按分钟折算课时 | 通过 |
| 课时与服务状态 | 结课学生登记历史补偿、续费均保持结课；续费更新是否续课。随后明确办理复课才恢复在读及正常订单 | 通过 |
| 数据与存储边界 | 新档案剩余课时未知；旧存储缺少新字段仍保留既有档案、余额和课程。真实原表全部55位27列逐项核对通过 | 通过 |

最终实跑：8个相关测试文件 **75项通过**（含本次独立验收文件14项）；另对共享domain的排课、冲突、换师和部分时段请假定向运行 **5项通过，9项未选中**。admin、shared、teacher三个受影响包类型检查再次全部通过。出现的React Router future flag提示不影响上述结果。

复跑命令：

```sh
pnpm exec vitest run packages/shared/src/student.test.ts packages/shared/src/student-demo.test.ts apps/admin/src/lib/studentWorkbook.test.ts apps/admin/src/__tests__/student-center-v2.test.tsx apps/admin/src/__tests__/student-forms-v2.test.tsx apps/admin/src/__tests__/lesson-confirmation.test.tsx apps/admin/src/__tests__/student-independent.test.tsx apps/admin/src/__tests__/student-acceptance-review.test.tsx
pnpm exec vitest run packages/shared/src/domain.test.ts -t '原表正常|排课|更换老师|部分时段'
pnpm --filter @crazytalk/admin typecheck
pnpm --filter @crazytalk/shared typecheck
pnpm --filter @crazytalk/teacher typecheck
```

本轮仅在jsdom隔离存储中执行操作测试，未改动浏览器现有存储；未部署，未执行全仓全量回归。真实后端、ClassIn、消息与资金退款不在本地Demo验收范围；未确认的二期自动提醒和派单参数不作为既定规则验收，后续AI能力不作为当前已实现功能。
