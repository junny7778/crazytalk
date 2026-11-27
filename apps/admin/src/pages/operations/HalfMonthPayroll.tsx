import { isDemoClockEnabled, operationsNow } from "@crazytalk/shared";
import { useQuery } from "@tanstack/react-query";

import { Fragment, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  DEMO_TODAY,
  halfMonthStatement,
  payrollReadiness,
  payDates,
  payPeriod,
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
  Field,
  PageHeader,
  Panel,
  Select,
  SearchInput,
  Tabs,
} from "@crazytalk/ui";
import { exportCsv, money, tone, useBusinessAction } from "./common";
import DataTransferButton from "../../components/DataTransferButton";
import {
  attendanceIssue,
  personAttendance,
  teacherNoShowHint,
} from "../../lib/lessonAttendance";
import ListPagination, {
  LIST_PAGE_SIZE,
  useListPage,
} from "../../components/ListPagination";
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

function nextPayrollChange(rows: PayEntry[], period: string) {
  const now = operationsNow();
  const closing = Date.parse(payDates(period).at(-1) + "T00:00:00+08:00");
  return rows.reduce(
    (next, row) =>
      row.nextChangeAt && row.nextChangeAt > now
        ? Math.min(next, row.nextChangeAt)
        : next,
    closing > now ? closing : Infinity,
  );
}

function usePayrollBoundary(
  next: number,
  refresh: () => void,
  refetch: () => Promise<unknown>,
) {
  useEffect(() => {
    if (isDemoClockEnabled() || !Number.isFinite(next)) return;
    let timer: number;
    function schedule() {
      const delay = next - operationsNow();
      if (delay > 0) {
        timer = window.setTimeout(schedule, Math.min(delay, 2_147_483_647));
      } else {
        refresh();
        if (businessMode()) void refetch();
      }
    }
    schedule();
    return () => window.clearTimeout(timer);
  }, [next, refresh, refetch]);
}

function usePayrollPreview(period: string, revision: number, enabled: boolean) {
  return useQuery({
    queryKey: ["half-month-payroll", businessAccountId(), revision, period],
    queryFn: async ({ signal }) =>
      (await businessRequest(
        "/payroll/half-month?period=" + period,
        "GET",
        undefined,
        signal,
      )) as Record<string, ReturnType<typeof halfMonthStatement>>,
    enabled: businessMode() && enabled,
    refetchInterval: (query) =>
      Object.values(query.state.data ?? {}).some((statement) =>
        statement.rows.some(
          (row) => row.category === "等待" || row.category === "待核",
        ),
      )
        ? 30_000
        : false,
  });
}

export default function HalfMonthPayroll() {
  const { period, teacherId } = useParams();
  return period && teacherId ? (
    <StatementPage key={period + teacherId} period={period} teacherId={teacherId} />
  ) : (
    <PayrollList />
  );
}

