import { ChevronDown, ChevronUp } from "lucide-react";
import FeedbackHistory from "./FeedbackHistory";
import { useId, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import { Badge, Button, Drawer, EmptyState, Modal } from "@crazytalk/ui";
import { feedbackCategories } from "../pages/operations/FeedbackEditor";
import { RecordFields } from "./StudentRecordDrawer";

export default function StudentFeedbackDrawer({
  id,
  onClose,
  onOpenFull,
}: {
  id: string;
  onClose: () => void;
  onOpenFull: (id: string) => void;
}) {
  const { data, can } = useDemo();
  const [preview, setPreview] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyId = useId();
  const record = data.feedback.find((item) => item.id === id);
  if (!can("feedback.view"))
    return (
      <Drawer open onClose={onClose} title="反馈详情">
        <EmptyState title="当前角色没有查看反馈的权限" />
      </Drawer>
    );
  if (!record)
    return (
      <Drawer open onClose={onClose} title="反馈详情">
        <EmptyState title="没有找到这条反馈" />
      </Drawer>
    );
  const credits = data.credits.filter(
    (item) => item.feedbackId === id && item.type === "补偿",
  );
  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title="反馈详情"
        description={`${record.date} · ${data.students.find((student) => student.id === record.studentId)?.name || ""}`}
        width={760}
        footer={
          <Button variant="primary" onClick={() => onOpenFull(id)}>
            {can("feedback.process") ||
            can("feedback.verdict") ||
            can("feedback.create")
              ? "前往反馈处理"
              : "查看完整反馈"}
          </Button>
        }
      >
        <div className="stack">
          <div className="row wrap">
            <Badge tone={record.rating === "好评" ? "success" : "warning"}>
              {record.rating}
            </Badge>
            <Badge>{record.status}</Badge>
          </div>
          <section
            className="student-feedback-section"
            aria-labelledby="feedback-basic-heading"
          >
            <h3 id="feedback-basic-heading">反馈基本信息</h3>
            <RecordFields
              values={[
                ["反馈内容", record.content],
                ["问题分类", feedbackCategories(record).join("、")],
                [
                  "关联老师",
                  record.teacherName ||
                    data.teachers.find(
                      (teacher) => teacher.id === record.teacherId,
                    )?.name,
                ],
                ["负责教务", record.owner],
                ["渠道", record.source],
              ]}
            />
            {record.screenshots.length > 0 && (
              <div className="student-feedback-images">
                {record.screenshots.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setPreview(item.dataUrl)}
                    aria-label={`查看截图 ${item.name}`}
                  >
                    <img src={item.dataUrl} alt={item.name} />
                  </button>
                ))}
              </div>
            )}
          </section>
          <section
            className="student-feedback-section"
            aria-labelledby="feedback-processing-heading"
          >
            <h3 id="feedback-processing-heading">处理跟进</h3>
            <RecordFields
              values={[
                ["客服处理进度", record.customerProgress],
                ["客服处理结果", record.customerResult],
                ["客服备注", record.processNote],
                ["客服&TM判定结果", record.jointVerdict],
                ["TM 判定", record.tmResult],
                ["TM处理日期", record.tmDate],
                ["TM 跟进", record.tmNote],
              ]}
            />
            {credits.length > 0 && (
              <div className="inset">
                <strong>已登记补偿</strong>
                {credits.map((item) => (
                  <p key={item.id}>
                    {item.date} · +{item.units} 课时 · {item.note}
                  </p>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="student-feedback-history-toggle"
              aria-expanded={historyOpen}
              aria-controls={historyId}
              onClick={() => setHistoryOpen((open) => !open)}
            >
              跟进历史{" "}
              {historyOpen ? (
                <ChevronUp size={14} aria-hidden="true" />
              ) : (
                <ChevronDown size={14} aria-hidden="true" />
              )}
            </Button>
            {historyOpen && (
              <div id={historyId} role="region" aria-label="跟进历史">
                <FeedbackHistory entries={record.followUps} />
              </div>
            )}
          </section>
        </div>
      </Drawer>
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="反馈截图"
        width={900}
      >
        {preview && (
          <img
            className="student-feedback-image-preview"
            src={preview}
            alt="反馈截图"
          />
        )}
      </Modal>
    </>
  );
}
