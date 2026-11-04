import { formatStudentProgress } from "@crazytalk/shared";
import DataTransferButton from "../components/DataTransferButton";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useDemo } from "@crazytalk/shared/react";
import {
  type Student,
  DEMO_TODAY,
  getStudentSummary,
  addDays,
} from "@crazytalk/shared";
import {
  Select,
  Badge,
  Button,
  Panel,
  PageHeader,
  SearchInput,
  EmptyState,
  useToast,
} from "@crazytalk/ui";
import {
  Plus,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import StudentImport from "../components/StudentImport";
import {
  StudentQuickView,
  StudentActionModal,
  NewStudentModal,
} from "../components/StudentActions";
import {
  studentWorkbookHeaders,
  studentWorkbookRow,
} from "../lib/studentWorkbook";
import { studentFieldGroups, studentFieldValue } from "../lib/studentFields";
import { attendanceSummary } from "../lib/dashboard";
import { downloadTable } from "../lib/export";

const defaultColumns = [
  "name",
  "groupName",
  "channel",
  "orderStatus",
  "teacherName",
  "material",
  "scheduleText",
  "totalUnits",
  "purchaseDate",
];
const studentColumnOrder = [
  "sourceSequence",
  "name",
  "groupName",
  "phone",
  "channel",
  "orderStatus",
  "purchaseDate",
  "totalUnits",
  "teacherName",
  "material",
  "scheduleText",
  "frequencyText",
  "originalPlanned",
  "originalActual",
  "firstLessonDate",
  "age",
  "gender",
  "personality",
  "foreignTeacherExperience",
  "preferences",
  "legacyComplaints",
  "legacyCompensations",
  "legacyMissed",
  "originalTeacher",
  "firstChangedTeacher",
  "secondChangedTeacher",
  "renewalStatus",
];
const orderStatuses = ["正常", "停课", "结课", "退款"];
export default function Students() {
  const { data, can } = useDemo();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const view = params.get("view") || "all";
  useEffect(() => {
    if (!orderStatuses.includes(view)) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (!next.has("orderStatus")) next.set("orderStatus", view);
        next.delete("view");
        return next;
      },
      { replace: true },
    );
  }, [view, setParams]);
  const requestedPage = Math.max(1, Number(params.get("page")) || 1);
  const [quick, setQuick] = useState<string | null>(null);
  const [newOpen, setNew] = useState(false);
  const [importOpen, setImport] = useState(false);
  const [sort, setSort] = useState<SortingState>([]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [columnVisibility, setColumnVisibility] = useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries([
      ...studentFieldGroups.flatMap((group) =>
        group.fields.map((field) => [
          field.key,
          defaultColumns.includes(field.key),
        ]),
      ),
      ["balance", false],
      ["owner", false],
      ["unit", false],
    ]),
  );
  const [creditStudentId, setCreditStudentId] = useState<string | null>(null);
  const update = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });
  const summaries = useMemo(
    () =>
      new Map(
        data.students.map((student) => [
          student.id,
          getStudentSummary(data, student.id),
        ]),
      ),
    [data],
  );
  const teacherFor = (s: Student) => summaries.get(s.id)?.teacher.name || "";
  function currentFieldValue(
    s: Student,
    key: Parameters<typeof studentFieldValue>[1],
  ) {
    const summary = summaries.get(s.id);
    if (!summary) return studentFieldValue(s, key);
    switch (key) {
      case "teacherName":
        return summary.teacher.name;
      case "material":
        return summary.progress.material;
      case "scheduleText":
        return summary.scheduleText;
      case "totalUnits":
        return summary.totalUnits;
      case "renewalStatus":
        return summary.renewalStatus;
      case "purchaseDate":
        return summary.purchaseDate;
      case "firstLessonDate":
        return summary.firstLessonDate;
      case "frequencyText":
        return summary.frequencyText;
      default:
        return studentFieldValue(s, key);
    }
  }
  const consecutiveIds = attendanceSummary(
    data.lessons.filter(
      (l) =>
        l.date >= (params.get("from") || "") &&
        l.date <= (params.get("to") || DEMO_TODAY),
    ),
  ).consecutive;
  const matchesView = (s: Student) => {
    if (view === "all") return true;
    if (["正常", "停课", "结课", "退款"].includes(view))
      return s.orderStatus === view;
    if (view === "low")
      return (
        s.orderStatus === "正常" &&
        s.balanceKnown &&
        s.balance > 0 &&
        s.balance <= data.rules.lowBalance
      );
    if (view === "consecutive") return consecutiveIds.includes(s.id);
    if (view === "pending")
      return (
        !data.lessons.some(
          (l) => l.studentId === s.id && l.status === "未开始",
        ) && !["停课", "结课", "退款"].includes(s.orderStatus)
      );
    if (view === "debt") return s.balanceKnown && s.balance < 0;
    if (view === "paused") return s.orderStatus === "停课";
    if (view === "inactive")
      return (
        !!s.lastLesson &&
        s.lastLesson < addDays(DEMO_TODAY, -14) &&
        s.status === "在读"
      );
    return true;
  };
  const filtered = useMemo(
    () =>
      data.students.filter(
        (s) =>
          matchesView(s) &&
          (!q ||
            `${s.name} ${s.groupName} ${s.phone} ${s.code}`
              .toLowerCase()
              .includes(q.toLowerCase())) &&
          (!params.get("project") || s.project === params.get("project")) &&
          (["channel", "owner", "orderStatus", "renewalStatus"] as const).every(
            (key) =>
              !params.get(key) ||
              (key === "renewalStatus"
                ? summaries.get(s.id)?.renewalStatus
                : s[key]) === params.get(key),
          ) &&
          (!params.get("teacher") || teacherFor(s) === params.get("teacher")),
      ),
    [data, params.toString()],
  );
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(filtered.length / 10)),
  );
  useEffect(() => {
    const key = params.get("openCredit");
    if (!key) return;
    const s = data.students.find(
      (s) => s.id === (data.studentIdAliases?.[key] ?? key) || s.code === key,
    );
    if (s) setCreditStudentId(s.id);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("openCredit");
        return next;
      },
      { replace: true },
    );
  }, [params, data.students, setParams]);
  const columns = useMemo<ColumnDef<Student>[]>(() => {
    const fields = studentFieldGroups.flatMap((group) => group.fields);
    const orderedFields = studentColumnOrder.flatMap((key) =>
      fields.filter((field) => field.key === key),
    );
    return [
      {
        id: "select",
        enableSorting: false,
        header: ({ table }) => {
          const visible = table
            .getRowModel()
            .rows.slice((page - 1) * 10, page * 10);
          return (
            <input
              aria-label="选择本页学员"
              type="checkbox"
              checked={
                visible.length > 0 &&
                visible.every((r) => selected[r.original.id])
              }
              onChange={(e) =>
                setSelected((old) => ({
                  ...old,
                  ...Object.fromEntries(
                    visible.map((r) => [r.original.id, e.target.checked]),
                  ),
                }))
              }
            />
          );
        },
        cell: ({ row }) => (
          <input
            aria-label={`选择 ${row.original.name}`}
            type="checkbox"
            checked={!!selected[row.original.id]}
            onChange={(e) =>
              setSelected((old) => ({
                ...old,
                [row.original.id]: e.target.checked,
              }))
            }
          />
        ),
      },
      ...orderedFields.map(
        (field): ColumnDef<Student> => ({
          id: field.key,
          header: field.label,
          enableSorting: [
            "orderStatus",
            "teacherName",
            "totalUnits",
            "renewalStatus",
          ].includes(field.key),
          accessorFn: (s) => currentFieldValue(s, field.key),
          cell: ({ row, getValue }) => {
            const value = getValue<string | number | null>();
            if (field.key === "name")
              return (
                <Link
                  className="student-name"
                  to={`/students/${row.original.id}`}
                >
                  <strong>{row.original.name}</strong>
                </Link>
              );
            if (field.key === "orderStatus" && value)
              return (
                <Badge
                  tone={
                    value === "正常"
                      ? "success"
                      : value === "退款"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {String(value)}
                </Badge>
              );
            if (field.key === "totalUnits" && value === null)
              return <span className="muted">待核实</span>;
            if (field.key === "scheduleText" && !value)
              return <span className="muted">暂未安排</span>;
            return value === null || value === "" ? (
              <span className="muted">未填写</span>
            ) : (
              String(value)
            );
          },
        }),
      ),
      {
        id: "balance",
        header: "剩余课时",
        accessorFn: (s) => (s.balanceKnown ? s.balance : undefined),
        cell: ({ row }) =>
          row.original.balanceKnown ? `${row.original.balance} 课时` : "未核实",
      },
      { accessorKey: "owner", header: "负责教务" },
      {
        id: "unit",
        header: "当前教材页码",
        accessorFn: (student) =>
          formatStudentProgress(summaries.get(student.id)?.progress.unit || ""),
      },
      {
        id: "actions",
        header: "操作",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="row">
            <Link className="student-name" to={`/students/${row.original.id}`}>
              查看
            </Link>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setQuick(row.original.id)}
            >
              速览
            </Button>
          </div>
        ),
      },
    ];
  }, [data, selected, page]);
  const table = useReactTable({
    defaultColumn: { enableSorting: false },
    data: filtered,
    columns,
    manualPagination: true,
    state: { sorting: sort, columnVisibility },
    onSortingChange: setSort,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const rows = table.getRowModel().rows;
  const pageRows = rows.slice((page - 1) * 10, page * 10);
  const selectedStudents = data.students.filter((s) => selected[s.id]);
  const exportStudents = async (students: Student[]) => {
    if (exporting || !students.length) return;
    setExporting(true);
    try {
      await downloadTable(
        "学生课程信息表",
        studentWorkbookHeaders,
        students.map((s) => studentWorkbookRow(s, data)),
        [
          {
            name: "月度上课明细",
            headers: [
              "学生名字",
              "学生群名",
              "月份",
              "月应上课",
              "实际上课",
              "说明",
            ],
            rows: students.flatMap((s) =>
              s.monthlyRecords.map((r) => [
                s.name,
                s.groupName,
                r.month,
                r.planned ?? "",
                r.actual ?? "",
                r.note,
              ]),
            ),
          },
          {
            name: "当前课程与服务统计",
            headers: [
              "学员ID",
              "学生名字",
              "当前老师",
              "教材",
              "当前进度",
              "固定安排",
              "历史统计起算",
              "历史总课时",
              "已登记购课",
              "合计购课",
              "投诉累计",
              "投诉已有明细",
              "补偿累计",
              "补偿已有明细",
              "被缺席累计",
              "被缺席已有明细",
              "统计月份",
              "月已排课",
              "月实际上课",
            ],
            rows: students.map((student) => {
              const item = getStudentSummary(data, student.id);
              return [
                student.id,
                student.name,
                item.teacher.name,
                item.progress.material,
                formatStudentProgress(item.progress.unit),
                item.scheduleText,
                student.historyStartDate || "未确认",
                item.historicalTotalUnits ?? "未提供",
                item.systemPurchaseUnits,
                item.totalUnits ?? "待核实",
                item.complaints.total ?? "待核实",
                item.complaints.system,
                item.compensations.total ?? "待核实",
                item.compensations.system,
                item.teacherAbsences.total ?? "待核实",
                item.teacherAbsences.system,
                item.monthly.month,
                item.monthly.planned,
                item.monthly.actual,
              ];
            }),
          },
        ],
      );
      toast(`已导出 ${students.length} 位学员的资料`);
    } catch {
      toast("导出未完成，请重试", { tone: "error" });
    } finally {
      setExporting(false);
    }
  };
  const creditStudent = data.students.find((s) => s.id === creditStudentId);
  return (
    <>
      <PageHeader
        title="学员中心"
        description="集中查看学生课程信息，进入档案处理教学安排与服务跟进。"
        action={
          <>
            {can("student.import") && (
              <DataTransferButton
                direction="import"
                onClick={() => setImport(true)}
              />
            )}
            {can("student.export") && (
              <DataTransferButton
                direction="export"
                onClick={() => void exportStudents(filtered)}
                loading={exporting}
                disabled={!filtered.length}
                title="导出当前筛选结果的完整资料"
              />
            )}
            {can("student.create") && (
              <Button variant="primary" onClick={() => setNew(true)}>
                <Plus size={16} />
                新建学员
              </Button>
            )}
          </>
        }
      />
      <Panel className="students-list-panel">
        <div className="toolbar">
          <SearchInput
            value={q}
            onChange={(v) => update("q", v)}
            placeholder="搜索学生名字、学生群名或手机号"
          />
          {(
            [
              ["channel", "渠道"],
              ["teacher", "上课老师"],
              ["orderStatus", "订单状态"],
              ["renewalStatus", "是否续课"],
            ] as const
          ).map(([key, label]) => (
            <Select
              key={key}
              aria-label={`${label}筛选`}
              value={params.get(key) || ""}
              onValueChange={(v) => update(key, v)}
            >
              <option value="">全部{label}</option>
              {[
                ...new Set(
                  data.students
                    .map((s) =>
                      key === "teacher"
                        ? teacherFor(s)
                        : key === "renewalStatus"
                          ? summaries.get(s.id)?.renewalStatus || ""
                          : s[key],
                    )
                    .filter(Boolean),
                ),
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          ))}
          <div className="toolbar-spacer" />
          <span className="muted">共 {filtered.length} 位学员</span>
          <Button size="sm" onClick={() => setColumnsOpen(!columnsOpen)}>
            <SlidersHorizontal size={14} />
            显示列
          </Button>
        </div>
        {view !== "all" && !orderStatuses.includes(view) && (
          <p className="student-detail-note">
            正在查看看板筛选结果。
            <Button size="xs" variant="ghost" onClick={() => setParams({})}>
              清除筛选
            </Button>
          </p>
        )}
        {columnsOpen && (
          <div className="inset row wrap" style={{ marginBottom: 16 }}>
            {table
              .getAllLeafColumns()
              .filter((c) => !["select", "actions"].includes(c.id))
              .map((c) => (
                <label className="select-row" key={c.id}>
                  <input
                    type="checkbox"
                    checked={c.getIsVisible()}
                    onChange={c.getToggleVisibilityHandler()}
                  />
                  {String(c.columnDef.header)}
                </label>
              ))}
          </div>
        )}
        {rows.length ? (
          <div className="table-wrap">
            <table className="students-table">
              <thead>
                {table.getHeaderGroups().map((h) => (
                  <tr key={h.id}>
                    {h.headers.map((c) => (
                      <th key={c.id}>
                        {c.column.getCanSort() ? (
                          <button
                            className="table-sort"
                            onClick={c.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              c.column.columnDef.header,
                              c.getContext(),
                            )}
                            <ArrowUpDown size={12} />
                          </button>
                        ) : (
                          flexRender(c.column.columnDef.header, c.getContext())
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id}>
                    {r.getVisibleCells().map((c) => (
                      <td key={c.id}>
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="没有符合条件的学员"
            description="试试其他关键词，或清除当前筛选。"
            action={<Button onClick={() => setParams({})}>清除筛选</Button>}
          />
        )}
        <div className="pagination">
          <span>共 {filtered.length} 条 · 每页 10 条</span>
          <button
            aria-label="上一页"
            disabled={page <= 1}
            onClick={() => update("page", String(page - 1))}
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from(
            { length: Math.max(1, Math.ceil(rows.length / 10)) },
            (_, i) => (
              <button
                key={i}
                className={page === i + 1 ? "active" : ""}
                onClick={() => update("page", String(i + 1))}
              >
                {i + 1}
              </button>
            ),
          )}
          <button
            aria-label="下一页"
            disabled={page >= Math.ceil(rows.length / 10)}
            onClick={() => update("page", String(page + 1))}
          >
            <ChevronRight size={14} />
          </button>
        </div>
        {selectedStudents.length > 0 && (
          <div
            className="batch-bar students-batch-bar"
            role="region"
            aria-label="学员批量操作"
          >
            <span>已选 {selectedStudents.length} 位学员</span>
            <div className="row">
              <Button size="sm" onClick={() => setSelected({})}>
                取消选择
              </Button>
              {can("student.export") && (
                <DataTransferButton
                  direction="export"
                  size="sm"
                  loading={exporting}
                  onClick={() => void exportStudents(selectedStudents)}
                >
                  导出选中学员
                </DataTransferButton>
              )}
            </div>
          </div>
        )}
      </Panel>
      <StudentQuickView id={quick} onClose={() => setQuick(null)} />
      <NewStudentModal open={newOpen} onClose={() => setNew(false)} />
      {creditStudent && (
        <StudentActionModal
          student={creditStudent}
          action="credit"
          onClose={() => setCreditStudentId(null)}
        />
      )}
      <StudentImport open={importOpen} onClose={() => setImport(false)} />
    </>
  );
}
export { default as StudentDetail } from "./StudentDetail";
