import { businessHeaders, businessMode } from "@crazytalk/shared/react";
import { useEffect, useRef } from "react";
import type { Command, Student } from "@crazytalk/shared";

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
        const { surveyToken, surveySecret, surveySubmittedAt, chineseName } = student;
        if (controller.signal.aborted) return;
        if (!surveyToken || !surveySecret || surveySubmittedAt) continue;
        try {
          const updateName = synced.current.get(surveyToken) !== chineseName;
          const response = await fetch("/api/intake/" + surveyToken, {
            method: updateName ? "PATCH" : "GET",
            headers: { ...businessHeaders(), "Content-Type": "application/json", Authorization: "Bearer " + surveySecret },
            body: updateName ? JSON.stringify({ chineseName }) : undefined,
            signal: controller.signal,
          });
          if (!response.ok) continue;
          const result = await response.json();
          if (controller.signal.aborted) return;
          synced.current.set(surveyToken, chineseName);
          if (result.answers) await apply.current({type: "survey.submit", token: surveyToken, answers: result.answers,
            nameEdited: result.nameEdited, submittedAt: result.submittedAt});
        } catch {
          if (controller.signal.aborted) return;
        }
      }
      busy = false;
    }
    if (!students.some(s => s.surveyToken && s.surveySecret && !s.surveySubmittedAt)) return;
    void sync();
    const timer = window.setInterval(sync, 5000);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      controller.abort();
      window.removeEventListener("focus", sync);
    };
  }, [students, enabled]);
}
