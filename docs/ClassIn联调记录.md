# ClassIn 联调记录

2026-11-18。在本地读取已有配置，仅检查必要键并调用只读机构成员查询。凭证、签名和返回成员资料均未输出。

执行命令为 node scripts/classin-check.mjs。该脚本沿用当前 Demo 的 /partner/api/school.api.php?action=getSchoolMemberList，结果 HTTP 404，返回非 JSON。配置中 CLASSIN_API_BASE、CLASSIN_SID、CLASSIN_SECRET 均存在。

## 待解决

- 当前配置主机上的机构成员查询路径返回 404。需要机构可用的 API 地址与 getSchoolMemberList 接口契约。当前结果不足以判断 SID 或密钥有效性。
- 真实回调需要外部可达接收地址及机构配置，尚未验证。
- 真实建课、改课与取消的验收需要明确测试老师、学员和课程。未向机构创建或取消课程。

这些限制影响 ClassIn 真实联调验收。业务实现仍保留现有账号关联、同步和异常处理要求。

## 后续只读核实

同一配置主机的 /partner/api/cloud.api.php?action=getFolderList 返回 HTTP 200、errno 1，确认该配置能够通过机构签名校验。/partner/api/course.api.php?action=getSchoolMemberList 返回 HTTP 200 但响应为空。当前问题定位为成员查询接口契约，凭证整体连通已通过。