function PayrollList() {
  const { data, can } = useDemo();
  const run = useBusinessAction();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  const tab =
    requestedTab === "rates" || requestedTab === "rules"
      ? requestedTab
      : "period";
  const view =
    params.get("view") ?? (requestedTab === "office" ? "office" : "teacher");
  const selectedPeriod = payPeriod.safeParse(params.get("period"));
  const period = selectedPeriod.success ? selectedPeriod.data : currentPeriod();
  const [periodCount, setPeriodCount] = useState(48);
  const periods = useMemo(() => {
    const options = previousPeriods(currentPeriod(), periodCount);
    if (!options.includes(period)) options.push(period);
    return options;
  }, [period, periodCount]);
  const so = params.get("so");
  const search = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  function updateFilters(values: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    next.delete("page");
    for (const [key, value] of Object.entries(values)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }
  const online = businessMode();
  const allowed = can("field.pay_amount");
  const preview = usePayrollPreview(
    period,
    data.revision,
    allowed && tab === "period",
  );
  const [tick, refresh] = useReducer((value: number) => value + 1, 0);
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
  }, [allowed, tab, online, preview.data, data, period, tick]);
  const next = statements.reduce(
    (earliest, { statement, record }) =>
      record?.snapshot
        ? earliest
        : Math.min(earliest, nextPayrollChange(statement.rows, period)),
    Infinity,
  );
  usePayrollBoundary(next, refresh, preview.refetch);
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
  const requestedPage = Number(params.get("page"));
  const lastPage = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, Math.min(requestedPage, lastPage))
    : 1;
  const pageRows = filtered.slice(
    (page - 1) * LIST_PAGE_SIZE,
    page * LIST_PAGE_SIZE,
  );
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
        "明细状态",
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
        rows.push([...fields, "", "", "本期无计薪明细", "", "", 0, 0, ""]);
      for (const row of statement.rows)
        rows.push([
          ...fields,
          setupEntryKeys.has(row.key) ? "" : row.date,
          row.category,
          row.title,
          displayDetail(row, data),
          sourceLabel(row, data, statement.name),
          entryAmountPending(row, "teacher") ? "" : row.teacher,
          entryAmountPending(row, "office") ? "" : row.office,
          ledgerState(row),
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
        onChange={(value) => updateFilters({ tab: value })}
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
                onChange={(value) => updateFilters({ view: value })}
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
                    onChange={(value) => updateFilters({ q: value || null })}
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
                        updateFilters({ period: value });
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
                      onValueChange={(v) =>
                        updateFilters({ so: v ? v.slice(3) : null })
                      }
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
                      onValueChange={(value) =>
                        updateFilters({ status: value || null })
                      }
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
                                  updateFilters({ so: name, view: "teacher" });
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
                        {pageRows.map(({ teacher, statement, record }) => {
                          const { review: pending, waiting } = payrollReadiness(
                            statement.rows,
                            period,
                          );
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
                              <td>
                                {statementSubtotal(statement.rows, "teacher")}
                              </td>
                              <td>
                                {statementSubtotal(statement.rows, "office")}
                              </td>
                              <td>
                                <Badge tone={tone(state)}>{state}</Badge>
                                {pending > 0 && (
                                  <Badge tone="warning">{pending} 项待核</Badge>
                                )}
                                {waiting > 0 && (
                                  <Badge tone="neutral">等待结果</Badge>
                                )}
                              </td>
                              <td>
                                <Link
                                  className="btn btn-sm btn-ghost"
                                  to={`/payroll/${period}/${encodeURIComponent(teacher.id)}`}
                                  state={{ listSearch: params.toString() }}
                                >
                                  查看工资单
                                </Link>
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
                      page={page}
                      onChange={(n) =>
                        updateFilters({ page: n > 1 ? String(n) : null })
                      }
                    />
                  )
                )}
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}

function StatementPage({
  period,
  teacherId,
}: {
  period: string;
  teacherId: string;
}) {
  const ledgerView = useLedgerView();
  const { data, can } = useDemo();
  const location = useLocation();
  const allowed = can("field.pay_amount");
  const validPeriod = payPeriod.safeParse(period).success;
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const preview = usePayrollPreview(
    period,
    data.revision,
    allowed && validPeriod && !!teacher,
  );
  const record = data.halfMonthPayroll?.find(
    (r) => r.teacherId === teacherId && r.period === period,
  );
  const [tick, refresh] = useReducer((value: number) => value + 1, 0);
  const statement = useMemo(() => {
    if (!allowed || !validPeriod || !teacher) return;
    return businessMode()
      ? preview.data?.[teacherId]
      : halfMonthStatement(data, teacher, period);
  }, [
    allowed,
    validPeriod,
    teacher,
    teacherId,
    preview.data,
    data,
    period,
    tick,
  ]);
  usePayrollBoundary(
    statement && !record?.snapshot
      ? nextPayrollChange(statement.rows, period)
      : Infinity,
    refresh,
    preview.refetch,
  );
  const listParams = new URLSearchParams(location.state?.listSearch);
  if (validPeriod) listParams.set("period", period);
  let content;
  if (!allowed) content = <p>无金额查看权限</p>;
  else if (!validPeriod || !teacher) content = <p>找不到这份工资单。</p>;
  else if (businessMode() && preview.isError) {
    content = (
      <p role="alert">
        薪资明细读取失败。{" "}
        <Button onClick={() => void preview.refetch()}>重新读取</Button>
      </p>
    );
  } else if (businessMode() && preview.isPending)
    content = <p role="status">正在读取薪资明细。</p>;
  else if (!statement) content = <p>找不到这份工资单。</p>;
  else
    content = (
      <Statement
        ledgerView={ledgerView}
        statement={statement}
        teacherId={teacherId}
        period={period}
        status={record?.status ?? "待确认"}
      />
    );
  return (
    <section className="stack half-payroll" aria-label="工资单详情">
      <Link
        className="row muted"
        to={{ pathname: "/payroll", search: listParams.toString() }}
      >
        <ArrowLeft size={14} />
        返回薪资列表
      </Link>
      {content}
    </section>
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
  const [params, setParams] = useSearchParams();
  const side = params.get("side") === "office" ? "office" : "teacher";
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
  const editable = can("pay_rate.edit");
  const editId = params.get("edit");
  const editing = editable ? rows.find((row) => row.id === editId) : undefined;
  const page = useListPage(rows);
  function updateRateView(side: string, edit?: string) {
    const next = new URLSearchParams(params);
    next.set("side", side);
    if (edit) next.set("edit", edit);
    else next.delete("edit");
    setParams(next, { replace: true });
  }
  const closeEditor = () => updateRateView(side);
  return (
    <>
      <Tabs
        variant="underline"
        value={side}
        onChange={(value) => updateRateView(value)}
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
                {editable && <th>操作</th>}
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
                  {editable && (
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateRateView(side, r.id)}
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
      {editing && (
        <Modal
          key={`${side}:${editing.id}`}
          open
          onClose={closeEditor}
          title="编辑课时单价"
          description={editing.name}
          width={400}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const rate = Number(new FormData(e.currentTarget).get("rate"));
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
                closeEditor();
            }}
          >
            <Field label="课时单价（₱ / 课时）">
              <input
                required
                name="rate"
                type="number"
                step="0.01"
                min={teacherSide ? 0.01 : 0}
                defaultValue={editing.rate}
              />
            </Field>
            <div className="payroll-actions">
              <Button onClick={closeEditor}>取消</Button>
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
          <section
            key={title}
            aria-label={title}
            className="payroll-rule-section"
          >
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
  if (row.key.startsWith("renewal-lesson:") && row.dependsOn)
    return (
      "等待续费前的课程结果：" +
      row.dependsOn
        .map((key) => lessonLabel(data, key.slice("lesson-review:".length)))
        .join("、")
    );
  return row.detail;
}
function renewalSource(row: PayEntry, data: DemoState) {
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
  return { date: credit?.date || order?.date || row.date, names };
}

function ledgerStudentNames(
  row: PayEntry | undefined,
  lesson: DemoState["lessons"][number] | undefined,
  data: DemoState,
) {
  if (row?.key.startsWith("renewal"))
    return renewalSource(row, data).names.join("、");
  let studentId = lesson?.studentId;
  if (!studentId && row) {
    const feedbackId = row.key.startsWith("action:")
      ? data.actions.find((action) => action.id === row.source)?.feedbackId
      : /^(praise|complaint|serious):/.test(row.key)
        ? row.source
        : undefined;
    if (feedbackId)
      studentId = data.feedback.find((f) => f.id === feedbackId)?.studentId;
  }
  return (
    studentId && data.students.find((student) => student.id === studentId)?.name
  );
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
  if (directLessonEntry.test(row.key)) return lessonLabel(data, row.source);
  if (/^(praise|complaint|serious):/.test(row.key)) {
    const f = data.feedback.find((f) => f.id === row.source);
    const student = data.students.find((s) => s.id === f?.studentId);
    return [row.date, student?.name, "学员反馈"].filter(Boolean).join(" · ");
  }
  if (row.key.startsWith("renewal")) {
    const { date, names } = renewalSource(row, data);
    return [date, ...names, "续费订单"].join(" · ");
  }
  if (row.key.startsWith("action:")) return row.date + " · 扣款记录";
  return row.date.slice(0, 10) + " · 人工调整记录";
}

const setupEntryKeys = new Set(["mode", "office", "teacher-rate", "schedule"]);
const defaultLedgerColumns = [
  "计薪日期",
  "上课时间",
  "学员",
  "老师金额",
  "SO 金额",
  "计薪项目",
  "计薪数量",
  "明细状态",
] as const;
const ledgerColumns = [
  ...defaultLedgerColumns,
  "课型",
  "课程时长",
  "课程状态",
  "老师单价",
  "SO 单价",
  "计薪比例",
  "计算说明",
  "来源",
] as const;
type LedgerColumn = (typeof ledgerColumns)[number];
const ledgerColumnClass: Partial<Record<LedgerColumn, string>> = {
  上课时间: "payroll-class-time",
  学员: "payroll-students",
  计算说明: "payroll-basis",
  老师金额: "payroll-amount",
  "SO 金额": "payroll-amount",
  老师单价: "payroll-amount",
  "SO 单价": "payroll-amount",
};
const ledgerTitles: Record<string, string> = {
  "NP 正常完课": "完课底薪",
  "NP 学员缺席": "学员缺席课酬",
  "OP 固定时段": "固定时段底薪",
  "OP 底薪冲减": "固定时段底薪冲减",
  "OP 课表未登记": "固定课表未登记",
  老师缺席: "老师缺席扣款",
  老师取消: "老师取消扣款",
  迟到或早退: "迟到或早退扣款",
};
const directLessonEntry =
  /^(lesson|lesson-review|lesson-units|complaint-fee|reversal|attendance|cancel|late|network-pay):/;
function ledgerState(row: PayEntry) {
  if (row.category === "等待") return "等待结果";
  return row.category === "待核" || row.pendingRates?.length
    ? "待核实"
    : "已计算";
}
function entryAmountPending(row: PayEntry, side: "teacher" | "office") {
  return (
    row.category === "等待" ||
    row.category === "待核" ||
    row.pendingRates?.includes(side)
  );
}
function entryAmount(row: PayEntry, side: "teacher" | "office") {
  if (entryAmountPending(row, side)) return "—";
  const amount = row[side];
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return (
    <span className={amount < 0 ? "payroll-debit" : undefined}>
      {sign}
      {money(Math.abs(amount))}
    </span>
  );
}

type LedgerLine = {
  key: string;
  date: string;
  time: string;
  state: ReturnType<typeof ledgerState> | "不单独计薪";
  row?: PayEntry;
  lesson?: DemoState["lessons"][number];
  note?: string;
};

function ledgerSource(
  row: PayEntry | undefined,
  teacherId: string,
  can: (permission: string) => boolean,
) {
  const profile = "/teachers/" + encodeURIComponent(teacherId);
  if (!row || directLessonEntry.test(row.key)) return { label: "上课记录" };
  if (row.key === "mode") {
    return {
      label: "老师资料",
      action: can("teacher.edit") ? "设置计薪方式" : "查看老师资料",
      path: can("teacher.view")
        ? profile + (can("teacher.edit") ? "?edit=payMode" : "")
        : undefined,
    };
  }
  if (row.key === "office" || row.key === "teacher-rate") {
    const office = row.key === "office";
    const edit = can("pay_rate.edit");
    const query = new URLSearchParams({
      tab: "rates",
      side: office ? "office" : "teacher",
    });
    if (edit) query.set("edit", office ? row.source : teacherId);
    return {
      label: "课时单价",
      action: edit
        ? office
          ? "设置 SO 单价"
          : "设置老师单价"
        : "查看课时单价",
      path: "/payroll?" + query.toString(),
    };
  }
  if (row.key === "schedule" || /^(op|op-unfinished):/.test(row.key))
    return {
      label: "固定课表",
      action: "查看固定课表",
      path: can("teacher.view") ? profile : undefined,
    };
  if (row.key.startsWith("historical-rate:"))
    return {
      label: "老师资料",
      action: "查看老师资料",
      path: can("teacher.view") ? profile : undefined,
    };
  if (row.key === "attendance-award")
    return {
      label: "出勤记录",
      action: "查看出勤记录",
      path: can("teacher.view") ? profile + "?tab=attendance" : undefined,
    };
  if (/^(praise|complaint|serious):/.test(row.key))
    return {
      label: "学员反馈",
      action: "查看反馈",
      path: can("feedback.view")
        ? "/feedback/" + encodeURIComponent(row.source)
        : undefined,
    };
  if (row.key.startsWith("action:"))
    return {
      label: "扣款记录",
      action: "查看扣款记录",
      path: can("feedback.view") ? "/feedback?tab=actions" : undefined,
    };
  return { label: row.key.startsWith("renewal") ? "续费订单" : "人工调整记录" };
}
function canReviewEntry(row: PayEntry) {
  return (
    row.category === "待核" &&
    !/^(op-unfinished|renewal-lesson|lesson-review|complaint-fee):/.test(
      row.key,
    ) &&
    !["mode", "office", "teacher-rate", "schedule"].includes(row.key)
  );
}

function PayrollReview({
  line,
  rows,
  teacherId,
  onClose,
  onRecord,
}: {
  line: LedgerLine;
  rows: PayEntry[];
  teacherId: string;
  onClose: () => void;
  onRecord: (key: string) => void;
}) {
  const { data, can } = useDemo();
  const { row, lesson } = line;
  // A missing rate can affect several lines. Resolve each through its actual configuration or historical-rate item.
  const issues = row?.pendingRates?.length
    ? row.pendingRates.map((side) =>
        side === "office"
          ? rows.find((r) => r.key === "office")
          : (rows.find((r) => r.key === "historical-rate:" + line.date) ??
            rows.find((r) => r.key === "teacher-rate")),
      )
    : [row ?? rows.find((r) => r.key === "mode")];
  const names = ledgerStudentNames(row, lesson, data);
  const pendingPeople =
    lesson &&
    (["老师", "学员"] as const).filter((person) =>
      personAttendance(lesson, person).includes("待核实"),
    );
  const attendanceHint =
    lesson &&
    (teacherNoShowHint(lesson)
      ? "开课满 10 分钟时老师仍未到堂，尚无老师的最终考勤记录。"
      : attendanceIssue(lesson) ||
        (pendingPeople?.length
          ? pendingPeople.join("和") + "的考勤尚未核定。"
          : undefined));
  return (
    <Modal open title="核实薪资明细" onClose={onClose}>
      <dl className="detail-pairs payroll-review-pairs">
        {line.date && (
          <>
            <dt>计薪日期</dt>
            <dd>{line.date}</dd>
          </>
        )}
        {lesson && (
          <>
            <dt>上课时间</dt>
            <dd>
              {lesson.date === line.date
                ? lesson.time
                : lesson.date + " " + lesson.time}
            </dd>
          </>
        )}
        {names && (
          <>
            <dt>学员</dt>
            <dd>{names}</dd>
          </>
        )}
        {lesson?.material && (
          <>
            <dt>教材</dt>
            <dd>{lesson.material}</dd>
          </>
        )}
        {issues.map((issue, index) => {
          const source = ledgerSource(issue, teacherId, can);
          const courseReview =
            lesson && issue?.key.startsWith("lesson-review:");
          const showLesson =
            lesson && can("lesson.view") && !row?.pendingRates?.length;
          const showRecord =
            issue && can("payroll.adjust") && canReviewEntry(issue);
          return (
            <Fragment key={issue?.key ?? index}>
              <dt>待核项目</dt>
              <dd>{issue?.title ?? line.note ?? "课时单价待核"}</dd>
              <dt>核实说明</dt>
              <dd>
                {issue
                  ? displayDetail(issue, data)
                  : "请核对该课程适用的计薪设置。"}
              </dd>
              {courseReview && (
                <>
                  {attendanceHint && (
                    <>
                      <dt>考勤说明</dt>
                      <dd>{attendanceHint}</dd>
                    </>
                  )}
                  <dt>课程状态</dt>
                  <dd>{lesson.status}</dd>
                  <dt>老师进堂 / 离堂</dt>
                  <dd>
                    {lesson.teacherIn || "暂无记录"} /{" "}
                    {lesson.teacherOut || "暂无记录"}
                  </dd>
                  <dt>学员进堂 / 离堂</dt>
                  <dd>
                    {lesson.studentIn || "暂无记录"} /{" "}
                    {lesson.studentOut || "暂无记录"}
                  </dd>
                </>
              )}
              {(source.path || showLesson || showRecord) && (
                <>
                  <dt>操作</dt>
                  <dd className="row wrap">
                    {source.path && (
                      <Link to={source.path}>{source.action}</Link>
                    )}
                    {showLesson && (
                      <Link
                        to={"/lessons?lesson=" + encodeURIComponent(lesson.id)}
                      >
                        查看上课记录
                      </Link>
                    )}
                    {showRecord && (
                      <Button size="sm" onClick={() => onRecord(issue.key)}>
                        记录处理结果
                      </Button>
                    )}
                  </dd>
                </>
              )}
            </Fragment>
          );
        })}
      </dl>
    </Modal>
  );
}

function statementSubtotal(rows: PayEntry[], side: "teacher" | "office") {
  const calculated = rows.filter((row) => !entryAmountPending(row, side));
  if (
    calculated.length < rows.length &&
    calculated.every((row) => row[side] === 0)
  ) {
    return rows.some(
      (row) => row.category !== "等待" && entryAmountPending(row, side),
    )
      ? "待核"
      : "等待结果";
  }
  return money(sum(calculated, side));
}

function useLedgerView() {
  const [detailState, setDetailState] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columns, setColumns] =
    useState<readonly LedgerColumn[]>(defaultLedgerColumns);
  const [requestedPage, setDetailPage] = useState(1);
  function filterDetails(value: string) {
    setDetailState(value);
    setDetailPage(1);
  }
  return {
    detailState, filterDetails, columnsOpen, setColumnsOpen,
    columns, setColumns, requestedPage, setDetailPage,
  };
}

function Statement({
  ledgerView,
  teacherId,
  statement,
  period,
  status,
}: {
  ledgerView: ReturnType<typeof useLedgerView>;
  teacherId: string;
  statement: ReturnType<typeof halfMonthStatement>;
  period: string;
  status: string;
}) {
  const { data, can } = useDemo();
  const run = useBusinessAction();
  const canAdjust = can("payroll.adjust");
  const canChangeStatus = can(
    status === "已确认" ? "payroll.mark_paid" : "payroll.confirm",
  );
  const [saving, setSaving] = useState(false);
  async function submit(command: HalfMonthCommand) {
    if (saving) return false;
    setSaving(true);
    try {
      return await run(command);
    } finally {
      setSaving(false);
    }
  }
  const [action, setAction] = useState<"adjust" | "serious" | null>(null);
  const [side, setSide] = useState<"teacher" | "office">("teacher");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [inspectKey, setInspectKey] = useState("");
  const [reviewItem, setReviewItem] = useState("");
  const [networkTeacher, setNetworkTeacher] = useState("");
  const [networkOffice, setNetworkOffice] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [seriousItem, setSeriousItem] = useState("");
  const { canConfirm } = payrollReadiness(statement.rows, period);
  const days = payDates(period);
  const firstDate = days[0];
  const lastDate = days[days.length - 1];
  const complaints = statement.rows.filter(
    (row) => row.key.startsWith("complaint:") && row.category !== "人工调整",
  );
  const {
    detailState, filterDetails, columnsOpen, setColumnsOpen,
    columns, setColumns, requestedPage, setDetailPage,
  } = ledgerView;
  const visibleColumns = ledgerColumns.filter((column) =>
    columns.includes(column),
  );
  const { ledger, hasCourses } = useMemo(() => {
    const teacher = data.teachers.find((t) => t.id === teacherId)!;
    const teacherLessons = data.lessons.filter(
      (lesson) => lesson.teacherId === teacherId,
    );
    const lessonById = new Map(
      teacherLessons.map((lesson) => [lesson.id, lesson]),
    );
    const linkedLessons = new Set<string>();
    const lessonsWithBaseOrReview = new Set<string>();
    const ledger: LedgerLine[] = statement.rows.map((row) => {
      const lessonId =
        row.lessonId ??
        (directLessonEntry.test(row.key) ? row.source : undefined);
      const lesson = lessonId ? lessonById.get(lessonId) : undefined;
      if (lessonId) {
        linkedLessons.add(lessonId);
        if (
          row.category === "底薪" ||
          ((row.category === "待核" || row.category === "等待") &&
            directLessonEntry.test(row.key))
        )
          lessonsWithBaseOrReview.add(lessonId);
      }
      const date = setupEntryKeys.has(row.key) ? "" : row.date.slice(0, 10);
      const slotTime = /^(op|op-unfinished):/.test(row.key)
        ? row.source.slice(0, 5)
        : "";
      return {
        key: row.key,
        date,
        time:
          row.date.slice(11, 16) ||
          (lesson?.date === date ? lesson.time : slotTime),
        state: ledgerState(row),
        row,
        lesson,
      };
    });
    const periodLessons = teacherLessons.filter(
      (lesson) => lesson.date >= firstDate && lesson.date <= lastDate,
    );
    for (const lesson of periodLessons) {
      const mode =
        data.lessonPayBasis?.[lesson.id]?.mode ??
        teacher.payModeHistory?.find((h) => lesson.date < h.until)?.mode ??
        statement.mode;
      const missingMode = status === "待确认" && !mode;
      const fixedBase = status === "待确认" && mode === "OP";
      if (
        linkedLessons.has(lesson.id) &&
        !fixedBase &&
        (!missingMode || lessonsWithBaseOrReview.has(lesson.id))
      )
        continue;
      let note = "本节无计薪项目";
      if (status !== "待确认") note = "工资单无单节计薪记录";
      else if (missingMode) note = "计薪方式待设置";
      else if (fixedBase) note = "底薪按固定时段单列";
      ledger.push({
        key: "course-info:" + lesson.id,
        date: lesson.date,
        time: lesson.time,
        lesson,
        note,
        state: missingMode ? "待核实" : "不单独计薪",
      });
    }
    ledger.sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    );
    return { ledger, hasCourses: periodLessons.length > 0 };
  }, [data, teacherId, firstDate, lastDate, statement, status]);
  const inspectedLine = ledger.find(
    (line) => line.key === inspectKey && line.state === "待核实",
  );
  const visibleLines = ledger.filter(
    (line) => !detailState || line.state === detailState,
  );
  const pending = ledger.filter((line) => line.state === "待核实").length;
  const waiting = ledger.filter((line) => line.state === "等待结果").length;
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(visibleLines.length / LIST_PAGE_SIZE)),
  );
  const visibleRows = visibleLines.slice(
    (page - 1) * LIST_PAGE_SIZE,
    page * LIST_PAGE_SIZE,
  );
  return (
    <div className="stack payroll-statement">
      <PageHeader
        title={statement.name + " · 工资单"}
        description={[
          periodLabel(period),
          statement.so,
          statement.mode ?? "计薪方式待设置",
          "PHP",
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="row payroll-statement-actions">
            <Badge tone={tone(status)}>{status}</Badge>
            {status === "待确认" && canAdjust && complaints.length > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setSeriousItem("");
                  setAction("serious");
                }}
              >
                登记严重违规
              </Button>
            )}
            {status === "待确认" && canAdjust && (
              <Button
                size="sm"
                onClick={() => {
                  setSide("teacher");
                  setAmount("");
                  setNote("");
                  setAction("adjust");
                }}
              >
                人工调整
              </Button>
            )}
            {status === "待确认" && canChangeStatus && (
              <Button
                size="sm"
                variant="primary"
                disabled={saving || !canConfirm}
                onClick={() =>
                  void submit({
                    type: "halfPay.status",
                    teacherId,
                    period,
                    status: "已确认",
                  })
                }
              >
                确认薪资
              </Button>
            )}
            {status === "已确认" && canChangeStatus && (
              <Button
                size="sm"
                variant="primary"
                disabled={saving}
                onClick={() =>
                  void submit({
                    type: "halfPay.status",
                    teacherId,
                    period,
                    status: "已发放",
                  })
                }
              >
                标记已发放
              </Button>
            )}
          </div>
        }
      />
      <Panel title="应结汇总">
        <div className="payroll-totals">
          {(["teacher", "office"] as const).map((target) => {
            const label =
              (target === "teacher" ? "老师" : "SO ") +
              (pending || waiting ? "已计算小计" : "应结");
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
      </Panel>
      <Panel title="薪资明细" className="payroll-ledger">
        <div className="record-list-tools" role="group" aria-label="薪资明细筛选">
          <Field label="明细状态">
            <Select
              aria-label="明细状态"
              value={detailState}
              onValueChange={filterDetails}
            >
              <option value="">全部明细状态</option>
              <option>已计算</option>
              <option>等待结果</option>
              <option>待核实</option>
              <option>不单独计薪</option>
            </Select>
          </Field>
          {pending > 0 && (
            <button
              className="text-link"
              aria-pressed={detailState === "待核实"}
              onClick={() => filterDetails("待核实")}
            >
              待核实 {pending} 项
            </button>
          )}
          {waiting > 0 && (
            <button
              className="text-link"
              aria-pressed={detailState === "等待结果"}
              onClick={() => filterDetails("等待结果")}
            >
              等待结果 {waiting} 项
            </button>
          )}
          <div className="row">
            <Button
              size="sm"
              aria-expanded={columnsOpen}
              onClick={() => setColumnsOpen(!columnsOpen)}
            >
              <SlidersHorizontal size={14} />
              显示列
            </Button>
          </div>
        </div>
        {columnsOpen && (
          <div
            className="inset row wrap payroll-column-options"
            role="group"
            aria-label="可选显示列"
          >
            {ledgerColumns.map((column) => (
              <label key={column} className="select-row">
                <input
                  type="checkbox"
                  checked={columns.includes(column)}
                  onChange={(e) =>
                    setColumns(
                      e.target.checked
                        ? [...columns, column]
                        : columns.filter((c) => c !== column),
                    )
                  }
                />
                {column}
              </label>
            ))}
          </div>
        )}
        {status !== "待确认" && (
          <p>课程资料来自当前上课记录，金额取自已确认工资单。</p>
        )}
        {!hasCourses && <p>本期没有可查看的上课记录。</p>}
        <div
          className="table-wrap payroll-ledger-scroll"
          role="region"
          aria-label="薪资明细滚动区"
          tabIndex={0}
        >
          <table aria-label="薪资明细">
            <thead>
              <tr>
                {visibleColumns.map((column) => (
                  <th key={column} className={ledgerColumnClass[column]}>
                    {column}
                  </th>
                ))}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ key, date, row, lesson, note, state }) => {
                const source = ledgerSource(row, teacherId, can);
                const lessonPath =
                  lesson && can("lesson.view")
                    ? "/lessons?lesson=" + encodeURIComponent(lesson.id)
                    : undefined;
                const studentName = ledgerStudentNames(row, lesson, data);
                let basis = row?.detail ?? note;
                if (
                  row?.key.startsWith("renewal:") &&
                  row.detail.startsWith("复购前最后一节完课 ")
                )
                  basis = "复购前最后一节完课";
                if (row?.key.startsWith("renewal-lesson:"))
                  basis = displayDetail(row, data);
                if (row && /^(op|op-unfinished):/.test(row.key))
                  basis = row.source + "，" + basis;
                const classTime =
                  lesson &&
                  (date === lesson.date
                    ? lesson.time
                    : lesson.date + " " + lesson.time);
                const cells: Record<LedgerColumn, ReactNode> = {
                  计薪日期: date || "—",
                  上课时间: classTime || "—",
                  学员: studentName || "—",
                  计薪项目: row
                    ? (ledgerTitles[row.title] ?? row.title)
                    : note === "计薪方式待设置"
                      ? note
                      : "课程计薪",
                  计薪数量:
                    row?.quantity !== undefined && row.quantityUnit
                      ? row.quantity + " " + row.quantityUnit
                      : "—",
                  老师金额: row ? entryAmount(row, "teacher") : "—",
                  "SO 金额": row ? entryAmount(row, "office") : "—",
                  明细状态: (
                    <Badge
                      tone={
                        state === "待核实"
                          ? "warning"
                          : state === "已计算"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {state}
                    </Badge>
                  ),
                  课型: lesson?.kind || "—",
                  课程时长: lesson ? lesson.duration + " 分钟" : "—",
                  课程状态: lesson?.status || "—",
                  老师单价:
                    row?.teacherUnitPrice !== undefined
                      ? money(row.teacherUnitPrice)
                      : "—",
                  "SO 单价":
                    row?.officeUnitPrice !== undefined
                      ? money(row.officeUnitPrice)
                      : "—",
                  计薪比例:
                    row?.payRatio !== undefined
                      ? roundPay(row.payRatio * 100) + "%"
                      : "—",
                  计算说明: basis || "—",
                  来源: source.label,
                };
                return (
                  <tr key={key}>
                    {visibleColumns.map((column) => (
                      <td key={column} className={ledgerColumnClass[column]}>
                        {cells[column]}
                      </td>
                    ))}
                    <td className="payroll-entry-actions">
                      {state === "待核实" ? (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => setInspectKey(key)}
                        >
                          核实
                        </button>
                      ) : (
                        <>
                          {row?.key.startsWith("complaint-fee:") &&
                            lesson &&
                            (lesson.date < firstDate ||
                              lesson.date > lastDate) && (
                              <Link
                                to={`/payroll/${lesson.date.slice(0, 7)}-${Number(lesson.date.slice(8)) <= 15 ? 1 : 2}/${encodeURIComponent(teacherId)}`}
                                state={{ listSearch: "?period=" + period }}
                              >
                                查看涉事周期工资单
                              </Link>
                            )}
                          {source.path && (
                            <Link to={source.path}>{source.action}</Link>
                          )}
                          {row?.key.startsWith("renewal-lesson:") &&
                          can("lesson.view")
                            ? row.dependsOn?.map((key) => {
                                const id = key.slice("lesson-review:".length);
                                return (
                                  <Link
                                    key={id}
                                    to={
                                      "/lessons?lesson=" +
                                      encodeURIComponent(id)
                                    }
                                  >
                                    {lessonLabel(data, id)}
                                  </Link>
                                );
                              })
                            : lessonPath && (
                                <Link to={lessonPath}>查看上课记录</Link>
                              )}
                          {!source.path &&
                            !lessonPath &&
                            !(
                              row?.key.startsWith("renewal-lesson:") &&
                              can("lesson.view") &&
                              row.dependsOn?.length
                            ) &&
                            "—"}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!visibleLines.length && (
                <tr>
                  <td colSpan={visibleColumns.length + 1}>
                    {detailState
                      ? "没有符合该状态的明细。"
                      : "本期没有薪资明细。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ListPagination
          total={visibleLines.length}
          page={page}
          onChange={setDetailPage}
        />
      </Panel>
      {inspectedLine && (
        <PayrollReview
          line={inspectedLine}
          rows={statement.rows}
          teacherId={teacherId}
          onClose={() => setInspectKey("")}
          onRecord={(key) => {
            setInspectKey("");
            setNetworkTeacher("");
            setNetworkOffice("");
            setReviewNote("");
            setReviewItem(key);
          }}
        />
      )}
      {status === "待确认" && canAdjust && action === "serious" && (
        <Modal open title="登记严重违规" onClose={() => setAction(null)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                seriousItem &&
                (await submit({
                  type: "halfPay.serious",
                  teacherId,
                  period,
                  feedbackId: seriousItem,
                }))
              )
                setAction(null);
            }}
          >
            <Field label="已核实差评">
              <Select value={seriousItem} onValueChange={setSeriousItem}>
                <option value="">请选择</option>
                {complaints.map((row) => (
                  <option key={row.key} value={row.source}>
                    {sourceLabel(row, data, statement.name)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="submit"
              disabled={saving || !seriousItem}
              variant="secondary"
            >
              转为严重违规待核
            </Button>
          </form>
        </Modal>
      )}
      {status === "待确认" && canAdjust && reviewItem && (
        <Modal open title="记录处理结果" onClose={() => setReviewItem("")}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await submit({
                  type: "halfPay.review",
                  teacherId,
                  period,
                  key: reviewItem,
                  note: reviewNote,
                  networkPay: reviewItem.startsWith("network-pay:")
                    ? {
                        teacher: Number(networkTeacher),
                        office: Number(networkOffice),
                      }
                    : undefined,
                  historicalRate: reviewItem.startsWith("historical-rate:")
                    ? Number(networkTeacher)
                    : undefined,
                })
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
            <Button type="submit" variant="primary" loading={saving}>
              保存处理结果
            </Button>
          </form>
        </Modal>
      )}
      {status === "待确认" && canAdjust && action === "adjust" && (
        <Modal open title="人工调整" onClose={() => setAction(null)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await submit({
                  type: "halfPay.adjust",
                  teacherId,
                  period,
                  side,
                  amount: Number(amount),
                  note,
                })
              ) {
                setAction(null);
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
            <Button type="submit" variant="primary" loading={saving}>
              添加调整
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
