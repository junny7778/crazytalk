import { useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import { officePay, type PayTerms, type DemoState } from "@crazytalk/shared";
import { Select, EmptyState, Field, Button, Panel } from "@crazytalk/ui";
export default function OfficePayroll() {
  const { data, can } = useDemo();
  const [month, setMonth] = useState("2026-10"),
    [so, setSO] = useState(""),
    [id, setId] = useState("");
  const tutors = data.teachers.filter((t) => !so || t.so === so);
  const terms = (data.payTerms || []).filter(
    (t) => t.month === month && (!so || so === t.so),
  );
  const rows = terms.flatMap((t) =>
    officePay(data, t).map((row) => ({ ...row, so: t.so })),
  );
  return (
    <Panel title="老师与 SO 周期对账">
      <div className="row wrap">
        <Field label="结算月">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </Field>
        <Field label="办公室">
          <Select
            value={so}
            onValueChange={(value) => {
              setSO(value);
              setId("");
            }}
          >
            <option value="">全部 SO</option>
            {[...new Set(data.teachers.map((t) => t.so))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="老师">
          <Select value={id} onValueChange={setId}>
            <option value="">选择老师</option>
            {tutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="table-wrap"><table>
        <thead>
          <tr>
            <th>SO</th>
            <th>老师已核金额</th>
            <th>SO 已核金额</th>
            <th>待核明细</th>
          </tr>
        </thead>
        <tbody>
          {[...new Set(terms.map((t) => t.so))].map((s) => {
            const group = rows.filter((r) => r.so === s);
            return (
              <tr key={s}>
                <td>{s}</td>
                <td>
                  {can("field.pay_amount")
                    ? group.reduce((n, r) => n + (r.teacher ?? 0), 0).toFixed(2)
                    : "—"}
                </td>
                <td>
                  {can("field.pay_amount")
                    ? group.reduce((n, r) => n + (r.office ?? 0), 0).toFixed(2)
                    : "—"}
                </td>
                <td>
                  {
                    group.filter((r) => r.teacher === null || r.office === null)
                      .length
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      {!terms.length && <EmptyState title="暂无本期计薪资料" description="选择老师后可查看或登记本期计薪条件。"/>}
      {id && <PayEditor key={id + month} data={data} id={id} month={month} />}
    </Panel>
  );
}
function PayEditor({
  data,
  id,
  month,
}: {
  data: DemoState;
  id: string;
  month: string;
}) {
  const { act, can } = useDemo(),
    teacher = data.teachers.find((t) => t.id === id)!;
  const saved = data.payTerms?.find(
    (t) => t.teacherId === id && t.month === month,
  );
  const [form, setForm] = useState<PayTerms>(
    saved || {
      teacherId: id,
      month,
      so: teacher.so,
      mode: "NP",
      hourly: 0,
      soHourly: 0,
      paidMinutes: 30,
      praise: null,
      complaint: null,
      renewal: null,
      fullAttendance: null,
      confirmed: [],
      teacherAdjustment: 0,
      soAdjustment: 0,
      adjustmentNote: "",
    },
  );
  const [error, setError] = useState("");
  const frozen = data.settlements?.some(
    (s) => s.teacherId === id && s.month === month,
  );
  const labels = {
    hourly: "老师时薪",
    soHourly: "SO 时薪",
    paidMinutes: "每 25 分钟课对应计薪分钟",
    praise: "好评奖",
    complaint: "差评扣款",
    renewal: "复购奖",
    fullAttendance: "全勤奖",
    teacherAdjustment: "老师调整",
    soAdjustment: "SO 调整",
  };
  if (!can("field.pay_amount")) return <p>无金额查看权限</p>;
  const rows = saved ? officePay(data, saved) : [];
  return (
    <section>
      <h3>
        {teacher.name} · {month}
      </h3>
      <fieldset disabled={frozen || !can("pay_rate.edit")}>
        <Field label="计薪方式">
          <Select
            value={form.mode}
            onValueChange={(value) =>
              setForm({ ...form, mode: value === "OP" ? "OP" : "NP" })
            }
          >
            <option>NP</option>
            <option>OP</option>
          </Select>
        </Field>
        <div className="form-grid">
          {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
            <Field key={k} label={labels[k]}>
              <input
                type="number"
                step="any"
                value={form[k] ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [k]: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          ))}
        </div>
        <Field label="调整依据">
          <input
            value={form.adjustmentNote}
            onChange={(e) =>
              setForm({ ...form, adjustmentNote: e.target.value })
            }
          />
        </Field>
        {form.mode === "OP" && (
          <>
            <Button
              onClick={() =>
                setForm({
                  ...form,
                  confirmed: [
                    ...form.confirmed,
                    { date: month + "-01", time: "09:00", minutes: 30 },
                  ],
                })
              }
            >
              添加已确认课表时段
            </Button>
            {form.confirmed.map((slot, i) => (
              <div className="row" key={i}>
                {(["date", "time", "minutes"] as const).map((k) => (
                  <input
                    key={k}
                    aria-label={k}
                    type={k === "minutes" ? "number" : k}
                    value={slot[k]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        confirmed: form.confirmed.map((s, j) =>
                          i === j
                            ? {
                                ...s,
                                [k]:
                                  k === "minutes"
                                    ? Number(e.target.value)
                                    : e.target.value,
                              }
                            : s,
                        ),
                      })
                    }
                  />
                ))}
                <Button
                  onClick={() =>
                    setForm({
                      ...form,
                      confirmed: form.confirmed.filter((_, j) => j !== i),
                    })
                  }
                >
                  移除时段
                </Button>
              </div>
            ))}
          </>
        )}
        <Button
          onClick={() => {
            try {
              act({ type: "pay.terms", terms: form });
              setError("已保存");
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          保存计薪条件
        </Button>
      </fieldset>
      <div className="table-wrap"><table>
        <thead>
          <tr>
            <th>来源</th>
            <th>项目</th>
            <th>老师 PHP</th>
            <th>SO PHP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.source}</td>
              <td>{r.label}</td>
              <td>{r.teacher ?? "待核"}</td>
              <td>{r.office ?? "待核"}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {can("payroll.confirm") && (
        <Button
          disabled={
            frozen ||
            !saved ||
            Object.keys(form).some(
              (k) =>
                JSON.stringify(saved[k as keyof PayTerms]) !==
                JSON.stringify(form[k as keyof PayTerms]),
            )
          }
          onClick={() => {
            try {
              act({ type: "pay.freeze", teacherId: id, month });
              setError("已冻结周期明细");
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          {frozen ? "已确认" : "确认本期结算"}
        </Button>
      )}
      <p role="status">{error}</p>
    </section>
  );
}
