import { useQuery } from "@tanstack/react-query";

import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  DEMO_TODAY,
  halfMonthStatement,
  payDates,
  type DemoState,
  roundPay,
  rulesForPeriod,
  type HalfMonthCommand,
  type PayEntry,
} from "@crazytalk/shared";
import {
  businessAccountId,
  businessMode,
  businessRequest,
  useDemo,
} from "@crazytalk/shared/react";
import {
  Badge,
  Button,
  Modal,
  Drawer,
  Field,
  PageHeader,
  Panel,
  Select,
  SearchInput,
  Tabs,
} from "@crazytalk/ui";
import { exportCsv, money, tone, useBusinessAction } from "./common";
import DataTransferButton from "../../components/DataTransferButton";
import ListPagination, { useListPage } from "../../components/ListPagination";
import "./operations.css";

type RuleKey = keyof ReturnType<typeof rulesForPeriod>;
const ruleGroups = [
  {
    title: "奖金",
    fields: [
      ["praise", "好评奖金（₱）"],
      ["renewal", "复购奖金（₱）"],
      ["attendanceUnits", "全勤门槛（课时）"],
      ["attendanceAward", "全勤奖金（₱）"],
    ],
  },
  {
    title: "缺席与取消",
    fields: [
      ["absentRatio", "学员缺席计薪比例（%）"],
      ["studentCancelMinutes", "学员临时取消界线（分钟）"],
      ["absenceMultiple", "老师缺席扣款倍数"],
      ["shortCancelMultiple", "24 小时内取消扣款倍数"],
      ["earlyCancelMultiple", "超过 24 小时且不超过 5 天取消扣款倍数"],
    ],
  },
  {
    title: "迟到与早退",
    fields: [
      ["latePerMinute", "迟到早退每分钟扣款（₱）"],
      ["lateCap", "迟到早退每节扣款上限（₱）"],
      ["lateLimit", "按缺席处理的迟到早退界线（分钟）"],
    ],
  },
  {
    title: "差评扣款",
    fields: [["complaintRatio", "差评扣款比例（%）"]],
  },
] satisfies { title: string; fields: [RuleKey, string][] }[];
const groups: PayEntry["category"][] = [
  "底薪",
  "奖金",
  "扣款",
  "人工调整",
  "待核",
];
const sum = (
  rows: PayEntry[],
  side: "teacher" | "office",
  category?: PayEntry["category"],
) =>
  roundPay(
    rows
      .filter((row) => !category || row.category === category)
      .reduce((n, row) => n + row[side], 0),
  );

