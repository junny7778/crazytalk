import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  useBusiness,
  businessAccountId,
  businessMode,
  businessRequest,
  waitForBusinessOperation,
} from "@crazytalk/shared/react";
import { Button, useToast } from "@crazytalk/ui";
const schema = z.array(
  z.object({
    id: z.string(),
    type: z.string(),
    studentIds: z.array(z.string()),
    status: z.enum(["processing", "completed", "failed"]),
    message: z.string(),
    retryable: z.boolean().optional(),
  }),
);
const labels: Record<string, string> = {
  "lesson.schedule": "排课",
  "lesson.changeTeacher": "换老师",
  "student.bindClassIn": "更换账号",
  "lesson.reschedule": "改期",
  "lesson.cancel": "取消课程",
  "student.details.update": "教务交接",
  "student.profile": "教务交接",
  "student.edit": "教务交接",
  "account.save": "教务交接",
  "student.lifecycle": "服务变更",
};
export default function ClassInOperationFeedback({
  studentId,
}: {
  studentId?: string;
}) {
  const business = useBusiness();
  const query = useQuery({
    queryKey: ["classin-operations", businessAccountId()],
    enabled: businessMode(),
    queryFn: async () =>
      schema.parse(await businessRequest("/classin-operations")),
    refetchInterval: 2000,
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const toast = useToast();
  if (!businessMode()) return null;
  async function continueOperation(id: string) {
    if (busy) return;
    setBusy(id);
    setError("");
    try {
      await businessRequest(`/commands/${id}/continue`, "POST");
      const result = await waitForBusinessOperation(id, business?.acceptState);
      toast(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作未完成");
    } finally {
      setBusy("");
      void query.refetch();
    }
  }
  return (
    <>
      {query.error && <p role="alert">暂时无法获取处理结果，请稍后查看。</p>}
      {(query.data ?? [])
        .filter((o) => !studentId || o.studentIds.includes(studentId))
        .map((o) => (
          <div
            key={o.id}
            role={o.status === "failed" ? "alert" : "status"}
            className="row wrap"
          >
            {o.status === "processing" || busy === o.id ? (
              <>
                <Loader2 size={16} className="spin" />
                正在{labels[o.type] || "处理"}
              </>
            ) : (
              <>
                {o.message}
                {o.retryable && (
                  <Button
                    size="sm"
                    loading={busy === o.id}
                    disabled={!!busy}
                    onClick={() => continueOperation(o.id)}
                  >
                    继续{labels[o.type] || "操作"}
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
