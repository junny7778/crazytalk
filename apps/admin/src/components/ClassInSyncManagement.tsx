import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import { Button, EmptyState, Panel } from "@crazytalk/ui";
import {
  hasSyncIssue,
  missingAttendanceData,
  lessonSyncReason,
} from "../lib/lessonSync";
import { useBusinessAction } from "../pages/operations/common";
import ListPagination, { useListPage } from "./ListPagination";
export default function ClassInSyncManagement() {
  const { data, can } = useDemo();
  const [params, setParams] = useSearchParams();
  const run = useBusinessAction();
  const [busy, setBusy] = useState<string[]>([]);
  const target = params.get("lesson");
  const queue = data.lessons.filter(
    (l) =>
      can("lesson.view") &&
      (hasSyncIssue(l) || l.sync === "处理中") &&
      (!target || target === l.id),
  );
  const page = useListPage(queue);
  async function retry(ids: string[]) {
    if (busy.length || !can("sync.retry") || data.connection !== "正常") return;
    setBusy(ids);
    try {
      // Yield for pending feedback before running the local demo action.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      for (const id of ids) {
        const lesson = data.lessons.find((l) => l.id === id);
        if (!lesson || lesson.sync !== "未同步") continue;
        run({ type: "lesson.retry", id });
      }
    } finally {
      setBusy([]);
    }
  }
  if (!can("lesson.view"))
    return (
      <Panel title="同步异常处理">
        <p>当前账号没有课程查看权限，请联系管理员。</p>
      </Panel>
    );
  const retryable = queue.filter((l) => l.sync === "未同步");
  return (
    <Panel title="同步异常处理">
      {data.connection !== "正常" && (
        <p role="status">请先恢复 ClassIn 连接，再重试同步。</p>
      )}
      {(target || (can("sync.retry") && retryable.length > 1)) && (
        <div className="row between">
          {target && (
            <Button
              size="sm"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete("lesson");
                setParams(next);
              }}
            >
              查看全部同步异常
            </Button>
          )}
          {can("sync.retry") && retryable.length > 1 && (
            <Button
              size="sm"
              disabled={!!busy.length || data.connection !== "正常"}
              onClick={() => void retry(retryable.map((l) => l.id))}
            >
              批量重试课程推送（{retryable.length}）
            </Button>
          )}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>上课时间</th>
              <th>学员</th>
              <th>老师</th>
              <th>同步事项</th>
              <th>异常原因</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((lesson) => (
              <tr key={lesson.id}>
                <td>
                  {lesson.date} {lesson.time}
                </td>
                <td>
                  {data.students.find((s) => s.id === lesson.studentId)?.name ||
                    "—"}
                </td>
                <td>
                  {data.teachers.find((t) => t.id === lesson.teacherId)?.name ||
                    "—"}
                </td>
                <td>
                  {lesson.sync === "未同步" && <div>课程信息推送</div>}
                  {lesson.sync === "处理中" && <div>同步处理中</div>}
                  {missingAttendanceData(lesson) && <div>考勤数据拉取</div>}
                </td>
                <td>
                  {lesson.sync === "未同步" && (
                    <div>{lessonSyncReason(lesson)}</div>
                  )}
                  {missingAttendanceData(lesson) && <div>未收到考勤数据</div>}
                </td>
                <td>
                  {lesson.sync === "未同步" && can("sync.retry") && (
                    <Button
                      size="sm"
                      disabled={!!busy.length || data.connection !== "正常"}
                      onClick={() => void retry([lesson.id])}
                    >
                      {busy.includes(lesson.id) ? "处理中…" : "重新同步"}
                    </Button>
                  )}
                  {missingAttendanceData(lesson) && (
                    <small>考勤拉取尚未接入</small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!queue.length && (
        <EmptyState title={target ? "该课程暂无同步异常" : "暂无同步异常"} />
      )}
      <ListPagination
        total={queue.length}
        page={page.page}
        onChange={page.setPage}
      />
    </Panel>
  );
}
