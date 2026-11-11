import OfficePayroll from "./OfficePayroll";
import ListPagination, { useListPage } from "../../components/ListPagination";
import { DatePicker } from "@crazytalk/ui";
import DataTransferButton from "../../components/DataTransferButton";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Plus, ArrowRight } from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import { payrollBreakdown, payrollTotal, type Payroll as PayrollRecord } from "@crazytalk/shared";
import {
  Select,
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  StatCard,
  Tabs,
} from "@crazytalk/ui";
import { exportCsv, money, tone, useBusinessAction } from "./common";
import "./operations.css";
export default function Payroll() {
  const { data, can } = useDemo();
  const run = useBusinessAction();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "monthly";
  const q = params.get("q") || "";
  const [month, setMonth] = useState("2026-10");
  const [status, setStatus] = useState("全部状态");
  const [selected, setSelected] = useState<string[]>([]);
  const [detailId, setDetailId] = useState("");
  const [confirm, setConfirm] = useState<"已确认" | "已发放" | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [rateId, setRateId] = useState("");
  const [rate, setRate] = useState(180);
  const teacher = (id: string) => data.teachers.find((t) => t.id === id);
  const deductions = (p: PayrollRecord) => payrollBreakdown(data, p.id).deductionRows;
  const base = (p: PayrollRecord) => payrollTotal(data, p.id).base;
  const deductionTotal = (p: PayrollRecord) =>
    payrollTotal(data, p.id).deductions;
  const total = (p: PayrollRecord) => payrollTotal(data, p.id).total;
  const breakdown = (p: PayrollRecord) => payrollBreakdown(data, p.id);
  const display = (value: number) =>
    can("field.pay_amount") ? money(value) : "—";
  const filtered = data.payroll.filter(
    (p) =>
      p.month === month &&
      (status === "全部状态" || p.status === status) &&
      `${teacher(p.teacherId)?.name} ${teacher(p.teacherId)?.so}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const detail = data.payroll.find((p) => p.id === detailId);
  const detailPay = detail ? breakdown(detail) : undefined;
  const pending = data.actions.filter(
    (a) =>
      a.status === "待确认" && a.type === "扣款" && a.date.startsWith(month),
  );
  const listPage0 = useListPage(filtered);
  const listPage1 = useListPage(data.teachers);
  const chosen = filtered.filter((p) => selected.includes(p.id));
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  };
  return (
    <div className="stack">
      <PageHeader
        title="薪资"
        description="核对课酬、扣款与调整，每笔金额都能追溯。"
        action={
          can("payroll.export") ? (
            <DataTransferButton
              direction="export"
              size="sm"
              onClick={() =>
                exportCsv("月度薪资", [
                  [
                    "月份",
                    "老师",
                    "SO",
                    "课时",
                    "课酬",
                    "扣款",
                    "调整",
                    "应发",
                    "状态",
                  ],
                  ...filtered.map((p) => [
                    p.month,
                    teacher(p.teacherId)?.name || "",
                    teacher(p.teacherId)?.so || "",
                    breakdown(p).units,
                    display(base(p)),
                    display(deductionTotal(p)),
                    display(breakdown(p).adjustment),
                    display(total(p)),
                    p.status,
                  ]),
                ])
              }
            />
          ) : null
        }
      />
      <Tabs
        value={tab}
        onChange={(v) => update("tab", v)}
        items={[
          { value: "monthly", label: "月度薪资" },
          { value: "rates", label: "单价" },
          {value:"office",label:"老师与 SO 对账"},
        ]}
      />
      {tab==="office" ? <OfficePayroll/> : tab === "monthly" ? (
        <>
          <div className="grid-4">
            <StatCard
              label="核算老师"
              value={filtered.length}
              note="本月薪资单"
            />
            <StatCard
              label="计薪课时"
              value={filtered.reduce((s, p) => s + breakdown(p).units, 0)}
              note="含明确列示的期初课时"
            />
            <StatCard
              label="应发合计"
              value={display(filtered.reduce((s, p) => s + total(p), 0))}
              note="课酬 − 扣款 + 调整"
            />
            <StatCard
              label="已确认 / 已发放"
              value={`${filtered.filter((p) => p.status !== "待确认").length} / ${filtered.length}`}
              note="确认后金额锁定"
            />
          </div>
          {pending.length > 0 && (
            <div className="notice">
              <AlertTriangle size={18} />
              <div>
                有 {pending.length} 笔老师扣款等待确认，确认后才会计入薪资。{" "}
                <Link to="/feedback?tab=actions">
                  去确认 <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          )}
          <Panel>
            <div className="toolbar" style={{ marginTop: 0 }}>
              <DatePicker
                placeholder="薪资月份"
                aria-label="薪资月份"
                className="ops-filter-select"
                mode="month"
                value={month}
                onValueChange={(nextValue) => {
                  setMonth(nextValue);
                  setSelected([]);
                }}
              />
              <SearchInput
                value={q}
                onChange={(v) => update("q", v)}
                placeholder="搜索老师或 SO"
              />
              <Select
                className="ops-filter-select"
                aria-label="薪资状态"
                value={status}
                onValueChange={(value) => setStatus(value)}
              >
                {["全部状态", "待确认", "已确认", "已发放"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        aria-label="选择全部薪资"
                        type="checkbox"
                        checked={
                          listPage0.rows.length > 0 &&
                          listPage0.rows.every((p) => selected.includes(p.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? listPage0.rows.map((p) => p.id)
                              : [],
                          )
                        }
                      />
                    </th>
                    <th>老师 / SO</th>
                    <th className="text-right">课时</th>
                    <th className="text-right">课酬</th>
                    <th className="text-right">扣款</th>
                    <th className="text-right">调整</th>
                    <th className="text-right">应发</th>
                    <th>状态</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {listPage0.rows.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`选择 ${teacher(p.teacherId)?.name} 薪资`}
                          checked={selected.includes(p.id)}
                          onChange={(e) =>
                            setSelected((s) =>
                              e.target.checked
                                ? [...s, p.id]
                                : s.filter((x) => x !== p.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="text-link"
                          onClick={() => setDetailId(p.id)}
                        >
                          {teacher(p.teacherId)?.name}
                        </button>
                        <small>{teacher(p.teacherId)?.so}</small>
                      </td>
                      <td className="text-right">{breakdown(p).units}</td>
                      <td className="text-right">{display(base(p))}</td>
                      <td className="text-right danger">
                        {deductionTotal(p)
                          ? `−${display(deductionTotal(p))}`
                          : "—"}
                      </td>
                      <td className="text-right">
                        {breakdown(p).adjustment
                          ? `${breakdown(p).adjustment > 0 ? "+" : ""}${display(breakdown(p).adjustment)}`
                          : "—"}
                      </td>
                      <td className="text-right">
                        <strong>{display(total(p))}</strong>
                      </td>
                      <td>
                        <Badge tone={tone(p.status)}>{p.status}</Badge>
                      </td>
                      <td>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setDetailId(p.id)}
                        >
                          明细
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination
              total={filtered.length}
              page={listPage0.page}
              onChange={listPage0.setPage}
            />
            {!filtered.length && (
              <EmptyState
                title="这个月份还没有薪资单"
                description="演示薪资在 2026 年 10 月，其他月份将在核算后显示。"
                action={
                  <Button
                    onClick={() => {
                      setMonth("2026-10");
                      setStatus("全部状态");
                    }}
                  >
                    查看 10 月薪资
                  </Button>
                }
              />
            )}
          </Panel>
          {chosen.length > 0 && (
            <div className="batch-bar">
              <span>
                已选 <strong>{chosen.length}</strong> 位老师 · 合计{" "}
                {display(chosen.reduce((s, p) => s + total(p), 0))}
              </span>
              <div className="row">
                {can("payroll.confirm") && (
                  <Button
                    variant="primary"
                    disabled={chosen.some((p) => p.status !== "待确认")}
                    onClick={() => setConfirm("已确认")}
                  >
                    确认薪资
                  </Button>
                )}
                {can("payroll.mark_paid") && (
                  <Button
                    disabled={chosen.some((p) => p.status !== "已确认")}
                    onClick={() => setConfirm("已发放")}
                  >
                    标记已发放
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setSelected([])}>
                  取消选择
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <Panel title="老师课酬单价" action={<small>每 25 分钟课酬</small>}>
          <p className="muted" style={{ marginBottom: 20 }}>
            示例按老师分别设置单价。修改后用于后续核算，已确认薪资不能调整。
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>老师</th>
                  <th>SO</th>
                  <th>等级</th>
                  <th className="text-right">单价</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {listPage1.rows.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.so}</td>
                    <td>{t.level}</td>
                    <td className="text-right">{display(t.rate)}</td>
                    <td>
                      {can("pay_rate.edit") && (
                        <Button
                          size="xs"
                          onClick={() => {
                            setRateId(t.id);
                            setRate(t.rate);
                          }}
                        >
                          修改单价
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ListPagination
            total={data.teachers.length}
            page={listPage1.page}
            onChange={listPage1.setPage}
          />
        </Panel>
      )}
      <Drawer
        open={!!detail}
        onClose={() => setDetailId("")}
        title={`${teacher(detail?.teacherId || "")?.name || ""} · ${detail?.month || ""} 薪资`}
        width={720}
        footer={
          detail && (
            <>
              {detail.status === "待确认" && can("payroll.adjust") && (
                <Button
                  onClick={() => {
                    setAmount(0);
                    setNote("");
                    setAdjust(true);
                  }}
                >
                  <Plus size={16} />
                  加一笔调整
                </Button>
              )}
              {detail.status === "待确认" && can("payroll.confirm") && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setSelected([detail.id]);
                    setConfirm("已确认");
                  }}
                >
                  确认这份薪资
                </Button>
              )}
              {detail.status === "已确认" && can("payroll.mark_paid") && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setSelected([detail.id]);
                    setConfirm("已发放");
                  }}
                >
                  标记已发放
                </Button>
              )}
            </>
          )
        }
      >
        {detail && detailPay && (
          <div className="stack">
            <div className="row between">
              <h2>应发 {display(total(detail))}</h2>
              <Badge tone={tone(detail.status)}>{detail.status}</Badge>
            </div>
            <dl className="detail-pairs">
              <dt>课酬</dt>
              <dd>
                {detailPay.units} 计薪课时 · {display(detailPay.base)}
              </dd>
              <dt>扣款</dt>
              <dd>−{display(deductionTotal(detail))}</dd>
              <dt>调整</dt>
              <dd>
                {display(detailPay.adjustment)}
                {detailPay.adjustmentNote && ` · ${detailPay.adjustmentNote}`}
              </dd>
            </dl>
            <h3>扣款明细</h3>
            {deductions(detail).map((a) => (
              <div className="inset row between" key={a.id}>
                <div>
                  {a.reason}
                  <small style={{ display: "block" }}>
                    {a.date}
                    {a.feedbackId && (
                      <>
                        {" "}
                        · <Link to={`/feedback/${a.feedbackId}`}>关联反馈</Link>
                      </>
                    )}
                  </small>
                </div>
                <strong className="danger">−{display(a.amount)}</strong>
              </div>
            ))}
            {!deductions(detail).length && (
              <p className="muted">{detailPay.deductions ? "历史扣款汇总已保留，原扣款明细未留存。" : "没有已确认扣款"}</p>
            )}
            <h3>课酬来源</h3>
            <div className="inset stack">
              <div className="row between"><span>期初 / 历史课酬 · {detailPay.opening.units} 课时</span><strong>{display(detailPay.opening.amount)}</strong></div>
              <small className="muted">{detailPay.opening.source}</small>
              <div className="row between"><span>可追溯课程 · {detailPay.rows.length} 节</span><strong>{display(detailPay.rows.reduce((sum, row) => sum + row.amount, 0))}</strong></div>
              <div className="row between"><span>课酬合计</span><strong>{display(detailPay.base)}</strong></div>
            </div>
            <p className="muted">{detailPay.frozen ? "已锁定计薪明细，后续课程和单价变化不改写本次结算。" : "按符合计薪条件的已完成课程核算；课时与金额随课程核实结果更新，确认薪资后锁定。"}</p>
            <h3>计薪课程明细</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>时间</th><th>学员</th><th>时长</th><th>计薪课时</th><th>单价</th><th>课酬</th></tr></thead>
                <tbody>
                  {detailPay.rows.map((row) => (
                    <tr key={row.lessonId}>
                      <td>{row.date} {row.time}</td>
                      <td>{data.students.find((student) => student.id === row.studentId)?.name || "未知学员"}</td>
                      <td>{row.duration} 分钟</td><td>{row.units}</td>
                      <td>{display(row.rate)}</td><td>{display(row.amount)}</td>
                    </tr>
                  ))}
                  {!detailPay.rows.length && <tr><td colSpan={6}><p className="muted">暂无可追溯的计薪课程明细。{detailPay.opening.amount ? "本次课酬来自上方列示的期初 / 历史汇总，并非逐课结算数据。" : "本月暂无符合计薪条件的课程。"}</p></td></tr>}
                </tbody>
              </table>
            </div>

          </div>
        )}
      </Drawer>
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === "已确认" ? "确认本月薪资" : "标记薪资已发放"}
        width={440}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>取消</Button>
            <Button
              variant="primary"
              onClick={() =>
                confirm &&
                run(
                  { type: "payroll.status", ids: selected, status: confirm },
                  () => {
                    setConfirm(null);
                    setSelected([]);
                  },
                )
              }
            >
              {confirm === "已确认" ? "确认薪资" : "确认已发放"}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p>
            共 {selected.length} 位老师，合计{" "}
            <strong>
              {display(
                data.payroll
                  .filter((p) => selected.includes(p.id))
                  .reduce((s, p) => s + total(p), 0),
              )}
            </strong>
            。
          </p>
          <div className="inset">
            {confirm === "已确认"
              ? "确认后本月薪资将锁定，不能再修改。发现错误时，应在下个月增加调整记录。"
              : "请确认实际转账已经完成，此操作只记录发放状态。"}
          </div>
        </div>
      </Modal>
      <Modal
        open={adjust && !!detail}
        onClose={() => setAdjust(false)}
        title="增加薪资调整"
        footer={
          <>
            <Button onClick={() => setAdjust(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!amount || !note.trim()}
              onClick={() =>
                detail &&
                run(
                  { type: "payroll.adjust", id: detail.id, amount, note },
                  () => setAdjust(false),
                )
              }
            >
              保存调整
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="调整金额" hint="增加填正数，扣减填负数。" required>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </Field>
          <Field label="调整原因" required>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：代课奖励、上月差额补发"
            />
          </Field>
        </div>
      </Modal>
      <Modal
        open={!!rateId}
        onClose={() => setRateId("")}
        title={`修改 ${teacher(rateId)?.name} 的单价`}
        width={440}
        footer={
          <>
            <Button onClick={() => setRateId("")}>取消</Button>
            <Button
              variant="primary"
              disabled={rate <= 0}
              onClick={() => {
                const t = teacher(rateId);
                if (t)
                  run({ type: "teacher.save", teacher: { ...t, rate } }, () =>
                    setRateId(""),
                  );
              }}
            >
              保存单价
            </Button>
          </>
        }
      >
        <Field label="每 25 分钟课酬（菲律宾比索）" required>
          <input
            type="number"
            min="1"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </Field>
      </Modal>
    </div>
  );
}
