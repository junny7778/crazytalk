import { officePay } from "./officePay";
import {payTermsSchema} from "./model";
import {studentSurveyAnswers} from "./model";
import { getScheduleCredits, scheduleUnits } from "./scheduleCredits";
import { initializePayroll, payrollBreakdown } from "./payroll";
import {
  formatMaterialProgress,
  formatStudentProgress,
} from "./studentProgress";
import {
  saveFeedbackCategory,
  trackFeedbackCategoryUsage,
  feedbackCategoryDeletionError,
} from "./feedbackCatalog";
import {
  scheduleIntentSchema,
  studentEditableSchema,
  studentHistorySchema,
  feedbackSchema,
  studentSchema,
  teacherSchema,
  studentProfileSchema,
  feedbackDetailsInputSchema,
  type Feedback,
  type FeedbackDetailsInput,
  type Command,
  type DemoState,
  type Student,
  type Teacher,
  type Lesson,
  DEMO_TODAY,
  addDays,
  studentOrderStatus,
  serviceStatusForOrder,
  canSubmitLessonReport,
} from "./model";
import {
  isRegularTime,
  isScheduleDate,
  availabilityError,
} from "./availability";
import { nextStudentId } from "./studentIds";
const id = () => globalThis.crypto.randomUUID();
const teacherIdentity = (name: string) =>
  name
    .trim()
    .replace(/^T\.\s*/i, "")
    .toLowerCase();
