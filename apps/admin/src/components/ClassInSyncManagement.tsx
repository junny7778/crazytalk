import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useSearchParams } from "react-router-dom";
import {
  businessMode,
  businessRequest,
  useDemo,
} from "@crazytalk/shared/react";
import { Button, EmptyState, Panel } from "@crazytalk/ui";
import ListPagination, { useListPage } from "./ListPagination";
const schema = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      lessonId: z.string(),
      studentId: z.string(),
      createdAt: z.string(),
      operation: z.string(),
      status: z.string(),
      error: z.string(),
      step: z.string(),
      courseId: z.string(),
      attempts: z.number(),
    }),
  ),
  notices: z.array(
    z.object({
      id: z.string(),
      command: z.string(),
      error: z.string(),
      receivedAt: z.string(),
      courseId: z.string(),
      classId: z.string(),
    }),
  ),
});
const actions: Record<string, string> = {
  create: "排课",
  update: "改期",
  cancel: "取消课程",
  "course.owner": "教务交接",
  "course.student": "更换账号",
  "course.member": "添加成员",
};
const states: Record<string, string> = {
  pending: "处理中",
  processing: "处理中",
  completed: "成功",
  failed: "失败",
  uncertain: "未能确认结果",
  blocked: "未完成",
  superseded: "已被后续操作替代",
};
export default function ClassInSyncManagement({
  connected,
}: {
  connected: boolean;
}) {
  const { data, can, accountId } = useDemo();
  const [params, setParams] = useSearchParams();
  const target = params.get("lesson");
  const query = useQuery({
    queryKey: ["classin-logs", accountId],
    enabled: businessMode() && can("lesson.view"),
    queryFn: async () =>
      schema.parse(await businessRequest("/classin-classes/logs")),
    refetchInterval: 5000,
  });
  const jobs = (query.data?.jobs ?? [])
    .filter((j) => !target || j.lessonId === target)
    .map((j) => ({
      id: j.id,
      time: j.createdAt,
      object: data.students.find((s) => s.id === j.studentId)?.name || "课程",
      action: actions[j.operation] || j.operation,
      result: states[j.status] || j.status,
      reason: j.error,
      detail: `任务 ${j.id} · 班级 ${j.courseId || "—"} · 步骤 ${j.step || "—"} · 尝试 ${j.attempts}`,
    }));
  const notices = target
    ? []
    : (query.data?.notices ?? []).map((n) => ({
        id: n.id,
        time: n.receivedAt,
        object: n.courseId ? `班级 ${n.courseId}` : "外部通知",
        action: "接收通知",
        result: n.error ? "已记录" : "已接收",
        reason: n.error,
        detail: `${n.command} · 课堂 ${n.classId || "—"}`,
      }));
  const demo = businessMode()
    ? []
    : data.lessons
        .filter((l) => !target || l.id === target)
        .map((l) => ({
          id: l.id,
          time: `${l.date} ${l.time}`,
          object:
            data.students.find((s) => s.id === l.studentId)?.name || "课程",
          action: "课程同步",
          result: l.sync,
          reason: l.syncReason,
          detail: "演示数据",
        }));
  const rows = [...jobs, ...notices, ...demo].sort((a, b) =>
    b.time.localeCompare(a.time),
  );
  const page = useListPage(rows);
  return (
    <Panel title="同步日志">
      {!can("lesson.view") ? (
        <p>当前账号没有课程查看权限。</p>
      ) : (
        <>
          {!connected && <p role="status">ClassIn 尚未连接。</p>}
          {query.error && (
            <p role="alert">日志读取失败：{query.error.message}</p>
          )}
          {target && (
            <Button
              size="sm"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete("lesson");
                setParams(next);
              }}
            >
              查看全部同步日志
            </Button>
          )}
          <div className="table-wrap">
            <table className="classin-log-table">
              <colgroup>
                <col style={{ width: 180 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 160 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>对象</th>
                  <th>操作</th>
                  <th>结果</th>
                  <th>原因</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.time.replace("T", " ").slice(0, 19)}</td>
                    <td>{row.object}</td>
                    <td>{row.action}</td>
                    <td>{row.result}</td>
                    <td>{row.reason || "—"}</td>
                    <td>{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && !query.isLoading && (
            <EmptyState title="暂无同步日志" />
          )}
          <ListPagination
            total={rows.length}
            page={page.page}
            onChange={page.setPage}
          />
        </>
      )}
    </Panel>
  );
}
