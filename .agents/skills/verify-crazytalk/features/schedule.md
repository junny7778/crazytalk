# 排班

## Sub-features

周日视图、待排课、找老师、固定临时课、冲突、空档图。

## How to get to it (user POV)

排课管理默认「按学员排课」→ 选择学员 → 排课概况 → 一键排课 / 自定义排课 → 预览确认。也可切换「按老师排课」→ 为该老师排课，或查看完整课表。已排学员仍在列表中，已有课程从详情调整时间。

## Driving it with cua_repl

先保证学员已有课包、ClassIn账号已核实UID，教师可用时间和培训符合规则。按页面选择日期、时间和老师，确认固定或临时计划。检查课程数量、日期、老师及可用课时占用；同老师重叠时段必须阻断。取消符合提前条件的课程后，确认占用释放并保留取消历史。


## Gotchas

仅在需要重新演示时恢复Demo数据，业务环境禁止重置。过去日期不可排。找老师检查未来 4 周，排课确认检查所有已选周。空档图不得包含其他学员姓名。


## ClassIn 账号共享余额（2026-11-20）

以同一 UID 为共享单位：在关联账号先核实 UID，查看成员和余额，再确认共享；加课时无独立共享入口。
验证两名学员绑定后显示同一余额；重复绑定不加余额；从任一成员充值、扣课和更正后另一成员同步；预约占用与取消释放不重复计算。
历史导入多份余额不自动求和，成员不一致先核实；禁止单独带走共享余额。正式退费影响同账号全部成员，个人课程与购买流水仍可追溯。
相关测试：studentAccount、sharedOrder、packageLifecycle.acceptance、scheduleCredits、businessEffects，以及 student-forms-v2、shared-credit-detail、schedule-workflows。

## 排课交互优化验收

概况与设置分开，保留固定/灵活意向；自定义和灵活课表先预览再提交。检查返回保留草稿、切换人员/Tab或离开页面的草稿保护、只读权限和共享余额口径。
专项证据见 `docs/evidence/schedule-redesign/README.md`，浏览器脚本为 `scripts/verify-schedule-redesign.mjs`。待排列表不再因排齐自动移除学员，改为检查当前计划进度更新且选中学员保留。
