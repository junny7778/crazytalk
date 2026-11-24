import { businessHeaders, businessMode } from "@crazytalk/shared/react";
import { useEffect, useRef } from "react";
import { studentSurveyPrefill, type Command, type Student } from "@crazytalk/shared";

export function useSurveyPrefill(students: Student[], enabled: boolean, act: (command: Command) => unknown) {
  const synced = useRef(new Map<string, string>());
  const apply = useRef(act);
  apply.current = act;
  useEffect(() => {
    if (!enabled || businessMode()) return;
    const controller = new AbortController();
    let busy = false;
    async function sync() {
      if (busy) return;
      busy = true;
      for (const student of students) {
        const { surveyToken, surveySecret, surveySubmittedAt } = student;
        if (controller.signal.aborted) return;
        if (!surveyToken || !surveySecret) continue;
        const prefill = studentSurveyPrefill(student);
        const profile = JSON.stringify({ ...prefill, submittedAt: surveySubmittedAt });
        const updateProfile = synced.current.get(surveyToken) !== profile;
        if (surveySubmittedAt && !updateProfile) continue;
        try {
          const headers = { ...businessHeaders(), "Content-Type": "application/json", Authorization: "Bearer " + surveySecret };
          let response = await fetch("/api/intake/" + surveyToken, {
            method: updateProfile ? "PATCH" : "GET",
            headers,
            body: updateProfile ? profile : undefined,
            signal: controller.signal,
          });
          let result = response.ok ? await response.json() : null;
          if (controller.signal.aborted) return;
          const previous = student.surveyPreviousSubmittedAt;
          const shouldRestore = (response.status === 404 || (response.ok && !result.submitted)) &&
            !!previous && previous === surveySubmittedAt && student.surveyOriginal &&
            ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
          if (shouldRestore) {
            response = await fetch("/api/intake/" + surveyToken + "/restore-legacy", {
              method: "POST", headers, signal: controller.signal,
              body: JSON.stringify({ submittedAt: previous, answers: student.surveyOriginal, prefill }),
            });
            if (controller.signal.aborted) return;
            if (response.ok) {
              result = await response.json();
              window.dispatchEvent(new Event("crazytalk-survey-restored"));
            }
          }
          if (!response.ok || controller.signal.aborted) continue;
          synced.current.set(surveyToken, profile);
          if (result.answers && (!surveySubmittedAt || result.submittedAt > surveySubmittedAt))
            await apply.current({type: "survey.submit", token: surveyToken, answers: result.answers,
              revision: !!surveySubmittedAt, nameEdited: result.nameEdited, submittedAt: result.submittedAt});
        } catch {
          if (controller.signal.aborted) return;
        }
      }
      busy = false;
    }
    if (!students.some(s => s.surveyToken && s.surveySecret)) return;
    void sync();
    const timer = students.some((student) => student.surveyToken && !student.surveySubmittedAt)
      ? window.setInterval(sync, 5000)
      : undefined;
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      controller.abort();
      window.removeEventListener("focus", sync);
    };
  }, [students, enabled]);
}