只读云盘接口依据为[ClassIn 文档](https://classin.vn/huong-dan/lay-danh-sach-thu-muc-get-folder-list/)。

自动测试 apps/api/src/integrations/classin.test.ts 共 3 项通过，覆盖 v1/v2 请求签名、API 错误和部分成功未知结果，以及回调签名和时间窗口。

## 账号查询产品约束

官方 FAQ 说明账号 UID 通过 register 接口取得，既有账号返回 UID，未注册账号可能被创建。当前 Demo 的“查询账号”动作是只读查询，使用 register 会改变该动作的外部业务效果。因此保留查询失败提示，等待机构提供只读查询契约、已有 UID 映射，或用户明确批准注册关联流程。

依据为[官方 FAQ](https://docs.eeo.cn/api/en/Error-Handling/Lesson_errors.html)及[注册接口](https://docs.eeo.cn/api/en/user/register.html)。真实写入课程还依赖老师 UID 和课节对应的外部课程、课节 ID。

## 回调配置与本地验证

用户已说明回调地址稍后提供。公网 HTTPS 地址应反向代理至后端 POST /api/webhooks/classin，保留 JSON 请求体。机构配置须指向这一路径，使用对应机构 SID 和 SECRET 验证 TimeStamp、SafeKey。接收端使用 10 分钟时间窗口，数据库保存去重后的事件并返回 error_info.errno=1。应确认代理允许 ClassIn 来源访问该路径，以及服务器时间同步。

执行 pnpm --filter @crazytalk/api exec tsx src/integrations/verify-webhook.ts 已通过真实本地数据库验证，覆盖有效签名、重复投递只存一条、错误签名拒绝、入库事件保持待处理。测试创建的事件已按唯一 ID 清理，未请求任何外部接口。

该验证证明接收及存储能力。事件转换为业务考勤仍需结合外部课节 ID 映射及实际订阅事件样例完成验证，当前接收记录 processedAt 为空并保留待处理原因。

## 已实现的本地事件处理

已按工作区 ClassIn 回调资料实现进入教室（67371107）、课堂结束（End）、出勤摘要（Attendance）、学员评价（Rating）和网络报告（Net）的本地处理。外部 courseId/classId 通过 ClassInLesson 表关联本地课节。入堂和出勤写入业务考勤，结束进入待确认；时间异常沿用待核实标签。五星评价进入好评，一／二星进入差评，三星／四星保留待核实。网络报告形成待核实服务事件，原始报告留在回调收件表。

pnpm --filter @crazytalk/api exec tsx src/integrations/verify-events.ts 已使用真实本地数据库验证进入、出勤、评价及网络事件，测试状态在事务结束时回滚。

业务排课、改课和取消写入 ClassInJob，再由 worker 消费。外部创建课程、添加学员、创建课堂及修改／取消已具备客户端调用，实际写入尚待指定测试对象联调。网络超时和唯一标识冲突标记 uncertain，保留人工核对外部结果的阻塞信息。当前自动核对并恢复外部 ID 的查询能力尚未完成。


## 并发、重启与流式附件专项

worker 使用 PostgreSQL 事务 advisory lock，跨进程一次只有一个消费者执行外部请求。持锁后识别遗留 processing 任务并转为 uncertain；同课节的后续任务不会越过未知结果继续执行。`verify-worker.ts` 在随机隔离 schema 内注入假客户端，真实数据库验证双消费者只执行一次、崩溃恢复及后续任务阻断，并验证更换学生后删除旧课程成员、加入新成员、更新课节；已通过；未读取机构凭证、未发外部请求。

已复核[官方创建课堂接口](https://docs.eeo.cn/api/zh-hans/LMS/createClassroom.html)：v2 seatNum 包含老师，1对1使用2；uniqueIdentity 限32位，使用本地课节ID的稳定32位摘要。部分成功返回及成功但缺失外部ID均视为结果未知。尚未找到可证实的按唯一标识读取课程/课堂状态契约，因此不声称已实现自动外部核对恢复。

附件改用 `/api/files/raw` 流式上传和带授权的 Range 读取，前端现有选择交互保持不变。新增 `files.integration.ts` 将16MB视频上传、分段读取、匿名拒绝验证接入隔离API专项，避免JSON body解析限制成为产品上传限制。隔离业务集成测试已实际通过这三项，且原有业务集成断言全部通过。

## 2026-11-18 更新配置后的只读重测

重新读取 apps/admin/.env.local 当前SID/密钥，未输出凭证。API .env没有覆盖这些键，也没有落盘凭证覆盖文件。getSchoolMemberList仍返回HTTP404、HTML；getFolderList返回HTTP200、errno106。官方云盘接口文档定义106为无数据、102为安全验证失败，不能把106当成密钥错误，也不能把本次结果写成errno1成功。现有凭证检查仅接受1，后续需要按该接口契约区分空目录与认证失败。查询路径/契约问题未因换凭证解决。未执行注册、建课、改课或取消。

来源：https://docs.eeo.cn/api/zh-hans/cloud/getFolderList.html 。未知结果恢复指外部写请求成功但响应丢失时查询并补回外部ID，并非已经发生真实课程丢失。

### 2026-11-18 凭证空数据判定修复

checkCredentials 和只读检查脚本现按 getFolderList 文档接受 1/106；脚本默认路径改为 cloud.api.php?action=getFolderList。实际重测 HTTP200 errno106，退出码0。新增成功/空数据/认证失败三个专项断言通过。不代表成员查询或排课已验收；未执行真实写操作。

### 2026-11-18 官方注册流程与恢复修正

用户已授权在明示持有人同意后通过register获取UID；已移除业务代码中的getSchoolMemberList调用。老师UID存储、换绑同步、课程course.create阶段固定唯一标识显式恢复已实现并通过隔离测试。classId及未知改课/取消状态读回仍缺正式契约。详见ClassIn接口契约核对与阻塞清单.md。

用户随后明确暂不执行真实老师/学员操作，改为先提供待测清单供其评估。已生成ClassIn真实联调待测清单.md，本次未执行真实注册或课程写入。

## 2026-11-19 账号关联入口统一

老师与学员共用关联表单，默认 UID 模式：输入 UID、确认归属及机构身份后仅保存本系统关联，不调用外部注册接口。手机号/邮箱模式需要6–20位初始密码及代注册授权，按老师/学生传入对应 role，既有服务映射 addToSchoolMember=2/1。更换已有 UID 需二次勾选确认，不自动迁移课程。

注册成功后保存失败，保留返回 UID，重新保存不再次调用注册。注册异常不视为未注册。UID 模式不强制手机号，学员按 UID 复用账号并保留家庭共用规则；老师注册账号独立保存，不覆盖联系手机。

验证：相关组件、学员账号领域、课时共用、老师页面合计35项专项通过，追加3项学员表单专项通过。浏览器 `scripts/verify-classin-link.mjs` 验证UID关联、刷新回显及注册条件；类型检查通过。未实际调用ClassIn写接口、未部署。

## 2026-11-19：仅关联已注册账号
- 手机号／邮箱关联先调用 addTeacher / addSchoolStudent，姓名来自本地档案。
- 返回 1 或 133 后才调用 register 获取既有账号 UID；后端生成临时随机密码参数，不要求教务输入、不保存，也不修改已有账号密码。
- 返回 113 时提示「该账号尚未注册 ClassIn，请先注册后再关联」，不再调用 register；其他添加失败同样停止。
- 获取 UID 只接受既有账号返回码 135 / 461。register 仍是具备注册能力的外部接口，本流程通过前置成员添加结果确认账号已存在，不将其描述为只读查询。
- UID 与账号沿用现有老师资料和学员 ClassIn 账号记录保存。只有保存完成后才提示「关联成功」；保存失败保留本次 UID，允许仅重试本地保存。
- 保留手动 UID 入口及机构身份核实，更换 UID 仍需确认。
- 验证：ClassIn API、关联表单、学员账号领域共 27 项测试通过；详情页及关联相关筛选测试 5 项通过；admin/api 类型检查通过。
- 浏览器脚本 scripts/verify-classin-link.mjs 验证无密码关联、未注册提示、UID/账号保存与刷新。外部响应模拟，未调用真实 ClassIn 写接口，未部署。

### 后续调整：统一账号入口与成功提示
- 删除手动 UID 关联入口，仅支持手机号／邮箱；UID 自动获取并保存。
- 添加成员接口返回 1 时，成功保存后提示「关联成功，学员已加入 ClassIn 机构」或「关联成功，老师已加入 ClassIn 机构」；返回 133 时只提示「关联成功」。
- 后端返回 addedToInstitution，前端保存本次结果；本地保存失败后重试仍使用原结果，不重复请求外部接口。
- 本次 28 项专项测试通过，admin/api 类型检查通过；浏览器验证未注册、新增成员、已有成员提示与刷新后的 UID/账号持久化。真实 ClassIn 响应使用模拟，未部署。
