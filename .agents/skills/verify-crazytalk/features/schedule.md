# 排班

## Sub-features

周日视图、待排课、找老师、固定临时课、冲突、空档图。

## How to get to it (user POV)

排课管理 → 待排课 → 选择学员 → 找老师；也可从学员档案进入排课。

## Driving it with cua_repl

先保证学员已有课包、ClassIn账号已核实UID，教师可用时间和培训符合规则。按页面选择日期、时间和老师，确认固定或临时计划。检查课程数量、日期、老师及可用课时占用；同老师重叠时段必须阻断。取消符合提前条件的课程后，确认占用释放并保留取消历史。


## Gotchas

仅在需要重新演示时恢复Demo数据，业务环境禁止重置。过去日期不可排。找老师检查未来 4 周，排课确认检查所有已选周。空档图不得包含其他学员姓名。


## ClassIn 账号共享余额（2026-11-20）

以同一 UID 为共享单位：在关联账号先核实 UID，查看成员和余额，再确认共享；加课时无独立共享入口。
验证两名学员绑定后显示同一余额；重复绑定不加余额；从任一成员充值、扣课和更正后另一成员同步；预约占用与取消释放不重复计算。
历史导入多份余额不自动求和，成员不一致先核实；禁止单独带走共享余额。正式退费影响同账号全部成员，个人课程与购买流水仍可追溯。
相关测试：studentAccount、sharedOrder、packageLifecycle.acceptance、scheduleCredits、businessEffects，以及 student-forms-v2、shared-credit-detail、schedule-workflows。
