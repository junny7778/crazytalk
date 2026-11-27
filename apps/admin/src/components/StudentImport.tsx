import {rosterHeaders} from "../lib/customerRoster";
import { useState } from "react";
import {
  studentProfileSchema,
  studentImportMatches,
  openingImportIssue,
  type StudentProfileInput,
} from "@crazytalk/shared";
import { useDemo } from "@crazytalk/shared/react";
import { Button, Field, Modal, Select, useToast } from "@crazytalk/ui";
import { downloadTable } from "../lib/export";
import {
  readStudentWorkbook,
} from "../lib/studentWorkbook";

export default function StudentImport({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, act } = useDemo();
  const toast = useToast();
  const [rows, setRows] = useState<StudentProfileInput[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"skip" | "update">("update");
  const [filename, setFilename] = useState("");
  const [page,setPage]=useState(0);
  const headers=rosterHeaders;
  const identities = new Set<string>();
  const errors: string[] = [];
  const openingBalances = new Map(data.orders?.flatMap(order => order.openingGroup ? [[order.openingGroup, order.balance] as const] : []));
  rows.forEach((row, index) => {
    if (!studentImportMatches(data.students, row).length) {
      const issue = openingImportIssue(row);
      if (issue) errors.push(issue);
      else if (row.openingGroup && row.openingBalance !== undefined) {
        const balance = openingBalances.get(row.openingGroup);
        if (balance !== undefined && balance !== row.openingBalance) errors.push(`第 ${row.roster?.row ?? index + 1} 行：共享课包「${row.openingGroup}」的剩余课时不一致`);
        openingBalances.set(row.openingGroup, row.openingBalance);
      }
    }
    const parsed = studentProfileSchema.safeParse(row);
    if (!parsed.success)
      errors.push(
        `第 ${index + 1} 条：${parsed.error.issues.map((issue) => issue.message).join("；")}`,
      );
    if (!row.chineseName.trim() && !studentImportMatches(data.students, row).length)
      errors.push(`第 ${index + 1} 条：请补全学生中文名。`);
    const identity = row.importStudentId || row.roster?.key || "";
    if (identity && identities.has(identity))
      errors.push(
        `第 ${index + 1} 条：文件内学员标识重复，请先核对。`,
      );
    if (identity) identities.add(identity);
    if (row.importStudentId && !data.students.some(s => s.id === row.importStudentId)) errors.push(`第 ${index+1} 条：学员 ID 不存在`);
    if (studentImportMatches(data.students, row).length > 1)
      errors.push(
        `第 ${index + 1} 条：匹配到多份档案，请先人工核对；不会自动覆盖。`,
      );
  });
  const existing = rows.filter(
    (row) => studentImportMatches(data.students, row).length === 1,
  ).length;
  function close() {
    setRows([]);
    setWarnings([]);
    setError("");
    setFilename("");
    setSkipped(0);
    onClose();
  }
  function edit(
    index: number,
    field: "importStudentId" | "name" | "phone",
    value: string,
  ) {
    setRows((list) =>
      list.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setLoading(true);
    setError("");
    setRows([]);
    setWarnings([]);
    setPage(0);setFilename(file.name);
    try {
      if (!file.name.toLowerCase().endsWith(".xlsx"))
        throw new Error("请上传 .xlsx 格式的学生课程信息表。");
      const result = await readStudentWorkbook(await file.arrayBuffer(), data);
      setRows(result.rows);
      setWarnings(result.warnings);
      setSkipped(result.skipped);
      if (!result.rows.length) setError("文件中没有可导入的学员记录。");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "文件读取失败，请检查文件格式。",
      );
    } finally {
      setLoading(false);
    }
  }
  async function submit() {
    try {
      const bytes = new TextEncoder().encode(JSON.stringify([mode,rows]));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const batchId = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
      const result = await act({ type: "student.import", students: rows, mode, batchId });
      toast(result.message);
      close();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "导入未完成，请检查后重试。",
      );
    }
  }
  return (
    <Modal
      open={open}
      onClose={close}
      width={1000}
      title="导入学员课程信息"
      description="上传学生信息表，核对后保存。"
      footer={
        <>
          <Button onClick={close}>取消</Button>
          <Button
            variant="primary"
            disabled={loading || !rows.length || errors.length > 0}
            onClick={submit}
          >
            确认导入 {rows.length > 0 ? `${rows.length} 条` : ""}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div
          className="row"
          style={{ justifyContent: "space-between", flexWrap: "wrap" }}
        >
          <Field label="选择学员表">
            <label className="admin-file-picker">
              <span>{loading ? "正在读取…" : "选择文件"}</span>
              <input
                aria-label="选择学员表"
                type="file"
                accept=".xlsx"
                disabled={loading}
                onChange={(event) => {
                  void upload(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </Field>
          <Button
            onClick={() => {
              void downloadTable(
                "学生课程信息导入模板",
                ["学员ID", "学生中文名", "学生英文名", ...rosterHeaders],
                [],
              ).catch(() => setError("模板下载失败，请重试。"));
            }}
          >
            下载模板
          </Button>
        </div>
        <p className="muted">
          请使用学生信息表模板。新增历史学员须填写订单状态和剩余课时，余额为零请填 0。剩余课时包含已排未扣的课时。共用同一课包的学员填写相同的共享课包编号及余额。更新已有学员会保留系统余额。
        </p>
        {loading && <p role="status">正在读取文件…</p>}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {rows.length > 0 && (
          <>
            <p>
              {filename} · 识别 {rows.length} 位学员
              {skipped > 0 ? `，跳过 ${skipped} 行仅有序号的空记录` : ""}
              。可直接修正学员 ID、名字和手机号，展开查看完整原表信息。
            </p>
            <details>
              <summary>查看 {headers.length} 列字段对应关系</summary>
              <p className="muted">
                按表头名称匹配，原表的两行合并表头会自动展开。
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                  gap: 8,
                }}
              >
                {headers.map((header) => (
                  <span key={header}>
                    {header} → {header}
                  </span>
                ))}
              </div>
            </details>
            <Field label={`遇到已有学员（当前 ${existing} 位）`}>
              <Select
                value={mode}
                onValueChange={(value) =>
                  setMode(value === "update" ? "update" : "skip")
                }
              >
                <option value="skip">跳过匹配的已有学生，保留现有资料</option>
                <option value="update">
                  更新匹配的原表资料，保留课时余额与业务记录
                </option>
              </Select>
            </Field>
            <p className="muted">
              新版学生表按原表学员标识和拉群日期匹配；导出后可按学员 ID 更新。新记录分配独立 ID，同一批次重复提交只登记一次。更改订单状态请通过档案内服务操作处理。
            </p>
            {warnings.length > 0 && (
              <details>
                <summary>原表提示（{warnings.length} 条）</summary>
                <ul>
                  {warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
            {errors.length > 0 && (
              <div role="alert">
                <strong>请先修正以下内容</strong>
                <ul>
                  {errors.map((message, i) => (
                    <li key={i}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            {rows.length>50 && <div className="row"><Button size="sm" disabled={page===0} onClick={()=>setPage(page-1)}>上一页</Button><span>{page+1} / {Math.ceil(rows.length/50)}</span><Button size="sm" disabled={(page+1)*50>=rows.length} onClick={()=>setPage(page+1)}>下一页</Button></div>}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>原序号</th>
                    <th>学员 ID（新增留空）</th>
                    <th>学员姓名</th>
                    <th>手机号</th>
                    <th>剩余课时</th>
                    <th>匹配结果</th>
                    <th>原表信息</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(page*50,page*50+50).map((row, offset) => {const index=page*50+offset;return (
                    <tr key={index}>
                      <td>{row.sourceSequence || index + 1}</td>
                      <td>
                        <input
                          aria-label={`第${index + 1}条学员ID`}
                          value={row.importStudentId || ""}
                          onChange={(event) =>
                            edit(index, "importStudentId", event.target.value)
                          }
                          style={{ width: 130 }}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`第${index + 1}条学员姓名`}
                          value={row.name}
                          onChange={(event) =>
                            edit(index, "name", event.target.value)
                          }
                          style={{ width: 130 }}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`第${index + 1}条手机号`}
                          value={row.phone}
                          placeholder="未填写"
                          onChange={(event) =>
                            edit(index, "phone", event.target.value)
                          }
                          style={{ width: 140 }}
                        />
                      </td>
                      <td>{studentImportMatches(data.students, row).length === 1 ? "保留系统余额" : Number.isFinite(row.openingBalance) ? row.openingBalance : "未填写"}</td>
                      <td>
                        {studentImportMatches(data.students, row).length === 1
                          ? "匹配已有档案"
                          : data.students.some(
                                (student) =>
                                  student.name.trim() === row.name.trim(),
                              )
                            ? "同名需核对，将新增"
                            : "新增档案"}
                      </td>
                      <td>
                        <details>
                          <summary>完整 {headers.length} 列</summary>
                          <dl>
                            {rosterHeaders.map(h=>row.roster?.fields[h] || "").map(
                              (value, column) => (
                                <div key={column} style={{ marginBottom: 8 }}>
                                  <dt className="muted">
                                    {headers[column]}
                                  </dt>
                                  <dd
                                    style={{
                                      margin: 0,
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {value === "" ? "未填写" : value}
                                  </dd>
                                </div>
                              ),
                            )}
                          </dl>
                        </details>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
