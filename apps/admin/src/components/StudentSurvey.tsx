import { businessHeaders, businessMode } from "@crazytalk/shared/react";
import { matchingSurveyAnswers, matchingSurveyQuestions, studentSurveyPrefill, studentSurveyPrefillSchema } from "@crazytalk/shared";
import SurveyOptions from "./SurveyOptions";
import { useEffect, useRef, useState } from "react";
import { BookOpenText, Check } from "lucide-react";
import { useParams } from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import { Badge, Button, Panel, useToast } from "@crazytalk/ui";
import type { Student } from "@crazytalk/shared";

function answerRows(original: NonNullable<Student["surveyOriginal"]>): [string, string][] {
  if ("chineseName" in original)
    return matchingSurveyQuestions.map(({ key, title }) => {
      const value = original[key];
      return [title, Array.isArray(value) ? value.join("、") : value];
    });
  return Object.entries({
    年龄: original.age + " 岁", 口语等级: original.level, 性格: original.personality,
    外教课经验: original.experience, 意向时段: original.times, 起始教材: original.material,
    兴趣: original.interests, 教学需求: original.needs,
  });
}

export function SurveyLink({ student }: { student: Student }) {
  const { act, can, preview } = useDemo(),
    [error, setError] = useState("");
  const toast = useToast();
  const previous = !!student.surveyOriginal && !student.surveySubmittedAt;
  const editable = can("student.edit");
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const apply = useRef(act);
  apply.current = act;
  const { surveyToken, surveySecret, surveySubmittedAt } = student;
  useEffect(() => {
    setUnavailable(false);
    setRevisionOpen(false);
    if (!editable || !surveyToken) return;
    const token = surveyToken;
    const controller = new AbortController();
    async function check() {
      try {
        const response = await fetch("/api/intake/" + token, {
          headers: surveySecret ? { Authorization: "Bearer " + surveySecret } : {},
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setUnavailable(response.status === 404);
        if (!response.ok) return;
        const result = await response.json();
        if (controller.signal.aborted) return;
        setRevisionOpen(!!result.revisionOpen);
        if (!businessMode() && surveySubmittedAt && result.answers && result.submittedAt > surveySubmittedAt) {
          await apply.current({
            type: "survey.submit", token, revision: true,
            answers: result.answers, submittedAt: result.submittedAt, nameEdited: result.nameEdited,
          });
        }
      } catch {
        // Keep the last known state when the service cannot be reached.
      }
    }
    void check();
    window.addEventListener("focus", check);
    window.addEventListener("crazytalk-survey-restored", check);
    return () => {
      controller.abort();
      window.removeEventListener("focus", check);
      window.removeEventListener("crazytalk-survey-restored", check);
    };
  }, [editable, surveyToken, surveySecret, surveySubmittedAt]);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL("/intake/" + student.surveyToken, location.origin).href);
      toast("问卷链接已复制");
    } catch {
      setError("复制失败，可右键或长按「打开专属问卷」复制链接");
    }
  }
  const [issuing, setIssuing] = useState(false);
  async function updateLink() {
    setIssuing(true);
    setError("");
    try {
      if (surveyToken) {
        const response = await fetch("/api/intake/" + surveyToken + "/reopen", {
          method: "POST",
          headers: {
            ...businessHeaders(),
            "Content-Type": "application/json",
            ...(surveySecret ? { Authorization: "Bearer " + surveySecret } : {}),
          },
        });
        if (response.status === 404) {
          setUnavailable(true);
          return;
        }
        if (!response.ok) throw new Error("暂时无法开启问卷修改，请重试");
        setRevisionOpen(true);
        toast("已允许修改，请继续使用原问卷链接");
      } else {
        const response = await fetch("/api/intake", {
          method: "POST",
          headers: { ...businessHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(studentSurveyPrefill(student)),
        });
        if (!response.ok) throw new Error("问卷服务暂不可用");
        const next = await response.json();
        await act({ type: "survey.issue", id: student.id, ...next });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "问卷操作失败");
    } finally {
      setIssuing(false);
    }
  }
  if (!editable) return null;
  return (
    <Panel
      title="学员问卷与画像"
      action={(!surveyToken || surveySubmittedAt) && (
        <Button variant="primary" size="sm" onClick={updateLink} disabled={preview || issuing || revisionOpen || unavailable}>
          {issuing ? "处理中…" : revisionOpen ? "已允许修改" : surveyToken ? "允许修改" : "生成专属链接"}
        </Button>
      )}
    >
      <dl className="profile-summary-fields">
        <div>
          <dt>问卷状态</dt>
          <dd>
            <Badge tone={student.surveySubmittedAt ? "success" : "neutral"}>
              {student.surveySubmittedAt ? "已填写" : student.surveyToken ? "待填写" : "未生成"}
            </Badge>
          </dd>
        </div>
        <div>
          <dt>{previous ? "上次提交时间" : "提交时间"}</dt>
          <dd>
            {student.surveySubmittedAt
              ? new Date(student.surveySubmittedAt).toLocaleString()
              : previous && student.surveyPreviousSubmittedAt ? new Date(student.surveyPreviousSubmittedAt).toLocaleString() : "—"}
          </dd>
        </div>
        <div>
          <dt>专属问卷</dt>
          <dd>
            {student.surveyToken ? (
              <div className="row wrap survey-link-actions">
                <button type="button" className="text-link" onClick={copyLink}>复制链接</button>
                <a
                  className="text-link"
                  href={"/intake/" + student.surveyToken}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开专属问卷
                </a>
              </div>
            ) : (
              "待生成"
            )}
          </dd>
        </div>
      </dl>
      {student.surveyOriginal && (
        <section className="profile-survey-details" aria-label="问卷原答">
          <h3>{previous ? "上次提交的问卷原答" : "问卷原答"}</h3>
          <dl className="profile-summary-fields">
            {answerRows(student.surveyOriginal).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "未填写"}</dd>
              </div>
            ))}
          </dl>

        </section>
      )}
      {(error || unavailable) && <p role="alert">{error || "当前问卷链接不可用，历史答案已保留。"}</p>}
    </Panel>
  );
}

