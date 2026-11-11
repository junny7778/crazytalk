import {recommendedTags} from "@crazytalk/shared";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import { Select, Button, Field, Panel } from "@crazytalk/ui";
import type { Student } from "@crazytalk/shared";

export function SurveyLink({ student }: { student: Student }) {
  const { act, can } = useDemo(),
    [error, setError] = useState("");
  useEffect(() => {
    if (
      !student.surveyToken ||
      !student.surveySecret ||
      student.surveySubmittedAt ||
      !can("student.edit")
    )
      return;
    let active = true;
    async function sync() {
      try {
        const response = await fetch("/api/intake/" + student.surveyToken, {
          headers: { Authorization: "Bearer " + student.surveySecret },
        });
        if (!active) return;
        if (response.status === 404) {
          setError("链接已失效，请重新生成问卷链接");
          return;
        }
        if (!response.ok) return;
        const result = await response.json();
        if (active && result.answers)
          act({
            type: "survey.submit",
            token: student.surveyToken!,
            answers: result.answers,
          });
      } catch (e) {
        if (active) setError(String(e));
      }
    }
    void sync();
    const timer = setInterval(sync, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [student.surveyToken, student.surveySecret, student.surveySubmittedAt]);
  async function issue() {
    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("问卷服务暂不可用");
      const next = await response.json();
      if (student.surveyToken && student.surveySecret)
        await fetch("/api/intake/" + student.surveyToken, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + student.surveySecret },
        });
      act({ type: "survey.issue", id: student.id, ...next });
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  if (!can("student.edit")) return null;
  return (
    <Panel title="学员问卷与画像">
      <p>
        {student.surveySubmittedAt
          ? "已提交 · " + new Date(student.surveySubmittedAt).toLocaleString()
          : "待填写"}{" "}
        · {student.id}
      </p>
      {student.surveyToken && (
        <p>
          <a
            href={"/intake/" + student.surveyToken}
            target="_blank"
            rel="noreferrer"
          >
            打开专属问卷
          </a>
        </p>
      )}
      <Button onClick={issue}>
        {student.surveyToken ? "重新生成链接" : "生成专属链接"}
      </Button>
      {student.surveySubmittedAt && (
        <p>
          {[
            student.age + " 岁",
            student.level,
            student.personality,
            student.interests,
            student.preferences,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {student.surveyOriginal && <details><summary>查看问卷原答及匹配依据</summary>
        <p>意向时段：{student.surveyOriginal.times || "未填写"} · 教材：{student.surveyOriginal.material || "未填写"}</p>
        <p>教学需求：{student.surveyOriginal.needs || "未填写"} · 兴趣：{student.surveyOriginal.interests || "未填写"}</p>
        <p>推荐老师标签：{recommendedTags(student).join("、") || "待教务评估"}</p>
      </details>}
      <small>在可访问同一开发服务的设备上填写。重新生成会替换旧链接。</small>
      {error && <p role="alert">{error}</p>}
    </Panel>
  );
}

export default function StudentSurvey() {
  const { token } = useParams();
  const [level,setLevel]=useState("L0");
  const [personality,setPersonality]=useState("活泼外向");
  const [done, setDone] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/intake/" + token)
      .then(async (r) => {
        if (!r.ok) throw new Error("问卷链接已失效");
        const j = await r.json();
        if (active) {
          setDone(j.submitted);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [token]);
  if (!ready)
    return (
      <Panel title="学员问卷">
        <p>{error || "正在读取问卷…"}</p>
      </Panel>
    );
  if (done)
    return (
      <Panel title="已收到学员资料">
        <p>教务将根据填写的信息匹配老师。</p>
      </Panel>
    );
  return (
    <main className="student-survey-page">
      <Panel title="学员信息问卷">
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const field = (k: string) => String(f.get(k) || "").trim();
            try {
              const response = await fetch("/api/intake/" + token, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  age: Number(field("age")),
                  level: field("level"),
                  personality: field("personality"),
                  interests: field("interests"),
                  experience: field("experience"),
                  material: field("material"),
                  times: field("times"),
                  needs: field("needs"),
                }),
              });
              if (!response.ok && response.status !== 409)
                throw new Error("提交失败，请检查资料并重试");
              setDone(true);
            } catch (cause) {
              setError(String(cause));
            }
          }}
        >
          <Field label="年龄">
            <input required type="number" min="1" max="120" name="age" />
          </Field>
          <Field label="口语等级">
            <Select size="form" name="level" value={level} onValueChange={setLevel}>
              {["L0", "L1", "L2", "L3", "L4", "待评估"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="性格">
            <Select size="form" name="personality" value={personality} onValueChange={setPersonality}>
              <option>活泼外向</option>
              <option>内向或慢热</option>
            </Select>
          </Field>
          {Object.entries({
            interests: "兴趣爱好",
            experience: "外教课经验",
            material: "起始教材",
            times: "期望上课时间",
            needs: "其他教学需求",
          }).map(([k, label]) => (
            <Field key={k} label={label}>
              <input name={k} />
            </Field>
          ))}
          {error && <p role="alert">{error}</p>}
          <Button type="submit" variant="primary">
            提交学员资料
          </Button>
        </form>
      </Panel>
    </main>
  );
}
