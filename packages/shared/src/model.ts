import { z } from "zod";
export const scheduleIntentSchema = z
  .object({
    mode: z.enum(["fixed", "flex"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weeks: z.number().int().min(1).max(52),
    duration: z
      .number()
      .refine(
        (value) => [25, 50, 55, 120].includes(value),
        "请选择可用的上课时长",
      ),
    frequency: z.number().int().min(1).max(14),
    windows: z.array(
      z.object({
        day: z.number().int().min(0).max(6),
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }),
    ),
  })
  .refine((value) => value.mode === "flex" || value.windows.length > 0, {
    message: "请选择固定上课意向时间",
    path: ["windows"],
  });
export type ScheduleIntent = z.infer<typeof scheduleIntentSchema>;
const surveyAnswers = z.object({age:z.number().int().min(1).max(120),level:z.enum(["L0","L1","L2","L3","L4","待评估"]),personality:z.string(),interests:z.string(),experience:z.string(),material:z.string(),times:z.string(),needs:z.string()});
export const studentSurveyAnswers = surveyAnswers;
export const studentSchema = z.object({
  id: z.string(),
  surveySecret:z.string().optional(), surveyToken:z.string().optional(),surveySubmittedAt:z.string().optional(), surveyOriginal:surveyAnswers.optional(), interests:z.string().optional(),
  code: z.string(),
  name: z.string(),
  chineseName: z.string(),
  age: z.number().int().min(0).max(120).nullable().default(null),
  project: z.string(),
  channel: z.string(),
  owner: z.string(),
  phone: z.string(),
  status: z.enum(["待排课", "在读", "停课", "结课", "退费"]),
  level: z.string(),
  material: z.string(),
  unit: z.string(),
  teacherId: z.string(),
  balance: z.number(),
  preferences: z.string(),
  scheduleIntent: scheduleIntentSchema.nullable().optional(),
  goal: z.string(),
  createdAt: z.string(),
  lastLesson: z.string(),
  ageText: z.string().default(""),
  historyStartDate: z.string().optional(),
  sourceSequence: z.string().default(""),
  groupName: z.string().default(""),
  orderStatus: z.string().default(""),
  purchaseDate: z.string().default(""),
  teacherName: z.string().default(""),
  scheduleText: z.string().default(""),
  frequencyText: z.string().default(""),
  firstLessonDate: z.string().default(""),
  gender: z.string().default(""),
  personality: z.string().default(""),
  foreignTeacherExperience: z.string().default(""),
  renewalStatus: z.string().default(""),
  legacyComplaints: z.string().default(""),
  legacyCompensations: z.string().default(""),
  legacyMissed: z.string().default(""),
  originalTeacher: z.string().default(""),
  firstChangedTeacher: z.string().default(""),
  secondChangedTeacher: z.string().default(""),
  totalUnits: z.number().nonnegative().nullable().default(null),
  balanceKnown: z.boolean().default(true),
  monthlyRecords: z
    .array(
      z.object({
        id: z.string(),
        month: z.string(),
        planned: z.number().nonnegative().nullable(),
        actual: z.number().nonnegative().nullable(),
        note: z.string(),
      }),
    )
    .default([]),
  teacherChanges: z
    .array(
      z.object({
        id: z.string(),
        date: z.string(),
        fromTeacher: z.string(),
        toTeacher: z.string(),
        reason: z.string(),
      }),
    )
    .default([]),
  serviceStopResults: z
    .array(
      z.object({
        step: z.string(),
        status: z.string(),
        detail: z.string(),
      }),
    )
    .default([]),
});
export const studentProfileSchema = studentSchema
  .omit({
    id: true, surveySecret:true,surveyToken:true,surveySubmittedAt:true,surveyOriginal:true,
    scheduleIntent: true,
    balance: true,
    createdAt: true,
    lastLesson: true,
    teacherChanges: true,
    balanceKnown: true,
    serviceStopResults: true,
  })
  .extend({
    importStudentId: z.string().optional(),
    code: z.string().trim().default(""),
    name: z.string().trim().min(1, "请填写学员姓名"),
    phone: z
      .string()
      .refine(
        (value) => value === "" || /^1\d{10}$/.test(value),
        "手机号需为 11 位，暂未提供可留空",
      ),
  });
export const studentEditableSchema = studentProfileSchema.pick({
  name: true,
  groupName: true,
  phone: true,
  age: true,
  ageText: true,
  gender: true,
  level: true, interests:true,
  project: true,
  channel: true,
  owner: true,
  personality: true,
  foreignTeacherExperience: true,
  preferences: true,
  material: true,
  unit: true,
});
export type StudentEditableInput = z.infer<typeof studentEditableSchema>;
export const studentHistorySchema = studentProfileSchema.pick({
  historyStartDate: true,
  sourceSequence: true,
  purchaseDate: true,
  totalUnits: true,
  renewalStatus: true,
  scheduleText: true,
  frequencyText: true,
  firstLessonDate: true,
  legacyComplaints: true,
  legacyCompensations: true,
  legacyMissed: true,
  originalTeacher: true,
  firstChangedTeacher: true,
  secondChangedTeacher: true,
  monthlyRecords: true,
});
export type StudentHistoryInput = z.infer<typeof studentHistorySchema>;
export type StudentProfileInput = z.infer<typeof studentProfileSchema>;
export function emptyStudentProfile(): StudentProfileInput {
  return {
    code: "",
    name: "",
    chineseName: "",
    age: null,
    project: "",
    channel: "",
    owner: "",
    phone: "",
    status: "待排课",
    level: "",
    material: "",
    unit: "",
    teacherId: "",
    preferences: "",
    goal: "",
    ageText: "",
    sourceSequence: "",
    groupName: "",
    orderStatus: "",
    purchaseDate: "",
    teacherName: "",
    scheduleText: "",
    frequencyText: "",
    firstLessonDate: "",
    gender: "",
    personality: "",
    foreignTeacherExperience: "",
    renewalStatus: "",
    legacyComplaints: "",
    legacyCompensations: "",
    legacyMissed: "",
    originalTeacher: "",
    firstChangedTeacher: "",
    secondChangedTeacher: "",
    totalUnits: null,
    monthlyRecords: [],
  };
}
export const availabilitySlotSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/),
});
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;
const legacyAvailabilitySchema = z.object({
  openDays: z.array(z.number().int().min(0).max(6)),
  openStart: z.number().min(0).max(24),
  openEnd: z.number().min(0).max(24),
});
const clockFromHour = (hour: number) => {
  const total = Math.round(hour * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
export const teacherSchema = z.preprocess(
  (value) => {
    const record = z.record(z.unknown()).safeParse(value);
    if (!record.success || "availability" in record.data) return value;
    const old = legacyAvailabilitySchema.safeParse(value);
    if (!old.success) return value;
    return {
      ...record.data,
      availability: old.data.openDays.map((day) => ({
        day,
        start: clockFromHour(old.data.openStart),
        end: clockFromHour(old.data.openEnd),
      })),
      availabilitySource: "legacy",
    };
  },
  z.object({
    id: z.string(),
    name: z.string(),
    so: z.string(),
    tmAccountId: z.string().optional(),
    accent: z.string(),
    level: z.string(),
    categories: z.array(z.string()),
    status: z.enum(["在职", "培训中", "请假中", "已离职"]),
    trained: z.boolean(),
    photos:z.array(z.string()).optional(), introVideo:z.string().optional(),
    photo: z.string().optional(),
    startDate: z.string().optional(),
    certificates: z.string().optional(),
    notes: z.string().optional(),
    quizScore: z.number().min(0).max(100).nullable().optional(),
    newTutorTraining: z
      .enum(["未登记", "未完成", "已完成", "不适用"])
      .optional(),
    rcTraining: z.enum(["未登记", "未完成", "已完成", "不适用"]).optional(),
    titTraining: z.enum(["未登记", "未完成", "已完成", "不适用"]).optional(),
    teacherTraining: z.string().optional(),
    needConfirm: z.boolean(),
    phone: z.string(),
    bio: z.string(),
    rate: z.number(),
    availability: z.array(availabilitySlotSchema).default([]),
    availabilityFrom: z.string().default(""),
    availabilityNote: z.string().default(""),
    availabilitySource: z
      .enum(["legacy", "entered", "reference"])
      .default("entered"),
    tags: z.array(z.string()),
  }),
);
export const lessonSchema = z.object({
  cancellation:z.object({kind:z.string(),at:z.string(),responsibility:z.string(),waived:z.boolean()}).optional(),
  requiresScreenshot:z.boolean().optional(),
  incident:z.object({minutes:z.number().nonnegative().optional(),reason:z.string(),note:z.string(),at:z.string(),operator:z.string()}).optional(),
  absenceNotice:z.enum(["待发送","已送达","发送失败"]).optional(),noticeError:z.string().optional(),
  orderId: z.string().optional(),
  id: z.string(),
  studentId: z.string(),
  teacherId: z.string(),
  scheduleExtra: z.boolean().optional(),
  fixedOrigin: z.object({ date: z.string(), time: z.string() }).optional(),
  date: z.string(),
  time: z.string(),
  duration: z.number(),
  kind: z.enum(["固定课", "临时课"]),
  status: z.enum(["未开始", "待确认", "已完成", "缺席", "已取消"]),
  attendance: z.enum([
    "正常",
    "学员缺席",
    "老师缺席",
    "老师迟到",
    "老师早退",
    "学员迟到",
    "学员早退",
    "无数据",
    "账号待关联",
  ]),
  deducted: z.boolean(),
  autoSettlementPaused: z.boolean().optional(),
  confirmedUnits: z.number().nonnegative().optional(),
  plannedUnits: z.number().positive().finite().optional(),
  sync: z.enum(["已同步", "处理中", "未同步"]),
  syncReason: z.string(),
  material: z.string(),
  note: z.string(),
  teacherAttendance: z
    .array(z.enum(["正常", "迟到", "早退", "缺席", "待核实"]))
    .min(1)
    .refine(
      (tags) =>
        new Set(tags).size === tags.length &&
        (tags.length === 1 ||
          tags.every((tag) => tag === "迟到" || tag === "早退")),
      "老师考勤结果不可重复或相互矛盾",
    )
    .optional(),
  studentAttendance: z
    .array(z.enum(["正常", "迟到", "早退", "缺席", "待核实"]))
    .min(1)
    .refine(
      (tags) =>
        new Set(tags).size === tags.length &&
        (tags.length === 1 ||
          tags.every((tag) => tag === "迟到" || tag === "早退")),
      "学员考勤结果不可重复或相互矛盾",
    )
    .optional(),
  teacherIn: z.string(),
  teacherOut: z.string(),
  studentIn: z.string(),
  studentOut: z.string(),
  leaveFlag: z.boolean(),
  conflict: z.boolean(),
  confirmation: z
    .object({ operator: z.string(), at: z.string(), note: z.string() })
    .optional(),
});
export const feedbackScreenshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  dataUrl: z
    .string()
    .regex(
      /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
      "请上传 PNG、JPEG 或 WebP 图片",
    ),
});
const feedbackScreenshotsSchema = z
  .array(feedbackScreenshotSchema)
  .max(3, "最多上传 3 张截图")
  .refine(
    (items) =>
      items.reduce((size, item) => size + item.dataUrl.length * 0.75, 0) <=
      1024 * 1024,
    "截图总大小不能超过 1 MB",
  );
