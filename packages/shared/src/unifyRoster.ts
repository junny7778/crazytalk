import { stateSchema, type DemoState } from "./model";
import { createSeed } from "./seed";
import { migrateStudentIds } from "./studentIds";

// Keep any original learner whose profile or associated business history was edited locally.
export function unifyRoster(state: DemoState): DemoState {
  const batch = "unified-student-register-v1";
  if (
    state.importedBatches?.includes(batch) ||
    !state.students.some((s) => s.roster)
  )
    return state;
  const baseline = stateSchema.parse(migrateStudentIds(createSeed()).data);
  const remove = new Set<string>();
  const history = [
    "lessons",
    "credits",
    "feedback",
    "tasks",
    "events",
    "reports",
  ] as const;
  for (const original of baseline.students) {
    const current = state.students.find((s) => s.id === original.id);
    if (!current || current.roster) continue;
    if (
      JSON.stringify(stateSchema.shape.students.element.parse(current)) !==
      JSON.stringify(original)
    )
      continue;
    const id = current.id;
    if (
      state.orders?.some((o) => o.studentIds.includes(id)) ||
      state.classInAccounts?.some((a) => a.studentIds.includes(id)) ||
      state.slotLocks?.some((l) => l.studentId === id) ||
      state.referrals.some(
        (r) => r.studentId === id || r.referrerStudentId === id,
      )
    )
      continue;
    if (
      history.some((k) => {
        const rows = stateSchema.shape[k].parse(
          state[k].filter((r) => r.studentId === id),
        );
        return (
          JSON.stringify(rows) !==
          JSON.stringify(baseline[k].filter((r) => r.studentId === id))
        );
      })
    )
      continue;
    const feedbackIds = state.feedback
      .filter((f) => f.studentId === id)
      .map((f) => f.id);
    if (
      state.actions.some(
        (a) =>
          feedbackIds.includes(a.feedbackId) &&
          !baseline.actions.some(
            (b) => JSON.stringify(b) === JSON.stringify(a),
          ),
      )
    )
      continue;
    remove.add(id);
  }
  const keep = (r: { studentId: string }) => !remove.has(r.studentId);
  const feedback = state.feedback.filter(keep);
  return {
    ...state,
    revision: state.revision + 1,
    students: state.students.filter((s) => !remove.has(s.id)),
    feedback,
    lessons: state.lessons.filter(keep),
    credits: state.credits.filter(keep),
    reports: state.reports.filter(keep),
    tasks: state.tasks.filter(keep),
    events: state.events.filter(keep),
    actions: state.actions.filter(
      (a) => !a.feedbackId || feedback.some((f) => f.id === a.feedbackId),
    ),
    studentIdAliases: Object.fromEntries(
      Object.entries(state.studentIdAliases || {}).filter(
        ([, id]) => !remove.has(id),
      ),
    ),
    importedBatches: [...(state.importedBatches ?? []), batch],
  };
}
