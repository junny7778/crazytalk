import { creditTypeLabel } from "../lib/creditLabels";
import { useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import { getStudentSummary, type Student } from "@crazytalk/shared";
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
  const amount = Number(deductUnits);
  const canDeduct = student.balanceKnown && student.status !== "退费" && Number.isFinite(amount) && amount > 0 && amount <= student.balance && Boolean(deductReason.trim());
  const afterDeduction = Math.round((student.balance - amount) * 1e8) / 1e8;
  function saveDeduction() {
    try {
      const result = act({ type: "credit.deduct", studentId: student.id, units: amount, reason: deductReason });
      toast(result.message);
      setDeductOpen(false);
    } catch (cause) {
      setDeductError(cause instanceof Error ? cause.message : "扣减失败，请检查填写内容");
    }
  }
  const [opening, setOpening] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const credits = data.credits
    .filter((item) => item.studentId === student.id)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.recordedAt || "").localeCompare(a.recordedAt || ""),
    );
  const referrals = data.referrals
    .filter(
      (item) =>
        item.studentId === student.id || item.referrerStudentId === student.id,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const renewal = credits.find((item) => item.type === "续费");
  const name = (id: string) =>
    data.students.find((item) => item.id === id)?.name || "未关联学员";
  function saveOpening() {
    setError("");
    if (!opening.trim() || !Number.isFinite(Number(opening))) {
      setError("请填写已核实的剩余课时");
      return;
    }
    try {
      act({
        type: "student.balance.open",
        id: student.id,
        balance: Number(opening),
        reason,
      });
      toast("剩余课时已登记");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "请检查填写内容");
    }
  }
  return (
    <div className="stack">
      <Modal open={deductOpen} onClose={() => setDeductOpen(false)} title={`给 ${student.name} 扣减课时`}
        footer={<><Button onClick={() => setDeductOpen(false)}>取消</Button><Button variant="danger-solid" disabled={!canDeduct} onClick={saveDeduction}>确认扣减</Button></>}>
        <div className="stack">
          <p className="muted">用于多加纠正、历史余额调整。正常上课请通过课程确认扣课，避免重复扣减。</p>
          {!student.balanceKnown && <p role="alert">请先核实并录入剩余课时。</p>}
          {student.status === "退费" && <p role="alert">退费学员的课包已冻结，请先办理复课。</p>}
          <Field label="扣减课时" required>
            <input aria-label="扣减课时" type="number" min="0" step="any" value={deductUnits} onChange={(e) => setDeductUnits(e.target.value)} />
          </Field>
          <Field label="扣减原因" required>
            <textarea aria-label="扣减原因" value={deductReason} onChange={(e) => setDeductReason(e.target.value)} placeholder="说明需要纠正的记录及原因" />
          </Field>
          {student.balanceKnown && <div className="inset">当前剩余 {student.balance} 课时 → 扣减后 {deductUnits && Number.isFinite(amount) && amount > 0 ? afterDeduction : student.balance} 课时</div>}
          {deductUnits && (!Number.isFinite(amount) || amount <= 0 || amount > student.balance) && <p role="alert">请输入大于 0 且不超过剩余课时的扣减量。</p>}
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
              student.balanceKnown ? `${student.balance} 课时` : "未核实",
            ],
            ["买单日期", summary.purchaseDate],
            ["是否续课", summary.renewalStatus],
          ]}
        />
      </Panel>
      {!student.balanceKnown && (
        <Panel title="录入初始剩余课时">
          <p className="student-detail-note">
            核对已有课时台账后登记一次，后续变动会自动汇总。欠课可填写负数。
          </p>
          {can("credit.add") ? (
            <form
              className="student-opening-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveOpening();
              }}
            >
              <Field label="初始剩余课时" required>
                <input
                  type="number"
                  step="any"
                  value={opening}
                  onChange={(event) => setOpening(event.target.value)}
                />
              </Field>
              <Field label="核实说明" required>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="例如：已核对旧课时台账"
                />
              </Field>
              <Button type="submit" variant="primary">
                确认录入余额
              </Button>
              {error && (
                <p role="alert" className="danger">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <p>请联系负责教务核实余额。</p>
          )}
        </Panel>
      )}
      <Panel
        title="课时与充值明细"
        action={
          can("credit.add") && (
            <div className="row">
              <Button size="sm" onClick={() => { setDeductUnits(""); setDeductReason(""); setDeductError(""); setDeductOpen(true); }}>扣减课时</Button>
              <Button size="sm" onClick={() => onAction("credit")}>加课时</Button>
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
      <Panel
        title="转介绍关系"
        action={
          can("student.edit") && (
            <Button size="sm" onClick={() => onAction("referral")}>
              登记转介绍
            </Button>
          )
        }
      >
        {referrals.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>介绍人</th>
                  <th>被介绍人</th>
                  <th>说明</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((item) => (
                  <tr key={item.id}>
                    <td>{item.date}</td>
                    <td>{name(item.referrerStudentId)}</td>
                    <td>{name(item.studentId)}</td>
                    <td>{item.note || "未填写"}</td>
                    <td>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          onOpen({ kind: "referral", id: item.id })
                        }
                      >
                        查看记录
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="暂无转介绍关系"
            description="从已有学员中登记介绍人，关系与充值记录分别保存。"
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