export default function HalfMonthPayroll() {
  const { data, can } = useDemo();
  const run = useBusinessAction();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  const tab =
    requestedTab === "rates" || requestedTab === "rules"
      ? requestedTab
      : "period";
  const [view, setView] = useState(
    requestedTab === "office" ? "office" : "teacher",
  );
  const [period, setPeriod] = useState(currentPeriod);
  const [periodCount, setPeriodCount] = useState(48);
  const periods = useMemo(
    () => previousPeriods(currentPeriod(), periodCount),
    [periodCount],
  );
  const [so, setSO] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState("");
  const online = businessMode();
  const preview = useQuery({
    queryKey: [
      "half-month-payroll",
      businessAccountId(),
      data.revision,
      period,
    ],
    queryFn: async ({ signal }) =>
      (await businessRequest(
        "/payroll/half-month?period=" + period,
        "GET",
        undefined,
        signal,
      )) as Record<string, ReturnType<typeof halfMonthStatement>>,
    enabled: online && can("field.pay_amount") && tab === "period",
  });
  const allowed = can("field.pay_amount");
  const statements = useMemo(() => {
    if (!allowed || tab !== "period" || (online && !preview.data)) return [];
    const days = payDates(period);
    const first = days[0],
      end = days[days.length - 1];
    return data.teachers.flatMap((teacher) => {
      const record = data.halfMonthPayroll?.find(
        (r) => r.teacherId === teacher.id && r.period === period,
      );
      const statement = online
        ? preview.data![teacher.id]
        : halfMonthStatement(data, teacher, period);
      if (!statement) return [];
      const inService =
        teacher.status !== "已离职" &&
        (!teacher.startDate || teacher.startDate <= end);
      const accrued = statement.rows.some(
        (r) => !["mode", "teacher-rate", "office", "schedule"].includes(r.key),
      );
      const hasLesson = data.lessons.some(
        (l) => l.teacherId === teacher.id && l.date >= first && l.date <= end,
      );
      if (!record && !inService && !accrued && !hasLesson) return [];
      return [{ teacher, statement, record }];
    });
  }, [allowed, tab, online, preview.data, data, period]);
  const offices = [
    ...new Set([
      ...statements.map((x) => x.statement.so),
      ...(so === null ? [] : [so]),
    ]),
  ].sort();
  const filtered = statements.filter(
    ({ statement, record }) =>
      (so === null || statement.so === so) &&
      statement.name.toLowerCase().includes(search.trim().toLowerCase()) &&
      (!status || confirmationStatus(record?.status) === status),
  );
  const summary = new Map<
    string,
    { count: number; teacher: number; office: number }
  >();
  for (const { statement } of filtered) {
    const line = summary.get(statement.so) ?? {
      count: 0,
      teacher: 0,
      office: 0,
    };
    line.count++;
    line.teacher += sum(statement.rows, "teacher");
    line.office += sum(statement.rows, "office");
    summary.set(statement.so, line);
  }
  const page = useListPage(filtered);
  const current = statements.find((x) => x.teacher.id === selected);
  const submit = (command: HalfMonthCommand) => run(command);
  function download() {
    const range = periodLabel(period);
    const rows: (string | number)[][] = [
      [
        "结算周期",
        "老师",
        "所属 SO",
        "确认状态",
        "日期",
        "分类",
        "项目",
        "计算依据",
        "来源",
        "老师金额",
        "SO 金额",
      ],
    ];
    for (const { statement, record } of filtered) {
      const fields = [
        range,
        statement.name,
        statement.so,
        confirmationStatus(record?.status),
      ];
      if (!statement.rows.length)
        rows.push([...fields, "", "", "本期无计薪明细", "", "", 0, 0]);
      for (const row of statement.rows)
        rows.push([
          ...fields,
          row.date,
          row.category,
          row.title,
          displayDetail(row, data),
          sourceLabel(row, data, statement.name),
          row.category === "待核" ? "" : row.teacher,
          row.category === "待核" ? "" : row.office,
        ]);
    }
    exportCsv(period + " 薪资明细", rows);
  }
  return (
    <div className="stack half-payroll">
      <PageHeader
        title="薪资"
        action={
          tab === "period" &&
          allowed &&
          can("payroll.export") && (
            <DataTransferButton
              direction="export"
              size="sm"
              disabled={!filtered.length}
              onClick={download}
            />
          )
        }
      />
      <Tabs
        value={tab}
        onChange={(value) => {
          setSelected("");
          setParams({ tab: value });
        }}
        items={[
          { value: "period", label: "薪资" },
          { value: "rates", label: "课时单价" },
          { value: "rules", label: "薪资规则" },
        ]}
      />
      {!allowed ? (
        <Panel title="薪资">
          <p>无金额查看权限</p>
        </Panel>
      ) : (
        <>
          {tab === "rules" && (
            <RulesEditor
              values={rulesForPeriod(data)}
              editable={can("pay_rate.edit")}
              save={(values) => submit({ type: "halfPay.rules", values })}
            />
          )}
          {tab === "rates" && <Rates />}
          {tab === "period" && (
            <>
              <Tabs
                variant="underline"
                value={view}
                onChange={setView}
                items={[
                  { value: "teacher", label: "老师明细" },
                  { value: "office", label: "SO 汇总" },
                ]}
              />
              <Panel className="payroll-results">
                <div className="record-list-tools payroll-filters">
                  <SearchInput
                    placeholder="搜索老师"
                    value={search}
                    onChange={setSearch}
                  />
                  <Field label="结算周期">
                    <Select
                      aria-label="结算周期"
                      value={period}
                      onValueChange={(value) => {
                        if (value === "earlier") {
                          setPeriodCount(periodCount + 48);
                          return;
                        }
                        setPeriod(value);
                      }}
                    >
                      {periods.map((p) => (
                        <option value={p} key={p}>
                          {periodLabel(p)}
                        </option>
                      ))}
                      <option value="earlier">显示更早周期</option>
                    </Select>
                  </Field>
                  <Field label="所属 SO">
                    <Select
                      aria-label="所属 SO"
                      value={so === null ? "" : "so:" + so}
                      onValueChange={(v) => setSO(v ? v.slice(3) : null)}
                    >
                      <option value="">全部 SO</option>
                      {offices.map((name) => (
                        <option key={name} value={"so:" + name}>
                          {name || "未分配 SO"}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="确认状态">
                    <Select
                      aria-label="确认状态"
                      value={status}
                      onValueChange={setStatus}
                    >
                      <option value="">全部确认状态</option>
                      <option>待确认</option>
                      <option>已确认</option>
                    </Select>
                  </Field>
                </div>
                <div className="table-wrap">
                  {view === "office" ? (
                    <table>
                      <thead>
                        <tr>
                          <th>SO</th>
                          <th>老师人数</th>
                          <th>老师应结合计</th>
                          <th>SO 应结合计</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...summary].map(([name, line]) => (
                          <tr key={name}>
                            <td>{name || "—"}</td>
                            <td>{line.count}</td>
                            <td>{money(line.teacher)}</td>
                            <td>{money(line.office)}</td>
                            <td>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSO(name);
                                  setView("teacher");
                                }}
                              >
                                查看老师明细
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>老师</th>
                          <th>所属 SO</th>
                          {["底薪", "奖金", "扣款"].map((g) => (
                            <th className="payroll-wide" key={g}>
                              {g}
                            </th>
                          ))}
                          <th>老师应结</th>
                          <th>SO 应结</th>
                          <th>确认状态</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.rows.map(({ teacher, statement, record }) => {
                          const pending = statement.rows.filter(
                            (r) => r.category === "待核",
                          ).length;
                          const state = confirmationStatus(record?.status);
                          return (
                            <tr key={teacher.id}>
                              <td>{statement.name}</td>
                              <td>{statement.so || "—"}</td>
                              {groups.slice(0, 3).map((g) => (
                                <td className="payroll-wide" key={g}>
                                  {money(
                                    g === "扣款"
                                      ? Math.abs(
                                          sum(statement.rows, "teacher", g),
                                        )
                                      : sum(statement.rows, "teacher", g),
                                  )}
                                </td>
                              ))}
                              <td>{money(sum(statement.rows, "teacher"))}</td>
                              <td>{money(sum(statement.rows, "office"))}</td>
                              <td>
                                <Badge tone={tone(state)}>{state}</Badge>
                                {pending > 0 && (
                                  <Badge tone="warning">{pending} 项待核</Badge>
                                )}
                              </td>
                              <td>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelected(teacher.id)}
                                >
                                  查看工资单
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                {online && preview.isError ? (
                  <p role="alert">
                    薪资预览读取失败。{" "}
                    <Button onClick={() => void preview.refetch()}>
                      重新读取
                    </Button>
                  </p>
                ) : online && preview.isPending ? (
                  <p role="status">正在读取薪资明细。</p>
                ) : !filtered.length ? (
                  <p>该周期暂无符合条件的老师</p>
                ) : (
                  view === "teacher" && (
                    <ListPagination
                      total={filtered.length}
                      page={page.page}
                      onChange={page.setPage}
                    />
                  )
                )}
              </Panel>
            </>
          )}
          {current && (
            <Drawer
              open
              width={900}
              title={current.statement.name + " · 工资单"}
              onClose={() => setSelected("")}
            >
              <Statement
                key={period + current.teacher.id}
                statement={current.statement}
                teacherId={current.teacher.id}
                period={period}
                status={current.record?.status ?? "待确认"}
                adjust={
                  can("payroll.adjust")
                    ? (side, amount, note) =>
                        submit({
                          type: "halfPay.adjust",
                          teacherId: current.teacher.id,
                          period,
                          side,
                          amount,
                          note,
                        })
                    : undefined
                }
                review={
                  can("payroll.adjust")
                    ? (key, note, networkPay, historicalRate) =>
                        submit({
                          type: "halfPay.review",
                          teacherId: current.teacher.id,
                          period,
                          key,
                          note,
                          networkPay,
                          historicalRate,
                        })
                    : undefined
                }
                markSerious={
                  can("payroll.adjust")
                    ? (feedbackId) =>
                        submit({
                          type: "halfPay.serious",
                          teacherId: current.teacher.id,
                          period,
                          feedbackId,
                        })
                    : undefined
                }
                statusChange={
                  can(
                    current.record?.status === "已确认"
                      ? "payroll.mark_paid"
                      : "payroll.confirm",
                  )
                    ? (status) =>
                        submit({
                          type: "halfPay.status",
                          teacherId: current.teacher.id,
                          period,
                          status,
                        })
                    : undefined
                }
              />
            </Drawer>
          )}
        </>
      )}
    </div>
  );
}

function confirmationStatus(status?: string) {
  return status === "已确认" || status === "已发放" ? "已确认" : "待确认";
}
function currentPeriod() {
  return DEMO_TODAY.slice(0, 7) + (DEMO_TODAY.slice(8) <= "15" ? "-1" : "-2");
}
function periodLabel(period: string) {
  const days = payDates(period);
  return (days[0] + " – " + days.at(-1)).replaceAll("-", "/");
}
function previousPeriods(latest: string, count: number) {
  let year = Number(latest.slice(0, 4)),
    month = Number(latest.slice(5, 7)),
    half = Number(latest.slice(-1));
  return Array.from({ length: count }, () => {
    const value = year + "-" + String(month).padStart(2, "0") + "-" + half;
    if (half === 1 && --month === 0) {
      year--;
      month = 12;
    }
    half = 3 - half;
    return value;
  });
}

function Rates() {
  const { data, can } = useDemo();
  const run = useBusinessAction();
  const [side, setSide] = useState("teacher");
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    rate?: number;
  }>();
  const [draft, setDraft] = useState("");
  const teacherSide = side === "teacher";
  const rows = teacherSide
    ? data.teachers.map((t) => ({
        id: t.id,
        name: t.name,
        so: t.so,
        rate: t.rate,
      }))
    : [...new Set(data.teachers.map((t) => t.so).filter(Boolean))]
        .sort()
        .map((so) => ({
          id: so,
          name: so,
          so,
          rate: data.officePayRates?.[so],
        }));
  const page = useListPage(rows);
  return (
    <>
      <Tabs
        variant="underline"
        value={side}
        onChange={setSide}
        items={[
          { value: "teacher", label: "老师单价" },
          { value: "office", label: "SO 单价" },
        ]}
      />
      <Panel className="payroll-results">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{teacherSide ? "老师" : "SO"}</th>
                {teacherSide && <th>所属 SO</th>}
                <th>课时单价</th>
                {can("pay_rate.edit") && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  {teacherSide && <td>{r.so || "—"}</td>}
                  <td>
                    {r.rate === undefined || (teacherSide && r.rate <= 0)
                      ? "待设置"
                      : money(r.rate) + " / 课时"}
                  </td>
                  {can("pay_rate.edit") && (
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(r);
                          setDraft(r.rate?.toString() ?? "");
                        }}
                      >
                        编辑
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ListPagination
          total={rows.length}
          page={page.page}
          onChange={page.setPage}
        />
      </Panel>
      {editing && can("pay_rate.edit") && (
        <Modal
          open
          onClose={() => setEditing(undefined)}
          title="编辑课时单价"
          description={editing.name}
          width={400}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const rate = Number(draft);
              if (
                await run(
                  teacherSide
                    ? {
                        type: "halfPay.teacherRate",
                        teacherId: editing.id,
                        rate,
                      }
                    : { type: "halfPay.officeRate", so: editing.id, rate },
                )
              )
                setEditing(undefined);
            }}
          >
            <Field label="课时单价（₱ / 课时）">
              <input
                required
                type="number"
                step="0.01"
                min={teacherSide ? 0.01 : 0}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </Field>
            <div className="payroll-actions">
              <Button onClick={() => setEditing(undefined)}>取消</Button>
              <Button type="submit" variant="primary">
                保存
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function RulesEditor({
  values,
  editable,
  save,
}: {
  values: ReturnType<typeof rulesForPeriod>;
  editable: boolean;
  save: (
    values: Partial<ReturnType<typeof rulesForPeriod>>,
  ) => Promise<boolean>;
}) {
  const [changes, setChanges] = useState<Partial<
    Record<RuleKey, string>
  > | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = editable && changes !== null;
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!editing || saving) return;
        const next: Partial<typeof values> = {};
        for (const key of Object.keys(changes) as RuleKey[]) {
          next[key] = Number(changes[key]) / (key.endsWith("Ratio") ? 100 : 1);
        }
        if (!Object.keys(next).length) {
          setChanges(null);
          return;
        }
        setSaving(true);
        try {
          if (await save(next)) setChanges(null);
        } finally {
          setSaving(false);
        }
      }}
    >
      <Panel
        title="薪资规则"
        action={
          editable &&
          (editing ? (
            <div className="payroll-actions">
              <Button
                size="sm"
                disabled={saving}
                onClick={() => setChanges(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                type="submit"
                variant="primary"
                loading={saving}
              >
                保存规则
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setChanges({})}>
              编辑
            </Button>
          ))
        }
      >
        {ruleGroups.map(({ title, fields }) => (
          <section key={title} aria-label={title} className="payroll-rule-section">
            <h3>{title}</h3>
            <div className="grid-3 payroll-rule-fields">
              {fields.map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type="number"
                    readOnly={!editing}
                    disabled={saving}
                    required={editing}
                    min={key === "attendanceUnits" ? 0.01 : 0}
                    max={key.endsWith("Ratio") ? 100 : undefined}
                    step="any"
                    value={
                      changes?.[key] ??
                      (key.endsWith("Ratio")
                        ? roundPay(values[key] * 100)
                        : values[key])
                    }
                    onChange={(event) =>
                      setChanges({ ...changes, [key]: event.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
          </section>
        ))}
      </Panel>
    </form>
  );
}
function lessonLabel(data: DemoState, id: string) {
  const l = data.lessons.find((x) => x.id === id);
  if (!l) return "上课记录";
  return [
    l.date,
    l.time,
    data.students.find((s) => s.id === l.studentId)?.name,
    "上课记录",
  ]
    .filter(Boolean)
    .join(" · ");
}
function displayDetail(row: PayEntry, data: DemoState) {
  if (
    row.key.startsWith("renewal:") &&
    row.detail.startsWith("复购前最后一节完课 ")
  )
    return (
      "复购前最后一节完课 · " +
      lessonLabel(data, row.detail.slice("复购前最后一节完课 ".length))
    );
  if (row.key.startsWith("renewal-lesson:") && row.detail.includes("："))
    return (
      "请先核定课程：" +
      row.detail
        .split("：")[1]
        .split("、")
        .map((id) => lessonLabel(data, id))
        .join("、")
    );
  return row.detail;
}
function sourceLabel(row: PayEntry, data: DemoState, name: string) {
  if (row.key.startsWith("op:") || row.key.startsWith("op-unfinished:"))
    return "固定课表 · " + row.source;
  if (row.key === "office") return row.source + " · 课时单价";
  if (
    ["mode", "teacher-rate", "schedule"].includes(row.key) ||
    row.key.startsWith("historical-rate:")
  )
    return name + " · 老师资料";
  if (row.key === "attendance-award")
    return periodLabel(row.source) + " · 出勤记录";
  if (directLessonEntry.test(row.key))
    return lessonLabel(data, row.source);
  if (/^(praise|complaint|serious):/.test(row.key)) {
    const f = data.feedback.find((f) => f.id === row.source);
    const student = data.students.find((s) => s.id === f?.studentId);
    return [row.date, student?.name, "学员反馈"].filter(Boolean).join(" · ");
  }
  if (row.key.startsWith("renewal")) {
    const credit = data.credits.find(
      (c) => c.purchaseId === row.source || c.id === row.source,
    );
    const order = data.orders?.find(
      (o) => o.id === (credit?.orderId ?? row.source),
    );
    const names = (
      credit?.purchaseStudentIds ??
      order?.purchaseStudentIds ??
      order?.studentIds ??
      []
    )
      .map((id) => data.students.find((s) => s.id === id)?.name)
      .filter(Boolean);
    return [credit?.date || order?.date || row.date, ...names, "续费订单"].join(
      " · ",
    );
  }
  if (row.key.startsWith("action:")) return row.date + " · 扣款记录";
  return row.date.slice(0, 10) + " · 人工调整记录";
}

const directLessonEntry =
  /^(lesson|lesson-review|lesson-units|complaint-fee|reversal|attendance|cancel|late|network-pay):/;
function entryAmount(row: PayEntry, side: "teacher" | "office") {
  return row.category === "待核" || row.pendingRates?.includes(side)
    ? "待核"
    : money(row[side]);
}

function statementSubtotal(rows: PayEntry[], side: "teacher" | "office") {
  const calculated = rows.filter(
    (row) => row.category !== "待核" && !row.pendingRates?.includes(side),
  );
  const hasUnknown = calculated.length < rows.length;
  return hasUnknown && calculated.every((row) => row[side] === 0)
    ? "待核"
    : money(sum(calculated, side));
}

function Statement({
  teacherId,
  statement,
  period,
  status,
  adjust,
  review,
  markSerious,
  statusChange,
}: {
  teacherId: string;
  statement: ReturnType<typeof halfMonthStatement>;
  period: string;
  status: string;
  adjust?: (
    side: "teacher" | "office",
    amount: number,
    note: string,
  ) => Promise<boolean>;
  review?: (
    key: string,
    note: string,
    networkPay?: { teacher: number; office: number },
    historicalRate?: number,
  ) => Promise<boolean>;
  markSerious?: (feedbackId: string) => Promise<boolean>;
  statusChange?: (status: "已确认" | "已发放") => Promise<boolean>;
}) {
  const { data, can } = useDemo();
  const [side, setSide] = useState<"teacher" | "office">("teacher");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [reviewItem, setReviewItem] = useState("");
  const [networkTeacher, setNetworkTeacher] = useState("");
  const [networkOffice, setNetworkOffice] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [seriousItem, setSeriousItem] = useState("");
  const pending = statement.rows.filter(
    (row) => row.category === "待核",
  ).length;
  const days = payDates(period);
  const lastDate = days[days.length - 1];
  const beforeConfirmation = DEMO_TODAY < lastDate;
  const lessons = data.lessons
    .filter(
      (l) =>
        l.teacherId === teacherId && l.date >= days[0] && l.date <= lastDate,
    )
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    );
  const teacher = data.teachers.find((t) => t.id === teacherId)!;
  const entries = new Map<string, PayEntry[]>();
  for (const row of statement.rows) {
    const lessonId =
      row.lessonId ??
      (directLessonEntry.test(row.key) ? row.source : undefined);
    if (lessonId) {
      const list = entries.get(lessonId) ?? [];
      list.push(row);
      entries.set(lessonId, list);
    }
  }
  return (
    <div className="stack payroll-statement">
      <div>
        {statement.so} · {statement.mode ?? "待设置"} · {days[0]} 至{" "}
        {days.at(-1)} · PHP <Badge tone={tone(status)}>{status}</Badge>
      </div>
      <Panel title="应结汇总">
        <div className="payroll-totals">
          {(["teacher", "office"] as const).map((target) => {
            const label = target === "teacher" ? "老师应结" : "SO 应结";
            return (
              <div key={target}>
                <span>{label}</span>
                <strong aria-label={label}>
                  {statementSubtotal(statement.rows, target)}
                </strong>
              </div>
            );
          })}
        </div>
        {pending > 0 && (
          <p role="status">有 {pending} 项待核。已列出的金额仅含已计算项目。</p>
        )}
      </Panel>
      <Panel title={`逐课明细（${lessons.length} 节）`}>
        {status !== "待确认" && (
          <p>课程资料来自当前上课记录，金额取自已确认工资单。</p>
        )}
        {!lessons.length ? (
          <p>本期没有可查看的上课记录。</p>
        ) : (
          <div className="table-wrap">
            <table aria-label="逐课明细">
              <thead>
                <tr>
                  <th>上课时间</th>
                  <th>课程 / 教材</th>
                  <th>学员</th>
                  <th>课程状态</th>
                  <th>计薪项目与依据</th>
                  <th>老师金额</th>
                  <th>SO 金额</th>
                </tr>
              </thead>
              <tbody>
                {lessons.flatMap((l) => {
                  const rows = entries.get(l.id) ?? [];
                  const mode =
                    data.lessonPayBasis?.[l.id]?.mode ??
                    teacher.payModeHistory?.find((h) => l.date < h.until)
                      ?.mode ??
                    statement.mode;
                  const missingMode = status === "待确认" && !mode;
                  const fixedBase = status === "待确认" && mode === "OP";
                  let note = "本节无计薪项目";
                  if (status !== "待确认") note = "工资单无单节计薪记录";
                  else if (missingMode) note = "计薪方式待设置";
                  else if (fixedBase) note = "底薪按固定时段单列";
                  const amountLabel = missingMode ? "待核" : "—";
                  const lines =
                    !rows.length || missingMode || fixedBase
                      ? [...rows, undefined]
                      : rows;
                  const slot = l.date + " " + l.time;
                  return lines.map((row, index) => (
                    <tr key={l.id + ":" + index}>
                      {index === 0 && (
                        <>
                          <td rowSpan={lines.length}>
                            {can("lesson.view") ? (
                              <Link
                                to={
                                  "/lessons?lesson=" + encodeURIComponent(l.id)
                                }
                              >
                                {slot}
                              </Link>
                            ) : (
                              slot
                            )}
                            <div>{l.duration} 分钟</div>
                          </td>
                          <td rowSpan={lines.length}>
                            {l.kind}
                            <div>{l.material || "未填写教材"}</div>
                          </td>
                          <td rowSpan={lines.length}>
                            {data.students.find((s) => s.id === l.studentId)
                              ?.name || "—"}
                          </td>
                          <td rowSpan={lines.length}>{l.status}</td>
                        </>
                      )}
                      <td>
                        {row ? (
                          <>
                            {row.title}
                            <div>{displayDetail(row, data)}</div>
                          </>
                        ) : (
                          note
                        )}
                      </td>
                      <td>{row ? entryAmount(row, "teacher") : amountLabel}</td>
                      <td>{row ? entryAmount(row, "office") : amountLabel}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {(["待核", ...groups.slice(0, 4)] as PayEntry["category"][]).map(
        (group) => {
          const rows = statement.rows.filter((row) => row.category === group);
          if (!rows.length) return null;
          return (
            <details key={group} open={group === "待核" || pending === 0}>
              <summary>
                {group} · {rows.length} 笔
                {group !== "待核" &&
                  ` · 老师 ${statementSubtotal(rows, "teacher")} · SO ${statementSubtotal(rows, "office")}`}
              </summary>
              {!!rows.length && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>项目</th>
                        <th>计算依据</th>
                        <th>来源</th>
                        <th>老师金额</th>
                        <th>SO 金额</th>
                        {group === "待核" && status === "待确认" && review && (
                          <th>操作</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key}>
                          <td>{row.date}</td>
                          <td>{row.title}</td>
                          <td>{displayDetail(row, data)}</td>
                          <td>
                            {row.category === "待核" &&
                            (row.key.startsWith("lesson-review:") ||
                              row.key.startsWith("complaint-fee:")) ? (
                              <Link
                                to={
                                  "/lessons?lesson=" +
                                  encodeURIComponent(row.source)
                                }
                              >
                                {lessonLabel(data, row.source)}
                              </Link>
                            ) : (
                              sourceLabel(row, data, statement.name)
                            )}
                          </td>
                          <td>{entryAmount(row, "teacher")}</td>
                          <td>{entryAmount(row, "office")}</td>
                          {group === "待核" &&
                            status === "待确认" &&
                            review && (
                              <td>
                                {!row.key.startsWith("op-unfinished:") &&
                                  !row.key.startsWith("renewal-lesson:") &&
                                  !row.key.startsWith("lesson-review:") &&
                                  !row.key.startsWith("complaint-fee:") &&
                                  ![
                                    "mode",
                                    "office",
                                    "teacher-rate",
                                    "schedule",
                                  ].includes(row.key) && (
                                    <Button
                                      variant="secondary"
                                      onClick={() => {
                                        setNetworkTeacher("");
                                        setNetworkOffice("");
                                        setReviewNote("");
                                        setReviewItem(row.key);
                                      }}
                                    >
                                      记录处理结果
                                    </Button>
                                  )}
                              </td>
                            )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          );
        },
      )}
      {status === "待确认" &&
        markSerious &&
        statement.rows.some(
          (row) =>
            row.key.startsWith("complaint:") && row.category !== "人工调整",
        ) && (
          <details>
            <summary>登记严重违规</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (seriousItem && (await markSerious(seriousItem)))
                  setSeriousItem("");
              }}
            >
              <Field label="已核实差评">
                <Select value={seriousItem} onValueChange={setSeriousItem}>
                  <option value="">请选择</option>
                  {statement.rows
                    .filter(
                      (row) =>
                        row.key.startsWith("complaint:") &&
                        row.category !== "人工调整",
                    )
                    .map((row) => (
                      <option key={row.key} value={row.source}>
                        {sourceLabel(row, data, statement.name)}
                      </option>
                    ))}
                </Select>
              </Field>
              <Button type="submit" disabled={!seriousItem} variant="secondary">
                转为严重违规待核
              </Button>
            </form>
          </details>
        )}
      {status === "待确认" && review && reviewItem && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await review(
                reviewItem,
                reviewNote,
                reviewItem.startsWith("network-pay:")
                  ? {
                      teacher: Number(networkTeacher),
                      office: Number(networkOffice),
                    }
                  : undefined,
                reviewItem.startsWith("historical-rate:")
                  ? Number(networkTeacher)
                  : undefined,
              )
            ) {
              setReviewItem("");
              setReviewNote("");
            }
          }}
        >
          {reviewItem.startsWith("historical-rate:") && (
            <Field label="该日老师课时单价（₱）">
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={networkTeacher}
                onChange={(e) => setNetworkTeacher(e.target.value)}
              />
            </Field>
          )}
          {reviewItem.startsWith("network-pay:") && (
            <>
              <Field label="本节老师应得课酬（₱）">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={networkTeacher}
                  onChange={(e) => setNetworkTeacher(e.target.value)}
                />
              </Field>
              <Field label="本节 SO 应得课酬（₱）">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={networkOffice}
                  onChange={(e) => setNetworkOffice(e.target.value)}
                />
              </Field>
            </>
          )}
          <Field label="待核处理说明">
            <input
              value={reviewNote}
              required
              onChange={(e) => setReviewNote(e.target.value)}
            />
          </Field>
          {!reviewItem.startsWith("network-pay:") && (
            <p>需要补发或补扣时，请另录入人工调整金额。</p>
          )}
          <Button type="submit" variant="secondary">
            保存处理结果
          </Button>
        </form>
      )}
      {status === "待确认" && adjust && (
        <Panel title="人工调整">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await adjust(side, Number(amount), note)) {
                setAmount("");
                setNote("");
              }
            }}
          >
            <Field label="调整对象">
              <Select
                value={side}
                onValueChange={(value) =>
                  setSide(value === "office" ? "office" : "teacher")
                }
              >
                <option value="teacher">老师</option>
                <option value="office">SO</option>
              </Select>
            </Field>
            <Field label="金额（加款填正数，扣款填负数）">
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="调整原因">
              <input
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="secondary">
              添加调整
            </Button>
          </form>
        </Panel>
      )}
      {status === "待确认" && statusChange && (
        <>
          {beforeConfirmation && <p>本周期可于 {lastDate} 起确认。</p>}
          <Button
            variant="primary"
            disabled={beforeConfirmation || pending > 0}
            onClick={() => void statusChange("已确认")}
          >
            确认薪资
          </Button>
        </>
      )}
      {status === "已确认" && statusChange && (
        <Button variant="primary" onClick={() => void statusChange("已发放")}>
          标记已发放
        </Button>
      )}
    </div>
  );
}
