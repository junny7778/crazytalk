import { Link } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { Lesson } from "@crazytalk/shared";
import { useDemo } from "@crazytalk/shared/react";
import { hasSyncIssue, lessonSyncPath } from "../lib/lessonSync";
export default function CourseSyncLink({
  lesson,
  detail = false,
}: {
  lesson: Lesson;
  detail?: boolean;
}) {
  const { can } = useDemo();
  if (lesson.sync === "处理中") return <small className="row"><Loader2 size={14} className="spin"/>同步处理中</small>;
  if (!hasSyncIssue(lesson)) return null;
  return can("classin.view") ? (
    <Link className="text-link" to={lessonSyncPath(lesson.id)}>
      <AlertTriangle size={14} aria-hidden="true" />{" "}
      {detail ? "去同步管理" : "同步异常"}
    </Link>
  ) : (
    <small>同步异常 · 请联系有权限的管理员</small>
  );
}