export const feedbackFollowUpSchema = z.object({
  id: z.string(),
  date: z.string(),
  operator: z.string(),
  section: z.enum(["反馈资料", "客服处理", "TM跟进", "处理措施"]),
  content: z.string(),
  changes: z
    .array(
      z.object({ field: z.string(), before: z.string(), after: z.string() }),
    )
    .optional(),
});
export const feedbackDetailsInputSchema = z.object({
  studentId: z.string().min(1, "请选择学员"),
  teacherId: z.string().min(1, "请选择老师"),
  lessonId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请填写反馈日期"),
  owner: z.string(),
  source: z.string(),
  teacherName: z.string(),
  so: z.string(),
  stage: z.string(),
  grade: z.string(),
  categories: z.array(z.string()).max(8, "最多选择 8 个问题分类"),
  rating: z.enum(["好评", "差评"]),
  content: z.string(),
  screenshots: feedbackScreenshotsSchema,
});
export type FeedbackDetailsInput = z.infer<typeof feedbackDetailsInputSchema>;
export const feedbackSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  teacherId: z.string(),
  lessonId: z.string(),
  date: z.string(),
  rating: z.enum(["好评", "差评"]),
  category: z.string(),
  content: z.string(),
  status: z.enum(["待处理", "处理中", "等待判定", "已完成"]),
  owner: z.string(),
  processNote: z.string(),
  verdict: z.string(),
  measures: z.array(z.string()),
  repeat: z.boolean(),
  source: z.string().default(""),
  teacherName: z.string().default(""),
  so: z.string().default(""),
  stage: z.string().default(""),
  grade: z.string().default(""),
  categories: z.array(z.string()).default([]),
  customerProgress: z.string().default(""),
  customerResult: z.string().default(""),
  jointVerdict: z.string().default(""),
  tmResult: z.string().default(""),
  tmDate: z.string().default(""),
  tmNote: z.string().default(""),
  screenshots: feedbackScreenshotsSchema.default([]),
  followUps: z.array(feedbackFollowUpSchema).default([]),
});
export const recordRelationTypeSchema = z.enum([
  "feedback",
  "credit",
  "referral",
  "task",
  "lesson",
  "student",
]);
export const creditSchema = z.object({
  orderId: z.string().optional(),
  id: z.string(),
  studentId: z.string(),
  date: z.string(),
  type: z.string(),
  units: z.number(),
  balance: z.number(),
  note: z.string(),
  operator: z.string(),
  amount: z.number().nonnegative().optional(),
  feedbackId: z.string().optional(),
  referralId: z.string().optional(),
  lessonId: z.string().optional(),
  recordedAt: z.string().optional(),
});
export const referralSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  referrerStudentId: z.string(),
  date: z.string(),
  note: z.string(),
  operator: z.string(),
  recordedAt: z.string().optional(),
});
export const serviceTaskSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  title: z.string(),
  owner: z.string(),
  dueDate: z.string(),
  note: z.string(),
  status: z.enum(["待处理", "已完成"]),
  result: z.string(),
  completedAt: z.string(),
  completedBy: z.string().optional(),
  createdAt: z.string().optional(),
  createdBy: z.string().optional(),
  sourceType: z
    .enum(["manual", "teacher", "feedback", "lesson", "student", "reminder"])
    .optional(),
  sourceId: z.string().optional(),
  lessonIds: z.array(z.string()).optional(),
});
export const eventSchema = z.object({
  visit:z.object({stars:z.number().int().min(1).max(5),stage:z.string(),text:z.string(),evidence:z.string()}).optional(),
  serviceStopResults: studentSchema.shape.serviceStopResults.optional(),
  id: z.string(),
  studentId: z.string(),
  teacherId: z.string(),
  date: z.string(),
  type: z.string(),
  content: z.string(),
  operator: z.string(),
  relatedType: recordRelationTypeSchema.optional(),
  relatedId: z.string().optional(),
  recordedAt: z.string().optional(),
});
export const actionSchema = z.object({
  id: z.string(),
  teacherId: z.string(),
  feedbackId: z.string(),
  date: z.string(),
  type: z.string(),
  amount: z.number(),
  reason: z.string(),
  status: z.enum(["待确认", "已确认", "已作废"]),
});
const payrollBreakdownSchema = z.object({
  adjustmentNote: z.string(),
  deductionRows: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      reason: z.string(),
      amount: z.number(),
      feedbackId: z.string().optional(),
    }),
  ),

  opening: z.object({
    units: z.number(),
    amount: z.number(),
    source: z.string(),
  }),
  rows: z.array(
    z.object({
      lessonId: z.string(),
      date: z.string(),
      time: z.string(),
      studentId: z.string(),
      duration: z.number(),
      units: z.number(),
      rate: z.number(),
      amount: z.number(),
    }),
  ),
  units: z.number(),
  base: z.number(),
  deductions: z.number(),
  total: z.number(),
  adjustment: z.number(),
  frozen: z.boolean(),
});
export const payrollSchema = z.object({
  opening: payrollBreakdownSchema.shape.opening.optional(),
  breakdownSnapshot: payrollBreakdownSchema.optional(),
  id: z.string(),
  teacherId: z.string(),
  month: z.string(),
  lessons: z.number(),
  adjustment: z.number(),
  adjustmentNote: z.string(),
  status: z.enum(["待确认", "已确认", "已发放"]),
  snapshot: z
    .object({ base: z.number(), deductions: z.number(), total: z.number() })
    .optional(),
});
export const reportSchema = z.object({
  screenshot:z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).optional(),
  id: z.string(),
  lessonId: z.string(),
  studentId: z.string(),
  teacherId: z.string(),
  date: z.string(),
  material: z.string(),
  from: z.string(),
  to: z.string(),
  rating: z.number(),
  comment: z.string(),
  suggestedLevel: z.string(),
  recordedAt: z.string().optional(),
});
export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  permissions: z.array(z.string()),
  scope: z.string(),
});
export const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  roleId: z.string(),
  group: z.string().optional(),
  team: z.string().optional(),
  scope: z.string(),
  enabled: z.boolean(),
});
export const catalogSchema = z.object({
  id: z.string(),
  parentId: z.string().optional(),
  targetHistory: z.array(z.object({ at: z.string(), lessons: z.number().int().positive(), operator: z.string() })).optional(),
  monthlyLessons: z.number().int().positive().optional(),
  usedInFeedback: z.boolean().optional(),
  type: z.enum(["教材", "反馈分类", "SO", "下拉选项", "项目", "渠道"]),
  name: z.string(),
  detail: z.string(),
  enabled: z.boolean(),
});
export const leaveSchema = z.object({
  id: z.string(),
  teacherId: z.string(),
  start: z.string(),
  end: z.string(),
  reason: z.string(),
  status: z.enum(["已登记","待审批", "已通过", "已驳回"]),
});
export const payTermsSchema=z.object({
  teacherId:z.string(),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),so:z.string().min(1),mode:z.enum(["OP","NP"]), hourly:z.number().positive(),soHourly:z.number().nonnegative(), paidMinutes:z.number().positive(),
  praise:z.number().nonnegative().nullable(),complaint:z.number().nonnegative().nullable(),fullAttendance:z.number().nonnegative().nullable(),renewal:z.number().nonnegative().nullable(),
  confirmed:z.array(z.object({date:z.string(),time:z.string(),minutes:z.number().positive()})),
  teacherAdjustment:z.number(),soAdjustment:z.number(),adjustmentNote:z.string()
});
export type PayTerms=z.infer<typeof payTermsSchema>;
const payLine=z.object({source:z.string(),label:z.string(),teacher:z.number().nullable(),office:z.number().nullable()});
export const stateSchema = z.object({
  version: z.literal(1),
  revision: z.number(),
  studentIdAliases: z.record(z.string()).optional(),
  classInAccounts: z.array(z.object({id:z.string(), phone:z.string(), uid:z.string(), studentIds:z.array(z.string())})).optional(),
  orders: z.array(z.object({ id:z.string(), studentIds:z.array(z.string()), units:z.union([z.literal(72),z.literal(144)]), balance:z.number(), date:z.string(), kind:z.string(), channel:z.string(), project:z.string() })).optional(),
  slotLocks:z.array(z.object({studentId:z.string(),teacherId:z.string(),date:z.string(),time:z.string(),duration:z.number().positive(),operator:z.string(),expiresAt:z.string()})).optional(),
  payTerms:z.array(payTermsSchema).optional(),
  settlements:z.array(z.object({teacherId:z.string(),month:z.string(),so:z.string(),at:z.string(),lines:z.array(payLine)})).optional(),
  importedBatches: z.array(z.string()).optional(),
  students: z.array(studentSchema),
  teachers: z.array(teacherSchema),
  lessons: z.array(lessonSchema),
  feedback: z.array(feedbackSchema),
  credits: z.array(creditSchema),
  events: z.array(eventSchema),
  actions: z.array(actionSchema),
  payroll: z.array(payrollSchema),
  reports: z.array(reportSchema),
  roles: z.array(roleSchema),
  accounts: z.array(accountSchema),
  catalog: z.array(catalogSchema),
  leaves: z.array(leaveSchema),
  referrals: z.array(referralSchema).default([]),
  tasks: z.array(serviceTaskSchema).default([]),
  rules: z.object({
    lowBalance: z.number(),
    trainingRequired: z.boolean(),
  }),
  connection: z.enum(["未连接", "正常", "异常"]),
  language: z.enum(["zh", "en"]),
});
export type Student = z.infer<typeof studentSchema>;
export type Teacher = z.infer<typeof teacherSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export function canSubmitLessonReport(lesson: Lesson): boolean {
  return (
    (lesson.date <= DEMO_TODAY && ["待确认", "已完成", "缺席"].includes(lesson.status))
    || (!!lesson.requiresScreenshot && lesson.status==="未开始" && Date.parse(lesson.date+"T"+lesson.time+":00+08:00")+lesson.duration*60000<=Date.now())
  );
}
export type Feedback = z.infer<typeof feedbackSchema>;
export type CreditEntry = z.infer<typeof creditSchema>;
export type ServiceEvent = z.infer<typeof eventSchema>;
export type TeacherAction = z.infer<typeof actionSchema>;
export type Payroll = z.infer<typeof payrollSchema>;
export type Report = z.infer<typeof reportSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Account = z.infer<typeof accountSchema>;
export type CatalogEntry = z.infer<typeof catalogSchema>;
export type Leave = z.infer<typeof leaveSchema>;
export type DemoState = z.infer<typeof stateSchema>;
export type Referral = z.infer<typeof referralSchema>;
export type ServiceTask = z.infer<typeof serviceTaskSchema>;
export function studentOrderStatus(status: Student["status"]): string {
  return status === "退费"
    ? "退款"
    : status === "在读" || status === "待排课"
      ? "正常"
      : status;
}
export function serviceStatusForOrder(orderStatus: string): Student["status"] {
  if (orderStatus === "退款" || orderStatus === "退费") return "退费";
  if (orderStatus === "停课" || orderStatus === "结课") return orderStatus;
  return orderStatus === "正常" || orderStatus === "在读" ? "在读" : "待排课";
}
export type Command = { operator?: string } & (
  | {
      type: "referral.add";
      studentId: string;
      referrerStudentId: string;
      date: string;
      note: string;
    }
  | {
      type: "task.add";
      studentId: string;
      title: string;
      owner: string;
      dueDate?: string;
      note?: string;
    }
  | { type: "task.complete"; id: string; result?: string }
  | {
      type: "student.reminder.preview";
      studentId: string;
      kind: "balance" | "attendance";
      threshold: number;
      lookbackDays?: number;
    }
  | {
      type: "student.courseReminder.preview";
      studentId: string;
      lessonId: string;
      kind: "before" | "feedback";
    }
  | {
      type: "student.details.update";
      id: string;
      patch: Partial<StudentEditableInput>;
      expected: Partial<StudentEditableInput>;
    }
  | {
      type: "student.history.update";
      id: string;
      history: StudentHistoryInput;
      reason: string;
    }
  | {
      type: "student.scheduleIntent.update";
      studentId: string;
      intent: ScheduleIntent;
    }
  | {type:"slot.lock";studentId:string;slots:{teacherId:string;date:string;time:string}[];duration:number;expiresAt:string}
  | {type:"lesson.incident";minutes?:number;id:string;reason:string;note:string}
  | {type:"lesson.notice";id:string;sent:boolean;error:string}
  | {type:"pay.terms";terms:PayTerms}
  | {type:"pay.freeze";teacherId:string;month:string}
  | {type:"slot.release";studentId:string}
  | {type:"survey.issue";id:string;token?:string;secret?:string}
  | {type:"survey.submit";token:string;answers:Omit<z.infer<typeof surveyAnswers>,"level"> & {level:string}}
  | { type: "order.buy"; id:string; studentId:string; studentIds:string[]; units:72|144; date:string; kind:string; note:string }
  | { type: "student.bindClassIn"; id: string; phone: string; uid: string }
  | { type: "student.profile"; id: string; profile: StudentProfileInput }
  | {
      type: "student.import";
      batchId?: string;
      students: StudentProfileInput[];
      mode: "skip" | "update";
    }
  | {
      type: "student.balance.open";
      id: string;
      balance: number;
      reason: string;
    }
  | {
      type: "student.create";
      student: z.input<typeof studentProfileSchema>;
    }
  | {
      type: "student.edit";
      id: string;
      patch: Partial<
        Pick<
          Student,
          | "name"
          | "chineseName"
          | "phone"
          | "owner"
          | "level"
          | "material"
          | "unit"
          | "preferences"
          | "goal"
        >
      >;
    }
  | {
      type: "credit.deduct";
      studentId: string;
      units: number;
      reason: string;
    }
  | {
      type: "credit.add";
      orderId?:string;
      studentId: string;
      units: number;
      kind: string;
      note: string;
      date?: string;
      amount?: number;
      feedbackId?: string;
      referralId?: string;
    }
  | {
      type: "student.lifecycle";
      studentId: string;
      status: Student["status"];
      reason: string;
      keepSlots?: boolean;
      simulateFailure?: boolean;
    }
  | {
      type: "service.add";
      studentId: string;
      content: string;
      satisfaction?: string; stars?:number; stage?:string; evidence?:string;
    }
  | {
      type: "lesson.schedule";
      schedulingMode?: "flex";
      studentId: string;
      teacherId: string;
      slots: {
        date: string;
        time: string;
        teacherId?: string;
        confirmedTeacher?: boolean;
        extra?: boolean;
        fixedOrigin?: { date: string; time: string };
      }[];
      duration: number;
      plannedUnits?: number;
      kind: Lesson["kind"];
      material: string;
      confirmedTeacher?: boolean;
      confirmationNote?: string;
    }
  | { type: "lesson.plannedUnits.update"; id: string; plannedUnits: number }
  | {
      type: "lesson.reschedule";
      id: string;
      date: string;
      time: string;
      teacherId: string;
      reason: string;
      confirmedTeacher?: boolean;
      confirmationNote?: string;
    }
  | {
      type: "lesson.cancel";
      kind?:string; cancelledAt?:string; waived?:boolean;
      id: string;
      reason: string;
      responsibility: "学员" | "老师" | "平台";
    }
  | {
      type: "lesson.changeTeacher";
      studentId: string;
      teacherId: string;
      from: string;
      reason: string;
      confirmedTeacher?: boolean;
      confirmationNote?: string;
    }
  | {
      type: "lesson.resolve";
      ids: string[];
      decision: "扣课" | "不扣" | "缺席";
      reason: string;
      units?: number;
    }
  | {
      type: "lesson.correct";
      id: string;
      deduct: boolean;
      reason: string;
      units?: number;
      attendance?: Lesson["attendance"];
      result?: "已完成" | "缺席";
    }
  | { type: "lesson.link"; id: string; studentId: string }
  | { type: "lesson.retry"; id: string }
  | {
      type: "feedback.create";
      feedback:
        | Pick<
            Feedback,
            | "studentId"
            | "teacherId"
            | "lessonId"
            | "rating"
            | "category"
            | "content"
          >
        | FeedbackDetailsInput;
    }
  | { type: "feedback.edit"; id: string; feedback: FeedbackDetailsInput }
  | {
      type: "feedback.customer";
      id: string;
      progress: string;
      result: string;
      note: string;
    }
  | {
      type: "feedback.tm";
      id: string;
      jointVerdict: string;
      result: string;
      date: string;
      note: string;
    }
  | {
      type: "feedback.followUp";
      id: string;
      section: "客服处理" | "TM跟进";
      content: string;
    }
  | {
      type: "feedback.measures";
      id: string;
      measures: string[];
      amount: number;
      separateDeduction: boolean;
      deductionConfirmed: boolean;
      note: string;
    }
  | { type: "feedback.process"; id: string; note: string; complete: boolean }
  | {
      type: "feedback.verdict";
      id: string;
      verdict: string;
      note: string;
      measures: string[];
      amount: number;
      deductionConfirmed: boolean;
      separateDeduction?: boolean;
    }
  | { type: "action.confirm"; id: string; approve: boolean }
  | { type: "teacher.save"; teacher: Teacher }
  | {
      type: "teacher.leave";
      teacherId: string;
      start: string;
      end: string;
      reason: string;
      cancelLessons: boolean;
    }
  | {
      type: "teacher.offboard";
      teacherId: string;
      confirmName: string;
      reason: string;
    }
  | { type: "payroll.adjust"; id: string; amount: number; note: string }
  | { type: "payroll.status"; ids: string[]; status: "已确认" | "已发放" }
  | { type: "role.save"; role: Role }
  | { type: "role.delete"; id: string }
  | { type: "account.save"; account: Account; handoverTo?: string }
  | { type: "catalog.save"; entry: CatalogEntry }
  | { type: "feedback-category.delete"; id: string }
  | { type: "rules.save"; rules: DemoState["rules"] }
  | { type: "connection.save"; sid: string; secret: string }
  | {
      type: "report.correct";
      id: string;
      material: string;
      from: string;
      to: string;
      reason: string;
    }
  | { type: "report.save"; report: Omit<Report, "id"> }
  | { type: "leave.request"; leave: Omit<Leave, "id" | "status"> }
  | { type: "leave.review"; id: string; approve: boolean }
  | { type: "language.set"; language: "zh" | "en" }
);
export const DEMO_TODAY = "2026-10-31";
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function formatDate(date: string) {
  return date.slice(5).replace("-", "月") + "日";
}
export const permissionGroups = [
  {
    name: "数据看板",
    keys: ["dashboard.overview", "dashboard.utilization", "dashboard.export"],
  },
  {
    name: "学员",
    keys: [
      "student.view",
      "student.create",
      "student.edit",
      "credit.add",
      "credit.compensate",
      "student.reschedule",
      "student.refund",
      "student.import",
      "student.export",
      "field.student_phone",
    ],
  },
  {
    name: "排班管理",
    keys: ["schedule.view", "schedule.create", "schedule.export"],
  },
  {
    name: "上课记录",
    keys: [
      "lesson.view",
      "lesson.confirm",
      "lesson.correct",
      "sync.retry",
      "classin_account.link",
    ],
  },
  {
    name: "反馈",
    keys: [
      "feedback.view",
      "feedback.create",
      "feedback.process",
      "feedback.verdict",
      "teacher_action.deduct",
      "teacher_action.confirm",
    ],
  },
  {
    name: "老师",
    keys: [
      "teacher.view",
      "teacher.create",
      "teacher.edit",
      "teacher.leave",
      "teacher.offboard",
      "availability.edit",
      "training.edit",
    ],
  },
  {
    name: "薪资",
    keys: [
      "payroll.view",
      "payroll.adjust",
      "payroll.confirm",
      "payroll.mark_paid",
      "pay_rate.edit",
      "field.pay_amount",
    ],
  },
  {
    name: "设置",
    keys: [
      "account.manage",
      "role.manage",
      "org.manage",
      "basics.manage",
      "rule.manage",
      "classin.view",
      "classin.manage",
      "audit.view",
    ],
  },
];
export const permissionLabels: Record<string, string> = {
  "dashboard.overview": "运营总览",
  "dashboard.utilization": "老师利用率",
  "dashboard.export": "导出看板",
  "student.view": "查看学员",
  "student.create": "新建学员",
  "student.edit": "编辑资料",
  "credit.add": "加课时",
  "credit.compensate": "补偿与赠送",
  "student.reschedule": "调课换老师",
  "student.refund": "退费",
  "student.import": "导入学员",
  "student.export": "导出学员",
  "schedule.view": "查看排班",
  "schedule.create": "排课",
  "schedule.export": "导出课表",
  "lesson.view": "查看上课记录",
  "lesson.confirm": "确认扣课",
  "lesson.correct": "更正结果",
  "sync.retry": "重新更新课程",
  "classin_account.link": "关联账号",
  "feedback.view": "查看反馈",
  "feedback.create": "登记反馈",
  "feedback.process": "处理反馈",
  "feedback.verdict": "责任判定",
  "teacher_action.deduct": "直接扣款",
  "teacher_action.confirm": "确认扣款",
  "teacher.view": "查看老师",
  "teacher.create": "新建老师",
  "teacher.edit": "编辑老师",
  "teacher.leave": "请假",
  "teacher.offboard": "离职",
  "availability.edit": "修改可用时间",
  "training.edit": "登记培训",
  "payroll.view": "查看薪资",
  "payroll.adjust": "薪资调整",
  "payroll.confirm": "确认薪资",
  "payroll.mark_paid": "标记发放",
  "pay_rate.edit": "修改单价",
  "field.pay_amount": "查看薪资金额",
  "field.student_phone": "查看学员完整手机号",
  "account.manage": "管理账号",
  "role.manage": "配置角色权限",
  "org.manage": "管理项目渠道",
  "basics.manage": "维护基础资料",
  "rule.manage": "修改业务规则",
  "classin.view": "查看课程连接",
  "classin.manage": "修改连接凭证",
  "audit.view": "查看操作日志",
};
