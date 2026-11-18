import type { DemoState } from "../../../../packages/shared/src/model";
import type { Transaction } from "../store";

export async function refreshRefundSync(tx: Transaction, state: DemoState) {
  for (const student of state.students.filter(item => item.status === "退费")) {
    const event = state.events.find(item => item.studentId === student.id && item.type === "退费" && item.serviceStopResults);
    const step = student.serviceStopResults.find(item => item.step === "未来课程");
    if (!step || !event) continue;
    const jobs = await tx.classInJob.findMany({ where: {
      operation: "cancel",
      OR: [
        { payload: { path: ["serviceStopEventId"], equals: event.id } },
        { status: { in: ["pending", "processing", "failed", "uncertain", "blocked"] } },
      ],
      lessonId: { in: state.lessons.filter(item => item.studentId === student.id).map(item => item.id) },
      status: { not: "superseded" },
    } });
    const failed = jobs.some(job => ["failed", "uncertain", "blocked"].includes(job.status));
    const pending = jobs.some(job => ["pending", "processing"].includes(job.status));
    step.status = failed ? "待处理" : pending ? "待同步" : "已完成";
    step.detail = failed ? "部分未来课程取消未完成，请核对同步异常。" : pending ? "本地课程已取消，等待 ClassIn 确认。" : jobs.length ? "本次未来课程均已在 ClassIn 取消。" : "本次没有需要取消的未来课程。";
    event.serviceStopResults = structuredClone(student.serviceStopResults);
  }
}
