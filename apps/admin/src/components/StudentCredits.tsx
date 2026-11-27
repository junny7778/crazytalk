import { creditTypeLabel } from "../lib/creditLabels";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import { getScheduleCredits, getStudentSummary, type Student } from "@crazytalk/shared";
import { Button, EmptyState, Field, Modal, Panel, useToast } from "@crazytalk/ui";
import type { StudentAction } from "./StudentActions";
import type { StudentRecordTarget } from "../lib/studentActivity";
import { RecordFields } from "./StudentRecordDrawer";

export default function StudentCredits({
  student,
  onAction,
  onOpen,
}: {
  student: Student;
  onAction: (action: StudentAction) => void;
  onOpen: (target: StudentRecordTarget) => void;
}) {
  const { data, can, act } = useDemo();
  const toast = useToast();
  const summary = getStudentSummary(data, student.id);
  const [deductOpen, setDeductOpen] = useState(false);
  const [deductUnits, setDeductUnits] = useState("");
  const [deductReason, setDeductReason] = useState("");
  const [deductError, setDeductError] = useState("");
  const memberOrders = (data.orders ?? []).filter(order => order.studentIds.includes(student.id));
  const deduction = deductOpen ? getScheduleCredits(data, student.id, 0, 1) : undefined;
  const available = deduction?.available ?? 0;
  const deductionBalance = deduction?.balance ?? student.balance;
  const amount = Number(deductUnits);
  const canDeduct = memberOrders.length === 1 && student.status !== "退费" && !deduction?.error && Number.isFinite(amount) && amount > 0 && amount <= available && Boolean(deductReason.trim());
  const afterDeduction = Math.round((deductionBalance - amount) * 1e8) / 1e8;
  async function saveDeduction() {
    try {
      const result = await act({ type: "credit.deduct", studentId: student.id, units: amount, reason: deductReason });
      toast(result.message);
      setDeductOpen(false);
    } catch (cause) {
      setDeductError(cause instanceof Error ? cause.message : "扣减失败，请检查填写内容");
    }
  }
  const credits = data.credits
    .filter((item) => item.studentId === student.id || !!item.orderId && data.orders?.some(o=>o.id===item.orderId && o.studentIds.includes(student.id)))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.recordedAt || "").localeCompare(a.recordedAt || ""),
    );
  const renewal = credits.find((item) => item.type === "续费");
  return (
    <div className="stack">
      <Panel title="课时余额" action={can("credit.add") && <Button variant="primary" size="sm" onClick={() => onAction("credit")}>加课时</Button>}>
        {memberOrders.length ? <div className="table-wrap"><table>
          <thead><tr><th>剩余课时</th><th>使用学员</th></tr></thead>
          <tbody>{memberOrders.map(order => <tr key={order.id}>
            <td>{order.balance} 课时</td>
            <td>{(order.memberCount ?? order.studentIds.length) > 1 && <span>共享课时 · {order.memberCount ?? order.studentIds.length} 人共用　</span>}
              {order.studentIds.map((id, index) => <span key={id}>{index > 0 && "、"}<Link to={`/students/${id}`}>{data.students.find(s => s.id === id)?.name ?? id}</Link></span>)}
            </td></tr>)}</tbody>
        </table></div> : <p>{student.balance} 课时</p>}
      </Panel>
      <Modal open={deductOpen} onClose={() => setDeductOpen(false)} title={`给 ${student.name} 扣减课时`}
        footer={<><Button onClick={() => setDeductOpen(false)}>取消</Button><Button variant="danger-solid" disabled={!canDeduct} onClick={saveDeduction}>确认扣减</Button></>}>
        <div className="stack">
          <p className="muted">用于多加纠正、历史余额调整。正常上课请通过课程确认扣课，避免重复扣减。</p>
          {student.status === "退费" && <p role="alert">退费学员的课包已冻结，请先办理复课。</p>}
          {memberOrders.length > 1 && <p>请先在「加课时 → 共享已有课时」核对并合并历史余额。</p>}
          {memberOrders.length === 1 && (memberOrders[0].memberCount ?? memberOrders[0].studentIds.length) > 1 &&
            <p>共享余额 · {memberOrders[0].studentIds.map(id => data.students.find(s => s.id === id)?.name).join("、")}</p>}
          <Field label="扣减课时" required>
            <input aria-label="扣减课时" type="number" min="0" max={available} step="any" value={deductUnits} onChange={(e) => setDeductUnits(e.target.value)} />
          </Field>
          <Field label="扣减原因" required>
            <textarea aria-label="扣减原因" value={deductReason} onChange={(e) => setDeductReason(e.target.value)} placeholder="说明需要纠正的记录及原因" />
          </Field>
          {deduction?.error ? <p role="alert">{deduction.error}</p> : <>
            <p>已预约占用 {deduction?.reserved} 课时，可排课余额 {available} 课时</p>
            <div className="inset">当前剩余 {deductionBalance} 课时{amount > 0 && amount <= available && ` → 扣减后 ${afterDeduction} 课时`}</div>
            {deductUnits && (!Number.isFinite(amount) || amount <= 0 || amount > available) && <p role="alert">请输入大于 0 且不超过可排课余额的扣减量。</p>}
          </>}
          {deductError && <p role="alert">{deductError}</p>}
        </div>
      </Modal>
      <Panel title="课时与续课信息">
        <RecordFields
          values={[
            ["购课总课时", summary.totalUnits ?? "待核实"],
            ...(summary.totalUnits === null &&
            summary.historicalTotalUnits !== null
              ? [
                  ["历史总课时", summary.historicalTotalUnits] satisfies [
                    string,
                    number,
                  ],
                  [
                    "已登记购课",
                    `${summary.systemPurchaseUnits} 课时`,
                  ] satisfies [string, string],
                ]
              : []),
            [
              "剩余课时",
              `${student.balance} 课时`,
            ],
            ["买单日期", summary.purchaseDate],
            ["是否续课", summary.renewalStatus],
          ]}
        />
      </Panel>
      <Panel
        title="课时与充值明细"
        action={
          can("credit.add") && (
            <div className="row">
              <Button variant="primary" size="sm" onClick={() => { setDeductUnits(""); setDeductReason(""); setDeductError(""); setDeductOpen(true); }}>扣减课时</Button>
            </div>
          )
        }
      >
        {credits.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>业务日期</th>
                  <th>事项</th>
                  <th>学员</th>
                  <th>课时变动</th>
                  <th>变动后余额</th>
                  <th>登记金额</th>
                  <th>说明</th>
                  <th>经办人</th>
                </tr>
              </thead>
              <tbody>
                {credits.map((item) => (
                  <tr key={item.id}>
                    <td>{item.date}</td>
                    <td>
                      <button
                        className="text-link"
                        onClick={() => onOpen({ kind: "credit", id: item.id })}
                      >
                        {creditTypeLabel(item.type)}
                      </button>
                    </td>
                    <td>
                      {data.students.find(s => s.id === item.studentId)?.name ?? item.studentId}
                    </td>
                    <td>
                      {item.units > 0 ? "+" : ""}
                      {item.units}
                    </td>
                    <td>{item.balance}</td>
                    <td>{item.amount ?? "未登记"}</td>
                    <td>{item.note || "未填写"}</td>
                    <td>{item.operator || "未记录"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="暂无课时记录"
            description="登记购课、补偿或确认课程结果后，可以在这里查看明细。"
          />
        )}
      </Panel>
      <Panel title="续费跟进">
        {renewal ? (
          <p>
            最近一次续费：{renewal.date}，新增 {renewal.units} 课时
            {renewal.amount === undefined ? "" : `，登记金额 ${renewal.amount}`}
            。
          </p>
        ) : (
          <EmptyState
            title="暂无续费记录"
            description="登记续费后，可在这里查看最近一次续费信息。"
          />
        )}
      </Panel>
    </div>
  );
}
