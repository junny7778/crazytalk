import { useState } from "react";
import { Link } from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import { Badge, DatePicker, Select } from "@crazytalk/ui";
export default function TeacherFeedback({ teacherId }: { teacherId: string }) {
  const { data } = useDemo();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rating, setRating] = useState("");
  const [status, setStatus] = useState("");
  const rows = data.feedback
    .filter(
      (f) =>
        f.teacherId === teacherId &&
        (!from || f.date >= from) &&
        (!to || f.date <= to) &&
        (!rating || f.rating === rating) &&
        (!status || f.status === status),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="stack">
      <div className="teacher-feedback-filters">
        <DatePicker
          aria-label="开始日期"
          placeholder="反馈日期（起始）"
          value={from}
          onValueChange={setFrom}
        />
        <DatePicker
          aria-label="结束日期"
          placeholder="反馈日期（结束）"
          value={to}
          onValueChange={setTo}
        />
        <Select
          aria-label="评价类型筛选"
          value={rating}
          onValueChange={setRating}
        >
          <option value="">全部评价</option>
          <option>好评</option>
          <option>差评</option>
        </Select>
        <Select
          aria-label="处理状态筛选"
          value={status}
          onValueChange={setStatus}
        >
          <option value="">全部状态</option>
          {["待处理", "处理中", "等待判定", "已完成"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
      <span className="muted">共 {rows.length} 条反馈</span>
      {from && to && from > to && <p role="alert">结束日期不能早于开始日期</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "反馈日期",
                "学员",
                "评价类型",
                "问题分类",
                "反馈内容",
                "负责教务",
                "处理状态",
                "操作",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td>{f.date}</td>
                <td>
                  {data.students.find((s) => s.id === f.studentId)?.name || "—"}
                </td>
                <td>
                  <Badge tone={f.rating === "好评" ? "success" : "danger"}>
                    {f.rating}
                  </Badge>
                </td>
                <td>
                  {f.categories.length ? f.categories.join("、") : f.category}
                </td>
                <td>
                  <span className="teacher-feedback-excerpt" title={f.content}>
                    {f.content || "—"}
                  </span>
                </td>
                <td>{f.owner || "—"}</td>
                <td>
                  <Badge
                    tone={
                      f.status === "已完成"
                        ? "success"
                        : f.status === "处理中"
                          ? "info"
                          : "warning"
                    }
                  >
                    {f.status}
                  </Badge>
                </td>
                <td>
                  <Link to={`/feedback/${f.id}`}>查看详情</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="muted">没有符合条件的反馈记录</p>}
    </div>
  );
}
