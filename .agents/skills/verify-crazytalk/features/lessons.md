# 课后确认

## Sub-features

正常批量确认、异常原因、不扣课、账号关联、撤销、更正、课程重新更新。

## How to get to it (user POV)

上课记录默认“待确认”。

## Driving it with cua_repl

展开正常课程明细，记节数与课时，点击确认扣课。检查卡片和计数减少。10 秒内点撤销，检查正常课程恢复；学员课时流水出现撤销退回，余额恢复。异常卡片点不扣需填原因。全部页签筛选需要重新更新，重新更新后该课移出筛选结果。

## Gotchas

撤销超过 10 秒需走更正结果，不可改本地时间绕过。确认已处理课不应再次扣课。数字快捷键不得在表单输入时触发。


## ClassIn 账号共享余额（2026-11-20）

以同一 UID 为共享单位：在关联账号先核实 UID，查看成员和余额，再确认共享；加课时无独立共享入口。
验证两名学员绑定后显示同一余额；重复绑定不加余额；从任一成员充值、扣课和更正后另一成员同步；预约占用与取消释放不重复计算。
历史导入多份余额不自动求和，成员不一致先核实；禁止单独带走共享余额。正式退费影响同账号全部成员，个人课程与购买流水仍可追溯。
相关测试：studentAccount、sharedOrder、packageLifecycle.acceptance、scheduleCredits、businessEffects，以及 student-forms-v2、shared-credit-detail、schedule-workflows。
