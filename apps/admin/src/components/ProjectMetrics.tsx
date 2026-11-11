import { useState } from "react";
import { projectMetrics, DEMO_TODAY } from "@crazytalk/shared";
import { useDemo } from "@crazytalk/shared/react";
import { Select, StatCard, EmptyState, Button, Field, Panel } from "@crazytalk/ui";
import { downloadTable } from "../lib/export";
export default function ProjectMetrics() {
  const { data, can } = useDemo(),
    [month, setMonth] = useState(DEMO_TODAY.slice(0, 7));
  const [filter, setFilter] = useState({
    channel: "",
    project: "",
    team: "",
    group: "",
    owner: "",
  });
  const students = data.students.map((s) => {
    const owner = data.accounts.find((a) => a.name === s.owner);
    return { ...s, team: owner?.team || "", group: owner?.group || "" };
  });
  const matches = students.filter((s) =>
    (Object.keys(filter) as (keyof typeof filter)[]).every(
      (k) => !filter[k] || s[k] === filter[k],
    ),
  );
  const rows = matches.map((s) => projectMetrics(data, s, month));
  const total = rows.reduce(
    (a, r) => ({
      used: a.used + r.used,
      target: a.target + (r.target ?? 0),
      expected: a.expected + r.expected,
      present: a.present + r.present,
    }),
    { used: 0, target: 0, expected: 0, present: 0 },
  );
  const percent = (n: number, d: number) =>
    d ? ((100 * n) / d).toFixed(1) + "%" : "—";
  const headers = [
    "学员 ID",
    "姓名",
    "月应上课时",
    "实消课时",
    "应出勤节数",
    "实出勤节数",
  ];
  return (
    <Panel title="项目消课率与出勤率">
      <div className="row wrap">
        <Field label="统计月">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </Field>
        {(
          Object.entries({
            channel: "渠道",
            project: "项目",
            team: "队别",
            group: "组别",
            owner: "教务",
          }) as [keyof typeof filter, string][]
        ).map(([k, label]) => (
          <Field key={k} label={label}>
            <Select
              value={filter[k]}
              onValueChange={(value) =>
                setFilter({
                  ...filter,
                  [k]: value,
                  ...(k === "team" ? { group: "" } : {}),
                  ...(k === "channel" ? { project: "" } : {}),
                })
              }
            >
              <option value="">全部</option>
              {[
                ...new Set(
                  students
                    .filter(
                      (s) =>
                        (k !== "group" ||
                          !filter.team ||
                          s.team === filter.team) &&
                        (k !== "project" ||
                          !filter.channel ||
                          s.channel === filter.channel),
                    )
                    .map((s) => s[k])
                    .filter(Boolean),
                ),
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
      <div className="metric-rate-cards">
        <StatCard label="消课率" value={rows.some(r=>r.target===null) ? "待补录" : percent(total.used,total.target)} note={`实消 ${total.used} / 已知应上 ${total.target} 课时`}/>
        <StatCard label="出勤率" value={percent(total.present,total.expected)} note={`到课 ${total.present} / 已结束应出勤 ${total.expected} 节`}/>
      </div>
      <p>
        月目标优先取学员当月已核数，其次取项目每人月目标。缺席扣课计入实消；已取消课不计应出勤。停课及月中入学的目标可用已核数修正。
      </p>
      {can("dashboard.export") && (
        <Button
          onClick={() =>
            void downloadTable(
              "项目月度指标",
              headers,
              rows.map((r) => [
                r.id,
                r.name,
                r.target ?? "待核",
                r.used,
                r.expected,
                r.present,
              ]),
            )
          }
        >
          导出当前明细
        </Button>
      )}
      {!rows.length ? <EmptyState title="当前范围没有学员" description="可调整项目、队伍或教务筛选。"/> : <div className="table-wrap"><table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
            <th>课节明细</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.name}</td>
              <td>{r.target ?? "待核"}</td>
              <td>{r.used}</td>
              <td>{r.expected}</td>
              <td>{r.present}</td>
              <td>
                <details>
                  <summary>{r.lessons.length} 节</summary>
                  {r.lessons.map((l) => (
                    <p key={l.id}>
                      {l.date} {l.time} · {l.status} · {l.attendance} · 扣{" "}
                      {l.deducted ? l.confirmedUnits : 0} 课时
                    </p>
                  ))}
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>}
    </Panel>
  );
}
