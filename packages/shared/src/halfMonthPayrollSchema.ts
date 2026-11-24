import { z } from "zod";

export const payPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-[12]$/);
export const payRuleValues = z.object({
  attendanceUnits: z.number().positive(),
  attendanceAward: z.number().nonnegative(),
  praise: z.number().nonnegative(),
  renewal: z.number().nonnegative(),
  absentRatio: z.number().min(0).max(1),
  studentCancelMinutes: z.number().nonnegative(),
  latePerMinute: z.number().nonnegative(),
  lateCap: z.number().nonnegative(),
  lateLimit: z.number().nonnegative(),
  absenceMultiple: z.number().nonnegative(),
  shortCancelMultiple: z.number().nonnegative(),
  earlyCancelMultiple: z.number().nonnegative(),
  complaintRatio: z.number().min(0).max(1),
});
export const defaultPayRules: z.infer<typeof payRuleValues> = {
  attendanceUnits: 70,
  attendanceAward: 500,
  praise: 50,
  renewal: 1000,
  absentRatio: 0.5,
  studentCancelMinutes: 30,
  latePerMinute: 2,
  lateCap: 18,
  lateLimit: 10,
  absenceMultiple: 3,
  shortCancelMultiple: 2,
  earlyCancelMultiple: 1,
  complaintRatio: 1,
};
const payEntry = z.object({
  key: z.string(),
  date: z.string(),
  category: z.enum(["底薪", "奖金", "扣款", "人工调整", "待核"]),
  title: z.string(),
  detail: z.string(),
  source: z.string(),
  lessonId: z.string().optional(),
  teacher: z.number(),
  office: z.number(),
  pendingRates: z.array(z.enum(["teacher", "office"])).optional(),
});
const adjustment = z.object({
  key: z.string(),
  side: z.enum(["teacher", "office"]),
  amount: z.number().finite(),
  note: z.string().trim().min(1),
  at: z.string(),
  operator: z.string(),
});
const networkAmounts = z.object({
  teacher: z.number().finite().nonnegative(),
  office: z.number().finite().nonnegative(),
});
export const halfMonthRecord = z.object({
  teacherId: z.string(),
  period: payPeriod,
  adjustments: z.array(adjustment),
  verifiedRates: z.record(z.string(), z.number().positive()).optional(),
  networkPay: z.record(z.string(), networkAmounts).optional(),
  decisions: z.record(z.string(), z.string()).optional(),
  seriousComplaints: z.array(z.string()).optional(),
  status: z.enum(["待确认", "已确认", "已发放"]),
  snapshot: z
    .object({
      rows: z.array(payEntry),
      name: z.string(),
      so: z.string(),
      mode: z.enum(["OP", "NP"]).optional(),
      teacherRate: z.number(),
      officeRate: z.number().optional(),
      rules: payRuleValues,
    })
    .optional(),
});
export type HalfMonthRecord = z.infer<typeof halfMonthRecord>;
export type PayEntry = z.infer<typeof payEntry>;
export const halfMonthCommand = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("halfPay.rules"),
    period: payPeriod.optional(),
    values: payRuleValues.partial(),
  }),
  z.object({
    type: z.literal("halfPay.teacherRate"),
    teacherId: z.string(),
    rate: z.number().positive(),
  }),
  z.object({
    type: z.literal("halfPay.officeRate"),
    so: z.string().trim().min(1),
    rate: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal("halfPay.adjust"),
    teacherId: z.string(),
    period: payPeriod,
    side: adjustment.shape.side,
    amount: adjustment.shape.amount.refine((n) => n !== 0),
    note: adjustment.shape.note,
  }),
  z.object({
    type: z.literal("halfPay.serious"),
    teacherId: z.string(),
    period: payPeriod,
    feedbackId: z.string(),
  }),
  z.object({
    type: z.literal("halfPay.review"),
    teacherId: z.string(),
    period: payPeriod,
    key: z.string().min(1),
    networkPay: networkAmounts.optional(),
    historicalRate: z.number().positive().finite().optional(),
    note: adjustment.shape.note,
  }),
  z.object({
    type: z.literal("halfPay.status"),
    teacherId: z.string(),
    period: payPeriod,
    status: z.enum(["已确认", "已发放"]),
  }),
]);
export type HalfMonthCommand = z.infer<typeof halfMonthCommand>;