export default function StudentSurvey() {
  const { token } = useParams();
  return <SurveyForm key={token} token={token} />;
}

function SurveyForm({ token }: { token?: string }) {
  const [formValues, setFormValues] = useState(() => studentSurveyPrefillSchema.parse({}));
  const [sending, setSending] = useState(false);
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
          setFormValues(studentSurveyPrefillSchema.parse(j.prefill ?? j.answers ?? { chineseName: j.chineseName }));
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
      <main className="student-survey-page">
        <Panel title="学员问卷">
          <p>{error || "正在读取问卷…"}</p>
        </Panel>
      </main>
    );
  if (done)
    return (
      <main className="survey-complete">
        <section className="survey-receipt" aria-labelledby="survey-received">
          <div className="survey-complete-book" aria-hidden="true">
            <BookOpenText size={84} strokeWidth={1.35} fill="white" />
            <span className="survey-check"><Check size={26} strokeWidth={3} /></span>
          </div>
          <h1 id="survey-received">已收到学员资料</h1>
          <p>感谢填写！教务将根据学员的情况匹配合适的外教。</p>
        </section>
      </main>
    );
  return (
    <main className="student-survey-page">
      <article className="survey-sheet">
        <img className="survey-cover" src="/survey-cover.webp" alt="" width="2848" height="1600" />
        <header className="survey-heading">
          <h1>外教匹配信息收集问卷</h1>
          <p>为了给学员匹配到合适的外教，请如实填写哦！</p>
        </header>
        <form className="matching-survey-form" onSubmit={async event => {
          event.preventDefault();
          if (sending) return;
          const form = new FormData(event.currentTarget);
          const result = matchingSurveyAnswers.safeParse({
            ...Object.fromEntries(form.entries()), interests: form.getAll("interests"),
          });
          if (!result.success) {
            setError(result.error.issues[0].message);
            return;
          }
          setSending(true);
          setError("");
          try {
            const response = await fetch("/api/intake/" + token, {
              method: "POST", headers: { ...businessHeaders(), "Content-Type": "application/json" },
              body: JSON.stringify({ ...result.data, initialName: formValues.chineseName }),
            });
            if (!response.ok && response.status !== 409)
              throw new Error(response.status === 404 ? "问卷链接已失效" : "提交失败，请检查资料并重试");
            setDone(true);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "提交失败，请重试");
          } finally {
            setSending(false);
          }
        }}>
          {matchingSurveyQuestions.map(({ key, title, required, options, hint }, index) => {
            const label = <>{index + 1}. {title}{required && <span aria-hidden="true" className="survey-required"> *</span>}</>;
            if (!options) return <div className="survey-question" key={key}>
              <label htmlFor={key}>{label}</label>
              {hint && <small id={key + "-hint"}>{hint}</small>}
              {key === "needs" ? <textarea id={key} name={key} rows={3} defaultValue={formValues.needs} aria-describedby={key + "-hint"} />
                : <input id={key} name={key} defaultValue={formValues.chineseName} required={required} />}
            </div>;
            if (key === "interests") return (
              <SurveyOptions
                key={key}
                name={key}
                label={label}
                hint={hint}
                multiple
                value={formValues.interests}
                onChange={(interests) => setFormValues((current) => ({
                  ...current,
                  interests,
                }))}
              />
            );
            return (
              <SurveyOptions
                key={key}
                name={key}
                label={label}
                hint={hint}
                required={required}
                options={options}
                value={formValues[key]}
                onChange={(value) => setFormValues((current) => ({ ...current, [key]: value }))}
              />
            );
          })}
          {error && <p role="alert">{error}</p>}
          <Button type="submit" variant="primary" disabled={sending}>{sending ? "提交中…" : "提交"}</Button>
        </form>
      </article>
    </main>
  );
}
