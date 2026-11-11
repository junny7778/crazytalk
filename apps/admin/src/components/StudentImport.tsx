import { useState } from "react";
import {
  emptyStudentProfile,
  studentProfileSchema,
  studentImportMatches,
  type StudentProfileInput,
} from "@crazytalk/shared";
import { useDemo } from "@crazytalk/shared/react";
import { Button, Field, Modal, Select, useToast } from "@crazytalk/ui";
import { downloadTable } from "../lib/export";
import {
  readStudentWorkbook,
  studentWorkbookHeaders,
  studentWorkbookRow,
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
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [filename, setFilename] = useState("");
  const identities = new Set<string>();
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const parsed = studentProfileSchema.safeParse(row);
    if (!parsed.success)
      errors.push(
        `第 ${index + 1} 条：${parsed.error.issues.map((issue) => issue.message).join("；")}`,
      );
    if (!row.name.trim()) errors.push(`第 ${index + 1} 条：请补全学生名字。`);
    const identity = row.importStudentId !== undefined ? row.importStudentId : row.groupName.trim()
      ? `${row.groupName.trim()}\u0000${row.name.trim()}`
      : "";
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
    setFilename(file.name);
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
      const bytes = new TextEncoder().encode(JSON.stringify(rows));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const batchId = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
      const result = act({ type: "student.import", students: rows, mode, batchId });
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
      description="支持原始学生课程信息表和模板，先核对完整信息，再确认保存。"
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
            <input
              type="file"
              accept=".xlsx"
              disabled={loading}
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </Field>
          <Button
            onClick={() => {
              void downloadTable(
                "学生课程信息导入模板",
                studentWorkbookHeaders,
                [studentWorkbookRow(emptyStudentProfile())],
              ).catch(() => setError("模板下载失败，请重试。"));
            }}
          >
            下载模板
          </Button>
        </div>
        <p className="muted">
          原表 27
          列将完整保留。手机号、年龄和课时可留空，不会自动补值；总课时不等于剩余课时。
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
              <summary>查看 27 列字段对应关系</summary>
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
                {studentWorkbookHeaders.map((header) => (
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
              更新已有档案需填写学员 ID。留空将分配新 ID；同一批次重复提交只登记一次。更改订单状态请通过档案内服务操作处理。
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
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>原序号</th>
                    <th>学员 ID（新增留空）</th>
                    <th>学员姓名</th>
                    <th>手机号</th>
                    <th>匹配结果</th>
                    <th>原表信息</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
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
                          <summary>完整 27 列</summary>
                          <dl>
                            {studentWorkbookRow(row, data).map(
                              (value, column) => (
                                <div key={column} style={{ marginBottom: 8 }}>
                                  <dt className="muted">
                                    {studentWorkbookHeaders[column]}
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
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