export function isAvailable(
  data: DemoState,
  teacherId: string,
  date: string,
  time: string,
  duration: number,
  studentId?: string,
  ignoreId?: string,
  allowOutsideRegular = false,
  timeOnly = false,
): string[] {
  const teacher = data.teachers.find((t) => t.id === teacherId);
  if (!teacher) return ["请选择老师"];
  const reasons: string[] = [];
  const start = minutes(time);
  if (!isScheduleDate(date)) reasons.push("请选择有效的上课日期");
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    start + duration > 24 * 60
  )
    reasons.push("请选择有效的上课时间和时长");
  if (teacher.status === "已离职") reasons.push("老师已离职");
  if (!timeOnly && data.rules.trainingRequired && !teacher.trained)
    reasons.push("老师尚未完成必修培训");
  if (!allowOutsideRegular && !isRegularTime(teacher, date, time, duration))
    reasons.push("不在老师的可上课时间内");
  if (
    data.leaves.some(
      (l) =>
        l.teacherId === teacherId &&
        ["已登记","已通过"].includes(l.status) &&
        overlapsLeave(date, time, duration, l.start, l.end),
    )
  )
    reasons.push("老师这段时间请假");
  if(data.slotLocks?.some(lock=>lock.date===date && Date.parse(lock.expiresAt)>Date.now() &&
    (lock.teacherId===teacherId || lock.studentId===studentId) &&
    !(lock.studentId===studentId && lock.teacherId===teacherId && lock.time===time && lock.duration===duration) &&
    start<minutes(lock.time)+lock.duration && minutes(lock.time)<start+duration)) reasons.push("时段已锁定");
  for (const l of data.lessons) {
    if (l.id === ignoreId || l.status === "已取消" || l.date !== date) continue;
    const a = minutes(l.time);
    if (start < a + l.duration && a < start + duration) {
      if (l.teacherId === teacherId) reasons.push("老师这个时间已经有课");
      if (studentId && l.studentId === studentId)
        reasons.push("学员这个时间已经有课");
    }
  }
  return [...new Set(reasons)];
}
export function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function teacherName(data: DemoState, teacherId: string) {
  return data.teachers.find((t) => t.id === teacherId)?.name || "待安排";
}
export function studentName(data: DemoState, studentId: string) {
  const s = data.students.find((s) => s.id === studentId);
  return s ? s.name : "待关联学员";
}
/** Import matching uses an explicitly supplied legacy key or exact nonempty group and name. */
export function studentImportMatches(
  students: Student[],
  profile: StudentProfileInputLike,
): Student[] {
  if (profile.importStudentId !== undefined) return students.filter(s => s.id === profile.importStudentId && !!profile.importStudentId);
  if (profile.code.trim())
    return students.filter(
      (s) => s.code.toLowerCase() === profile.code.trim().toLowerCase(),
    );
  if (!profile.groupName.trim() || !profile.name.trim()) return [];
  return students.filter(
    (s) =>
      s.groupName.trim() === profile.groupName.trim() &&
      s.name.trim() === profile.name.trim(),
  );
}
type StudentProfileInputLike = Pick<Student, "code" | "groupName" | "name"> & {importStudentId?: string};
export function payrollTotal(data: DemoState, payrollId: string) {
  if (!data.payroll.some((p) => p.id === payrollId))
    return { base: 0, deductions: 0, total: 0 };
  const { base, deductions, total } = payrollBreakdown(data, payrollId);
  return { base, deductions, total };
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}
export function transition(
  current: DemoState,
  command: Command,
): { data: DemoState; message: string } {
  const data = structuredClone(current);
  initializePayroll(data);
  data.teachers = data.teachers.map((record) => teacherSchema.parse(record));
  data.students = data.students.map((record) => studentSchema.parse(record));
  data.feedback = data.feedback.map((record) => feedbackSchema.parse(record));
  data.catalog = trackFeedbackCategoryUsage(data);
  data.tasks ??= [];
  data.referrals ??= [];
  let message = "已保存";
  const student = (s: string) =>
    required(
      data.students.find((x) => x.id === s),
      "找不到这位学员",
    );
  const teacher = (t: string) =>
    required(
      data.teachers.find((x) => x.id === t),
      "找不到这位老师",
    );
  const lesson = (l: string) =>
    required(
      data.lessons.find((x) => x.id === l),
      "找不到这节课",
    );
  const confirmation = (note = "") => ({
    operator: command.operator || "教务",
    at: new Date().toISOString(),
    note: note.trim() || "已与老师确认授课时间",
  });
  function requireTeacherConfirmation(
    t: Teacher,
    outside: boolean,
    confirmed?: boolean,
  ) {
    if ((outside || t.needConfirm) && !confirmed)
      throw new Error(
        outside
          ? "非常规时间需先与老师确认，再安排课程"
          : "请先与老师确认时间，并勾选确认",
      );
  }
  const recordedAt = new Date().toISOString();
  function event(
    type: string,
    content: string,
    studentId = "",
    teacherId = "",
    relation?: {
      relatedType: NonNullable<DemoState["events"][number]["relatedType"]>;
      relatedId: string;
    },
  ) {
    const inferred =
      relation ??
      (command.type === "credit.add" || command.type === "student.balance.open"
        ? {
            relatedType: "credit" as const,
            relatedId: data.credits[0]?.id || "",
          }
        : command.type === "referral.add"
          ? {
              relatedType: "referral" as const,
              relatedId: data.referrals[0]?.id || "",
            }
          : command.type === "lesson.resolve"
            ? undefined
            : command.type.startsWith("lesson.") && "id" in command
              ? { relatedType: "lesson" as const, relatedId: command.id }
              : undefined);
    data.events.unshift({
      id: id(),
      type,
      content,
      studentId,
      teacherId,
      date: DEMO_TODAY,
      operator: command.operator || "教务",
      recordedAt,
      ...(inferred?.relatedId ? inferred : {}),
    });
  }
  function addTask(input: {
    studentId: string;
    title: string;
    owner?: string;
    dueDate?: string;
    note?: string;
    sourceType: NonNullable<DemoState["tasks"][number]["sourceType"]>;
    sourceId?: string;
    lessonIds?: string[];
  }) {
    if (
      input.sourceId &&
      data.tasks.some(
        (task) =>
          task.studentId === input.studentId &&
          task.sourceType === input.sourceType &&
          task.sourceId === input.sourceId,
      )
    )
      return undefined;
    const learner = student(input.studentId);
    const task = {
      id: id(),
      studentId: input.studentId,
      title: input.title,
      owner: input.owner?.trim() || learner.owner || "待分配",
      dueDate: input.dueDate || "",
      note: input.note || "",
      status: "待处理" as const,
      result: "",
      completedAt: "",
      createdAt: recordedAt,
      createdBy: command.operator || "教务",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      lessonIds: input.lessonIds,
    };
    data.tasks.unshift(task);
    return task;
  }
  function teacherTasks(
    t: Teacher,
    impacted: Lesson[],
    title: string,
    sourceId: string,
  ) {
    for (const studentId of new Set(impacted.map((item) => item.studentId))) {
      const courses = impacted.filter((item) => item.studentId === studentId);
      addTask({
        studentId,
        title: `${t.name}${title}`,
        sourceType: "teacher",
        sourceId,
        lessonIds: courses.map((item) => item.id),
        note: `涉及 ${courses.length} 节课，请核对安排并联系家长。`,
      });
    }
  }
  const feedback = (feedbackId: string) =>
    required(
      data.feedback.find((record) => record.id === feedbackId),
      "找不到这条反馈",
    );
  function businessDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error("请填写有效的业务日期");
    const parsed = new Date(`${value}T12:00:00Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    )
      throw new Error("请填写有效的业务日期");
    return value;
  }
  function followUp(
    record: Feedback,
    section: Feedback["followUps"][number]["section"],
    content: string,
    changes?: { field: string; before: string; after: string }[],
  ) {
    record.followUps.push({
      id: id(),
      date: new Date().toISOString(),
      operator: command.operator || "操作人未记录",
      section,
      content,
      ...(changes ? { changes } : {}),
    });
    event(section, content, record.studentId, record.teacherId);
  }
  function details(input: FeedbackDetailsInput) {
    const parsed = feedbackDetailsInputSchema.parse(input);
    const learner = student(parsed.studentId);
    teacher(parsed.teacherId);
    if (parsed.lessonId) {
      const related = lesson(parsed.lessonId);
      if (
        related.studentId !== learner.id ||
        related.teacherId !== parsed.teacherId
      )
        throw new Error("关联课程与学员或老师不一致，请重新选择");
    }
    const date = new Date(`${parsed.date}T12:00:00+08:00`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== parsed.date
    )
      throw new Error("反馈日期无效");
    return {
      ...parsed,
      categories: [
        ...new Set(parsed.categories.filter((value) => value.trim())),
      ],
    };
  }
  function addMeasures(
    record: Feedback,
    command: {
      measures: string[];
      amount: number;
      separateDeduction?: boolean;
      deductionConfirmed: boolean;
      note: string;
    },
  ) {
    if (!command.note.trim()) throw new Error("请填写处理措施说明");
    if (!command.measures.length) throw new Error("请选择处理措施");
    if (
      !Number.isFinite(command.amount) ||
      command.amount < 0 ||
      (command.measures.includes("扣款") && command.amount <= 0)
    )
      throw new Error("请填写有效的扣款金额");
    const selected = [...new Set(command.measures)];
    const recorded: string[] = [];
    for (const measure of selected) {
      if (
        measure === "扣款" &&
        !command.separateDeduction &&
        data.actions.some(
          (action) =>
            action.teacherId === record.teacherId &&
            action.date === record.date &&
            action.type === "扣款" &&
            action.status !== "已作废",
        )
      )
        continue;
      data.actions.unshift({
        id: id(),
        teacherId: record.teacherId,
        feedbackId: record.id,
        date: record.date,
        type: measure,
        amount: measure === "扣款" ? command.amount : 0,
        reason: command.note.trim(),
        status:
          measure === "扣款" && !command.deductionConfirmed
            ? "待确认"
            : "已确认",
      });
      recorded.push(measure);
    }
    record.measures = [...new Set([...record.measures, ...recorded])];
    followUp(
      record,
      "处理措施",
      `${recorded.length ? recorded.join("、") : "同一事件已有扣款，本次不重复扣款"}：${command.note.trim()}`,
    );
  }
  function credit(
    s: Student,
    units: number,
    type: string,
    note: string,
    metadata: {
      date?: string;
      amount?: number;
      feedbackId?: string;
      orderId?: string;
      referralId?: string;
      lessonId?: string;
    } = {},
  ) {
    const orderId = metadata.lessonId ? lesson(metadata.lessonId).orderId : metadata.orderId;
    const order = orderId ? required(data.orders?.find(o => o.id === orderId), "找不到课程所属订单") : undefined;
    if (order) {
      if(!order.studentIds.includes(s.id))throw new Error("学员不属于该订单");
      if (order.balance + units < 0) throw new Error("共享订单余额不足");
      order.balance += units;
    } else {
      if (!s.balanceKnown) throw new Error("请先补录期初余额，再进行课时操作");
      s.balance += units;
    }
    const creditId = id();
    data.credits.unshift({
      id: creditId,
      studentId: s.id,
      date: metadata.date || DEMO_TODAY,
      type,
      units,
      balance: order?.balance ?? s.balance,
      orderId,
      note,
      operator: command.operator || "教务",
      recordedAt,
      ...(metadata.lessonId ? { lessonId: metadata.lessonId } : {}),
      ...(metadata.amount !== undefined ? { amount: metadata.amount } : {}),
      ...(metadata.feedbackId ? { feedbackId: metadata.feedbackId } : {}),
      ...(metadata.referralId ? { referralId: metadata.referralId } : {}),
    });
    return creditId;
  }
  function deduct(l: Lesson, shouldDeduct: boolean, confirmedUnits?: number) {
    const s = student(l.studentId);
    const previousUnits = l.deducted ? l.confirmedUnits : 0;
    const nextUnits = shouldDeduct ? (confirmedUnits ?? l.confirmedUnits) : 0;
    if (
      (l.deducted &&
        (previousUnits === undefined ||
          !Number.isFinite(previousUnits) ||
          previousUnits <= 0)) ||
      (shouldDeduct &&
        (nextUnits === undefined ||
          !Number.isFinite(nextUnits) ||
          nextUnits <= 0))
    )
      throw new Error("请由教务明确确认本节扣课数量，不按上课分钟数自动折算");
    const change = (previousUnits ?? 0) - (nextUnits ?? 0);
    if (change !== 0)
      credit(
        s,
        change,
        l.deducted ? (shouldDeduct ? "扣课更正" : "扣课退回") : "上课扣课",
        `${l.date} ${l.time} · ${command.type === "lesson.correct" ? command.reason : `${nextUnits} 课时`}`,
        { lessonId: l.id },
      );
    l.deducted = shouldDeduct;
    if (shouldDeduct) l.confirmedUnits = nextUnits;
  }
  switch (command.type) {
    case "student.create": {
      const profile = studentProfileSchema.parse(command.student);
      if (
        profile.code &&
        data.students.some(
          (s) => s.code.toLowerCase() === profile.code.toLowerCase(),
        )
      )
        throw new Error("这个学员编号已经使用，请换一个编号");
      const s = studentSchema.parse({
        ...profile,
        code: profile.code || `SYS-${id()}`,
        id: nextStudentId(data.students),
        createdAt: DEMO_TODAY,
        balance: 0,
        balanceKnown: true,
        historyStartDate: DEMO_TODAY,
        totalUnits: 0,
        legacyComplaints: "0",
        legacyCompensations: "0",
        legacyMissed: "0",
        orderStatus: "正常",
        status: "待排课",
        lastLesson: "",
      });
      data.students.unshift(s);
      event("新建学员", `为 ${s.name} 建立档案`, s.id);
      message = "学员档案已建立";
      break;
    }
    case "student.details.update": {
      const existing = student(command.id);
      const patch = studentEditableSchema
        .partial()
        .strict()
        .parse(command.patch);
      for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
        if (
          !(key in command.expected) ||
          JSON.stringify(existing[key]) !==
            JSON.stringify(command.expected[key])
        )
          throw new Error("这项资料已更新，请重新打开后核对再保存");
      }
      if (
        data.reports.some((report) => report.studentId === existing.id) &&
        ("material" in patch || "unit" in patch)
      )
        throw new Error("已有课后进度，请更正对应课后记录");
      Object.assign(existing, patch);
      event("修改资料", "更新了学员资料", existing.id);
      break;
    }
    case "student.history.update": {
      const existing = student(command.id);
      if (!command.reason.trim()) throw new Error("请填写更正原因");
      const history = studentHistorySchema.parse(command.history);
      if (
        history.historyStartDate &&
        (!isScheduleDate(history.historyStartDate) ||
          history.historyStartDate > DEMO_TODAY)
      )
        throw new Error("统计起算日期不能晚于今天");
      const months = history.monthlyRecords.map((item) => item.month.trim());
      if (months.some((month) => !month))
        throw new Error("请填写历史记录的月份");
      if (new Set(months).size !== months.length)
        throw new Error("同一月份不能重复登记");
      const before = studentHistorySchema.parse(existing);
      Object.assign(existing, history);
      event(
        "更正历史资料",
        `${command.reason.trim()}；${(
          Object.keys(history) as (keyof typeof history)[]
        )
          .filter(
            (key) =>
              JSON.stringify(before[key]) !== JSON.stringify(history[key]),
          )
          .map((key) => {
            const labels: Record<keyof typeof history, string> = {
              historyStartDate: "统计起算日期",
              sourceSequence: "序号",
              purchaseDate: "买单日期",
              totalUnits: "历史购课课时",
              renewalStatus: "是否续课",
              scheduleText: "历史上课时间",
              frequencyText: "历史上课频次",
              firstLessonDate: "历史首课日期",
              legacyComplaints: "历史投诉次数",
              legacyCompensations: "历史补偿次数",
              legacyMissed: "历史被缺席次数",
              originalTeacher: "原老师",
              firstChangedTeacher: "首次换老师",
              secondChangedTeacher: "二次换老师",
              monthlyRecords: "历史月度记录",
            };
            const display = (value: unknown) => {
              if (Array.isArray(value))
                return (
                  value
                    .map(
                      (item) =>
                        `${item.month || "未填写月份"}：应上${item.planned ?? "未提供"}节、实上${item.actual ?? "未提供"}节${item.note ? `，${item.note}` : ""}`,
                    )
                    .join("；") || "未提供"
                );
              return value === "" || value == null ? "未提供" : String(value);
            };
            return `${labels[key]}：${display(before[key])} → ${display(history[key])}`;
          })
          .join("；")}`,
        existing.id,
        "",
        { relatedType: "student", relatedId: existing.id },
      );
      break;
    }
    case "student.profile": {
      const profile = studentProfileSchema.parse(command.profile);
      if (
        profile.code &&
        data.students.some(
          (item) =>
            item.id !== command.id &&
            item.code.toLowerCase() === profile.code.toLowerCase(),
        )
      )
        throw new Error("这个学员编号已经使用，请换一个编号");
      const existing = student(command.id);
      if (
        existing.teacherId &&
        teacherIdentity(profile.teacherName) !==
          teacherIdentity(existing.teacherName) &&
        teacherIdentity(profile.teacherName) !==
          teacherIdentity(
            data.teachers.find((teacher) => teacher.id === existing.teacherId)
              ?.name || "",
          )
      )
        throw new Error(
          "请通过办理换老师调整任课老师和后续课程，不能直接修改已关联的老师姓名",
        );
      if (
        profile.orderStatus !== existing.orderStatus &&
        serviceStatusForOrder(profile.orderStatus) !== existing.status
      )
        throw new Error("请通过停课、复课、结课或退款服务停用操作变更订单状态");
      if (profile.status !== existing.status)
        throw new Error("请通过停课、复课或结课操作变更学员状态");
      if (profile.teacherId !== existing.teacherId)
        throw new Error("请通过换老师操作调整任课老师和后续课程");
      const safe = studentEditableSchema.parse(profile);
      if (data.reports.some((report) => report.studentId === existing.id)) {
        safe.material = existing.material;
        safe.unit = existing.unit;
      }
      Object.assign(existing, safe);
      event("修改资料", "更新了学员资料", command.id);
      break;
    }
    case "student.bindClassIn": {
      student(command.id);
      const phone = command.phone.trim(), uid = command.uid.trim();
      if (!/^1\d{10}$/.test(phone)) throw new Error("请填写注册用的 11 位手机号");
      const accounts = data.classInAccounts ??= [];
      let account = accounts.find(item => item.phone === phone);
      if (uid && accounts.some(item => item.uid === uid && item.phone !== phone))
        throw new Error("该 UID 已关联其他手机号，请先核实换号情况");
      if (account?.uid && uid && account.uid !== uid) throw new Error("手机号对应的 UID 不一致，请先核实");
      if (!account) {account = {id:id(),phone,uid,studentIds:[]}; accounts.push(account);}
      if (uid) account.uid = uid;
      for (const item of accounts) item.studentIds = item.studentIds.filter(s => s !== command.id);
      account.studentIds.push(command.id);
      event("ClassIn 账号", "更新学员账号绑定", command.id);
      break;
    }
    case "student.import": {
      if (command.batchId && data.importedBatches?.includes(command.batchId)) { message = "该批次已导入"; break; }
      const profiles = command.students.map((value) =>
        studentProfileSchema.parse(value),
      );
      const keys = new Set<string>();
      for (const profile of profiles) {
        if (profile.importStudentId && !data.students.some(s => s.id === profile.importStudentId)) throw new Error("学员 ID 不存在，请核对");
        const key = profile.importStudentId !== undefined ? profile.importStudentId : profile.code
          ? `code:${profile.code.toLowerCase()}`
          : profile.groupName.trim()
            ? `group:${profile.groupName.trim()}\u0000${profile.name.trim()}`
            : "";
        if (key && keys.has(key))
          throw new Error(
            `导入文件中的学生「${profile.name}」与群名重复，请先核对，避免重复导入`,
          );
        if (key) keys.add(key);
        const matches = studentImportMatches(data.students, profile);
        if (matches.length > 1)
          throw new Error(
            `学生「${profile.name}」匹配到多份档案，请先人工核对，未导入或覆盖任何资料`,
          );
        const existing = matches[0];
        if (existing && command.mode === "update") {
          const currentTeacherName = existing.teacherId
            ? data.teachers.find((teacher) => teacher.id === existing.teacherId)
                ?.name || existing.teacherName
            : existing.teacherName;
          if (
            teacherIdentity(currentTeacherName) !==
              teacherIdentity(profile.teacherName) &&
            (existing.teacherId ||
              existing.teacherName.trim() ||
              data.lessons.some(
                (lesson) =>
                  lesson.studentId === existing.id &&
                  lesson.status === "未开始",
              ))
          )
            throw new Error(
              `学生「${profile.name}」的上课老师发生变更，请先在档案办理换老师并核对后续课程，再重新导入；本次未覆盖任何资料`,
            );
        }
        if (
          matches.length &&
          command.mode === "update" &&
          profile.orderStatus &&
          profile.orderStatus !== matches[0].orderStatus &&
          serviceStatusForOrder(profile.orderStatus) !== matches[0].status
        )
          throw new Error(
            `学生「${profile.name}」的订单状态发生变更，请先通过服务操作处理，不能用导入覆盖`,
          );
      }
      const workbookFields = [
        "name",
        "channel",
        "phone",
        "material",
        "age",
        "preferences",
        "ageText",
        "sourceSequence",
        "groupName",
        "orderStatus",
        "purchaseDate",
        "teacherName",
        "scheduleText",
        "frequencyText",
        "firstLessonDate",
        "gender",
        "personality",
        "foreignTeacherExperience",
        "renewalStatus",
        "legacyComplaints",
        "legacyCompensations",
        "legacyMissed",
        "originalTeacher",
        "firstChangedTeacher",
        "secondChangedTeacher",
        "totalUnits",
      ] as const;
      let added = 0,
        updated = 0,
        skipped = 0;
      for (const profile of profiles) {
        const existing = studentImportMatches(data.students, profile)[0];
        if (existing) {
          if (command.mode === "skip") {
            skipped++;
            continue;
          }
          const workbook = Object.fromEntries(
            workbookFields.map((key) => [key, profile[key]]),
          );
          if (data.reports.some((report) => report.studentId === existing.id))
            workbook.material = existing.material;
          Object.assign(existing, workbook);
          const importedMonths = new Set(
            profile.monthlyRecords.map((record) => record.month),
          );
          existing.monthlyRecords = [
            ...existing.monthlyRecords.filter(
              (record) => !importedMonths.has(record.month),
            ),
            ...profile.monthlyRecords,
          ];
          updated++;
        } else {
          data.students.push(
            studentSchema.parse({
              ...profile,
              code: profile.code || `SYS-${id()}`,
              status: profile.orderStatus
                ? serviceStatusForOrder(profile.orderStatus)
                : profile.status,
              id: nextStudentId(data.students),
              balance: 0,
              balanceKnown: false,
              createdAt: DEMO_TODAY,
              lastLesson: "",
            }),
          );
          added++;
        }
      }
      event(
        "导入学员",
        `新增 ${added} 位，更新 ${updated} 位，跳过 ${skipped} 位`,
      );
      if (command.batchId) (data.importedBatches ??= []).push(command.batchId);
      message = `已导入：新增 ${added} 位，更新 ${updated} 位，跳过 ${skipped} 位`;
      break;
    }
    case "student.balance.open": {
      const learner = student(command.id);
      if (learner.balanceKnown)
        throw new Error("已录入期初余额，请通过课时操作调整");
      if (!Number.isFinite(command.balance))
        throw new Error("请填写有效的期初剩余课时，可填写负数表示欠课");
      if (!command.reason.trim()) throw new Error("请填写期初余额的核对依据");
      learner.balanceKnown = true;
      const creditId = credit(
        learner,
        command.balance,
        "期初余额",
        command.reason,
      );
      event(
        "补录期初余额",
        `核对剩余 ${command.balance} 课时，${command.reason}`,
        learner.id,
        "",
        { relatedType: "credit", relatedId: creditId },
      );
      message = "期初余额已记录";
      break;
    }
    case "student.scheduleIntent.update": {
      const intent = scheduleIntentSchema.parse(command.intent);
      if (!isScheduleDate(intent.startDate) || intent.startDate < DEMO_TODAY)
        throw new Error("请选择今天或以后的有效开始日期");
      if (
        intent.windows.some(
          (w) => minutes(w.end) - minutes(w.start) < intent.duration,
        )
      )
        throw new Error("意向时间范围需能容纳一节完整课程");
      student(command.studentId).scheduleIntent = intent;
      event(
        "更新排课意向",
        "保存了学员独立的意向时间与排课需求",
        command.studentId,
      );
      message = "排课意向已保存";
      break;
    }
    case "student.edit": {
      if (
        data.reports.some((report) => report.studentId === command.id) &&
        ("material" in command.patch || "unit" in command.patch)
      )
        throw new Error("已有课后进度，请更正对应课后记录");
      Object.assign(student(command.id), command.patch);
      event("修改资料", "更新了学员资料", command.id);
      break;
    }
    case "credit.deduct": {
      const s = student(command.studentId);
      if (!s.balanceKnown) throw new Error("请先核实并录入剩余课时");
      if (s.status === "退费")
        throw new Error("退费学员的课包已冻结，请先办理复课");
      if (!Number.isFinite(command.units) || command.units <= 0)
        throw new Error("扣减课时必须为大于 0 的有效数值");
      if (!command.reason.trim()) throw new Error("请填写扣减原因");
      if (command.units > s.balance)
        throw new Error("扣减课时不能超过当前剩余课时");
      const before = s.balance;
      const after = Math.round((before - command.units) * 1e8) / 1e8;
      const creditId = credit(
        s,
        -command.units,
        "手动扣减",
        command.reason.trim(),
      );
      s.balance = after;
      data.credits[0].balance = after;
      event(
        "手动扣减",
        `扣减 ${command.units} 课时，余额 ${before} → ${after}；${command.reason.trim()}`,
        s.id,
        "",
        { relatedType: "credit", relatedId: creditId },
      );
      message = `已扣减 ${command.units} 课时，剩余 ${after} 课时`;
      break;
    }
    case "survey.issue": {
      const s = student(command.id);
      s.surveyToken = command.token || crypto.randomUUID();
      s.surveySecret = command.secret;
      delete s.surveySubmittedAt;
      break;
    }
    case "survey.submit": {
      const s = required(data.students.find(s=>s.surveyToken===command.token && !!command.token),"问卷链接已失效");
      if(s.surveySubmittedAt) throw new Error("问卷已提交");
      const answers=studentSurveyAnswers.parse(command.answers);
      Object.assign(s,{surveyOriginal:answers,surveySubmittedAt:recordedAt,age:answers.age,level:answers.level,
        ageText:String(answers.age),personality:answers.personality,interests:answers.interests,
        foreignTeacherExperience:answers.experience,preferences:answers.needs});
      if(answers.material && !data.reports.some(r=>r.studentId===s.id))s.material=answers.material;
      event("学员问卷","收到学员资料",s.id);
      break;
    }
    case "slot.release": {
      data.slotLocks=data.slotLocks?.filter(lock=>lock.studentId!==command.studentId); break;
    }
    case "slot.lock": {
      student(command.studentId);
      if(!command.slots.length || !Number.isFinite(Date.parse(command.expiresAt)) || Date.parse(command.expiresAt)<=Date.now())throw new Error("请设置有效的保留时间");
      data.slotLocks=(data.slotLocks||[]).filter(lock=>Date.parse(lock.expiresAt)>Date.now() && lock.studentId!==command.studentId);
      for(const slot of command.slots){
        const reasons=isAvailable(data,slot.teacherId,slot.date,slot.time,command.duration,command.studentId);
        if(reasons.length)throw new Error(reasons[0]);
        data.slotLocks.push({...slot,studentId:command.studentId,duration:command.duration,expiresAt:command.expiresAt,operator:command.operator||"教务"});
      }
      event("锁定档期",`保留 ${command.slots.length} 个时段至 ${command.expiresAt}`,command.studentId);
      break;
    }
    case "order.buy": {
      const buyer = student(command.studentId);
      const members = [...new Set(command.studentIds)];
      if (!command.id.trim() || !members.includes(buyer.id) || ![72,144].includes(command.units)) throw new Error("请选择学员和套餐");
      const date = businessDate(command.date);
      for (const member of members) {
        const s = student(member);
        if (s.status === "退费") throw new Error("退费学员不能加入新订单");
      }
      const orders = data.orders ??= [];
      if (orders.some(o => o.id === command.id)) { message = "订单已登记"; break; }
      orders.push({id:command.id,studentIds:members,units:command.units,balance:command.units,date,kind:command.kind,channel:buyer.channel,project:buyer.project});
      data.credits.unshift({id:id(),studentId:buyer.id,orderId:command.id,date,type:command.kind,units:command.units,balance:command.units,note:command.note,operator:command.operator || "教务",recordedAt});
      if (command.kind === "续费") buyer.renewalStatus = "是";
      event("套餐订单", `登记 ${command.units} 课时，${members.length} 位学员共用`, buyer.id);
      break;
    }
    case "credit.add": {
      const s = student(command.studentId);
      if (!command.orderId && !s.balanceKnown) throw new Error("请先补录期初余额，再进行课时操作");
      if (!Number.isFinite(command.units) || command.units <= 0)
        throw new Error("课时数需为大于 0 的有效数值");
      if (["补偿", "赠送"].includes(command.kind) && !command.note.trim())
        throw new Error("请填写补偿或赠送的原因");
      if (s.status === "退费")
        throw new Error("退费学员的课包已冻结，请先办理复课");
      if (
        command.amount !== undefined &&
        (!Number.isFinite(command.amount) || command.amount < 0)
      )
        throw new Error("充值金额需为非负数，未知可留空");
      const date = businessDate(command.date || DEMO_TODAY);
      if (command.feedbackId) {
        const related = feedback(command.feedbackId);
        if (related.studentId !== s.id)
          throw new Error("补偿关联的反馈不属于这位学生");
        if (
          command.kind === "补偿" &&
          data.credits.some(
            (entry) =>
              entry.studentId === s.id &&
              entry.type === "补偿" &&
              entry.feedbackId === related.id,
          )
        )
          throw new Error("这条反馈已有补偿记录，请先核对，避免重复加课时");
      }
      if (
        command.referralId &&
        !data.referrals.some(
          (referral) =>
            referral.id === command.referralId &&
            (referral.studentId === s.id ||
              referral.referrerStudentId === s.id),
        )
      )
        throw new Error("关联转介绍关系不属于这位学生");
      const creditId = credit(s, command.units, command.kind, command.note, {
        date,
        orderId:command.orderId, amount: command.amount,
        feedbackId: command.feedbackId,
        referralId: command.referralId,
      });
      if (command.kind === "续费") s.renewalStatus = "是";
      event(
        command.kind,
        `增加 ${command.units} 课时，剩余 ${s.balance} 课时`,
        s.id,
        "",
        { relatedType: "credit", relatedId: creditId },
      );
      message = `已加 ${command.units} 课时，剩余 ${s.balance} 课时`;
      break;
    }
    case "student.lifecycle": {
      const s = student(command.studentId);
      if (!command.reason.trim()) throw new Error("请填写本次变更原因");
      s.status = command.status;
      s.orderStatus = studentOrderStatus(command.status);
      if (command.status === "在读" && s.serviceStopResults.length) {
        event(
          "历史停用结果",
          s.serviceStopResults
            .map(
              (result) => `${result.step}：${result.status}，${result.detail}`,
            )
            .join("；"),
          s.id,
        );
        s.serviceStopResults = [];
      }
      if (["退费", "停课", "结课"].includes(command.status)) {
        for (const l of data.lessons.filter(
          (l) =>
            l.studentId === s.id &&
            l.date >= DEMO_TODAY &&
            l.status === "未开始",
        )) {
          l.status = "已取消";
          l.note = command.reason;
          if (command.simulateFailure) {
            l.sync = "未同步";
            l.syncReason = "课程还未在 ClassIn 取消，请重新更新。";
          }
        }
      }
      if (command.status === "退费") {
        s.serviceStopResults = [
          {
            step: "固定安排",
            status: "本地模拟完成",
            detail: "该学员已停止继续排课，原表上课安排保留供历史查询。",
          },
          {
            step: "未来课程",
            status: command.simulateFailure ? "待处理" : "本地模拟完成",
            detail: command.simulateFailure
              ? "本地取消已记录，外部平台处理待确认。"
              : "本地未开始课程已取消，未调用外部平台。",
          },
          {
            step: "候课名单",
            status: "待确认范围",
            detail: "当前Demo没有外部候课名单，需确认实际停用范围。",
          },
          {
            step: "服务权限",
            status: "待确认范围",
            detail: "仅模拟停止本地排课；不冻结真实ClassIn或其他账号。",
          },
        ];
        for (const step of s.serviceStopResults.filter(
          (item) => item.status !== "本地模拟完成",
        )) {
          if (
            !data.tasks.some(
              (task) =>
                task.studentId === s.id &&
                task.title === `退款停用：${step.step}` &&
                task.status === "待处理",
            )
          )
            data.tasks.unshift({
              id: id(),
              studentId: s.id,
              title: `退款停用：${step.step}`,
              owner: s.owner || "待分配",
              dueDate: "",
              note: step.detail,
              status: "待处理",
              result: "",
              completedAt: "",
              sourceType: "student",
              sourceId: `refund:${s.id}:${step.step}`,
              createdAt: recordedAt,
              createdBy: command.operator || "教务",
            });
        }
      }
      event(command.status, command.reason, s.id);
      if (command.status === "退费")
        data.events[0].serviceStopResults = structuredClone(
          s.serviceStopResults,
        );
      message = `已${command.status}${command.simulateFailure ? "，部分课程尚未更新，请到上课记录重新更新" : ""}`;
      break;
    }
    case "referral.add": {
      const referred = student(command.studentId);
      const referrer = student(command.referrerStudentId);
      if (referred.id === referrer.id)
        throw new Error("介绍人与被介绍学生不能是同一人");
      if (
        data.referrals.some(
          (item) =>
            item.studentId === referred.id &&
            item.referrerStudentId === referrer.id,
        )
      )
        throw new Error("这组转介绍关系已经登记，请勿重复添加");
      data.referrals.unshift({
        id: id(),
        studentId: referred.id,
        referrerStudentId: referrer.id,
        date: businessDate(command.date),
        note: command.note.trim(),
        operator: command.operator || "教务",
        recordedAt,
      });
      event(
        "转介绍",
        `${referrer.name} 介绍 ${referred.name}${command.note ? `，${command.note}` : ""}`,
        referred.id,
      );
      message = "转介绍关系已登记，未自动增加课时";
      break;
    }
    case "task.add": {
      student(command.studentId);
      if (!command.title.trim()) throw new Error("请填写待办事项");
      const task = addTask({
        studentId: command.studentId,
        title: command.title.trim(),
        owner: command.owner,
        dueDate: command.dueDate ? businessDate(command.dueDate) : "",
        note: command.note?.trim(),
        sourceType: "manual",
      });
      if (task)
        event("新增待办", task.title, task.studentId, "", {
          relatedType: "task",
          relatedId: task.id,
        });
      message = "待办已登记";
      break;
    }
    case "task.complete": {
      const task = required(
        data.tasks.find((item) => item.id === command.id),
        "找不到这条待办",
      );
      if (task.status === "已完成")
        throw new Error("这条待办已经完成，请勿重复提交");
      task.status = "已完成";
      task.result = command.result?.trim() || "";
      task.completedAt = recordedAt;
      task.completedBy = command.operator || "教务";
      event(
        "完成待办",
        `${task.title}${task.result ? `：${task.result}` : ""}`,
        task.studentId,
        "",
        { relatedType: "task", relatedId: task.id },
      );
      message = "待办已完成";
      break;
    }
    case "student.courseReminder.preview": {
      const learner = student(command.studentId);
      const course = lesson(command.lessonId);
      if (course.studentId !== learner.id)
        throw new Error("这节课不属于当前学员");
      if (["停课", "结课", "退费"].includes(learner.status)) {
        message = "当前服务已暂停，不生成课程提醒";
        break;
      }
      if (
        command.kind === "before" &&
        (course.status !== "未开始" || course.date < DEMO_TODAY)
      )
        throw new Error("请选择尚未开始的后续课程");
      if (command.kind === "feedback" && !canSubmitLessonReport(course))
        throw new Error("请选择已经结束的课程");
      const title = command.kind === "before" ? "课前准备提醒" : "跟进课后反馈";
      const tutor = teacher(course.teacherId);
      const task = addTask({
        studentId: learner.id,
        title,
        sourceType: "reminder",
        sourceId: `course:${command.kind}:${course.id}`,
        lessonIds: [course.id],
        note: `${course.date} ${course.time} · ${tutor.name}${course.material ? ` · ${course.material}` : ""}。${command.kind === "before" ? "请核对教材与上课安排。" : "请核对教学反馈并跟进家长。"}`,
      });
      if (task)
        event("课程服务提醒", task.note, learner.id, tutor.id, {
          relatedType: "task",
          relatedId: task.id,
        });
      message = task ? "课程跟进待办已生成" : "已有相同课程待办，请勿重复生成";
      break;
    }
    case "student.reminder.preview": {
      const learner = student(command.studentId);
      if (!Number.isFinite(command.threshold) || command.threshold < 0)
        throw new Error("请填写本次演示条件");
      if (["停课", "结课", "退费"].includes(learner.status)) {
        message = "当前服务已暂停，不生成跟进提醒";
        break;
      }
      let basis = "",
        courseIds: string[] = [];
      if (command.kind === "balance") {
        if (!learner.balanceKnown) {
          message = "余额尚未核实，暂不生成课时提醒";
          break;
        }
        if (learner.balance > command.threshold) {
          message = "当前课时未达到本次提醒条件";
          break;
        }
        basis = `剩余 ${learner.balance} 课时，本次演示提醒线为 ${command.threshold} 课时。`;
      } else {
        if (
          !Number.isInteger(command.lookbackDays) ||
          !command.lookbackDays ||
          command.lookbackDays < 1 ||
          !Number.isInteger(command.threshold) ||
          command.threshold < 1
        )
          throw new Error("请填写观察天数和缺席节数");
        const start = addDays(DEMO_TODAY, -command.lookbackDays + 1);
        const missed = data.lessons.filter(
          (item) =>
            item.studentId === learner.id &&
            item.date >= start &&
            item.date <= DEMO_TODAY &&
            ["已完成", "缺席"].includes(item.status) &&
            item.attendance === "学员缺席",
        );
        if (missed.length < command.threshold) {
          message = "已确认出勤未达到本次提醒条件";
          break;
        }
        courseIds = missed.map((item) => item.id);
        basis = `最近 ${command.lookbackDays} 天已确认缺席 ${missed.length} 节，本次演示条件为 ${command.threshold} 节。请核实原因。`;
      }
      const task = addTask({
        studentId: learner.id,
        title: command.kind === "balance" ? "跟进剩余课时" : "核实近期出勤",
        note: basis,
        sourceType: "reminder",
        sourceId: `${DEMO_TODAY}:${command.kind}:${command.threshold}:${command.lookbackDays || ""}`,
        lessonIds: courseIds,
      });
      if (task)
        event("跟进提醒", basis, learner.id, "", {
          relatedType: "task",
          relatedId: task.id,
        });
      message = task ? "跟进待办已生成" : "已有相同跟进待办，请勿重复生成";
      break;
    }
    case "service.add": {
      if (!command.content.trim()) throw new Error("请填写回访内容");
      student(command.studentId);
      event(
        "回访",
        command.content +
          (command.satisfaction ? ` · 满意度：${command.satisfaction}` : ""),
        command.studentId,
      );
      if(command.stars!==undefined){
        if(!Number.isInteger(command.stars)||command.stars<1||command.stars>5)throw new Error("请评 1 至 5 星");
        data.events[0].visit={stars:command.stars,stage:command.stage||"常规跟进",text:command.content,evidence:command.evidence||""};
        data.events[0].content=`${data.events[0].visit.stage} · ${command.stars} 星 · ${command.content}`;
      }
      message = "回访已记录";
      break;
    }
    case "lesson.plannedUnits.update": {
      const item = lesson(command.id);
      if (item.deducted || !["未开始", "待确认", "缺席"].includes(item.status))
        throw new Error("仅可核实尚未扣课的课程占用");
      const units = scheduleUnits(item.duration, command.plannedUnits);
      if (units === undefined || !Number.isFinite(units) || units <= 0)
        throw new Error("请填写有效的预计扣课数");
      item.plannedUnits = units;
      event(
        "核实排课占用",
        `预计占用 ${units} 课时`,
        item.studentId,
        item.teacherId,
      );
      message = "课程占用课时已核实";
      break;
    }
    case "lesson.schedule": {
      const s = student(command.studentId);
      const flexible = command.schedulingMode === "flex";
      if (flexible && command.kind !== "临时课")
        throw new Error("灵活排课模式与课程类型不一致");
      if (["停课", "结课", "退费"].includes(s.status))
        throw new Error("请先为学员办理复课，再安排课程");
      if (!command.slots.length) throw new Error("请至少选择一个上课时间");
      if (![25, 50, 55, 120].includes(command.duration))
        throw new Error("请选择可用的上课时长");
      const plannedUnits = scheduleUnits(
        command.duration,
        command.plannedUnits,
      );
      const credits = getScheduleCredits(
        data,
        s.id,
        command.slots.length,
        plannedUnits ?? NaN,
      );
      if (credits.error) throw new Error(credits.error);
      const unique = new Set(command.slots.map((s) => s.date + s.time));
      if (unique.size !== command.slots.length)
        throw new Error("选择的时间有重复");
      for (const [slotIndex,slot] of command.slots.entries()) {
        const t = teacher(slot.teacherId ?? command.teacherId);
        if (
          !flexible &&
          s.age != null &&
          s.age < 16 &&
          !t.categories.includes("少儿")
        )
          throw new Error("这位老师不接受少儿课程，请选择其他老师");
        const outside = !isRegularTime(
          t,
          slot.date,
          slot.time,
          command.duration,
        );
        const confirmed = slot.confirmedTeacher ?? command.confirmedTeacher;
        if (!flexible) requireTeacherConfirmation(t, outside, confirmed);
        if (slot.date < DEMO_TODAY) throw new Error("不能安排已经过去的课程");
        const reasons = isAvailable(
          data,
          t.id,
          slot.date,
          slot.time,
          command.duration,
          s.id,
          undefined,
          !flexible && confirmed === true,
          flexible,
        );
        if (reasons.length)
          throw new Error(`${slot.date} ${slot.time}：${reasons[0]}`);
        const made: Lesson = {
          id: id(),
          studentId: s.id,
          orderId: credits.allocations[slotIndex],
          requiresScreenshot:true,
          teacherId: t.id,
          ...(command.kind === "固定课" && !slot.extra
            ? {
                fixedOrigin: slot.fixedOrigin || {
                  date: slot.date,
                  time: slot.time,
                },
              }
            : {}),
          date: slot.date,
          time: slot.time,
          duration: command.duration,
          kind: slot.extra ? "临时课" : command.kind,
          ...(slot.extra ? { scheduleExtra: true } : {}),
          status: "未开始",
          attendance: "正常",
          deducted: false,
          plannedUnits,
          sync: "已同步",
          syncReason: "",
          material: command.material,
          note: "",
          teacherIn: "",
          teacherOut: "",
          studentIn: "",
          studentOut: "",
          leaveFlag: false,
          conflict: false,
          ...((t.needConfirm || outside) && confirmed
            ? { confirmation: confirmation(command.confirmationNote) }
            : {}),
        };
        data.lessons.push(made);
        if(data.slotLocks)data.slotLocks=data.slotLocks.filter(lock=>!(lock.studentId===s.id && lock.teacherId===t.id && lock.date===slot.date && lock.time===slot.time));
      }
      if (command.kind === "固定课") {
        s.teacherId = command.slots[0].teacherId ?? command.teacherId;
        s.teacherName = teacher(s.teacherId).name;
      }
      event(
        "排课",
        `安排 ${command.slots.length} 节${command.kind}`,
        s.id,
        command.teacherId,
      );
      message = `已为 ${s.name} 安排 ${command.slots.length} 节课`;
      break;
    }
    case "lesson.reschedule": {
      const l = lesson(command.id);
      if (l.status !== "未开始") throw new Error("只能调整尚未开始的课程");
      const t = teacher(command.teacherId);
      const s = student(l.studentId);
      if (s.age != null && s.age < 16 && !t.categories.includes("少儿"))
        throw new Error("这位老师不接受少儿课程，请选择其他老师");
      if (["停课", "结课", "退费"].includes(s.status))
        throw new Error("请先为学员办理复课，再安排课程");
      const outside = !isRegularTime(t, command.date, command.time, l.duration);
      requireTeacherConfirmation(t, outside, command.confirmedTeacher);
      const reasons = isAvailable(
        data,
        command.teacherId,
        command.date,
        command.time,
        l.duration,
        l.studentId,
        l.id,
        command.confirmedTeacher === true,
      );
      if (reasons.length) throw new Error(reasons[0]);
      if (command.date < DEMO_TODAY) throw new Error("请选择今天或之后的时间");
      const before = `${l.date} ${l.time}`;
      if (l.kind === "固定课" && !l.fixedOrigin)
        l.fixedOrigin = { date: l.date, time: l.time };
      l.date = command.date;
      l.time = command.time;
      l.teacherId = command.teacherId;
      if (outside) l.kind = "临时课";
      if (command.confirmedTeacher && (outside || t.needConfirm))
        l.confirmation = confirmation(command.confirmationNote);
      else delete l.confirmation;
      l.conflict = false;
      l.sync = "已同步";
      l.note = `${before} 调至 ${command.date} ${command.time}，${command.reason}`;
      event("调课", l.note, l.studentId, l.teacherId, {
        relatedType: "lesson",
        relatedId: l.id,
      });
      message = "调课完成，学员和老师课表已更新";
      break;
    }
    case "lesson.incident": {
      const l=lesson(command.id);
      if(!command.note.trim() || !command.reason.trim())throw new Error("请填写核实依据");
      if(command.minutes!==undefined && (!Number.isInteger(command.minutes)||command.minutes<0))throw new Error("请填写非负整数分钟");
      l.incident={minutes:command.minutes,reason:command.reason,note:command.note.trim(),at:recordedAt,operator:command.operator||"教务"};
      event("考勤核实",command.reason+" · "+command.note,l.studentId,l.teacherId);
      if(command.reason==="学员缺席"){l.studentAttendance=["缺席"];l.absenceNotice ??= "待发送";}
      if(command.reason==="老师缺席")l.teacherAttendance=["缺席"];
      l.autoSettlementPaused=true;
      break;
    }
    case "lesson.notice": {
      const l=lesson(command.id);if(!l.absenceNotice)throw new Error("没有缺席通知");
      l.absenceNotice=command.sent?"已送达":"发送失败";l.noticeError=command.error;break;
    }
    case "lesson.cancel": {
      const l = lesson(command.id);
      if (l.status === "已取消") throw new Error("这节课已经取消");
      if (!command.reason.trim()) throw new Error("请选择取消原因");
      if(command.kind){
        const at=command.cancelledAt || recordedAt;
        const lead=(Date.parse(l.date+"T"+l.time+":00+08:00")-Date.parse(at))/60000;
        if(!Number.isFinite(lead))throw new Error("取消时间无效");
        l.cancellation={kind:command.kind,at,responsibility:command.responsibility,waived:!!command.waived};
        if(command.responsibility==="学员" && command.kind==="学员请假"){
          const charge=lead<180 && !command.waived;
          deduct(l,charge,l.plannedUnits ?? scheduleUnits(l.duration));
        } else if(["教材错误或重复","老师缺席","已核实网络故障"].includes(command.kind) || command.responsibility==="老师"){
          if(l.deducted)deduct(l,false);
        }
      }
      l.status = "已取消";
      l.note = `${command.responsibility}原因：${command.reason}`;
      addTask({
        studentId: l.studentId,
        title: "核实取消课程课时",
        sourceType: "lesson",
        sourceId: l.id,
        lessonIds: [l.id],
        note: `${l.date} ${l.time}：${l.note}。请核实是否扣课，当前余额未改变。`,
      });
      event("取消课程", l.note, l.studentId, l.teacherId, {
        relatedType: "lesson",
        relatedId: l.id,
      });
      message = "本地课程已取消，余额保持不变，扣课处理已生成核实待办";
      break;
    }
    case "lesson.changeTeacher": {
      const s = student(command.studentId);
      if (["停课", "结课", "退费"].includes(s.status))
        throw new Error("请先办理复课，再更换老师");
      const t = teacher(command.teacherId);
      if (s.age != null && s.age < 16 && !t.categories.includes("少儿"))
        throw new Error("这位老师不接受少儿课程，请选择其他老师");
      if (!isScheduleDate(command.from))
        throw new Error("请选择有效的换师日期");
      if (t.status === "已离职") throw new Error("老师已离职");
      if (data.rules.trainingRequired && !t.trained)
        throw new Error("老师尚未完成必修培训");
      const future = data.lessons.filter(
        (l) =>
          l.studentId === s.id &&
          l.date >= command.from &&
          l.status === "未开始",
      );
      const outsideLessons = future.filter(
        (l) => !isRegularTime(t, l.date, l.time, l.duration),
      );
      if (outsideLessons.some((l) => l.kind === "固定课"))
        throw new Error(
          "新老师的常规时间无法覆盖固定课，请先调整可用时间，或逐节安排临时代课",
        );
      if (future.length)
        requireTeacherConfirmation(
          t,
          outsideLessons.length > 0,
          command.confirmedTeacher,
        );
      for (const l of future) {
        const reasons = isAvailable(
          data,
          t.id,
          l.date,
          l.time,
          l.duration,
          s.id,
          l.id,
          l.kind === "临时课" && command.confirmedTeacher === true,
        );
        if (reasons.length)
          throw new Error(`${l.date} ${l.time}：${reasons[0]}`);
      }
      future.forEach((l) => {
        l.teacherId = t.id;
        l.conflict = false;
        if (
          command.confirmedTeacher &&
          (t.needConfirm || !isRegularTime(t, l.date, l.time, l.duration))
        )
          l.confirmation = confirmation(command.confirmationNote);
        else delete l.confirmation;
        l.note = `更换老师：${command.reason}`;
      });
      s.teacherChanges.push({
        id: id(),
        date: command.from,
        fromTeacher:
          data.teachers.find((item) => item.id === s.teacherId)?.name ||
          s.teacherName,
        toTeacher: t.name,
        reason: command.reason,
      });
      s.teacherId = t.id;
      s.teacherName = t.name;
      event(
        "换老师",
        `由 ${t.name} 接手 ${future.length} 节课，${command.reason}`,
        s.id,
        t.id,
      );
      message = `已更换老师，更新 ${future.length} 节课`;
      break;
    }
    case "lesson.resolve": {
      if (!command.ids.length) throw new Error("请选择需要确认的课程");
      for (const lessonId of command.ids) {
        const l = lesson(lessonId);
        if (l.status !== "待确认")
          throw new Error("这节课已经处理，请刷新后查看");
        if (l.attendance === "账号待关联") throw new Error("请先关联学员账号");
        if (command.decision === "不扣" && !command.reason.trim())
          throw new Error("请填写不扣课时的原因");
        deduct(l, command.decision !== "不扣", command.units);
        l.status = "已完成";
        if (command.decision === "缺席") {
          l.attendance = "学员缺席";
          l.studentAttendance = ["缺席"];
          l.absenceNotice ??= "待发送";
        }
        l.note = command.reason;
        const s = student(l.studentId);
        if (s.status === "待排课") s.status = "在读";
        s.lastLesson = l.date;
        event(
          "确认上课",
          `${l.date} ${l.time} · ${command.decision}`,
          l.studentId,
          l.teacherId,
          { relatedType: "lesson", relatedId: l.id },
        );
      }
      message = `已确认 ${command.ids.length} 节课`;
      break;
    }
    case "lesson.correct": {
      const l = lesson(command.id);
      if (!command.reason.trim()) throw new Error("请填写更正原因");
      if (
        (command.attendance !== undefined || command.result !== undefined) &&
        !["已完成", "缺席"].includes(l.status)
      )
        throw new Error("仅能更正已结束课程的结果和出勤，请先完成课后确认");
      const previous = {
        status: l.status,
        attendance: l.attendance,
        units: l.deducted ? l.confirmedUnits : 0,
      };
      deduct(l, command.deduct, command.units);
      if (
        command.attendance !== undefined &&
        command.attendance !== l.attendance
      ) {
        l.attendance = command.attendance;
        delete l.teacherAttendance;
      }
      if (command.result !== undefined) l.status = command.result;
      const changes = [
        previous.status !== l.status
          ? `课程结果 ${previous.status} → ${l.status}`
          : "",
        previous.attendance !== l.attendance
          ? `出勤 ${previous.attendance} → ${l.attendance}`
          : "",
        previous.units !== (l.deducted ? l.confirmedUnits : 0)
          ? `扣课 ${previous.units ?? "未记录"} → ${l.deducted ? l.confirmedUnits : 0} 课时`
          : "",
      ].filter(Boolean);
      l.note = `更正：${command.reason}${changes.length ? `；${changes.join("；")}` : ""}`;
      event("更正结果", l.note, l.studentId, l.teacherId, {
        relatedType: "lesson",
        relatedId: l.id,
      });
      message = "已更正上课结果和课时流水";
      break;
    }
    case "lesson.link": {
      const l = lesson(command.id);
      student(command.studentId);
      l.studentId = command.studentId;
      l.attendance = "正常";
      event(
        "关联账号",
        "已关联学员，可继续确认这节课",
        l.studentId,
        l.teacherId,
      );
      message = "账号已关联";
      break;
    }
    case "lesson.retry": {
      const l = lesson(command.id);
      l.sync = "已同步";
      l.syncReason = "";
      event("更新课程", "课程已更新到 ClassIn", l.studentId, l.teacherId);
      message = "课程已更新";
      break;
    }
    case "feedback.create": {
      const input = command.feedback;
      const learner = student(input.studentId);
      const tutor = teacher(input.teacherId);
      const fields = details(
        "categories" in input
          ? input
          : {
              studentId: input.studentId,
              teacherId: input.teacherId,
              lessonId: input.lessonId,
              date: DEMO_TODAY,
              owner: learner.owner,
              source: learner.project,
              teacherName: tutor.name,
              so: tutor.so,
              stage: "",
              grade: "",
              categories: input.category ? [input.category] : [],
              rating: input.rating,
              content: input.content,
              screenshots: [],
            },
      );
      const repeat =
        fields.rating === "差评" &&
        data.feedback.some(
          (record) =>
            record.studentId === fields.studentId &&
            record.teacherId === fields.teacherId &&
            record.rating === "差评" &&
            record.date >= addDays(fields.date, -7) &&
            record.date <= fields.date,
        );
      const record = feedbackSchema.parse({
        ...fields,
        id: `FB-${id()}`,
        category: fields.categories[0] || "",
        status: fields.rating === "好评" ? "已完成" : "待处理",
        processNote: "",
        verdict: "",
        measures: [],
        repeat,
      });
      followUp(record, "反馈资料", "登记反馈");
      data.feedback.unshift(record);
      event("登记反馈", record.content, record.studentId, record.teacherId, {
        relatedType: "feedback",
        relatedId: record.id,
      });
      if (record.status !== "已完成")
        addTask({
          studentId: learner.id,
          title: "跟进学生反馈",
          owner: fields.owner,
          note: record.content,
          sourceType: "feedback",
          sourceId: record.id,
          lessonIds: record.lessonId ? [record.lessonId] : [],
        });
      message = "反馈已登记";
      break;
    }
    case "feedback.edit": {
      const record = feedback(command.id);
      const fields = details(command.feedback);
      const labels: Record<keyof FeedbackDetailsInput, string> = {
        studentId: "学员",
        teacherId: "老师",
        lessonId: "关联课程",
        date: "反馈日期",
        owner: "教务",
        source: "项目／渠道",
        teacherName: "老师名字",
        so: "SO",
        stage: "反馈阶段",
        grade: "反馈等级",
        categories: "问题分类",
        rating: "评价分类",
        content: "学员反馈（原话）",
        screenshots: "截图",
      };
      const fieldsToCompare = [
        "studentId",
        "teacherId",
        "lessonId",
        "date",
        "owner",
        "source",
        "teacherName",
        "so",
        "stage",
        "grade",
        "categories",
        "rating",
        "content",
        "screenshots",
      ] satisfies (keyof FeedbackDetailsInput)[];
      const changes = fieldsToCompare
        .filter(
          (field) =>
            JSON.stringify(record[field]) !== JSON.stringify(fields[field]),
        )
        .map((field) => labels[field]);
      Object.assign(record, fields, { category: fields.categories[0] || "" });
      record.repeat =
        fields.rating === "差评" &&
        data.feedback.some(
          (other) =>
            other.id !== record.id &&
            other.studentId === fields.studentId &&
            other.teacherId === fields.teacherId &&
            other.rating === "差评" &&
            other.date >= addDays(fields.date, -7) &&
            other.date <= fields.date,
        );
      if (changes.length)
        followUp(record, "反馈资料", `更新：${changes.join("、")}`);
      message = "反馈资料已保存";
      break;
    }
    case "feedback.customer": {
      const record = feedback(command.id);
      const progresses = [
        "",
        "未处理",
        "处理中",
        "已处理",
        "待TM判定",
        "待回访",
        "已完成",
      ];
      if (!progresses.includes(command.progress))
        throw new Error("请选择有效的客服处理进度");
      const changes = [
        {
          field: "处理进度",
          before: record.customerProgress,
          after: command.progress,
        },
        {
          field: "处理结果",
          before: record.customerResult,
          after: command.result,
        },
        { field: "客服备注", before: record.processNote, after: command.note },
      ].filter((change) => change.before !== change.after);
      if (!changes.length) {
        message = "内容没有变化";
        break;
      }
      record.customerProgress = command.progress;
      record.customerResult = command.result;
      record.processNote = command.note;
      record.status =
        command.progress === ""
          ? record.status
          : command.progress === "已完成"
            ? "已完成"
            : command.progress === "待TM判定"
              ? "等待判定"
              : ["处理中", "已处理", "待回访"].includes(command.progress)
                ? "处理中"
                : "待处理";
      followUp(
        record,
        "客服处理",
        changes
          .map(
            (change) =>
              `${change.field}：${change.before || "未填写"} → ${change.after || "未填写"}`,
          )
          .join("\n"),
        changes,
      );
      message = "客服处理信息已保存";
      break;
    }
    case "feedback.tm": {
      const record = feedback(command.id);
      if (
        command.date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(command.date) ||
          !Number.isFinite(
            new Date(`${command.date}T12:00:00+08:00`).getTime(),
          ) ||
          new Date(`${command.date}T12:00:00+08:00`)
            .toISOString()
            .slice(0, 10) !== command.date)
      )
        throw new Error("TM处理日期无效");
      const changes = [
        {
          field: "客服&TM判定结果",
          before: record.jointVerdict,
          after: command.jointVerdict,
        },
        { field: "TM判定", before: record.tmResult, after: command.result },
        { field: "TM处理日期", before: record.tmDate, after: command.date },
        { field: "TM跟进", before: record.tmNote, after: command.note },
      ].filter((change) => change.before !== change.after);
      if (!changes.length) {
        message = "内容没有变化";
        break;
      }
      record.jointVerdict = command.jointVerdict;
      record.tmResult = command.result;
      record.tmDate = command.date;
      record.tmNote = command.note;
      followUp(
        record,
        "TM跟进",
        changes
          .map(
            (change) =>
              `${change.field}：${change.before || "未填写"} → ${change.after || "未填写"}`,
          )
          .join("\n"),
        changes,
      );
      message = "TM判定与跟进已保存";
      break;
    }
    case "feedback.followUp": {
      const record = feedback(command.id);
      if (!command.content.trim()) throw new Error("请填写跟进内容");
      followUp(record, command.section, command.content.trim());
      message = "跟进记录已添加";
      break;
    }
    case "feedback.measures": {
      const record = feedback(command.id);
      addMeasures(record, command);
      message = "处理措施已添加";
      break;
    }
    case "feedback.process": {
      const f = required(
        data.feedback.find((f) => f.id === command.id),
        "找不到这条反馈",
      );
      if (!command.note.trim()) throw new Error("请填写处理说明");
      if (f.status === "已完成") throw new Error("这条反馈已完成");
      f.processNote = command.note;
      f.status = command.complete ? "已完成" : "等待判定";
      event("处理反馈", command.note, f.studentId, f.teacherId);
      message = command.complete ? "反馈已完成" : "已提交责任判定";
      break;
    }
    case "feedback.verdict": {
      const f = required(
        data.feedback.find((f) => f.id === command.id),
        "找不到这条反馈",
      );
      if (!command.note.trim()) throw new Error("请填写跟进说明");
      if (f.status === "已完成") throw new Error("这条反馈已完成判定");
      if (command.amount < 0) throw new Error("扣款金额不能为负数");
      f.verdict = command.verdict;
      f.measures = command.measures;
      f.status = "已完成";
      for (const measure of command.measures) {
        if (
          measure === "扣款" &&
          !command.separateDeduction &&
          data.actions.some(
            (a) =>
              a.teacherId === f.teacherId &&
              a.date === f.date &&
              a.type === "扣款" &&
              a.status !== "已作废",
          )
        )
          continue;
        data.actions.unshift({
          id: id(),
          teacherId: f.teacherId,
          feedbackId: f.id,
          date: f.date,
          type: measure,
          amount: measure === "扣款" ? command.amount : 0,
          reason: command.note,
          status: command.deductionConfirmed ? "已确认" : "待确认",
        });
      }
      event(
        "责任判定",
        `${command.verdict}，${command.note}`,
        f.studentId,
        f.teacherId,
      );
      message = "责任判定已完成，处理措施已记录";
      break;
    }
    case "action.confirm": {
      const a = required(
        data.actions.find((a) => a.id === command.id),
        "找不到这条措施",
      );
      a.status = command.approve ? "已确认" : "已作废";
      message = command.approve ? "扣款已确认，已计入当月薪资" : "扣款已作废";
      event("确认处理措施", message, "", a.teacherId);
      break;
    }
    case "teacher.save": {
      if (!command.teacher.name.trim()) throw new Error("请填写老师姓名");
      const parsedTeacher = teacherSchema.safeParse(command.teacher);
      if (!parsedTeacher.success)
        throw new Error("请检查老师资料与可用时间，时间需填写到分钟");
      parsedTeacher.data.availability.sort(
        (a, b) =>
          ((a.day + 6) % 7) - ((b.day + 6) % 7) ||
          a.start.localeCompare(b.start),
      );
      const scheduleError = availabilityError(parsedTeacher.data);
      if (scheduleError) throw new Error(scheduleError);
      const found = data.teachers.find((t) => t.id === command.teacher.id);
      const beforeSchedule = found
        ? JSON.stringify([
            found.availability,
            found.availabilityFrom,
            found.availabilitySource,
          ])
        : "";
      if (found) Object.assign(found, parsedTeacher.data);
      else data.teachers.push(parsedTeacher.data);
      for (const l of data.lessons.filter(
        (l) =>
          l.teacherId === command.teacher.id &&
          l.date >= DEMO_TODAY &&
          l.status === "未开始",
      ))
        l.conflict =
          isAvailable(
            data,
            l.teacherId,
            l.date,
            l.time,
            l.duration,
            l.studentId,
            l.id,
            l.kind === "临时课" && !!l.confirmation,
          ).length > 0;
      const afterSchedule = JSON.stringify([
        parsedTeacher.data.availability,
        parsedTeacher.data.availabilityFrom,
        parsedTeacher.data.availabilitySource,
      ]);
      if (beforeSchedule && beforeSchedule !== afterSchedule) {
        const impacted = data.lessons.filter(
          (item) =>
            item.teacherId === command.teacher.id &&
            item.date >= DEMO_TODAY &&
            item.status === "未开始" &&
            item.conflict,
        );
        teacherTasks(
          parsedTeacher.data,
          impacted,
          "调整可上课时间",
          `availability:${command.teacher.id}:${afterSchedule}`,
        );
      }
      event("修改老师", "更新老师资料与可上课时间", "", command.teacher.id);
      break;
    }
    case "leave.request":
    case "teacher.leave": {
      const info = command.type === "leave.request" ? command.leave : command;
      const t = teacher(info.teacherId);
      if (!info.start || !info.end || info.end < info.start || !info.reason.trim()) throw new Error("请检查请假起止时间和原因");
      if (data.leaves.some(l=>l.teacherId===t.id && l.start===info.start && l.end===info.end && l.status==="已登记")) {message="请假已登记";break;}
      const impacted = data.lessons.filter(l=>l.teacherId===t.id && l.status==="未开始" && overlapsLeave(l.date,l.time,l.duration,info.start,info.end));
      data.leaves.push({id:id(),teacherId:t.id,start:info.start,end:info.end,reason:info.reason,status:"已登记"});
      teacherTasks(t,impacted,"请假，需要核对课程",`leave:${t.id}:${info.start}:${info.end}`);
      impacted.forEach(l=>{l.leaveFlag=true;});
      event("老师请假",`${info.start} 至 ${info.end}，涉及 ${impacted.length} 节已排课`,"",t.id);
      message=`请假已登记，${impacted.length} 节课由教务跟进`;
      break;
    }
    case "teacher.offboard": {
      const t = teacher(command.teacherId);
      if (t.name !== command.confirmName)
        throw new Error("请输入完整老师姓名确认");
      const impacted = data.lessons.filter(
        (item) =>
          item.teacherId === t.id &&
          item.date >= DEMO_TODAY &&
          item.status === "未开始",
      );
      teacherTasks(t, impacted, "离职，需要重新安排", `offboard:${t.id}`);
      t.status = "已离职";
      impacted.forEach((item) => {
        item.status = "已取消";
        item.note = "老师离职，不扣学员课时";
      });
      event("老师离职", command.reason, "", t.id);
      message = "已办理离职，未来课程已取消";
      break;
    }
    case "pay.terms": {
      const t=payTermsSchema.parse(command.terms);teacher(t.teacherId);
      if(data.settlements?.some(p=>p.teacherId===t.teacherId && p.month===t.month))throw new Error("本周期已确认");
      if((t.teacherAdjustment || t.soAdjustment) && !t.adjustmentNote.trim())throw new Error("请填写调整依据");
      for(const c of t.confirmed)if(!isScheduleDate(c.date)||!c.date.startsWith(t.month)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time) || minutes(c.time)+c.minutes>1440)throw new Error("请核对确认课表");
      if(t.confirmed.some((a,i)=>t.confirmed.slice(i+1).some(b=>a.date===b.date && minutes(a.time)<minutes(b.time)+b.minutes && minutes(b.time)<minutes(a.time)+a.minutes)))throw new Error("确认课表时段重复");
      data.payTerms=[...(data.payTerms||[]).filter(p=>p.teacherId!==t.teacherId || p.month!==t.month),t];break;
    }
    case "pay.freeze": {
      const t=required(data.payTerms?.find(p=>p.teacherId===command.teacherId && p.month===command.month),"请先登记计薪条件");
      if(data.settlements?.some(p=>p.teacherId===t.teacherId && p.month===t.month))break;
      const lines=officePay(data,t);if(!lines.length || lines.some(r=>r.teacher===null || r.office===null))throw new Error("没有可确认明细或仍有待核金额");
      (data.settlements??=[]).push({teacherId:t.teacherId,month:t.month,so:t.so,at:recordedAt,lines});break;
    }
    case "payroll.adjust": {
      const p = required(
        data.payroll.find((p) => p.id === command.id),
        "找不到工资单",
      );
      if (p.status !== "待确认")
        throw new Error("已确认的薪资不能修改，请在下个月调整");
      if (!Number.isFinite(command.amount) || !command.note.trim())
        throw new Error("请填写有效金额和调整原因");
      p.adjustment += command.amount;
      p.adjustmentNote = command.note;
      event("薪资调整", `${command.amount}，${command.note}`, "", p.teacherId);
      message = "薪资调整已记录";
      break;
    }
    case "payroll.status": {
      if (!command.ids.length) throw new Error("请先选择老师");
      for (const payId of command.ids) {
        const p = required(
          data.payroll.find((p) => p.id === payId),
          "找不到工资单",
        );
        if (command.status === "已确认" && p.status !== "待确认")
          throw new Error("只能确认待确认的工资单");
        if (command.status === "已发放" && p.status !== "已确认")
          throw new Error("请先确认薪资，再标记发放");
        if (
          command.status === "已确认" &&
          data.actions.some(
            (a) => a.teacherId === p.teacherId && a.status === "待确认",
          )
        )
          throw new Error("请先处理这位老师的待确认扣款");
        if (command.status === "已确认") {
          const breakdown = payrollBreakdown(data, p.id);
          p.breakdownSnapshot = { ...breakdown, frozen: true };
          p.lessons = breakdown.units;
          p.snapshot = {
            base: breakdown.base,
            deductions: breakdown.deductions,
            total: breakdown.total,
          };
        }
        p.status = command.status;
        event(
          command.status,
          `${p.month} 薪资${command.status}`,
          "",
          p.teacherId,
        );
      }
      message = `${command.ids.length} 位老师薪资${command.status}`;
      break;
    }
    case "role.save": {
      if (command.role.id === "admin")
        throw new Error("超级管理员角色不能修改");
      if (!command.role.name.trim()) throw new Error("请填写角色名称");
      const r = data.roles.find((r) => r.id === command.role.id);
      if (r) Object.assign(r, command.role);
      else data.roles.push(command.role);
      event("修改权限", `更新角色 ${command.role.name}`);
      break;
    }
    case "role.delete": {
      if (
        command.id === "admin" ||
        data.accounts.some((a) => a.roleId === command.id)
      )
        throw new Error("这个角色仍有账号使用，不能删除");
      data.roles = data.roles.filter((r) => r.id !== command.id);
      message = "角色已删除";
      break;
    }
    case "account.save": {
      if (!!command.account.team !== !!command.account.group?.trim()) throw new Error("队伍与队内组别需一起填写");
      if (["本队", "本组"].includes(command.account.scope) && !command.account.team) throw new Error("请先分配队伍与组别");
      const a = data.accounts.find((a) => a.id === command.account.id);
      if (
        command.account.id === "u1" &&
        (!command.account.enabled || command.account.roleId !== "admin")
      )
        throw new Error("不能停用最后一个超级管理员");
      if (a && !command.account.enabled) {
        const owned = data.students.filter((s) => s.owner === a.name);
        const feedback = data.feedback.filter(
          (f) => f.owner === a.name && f.status !== "已完成",
        );
        if ((owned.length || feedback.length) && !command.handoverTo)
          throw new Error("请先选择接手人，转交负责的学员和反馈");
        owned.forEach((s) => (s.owner = command.handoverTo || s.owner));
        feedback.forEach((f) => (f.owner = command.handoverTo || f.owner));
      }
      if (a) Object.assign(a, command.account);
      else data.accounts.push(command.account);
      event("管理账号", `更新账号 ${command.account.name}`);
      break;
    }
    case "feedback-category.delete": {
      const error = feedbackCategoryDeletionError(data, command.id);
      if (error) throw new Error(error);
      const entry = data.catalog.find((item) => item.id === command.id);
      data.catalog = data.catalog.filter((item) => item.id !== command.id);
      event("删除反馈分类", `删除分类：${entry?.name}`);
      message = "分类已删除";
      break;
    }
    case "catalog.save": {
      if (!command.entry.name.trim()) throw new Error("请填写名称");
      if (
        !command.entry.enabled &&
        command.entry.type === "SO" &&
        data.teachers.some(
          (t) => t.so === command.entry.name && t.status !== "已离职",
        )
      )
        throw new Error("仍有在职老师使用这个 SO，不能停用");
      const incoming = {...command.entry};
      const previous = data.catalog.find(item => item.id === incoming.id);
      if (previous && incoming.type !== previous.type) throw new Error("已创建的资料不能更换类型");
      if (incoming.type === "项目" && incoming.enabled) {
        const channel = data.catalog.find(item => item.type === "渠道" && item.id === incoming.parentId && item.enabled);
        if (!channel) throw new Error("请选择启用的所属渠道");
        if (!Number.isInteger(incoming.monthlyLessons) || (incoming.monthlyLessons ?? 0) <= 0)
          throw new Error("请填写正整数月应上课数");
      }
      if(previous && incoming.type==="渠道" && incoming.name!==previous.name)
        for(const s of data.students)if(s.channel===previous.name)s.channel=incoming.name;
      if(previous?.type==="项目" && previous.parentId && (previous.name!==incoming.name || previous.parentId!==incoming.parentId)){
        const oldChannel=data.catalog.find(c=>c.id===previous.parentId)?.name;
        const newChannel=data.catalog.find(c=>c.id===incoming.parentId)?.name;
        for(const s of data.students)if(s.channel===oldChannel && s.project===previous.name){s.project=incoming.name;s.channel=newChannel||s.channel;}
      }
      if (incoming.type === "项目" && incoming.monthlyLessons && incoming.monthlyLessons !== previous?.monthlyLessons) {
        incoming.targetHistory = [...(previous?.targetHistory || []),
          { at: recordedAt, lessons: incoming.monthlyLessons, operator: command.operator || "教务" }];
      }
      if (incoming.type === "项目" || incoming.type === "渠道") {
        if (data.catalog.some(item => item.id !== incoming.id && item.type === incoming.type &&
          item.name.trim() === incoming.name.trim() && (incoming.type === "渠道" || item.parentId === incoming.parentId)))
          throw new Error("该归属下已有同名记录");
        if (!incoming.enabled && incoming.type === "渠道" && data.catalog.some(item => item.type === "项目" && item.enabled && item.parentId === incoming.id))
          throw new Error("请先调整该渠道下的启用项目");
      }
      if (command.entry.type === "反馈分类") {
        data.catalog = saveFeedbackCategory(data.catalog, command.entry);
      } else {
        const entry = data.catalog.find((e) => e.id === command.entry.id);
        if (entry) Object.assign(entry, incoming);
        else data.catalog.push(incoming);
      }
      event("基础资料", `更新${command.entry.type}：${command.entry.name}`);
      break;
    }
    case "rules.save": {
      if (command.rules.lowBalance < 0) throw new Error("请填写有效阈值");
      data.rules = command.rules;
      event("业务规则", "更新业务规则与提醒阈值");
      break;
    }
    case "connection.save": {
      if (!command.sid.trim() || command.secret.length < 6)
        throw new Error("请填写机构 SID 和至少 6 位密钥");
      data.connection = "正常";
      event("课程连接", "更新机构连接，密钥不保存到演示数据");
      message = "连接设置已保存";
      break;
    }
    case "report.correct": {
      const report = required(
        data.reports.find((item) => item.id === command.id),
        "找不到这条课后记录",
      );
      if (!command.reason.trim()) throw new Error("请填写更正原因");
      if (!command.material.trim() || !command.to.trim())
        throw new Error("请填写教材和结束页码或章节");
      const before = `${formatMaterialProgress(report.material, report.from)} → ${formatStudentProgress(report.to)}`;
      report.material = command.material.trim();
      report.from = command.from.trim();
      report.to = command.to.trim();
      report.recordedAt = recordedAt;
      const latest = data.reports
        .filter((item) => item.studentId === report.studentId)
        .sort((a, b) => {
          const al = lesson(a.lessonId),
            bl = lesson(b.lessonId);
          return (bl.date + bl.time).localeCompare(al.date + al.time);
        })[0];
      if (latest) {
        student(report.studentId).material = latest.material;
        student(report.studentId).unit = latest.to;
      }
      event(
        "更正教材进度",
        `${before} 更正为 ${formatMaterialProgress(report.material, report.from)} → ${formatStudentProgress(report.to)}；${command.reason.trim()}`,
        report.studentId,
        report.teacherId,
        { relatedType: "lesson", relatedId: report.lessonId },
      );
      break;
    }
    case "report.save": {
      const l = lesson(command.report.lessonId);
      if (!canSubmitLessonReport(l))
        throw new Error(
          "仅能为已结束且待确认、已完成或缺席的课程提交进度，未来或未开始课程不能提前结课",
        );
      if (command.report.teacherId !== l.teacherId)
        throw new Error("只能为自己的课程结课");
      if (command.report.studentId !== l.studentId)
        throw new Error("教学进度与课程学生不一致");
      if (l.requiresScreenshot && !command.report.screenshot) throw new Error("请上传本节课结束页截图");
      if(command.report.screenshot && !/^data:image\/(png|jpeg|webp);base64,/.test(command.report.screenshot))throw new Error("截图格式无效");
      if (!command.report.material.trim() || !command.report.to.trim())
        throw new Error("请填写教材及结束页码或章节");
      const r = data.reports.find((r) => r.lessonId === l.id);
      if (r) Object.assign(r, command.report, { recordedAt });
      else data.reports.push({ ...command.report, id: id(), recordedAt });
      if(command.report.screenshot && !l.incident && ["待确认","未开始"].includes(l.status) && l.attendance==="正常") {
        deduct(l,true,l.confirmedUnits ?? l.plannedUnits ?? scheduleUnits(l.duration));
        l.status="已完成";student(l.studentId).lastLesson=l.date;
      }
      const latest = data.reports
        .filter((item) => item.studentId === l.studentId)
        .sort((a, b) => {
          const aLesson = lesson(a.lessonId),
            bLesson = lesson(b.lessonId);
          return (bLesson.date + bLesson.time).localeCompare(
            aLesson.date + aLesson.time,
          );
        })[0];
      if (latest) {
        student(l.studentId).unit = latest.to;
        student(l.studentId).material = latest.material;
      }
      event(
        "课后记录",
        `${formatMaterialProgress(command.report.material, command.report.to)}`,
        l.studentId,
        l.teacherId,
        { relatedType: "lesson", relatedId: l.id },
      );
      message = "Lesson closed";
      break;
    }
    case "leave.review": {
      const leave = required(
        data.leaves.find((l) => l.id === command.id),
        "找不到这条申请",
      );
      if(leave.status !== "待审批")throw new Error("该请假记录无需审批");
      leave.status = command.approve ? "已通过" : "已驳回";
      if (command.approve) {
        const t = teacher(leave.teacherId);
        const impacted = data.lessons.filter(
          (item) =>
            item.teacherId === t.id &&
            item.status === "未开始" &&
            overlapsLeave(
              item.date,
              item.time,
              item.duration,
              leave.start,
              leave.end,
            ),
        );
        impacted.forEach((item) => {
          item.leaveFlag = true;
        });
        teacherTasks(
          t,
          impacted,
          "请假，需要核对课程",
          `leave:${t.id}:${leave.start}:${leave.end}`,
        );
      }
      message = command.approve ? "请假已通过" : "申请已驳回";
      break;
    }
    case "language.set":
      data.language = command.language;
      break;
    default: {
      const exhaustive: never = command;
      throw new Error(`Unsupported command ${exhaustive}`);
    }
  }
  data.catalog = trackFeedbackCategoryUsage(data);
  data.revision++;
  return { data, message };
}

export function overlapsLeave(
  date: string,
  time: string,
  duration: number,
  start: string,
  end: string,
) {
  const normalize = (value: string, endOfDay = false) =>
    value.length === 10
      ? `${value}T${endOfDay ? "23:59" : "00:00"}`
      : value.replace(" ", "T").slice(0, 16);
  const a = new Date(`${date}T${time}:00+08:00`).getTime();
  const b = a + duration * 60000;
  const from = new Date(normalize(start) + ":00+08:00").getTime();
  const to = new Date(normalize(end, true) + ":00+08:00").getTime();
  return a < to && from < b;
}
