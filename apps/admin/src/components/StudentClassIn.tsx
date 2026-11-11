import { useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import { Button, Field, Panel } from "@crazytalk/ui";
import type { Student } from "@crazytalk/shared";

export default function StudentClassIn({ student }: { student: Student }) {
  const { data, act, can } = useDemo();
  const linked = data.classInAccounts?.find((a) =>
    a.studentIds.includes(student.id),
  );
  const [phone, setPhone] = useState(linked?.phone || student.phone);
  const [uid, setUid] = useState(linked?.uid || "");
  const [message, setMessage] = useState("");
  return (
    <Panel title="ClassIn 账号">
      <p>
        {linked
          ? linked.uid
            ? "已关联 UID"
            : "已登记手机号，待核实 UID"
          : "待绑定"}{" "}
        · 学员 {student.id}
      </p>
      {linked && (
        <p>
          关联学员：
          {data.students
            .filter((s) => linked.studentIds.includes(s.id))
            .map((s) => s.name + "（" + s.id + "）")
            .join("、")}
        </p>
      )}
      {can("classin_account.link") && (
        <div className="stack">
          <Field label="ClassIn 注册手机号">
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setUid("");
              }}
            />
          </Field>
          <Button
            onClick={async () => {
              try {
                const response = await fetch("/api/classin-account", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ phone }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                setUid(result.uid);
                setMessage("已按手机号匹配 UID，请核对并保存关联");
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "查询失败");
              }
            }}
          >
            按手机号查询 UID
          </Button>
          <Field label="已核实的 UID">
            <input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="暂未取得可留空"
            />
          </Field>
          <Button
            onClick={() => {
              try {
                act({
                  type: "student.bindClassIn",
                  id: student.id,
                  phone,
                  uid,
                });
                setMessage("账号信息已保存");
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "保存失败");
              }
            }}
          >
            保存账号关联
          </Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </Panel>
  );
}
