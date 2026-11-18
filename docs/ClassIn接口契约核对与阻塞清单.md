# ClassIn 接口契约核对与阻塞清单

2026-11-18。以下依据 ClassIn 官方文档及当前实现；“代码/模拟验证通过”不代表真实机构写入验收通过。用户已明确允许注册/获取 UID，但必须提示并取得账号持有人同意。

|业务能力|官方契约与实现结论|验证/状态|
|---|---|---|
|凭证验证|POST cloud.api.php?action=getFolderList；1成功，106空数据，102认证失败|当前配置真实只读 HTTP200/106；检查脚本通过|
|学员/老师 UID|POST course.api.php?action=register；telephone/email二选一、md5pass、addToSchoolMember=1学生/2老师；1/135/461返回UID。机构加入失败820/821不能视为绑定完成|已移除业务版getSchoolMemberList调用；界面明示创建账号及加入机构，必须勾选同意并提供初始密码；API拒绝缺同意或密码。未实际注册测试账号|
|老师 UID 持久化|老师资料保存classInUid，worker使用该UID；修改联系账号未重新核实时清除旧UID；UID更改对未来课节入同步队列|领域与worker专项|
|创建课程|POST course.api.php?action=addCourse，固定courseUniqueIdentity，成功data为courseId；文档说明相同唯一标识返回已存在ID|实现显式重试恢复：只允许持久化阶段为course.create的未知任务恢复；保持原唯一标识，保存返回ID。隔离DB/mock验证响应丢失后恢复，不自动循环重试|
|课程成员|addCourseStudent/delCourseStudent，courseId、studentUid、identity=1|参数已按文档核对；换学员移除旧成员、加入新成员专项通过|
|创建课节|POST /lms/activity/createClass；courseId、name、teacherUid、startTime/endTime；seatNum=2；录课四参数齐全；uniqueIdentity固定；响应data.classId|参数、响应及签名核对；使用无主题单元（unitId可省略）。部分成功/未知结果保持待核实|
|改课/换师|editCourseClass传courseId/classId、beginTime/endTime、teacherUid|官方仍支持旧接口；开课前20分钟等限制会由外部返回业务错误，本地保留同步失败，不宣称成功|
|取消课节|delCourseClass传courseId/classId|取消成功后才更新外部同步完成；212已删除、823已删除但唯一标识清理失败均按已取消处理（不复用该课节唯一标识）；无映射且曾尝试创建的课不能冒充本地取消成功|
|回调|签名校验、机构和时间检查；进入、Attendance、End、Rating、Net按订阅字段映射；先持久化收件箱再处理|签名、重复通知、早到关联及扣返组合本地验证；真实公网投递未验收|
|v2签名|ASCII排序标量参数加sid/timeStamp，MD5并写X-EEO头；当前请求仅使用短标量参数|与官方签名规则核对，专项断言通过；未引入当前用不到的数组等参数|

## 仍需外部条件的事项

1. **真实测试对象**：需指定允许联调的老师和学员手机号/邮箱及持有人同意，或已核实UID；测试机构、课程时间与可创建/改课/取消范围。不会使用任意真实用户或编造手机号盲测。初始密码只在请求中用于注册，不保存到业务库，不写日志；已有账号密码不会因此修改。注册成功但本地保存失败不会撤销外部成员，可再次获取UID后保存。
2. **公网回调**：待域名、HTTPS及ClassIn后台订阅配置，真实验证回调进入本系统。用户已表示会提供配置。
3. **课节未知结果恢复契约**：已核对公开接口目录、createClass及课节实时/结束回调文档，尚未找到按uniqueIdentity查询课节ID的已证实接口。createClass唯一标识用于防重复，不等于文档承诺返回已存在classId。当前仅完成课程courseId恢复；classId丢失仍阻断后续写入，不能声称整个恢复闭环已完成。

可提供给ClassIn技术支持的具体问题（尚未对外发送）：

- /lms/activity/createClass 响应丢失后，是否有按机构SID+uniqueIdentity读取activityId/classId的接口？请求路径、参数、响应和授权条件是什么？
- 相同uniqueIdentity再次创建的返回码和data是否保证携带原classId？请给出正式契约，不能仅凭样例推断。
- addCourse相同courseUniqueIdentity时正常返回原ID与398的适用条件分别是什么？
- 是否有读取已知courseId/classId当前时间、老师、取消状态的接口，供未知改课/取消结果核对？

## 官方依据

- [基础对接方案](https://docs.eeo.cn/api/zh-hans/Solutions/BasicScenario.html)
- [注册用户](https://docs.eeo.cn/api/zh-hans/user/register.html)
- [云盘文件夹查询](https://docs.eeo.cn/api/zh-hans/cloud/getFolderList.html)
- [创建课程](https://docs.eeo.cn/api/zh-hans/classroom/addCourse.html)
- [创建课堂](https://docs.eeo.cn/api/zh-hans/LMS/createClassroom.html)
- [修改课节](https://docs.eeo.cn/api/zh-hans/classroom/editCourseClass.html)
- [删除课节](https://docs.eeo.cn/api/zh-hans/classroom/delCourseClass.html)
- [课程添加成员](https://docs.eeo.cn/api/zh-hans/classroom/addCourseStudent.html)、[删除成员](https://docs.eeo.cn/api/zh-hans/classroom/delCourseStudent.html)
- [v2签名](https://docs.eeo.cn/api/zh-hans/appendix/signature.html)
- [实时消息](https://docs.eeo.cn/api/zh-hans/datasub/details.html)、[课后消息](https://docs.eeo.cn/api/zh-hans/datasub/classrelated.html)
