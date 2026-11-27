import {
  type Command,
  type DemoState,
  type Student,
  permissionGroups,
  superAdminRole,
} from "./model";
import type { HalfMonthRecord } from "./halfMonthPayrollSchema";
import { studentImportMatches } from "./domain";
import { studentInScope } from "./organization";
import { sharedBalanceGroup } from "./packageBalances";
import { withScopedReservations } from "./scheduleCredits";

export type BusinessIdentity = {
  accountId: string;
  roleId: string;
  teacherId?: string;
  name: string;
};

export function canBusiness(
  state: DemoState,
  identity: BusinessIdentity,
  permission: string,
) {
  return (
    identity.roleId === "admin" ||
    !!state.roles
      .find((role) => role.id === identity.roleId)
      ?.permissions.includes(permission)
  );
}

const commandPermissions: Partial<Record<Command["type"], string>> = {
  "report.correct": "lesson.correct",
  "student.create": "student.create",
  "student.edit": "student.edit",
  "student.bindClassIn": "classin_account.link",
  "student.profile": "student.edit",
  "student.details.update": "student.edit",
  "student.history.update": "student.edit",
  "student.import": "student.import",
  "lesson.attendance": "classin.manage",
  "lesson.incident": "lesson.correct",
  "lesson.notice": "lesson.confirm",
  "slot.lock": "schedule.create",
  "slot.release": "schedule.create",
  "halfPay.rules": "pay_rate.edit",
  "halfPay.officeRate": "pay_rate.edit",
  "halfPay.teacherRate": "pay_rate.edit",
  "halfPay.adjust": "payroll.adjust",
  "halfPay.review": "payroll.adjust",
  "halfPay.serious": "payroll.adjust",
  "halfPay.status": "payroll.confirm",
  "survey.issue": "student.edit",
  "order.join": "credit.add",
  "order.buy": "credit.add",
  "credit.add": "credit.add",
  "credit.deduct": "credit.add",
  "student.lifecycle": "student.reschedule",
  "service.add": "student.edit",
  "referral.add": "student.edit",
  "task.add": "student.edit",
  "task.complete": "student.edit",
  "student.reminder.preview": "student.edit",
  "student.courseReminder.preview": "student.edit",
  "lesson.schedule": "schedule.create",
  "lesson.plannedUnits.update": "schedule.create",
  "student.scheduleIntent.update": "schedule.create",
  "lesson.reschedule": "student.reschedule",
  "lesson.cancel": "student.reschedule",
  "lesson.changeTeacher": "student.reschedule",
  "lesson.resolve": "lesson.confirm",
  "lesson.correct": "lesson.correct",
  "lesson.link": "classin_account.link",
  "lesson.retry": "sync.retry",
  "feedback.create": "feedback.create",
  "feedback.edit": "feedback.create",
  "feedback.customer": "feedback.process",
  "feedback.tm": "feedback.verdict",
  "feedback.measures": "feedback.verdict",
  "feedback.process": "feedback.process",
  "feedback.verdict": "feedback.verdict",
  "action.confirm": "teacher_action.confirm",
  "teacher.save": "teacher.edit",
  "teacher.leave": "teacher.leave",
  "teacher.offboard": "teacher.offboard",
  "role.save": "role.manage",
  "role.delete": "role.manage",
  "account.save": "account.manage",
  "catalog.save": "basics.manage",
  "feedback-category.delete": "basics.manage",
  "rules.save": "rule.manage",
};
export function assertCommandAccess(
  state: DemoState,
  identity: BusinessIdentity,
  command: Command,
) {
  const account = state.accounts.find(
    (item) => item.id === identity.accountId && item.enabled,
  );
  if (!account || account.roleId !== identity.roleId)
    throw new Error("账号已停用或权限已变化");
  if (
    identity.roleId === "teacher" &&
    (!identity.teacherId ||
      !state.teachers.some((item) => item.id === identity.teacherId))
  )
    throw new Error("老师登录账号尚未关联档案");
  const can = (permission: string) => canBusiness(state, identity, permission);
  if (command.type === "role.save") {
    const known = new Set(permissionGroups.flatMap((group) => group.keys));
    if (command.role.permissions.some((permission) => !known.has(permission)))
      throw new Error("角色包含无效权限");
  }
  if (identity.teacherId) {
    switch (command.type) {
      case "report.save": {
        const lesson = state.lessons.find(
          (item) => item.id === command.report.lessonId,
        );
        if (
          lesson?.teacherId !== identity.teacherId ||
          command.report.teacherId !== identity.teacherId ||
          command.report.studentId !== lesson.studentId
        )
          throw new Error("只能为本人课程提交报告");
        return;
      }
      case "leave.request":
        if (command.leave.teacherId !== identity.teacherId)
          throw new Error("只能登记本人请假");
        return;
      case "teacher.save": {
        const existing = state.teachers.find(
          (item) => item.id === identity.teacherId,
        );
        if (!existing || command.teacher.id !== identity.teacherId)
          throw new Error("只能修改本人时间");
        const {
          availability,
          availabilityFrom,
          availabilityNote,
          availabilitySource,
          ...submitted
        } = command.teacher;
        const {
          availability: oldAvailability,
          availabilityFrom: oldFrom,
          availabilityNote: oldNote,
          availabilitySource: oldSource,
          ...original
        } = existing;
        if (JSON.stringify(submitted) !== JSON.stringify(original))
          throw new Error("老师仅可编辑本人可上课时间");
        return;
      }
      case "language.set":
        return;
      default:
        throw new Error("老师账号没有执行此操作的权限");
    }
  }
  if (command.type.startsWith("halfPay.") && (!can("payroll.view") || !can("field.pay_amount")))
    throw new Error("没有操作薪资金额的权限");
  if (command.type === "survey.submit")
    throw new Error("请通过专属问卷链接提交");
  let permission = commandPermissions[command.type];
  if (command.type === "feedback.followUp")
    permission =
      command.section === "TM跟进" ? "feedback.verdict" : "feedback.process";
  if (
    command.type === "catalog.save" &&
    ["项目", "渠道"].includes(command.entry.type)
  )
    permission = "org.manage";
  if (command.type === "report.save") permission = "lesson.confirm";
  if (command.type === "halfPay.status" && command.status === "已发放")
    permission = "payroll.mark_paid";
  if (
    command.type === "teacher.save" &&
    !state.teachers.some((item) => item.id === command.teacher.id)
  )
    permission = "teacher.create";
  if (command.type === "leave.request" || command.type === "leave.review")
    permission = "teacher.leave";
  if (command.type !== "language.set" && (!permission || !can(permission)))
    throw new Error("你没有执行这个操作的权限");
  if (
    (command.type === "feedback.measures" ||
      command.type === "feedback.verdict") &&
    command.measures.includes("扣款")
  ) {
    if (
      command.deductionConfirmed
        ? !can("teacher_action.deduct")
        : !can("teacher_action.create") && !can("teacher_action.deduct")
    )
      throw new Error("你没有执行此扣款操作的权限");
  }
  if (
    command.type === "credit.add" &&
    ["补偿", "赠送"].includes(command.kind) &&
    !can("credit.compensate")
  )
    throw new Error("你没有补偿或赠送课时的权限");
  if (
    command.type === "order.join" &&
    command.bindAccountId &&
    !can("classin_account.link")
  )
    throw new Error("你没有关联 ClassIn 账号的权限");
  const inScope = (student: Student) =>
    studentInScope(state, student, account.scope, account);
  const checkStudent = (studentId: string | undefined) => {
    const student = state.students.find((item) => item.id === studentId);
    if (!student || !inScope(student))
      throw new Error("学员不在当前数据范围内");
  };
  if ("studentId" in command) checkStudent(command.studentId);
  if ("id" in command && command.type.startsWith("student."))
    checkStudent(command.id);
  if (command.type === "survey.issue") checkStudent(command.id);
  if ("id" in command && command.type.startsWith("lesson."))
    checkStudent(
      state.lessons.find((item) => item.id === command.id)?.studentId,
    );
  if (command.type === "lesson.resolve")
    command.ids.forEach((id) =>
      checkStudent(state.lessons.find((item) => item.id === id)?.studentId),
    );
  if ("id" in command && command.type.startsWith("feedback."))
    checkStudent(
      state.feedback.find((item) => item.id === command.id)?.studentId,
    );
  if (command.type === "feedback.create" || command.type === "feedback.edit") {
    checkStudent(command.feedback.studentId);
    if (command.feedback.lessonId) {
      const lesson = state.lessons.find(
        (item) => item.id === command.feedback.lessonId,
      );
      if (lesson?.studentId !== command.feedback.studentId)
        throw new Error("反馈课程与学员不一致");
    }
  }
  if (command.type === "task.complete")
    checkStudent(state.tasks.find((item) => item.id === command.id)?.studentId);
  if (command.type === "report.correct")
    checkStudent(
      state.reports.find((item) => item.id === command.id)?.studentId,
    );
  if (command.type === "report.save") {
    checkStudent(command.report.studentId);
    const lesson = state.lessons.find(
      (item) => item.id === command.report.lessonId,
    );
    if (
      lesson?.studentId !== command.report.studentId ||
      lesson.teacherId !== command.report.teacherId
    )
      throw new Error("课堂报告与课程身份不一致");
  }
  if (command.type === "referral.add") checkStudent(command.referrerStudentId);
  if (command.type === "order.buy") command.studentIds.forEach(checkStudent);
  if (command.type === "order.join")
    sharedBalanceGroup(
      state,
      command.studentId,
      command.orderId,
    ).members.forEach(checkStudent);
  if (command.type === "student.bindClassIn") {
    sharedBalanceGroup(state, command.id).members.forEach(checkStudent);
    state.classInAccounts?.find(account => account.uid === command.uid.trim())?.studentIds.forEach(checkStudent);
  }
  if (command.type === "account.save" && command.handoverTo) {
    const successor = state.accounts.find(a => a.id === command.handoverTo);
    for (const student of state.students.filter(s => s.ownerAccountId === command.account.id)) {
      checkStudent(student.id);
      if (successor && !inScope({...student,ownerAccountId:successor.id,owner:successor.name})) throw new Error("接手教务超出当前数据范围");
    }
  }
  if (command.type === "credit.add" || command.type === "credit.deduct") {
    if (command.orderId) {
      const order = state.orders?.find((item) => item.id === command.orderId);
      if (!order?.studentIds.includes(command.studentId))
        throw new Error("课时账户不属于当前学员");
    }
  }
  if (command.type === "student.courseReminder.preview") {
    if (
      state.lessons.find((item) => item.id === command.lessonId)?.studentId !==
      command.studentId
    )
      throw new Error("课程与学员不一致");
  }
  // Scope must hold after reassignment too, including imports and newly created records.
  const checkProfile = (profile: {
    owner: string;
    ownerAccountId?: string;
    project: string;
    channel: string;
  }, existing?: Student) => {
    const ownerAccountId = existing && profile.owner !== existing.owner && profile.ownerAccountId === existing.ownerAccountId ? undefined : profile.ownerAccountId;
    if (!studentInScope(state, {...profile,ownerAccountId}, account.scope, account))
      throw new Error("资料归属超出当前数据范围");
  };
  if (command.type === "student.create") checkProfile(command.student);
  if (command.type === "student.profile") checkProfile(command.profile,state.students.find(s=>s.id===command.id));
  if (
    command.type === "student.details.update" ||
    command.type === "student.edit"
  ) {
    const existing = state.students.find((item) => item.id === command.id)!;
    checkProfile({ ...existing, ...command.patch },existing);
  }
  if (command.type === "student.import") {
    for (const profile of command.students) {
      if (profile.importStudentId) checkStudent(profile.importStudentId);
      if (profile.openingGroup && !studentImportMatches(state.students, profile).length) state.orders?.find(o => o.openingGroup === profile.openingGroup)?.studentIds.forEach(checkStudent);
      checkProfile(profile);
    }
  }
  if (command.type === "teacher.save" && !can("pay_rate.edit")) {
    const original = state.teachers.find(
      (item) => item.id === command.teacher.id,
    );
    if (
      original &&
      command.teacher.rate !== original.rate &&
      !(!can("field.pay_amount") && command.teacher.rate === 0)
    )
      throw new Error("你没有修改老师单价的权限");
  }
  if (!can("field.student_phone")) {
    const changedPhone =
      command.type === "student.details.update" ||
      command.type === "student.edit"
        ? command.patch.phone
        : command.type === "student.profile"
          ? command.profile.phone
          : undefined;
    if (
      changedPhone !== undefined &&
      "id" in command &&
      changedPhone !==
        state.students.find((item) => item.id === command.id)?.phone
    )
      throw new Error("你没有修改学员手机号的权限");
    const changedEmail =
      command.type === "student.details.update"
        ? command.patch.email
        : command.type === "student.profile"
          ? command.profile.email
          : undefined;
    if (
      changedEmail !== undefined &&
      "id" in command &&
      changedEmail !== state.students.find((item) => item.id === command.id)?.email
    )
      throw new Error("你没有修改学员邮箱的权限");
  }
  if (command.type === "teacher.save" && !can("availability.edit")) {
    const existing = state.teachers.find(
      (item) => item.id === command.teacher.id,
    );
    const selected = (teacher: typeof command.teacher) => [
      teacher.availability,
      teacher.availabilityFrom,
      can("teacher.view") || can("schedule.view")
        ? teacher.availabilityNote
        : "",
      teacher.availabilitySource,
    ];
    if (
      existing
        ? JSON.stringify(selected(existing)) !==
          JSON.stringify(selected(command.teacher))
        : command.teacher.availability.length > 0
    )
      throw new Error("你没有修改老师可用时间的权限");
  }
  if (identity.roleId === "tm") {
    if (command.type === "halfPay.officeRate" &&
        !state.teachers.some(t => t.so === command.so && t.tmAccountId === account.id))
      throw new Error("只能修改本人负责老师所属 SO 的单价");
    let teacherId: string | undefined;
    if ("teacherId" in command) teacherId = command.teacherId;
    if (command.type === "teacher.save") teacherId = command.teacher.id;
    if (command.type === "action.confirm")
      teacherId = state.actions.find(
        (item) => item.id === command.id,
      )?.teacherId;
    if (command.type === "report.correct")
      teacherId = state.reports.find(
        (item) => item.id === command.id,
      )?.teacherId;
    if (command.type === "report.save") teacherId = command.report.teacherId;
    if ("id" in command && command.type.startsWith("lesson."))
      teacherId = state.lessons.find(
        (item) => item.id === command.id,
      )?.teacherId;
    if (command.type === "lesson.resolve")
      for (const id of command.ids) {
        const lesson = state.lessons.find((item) => item.id === id);
        if (
          state.teachers.find((item) => item.id === lesson?.teacherId)
            ?.tmAccountId !== account.id
        )
          throw new Error("只能操作本人负责的老师");
      }
    if ("id" in command && command.type.startsWith("feedback."))
      teacherId = state.feedback.find(
        (item) => item.id === command.id,
      )?.teacherId;
    if (command.type === "feedback.create" || command.type === "feedback.edit")
      teacherId = command.feedback.teacherId;
    if (command.type === "leave.review")
      teacherId = state.leaves.find(
        (item) => item.id === command.id,
      )?.teacherId;
    if (
      teacherId &&
      state.teachers.find((item) => item.id === teacherId)?.tmAccountId !==
        account.id
    )
      throw new Error("只能操作本人负责的老师");
    if (
      command.type === "teacher.save" &&
      command.teacher.tmAccountId !== account.id
    )
      throw new Error("只能保存本人负责的老师");
  }
}

export function redactHalfMonthForTeacher(
  record: HalfMonthRecord,
): HalfMonthRecord {
  return {
    teacherId: record.teacherId,
    period: record.period,
    status: record.status,
    adjustments: record.adjustments.filter((adj) => adj.side === "teacher"),
    verifiedRates: undefined,
    networkPay: undefined,
    decisions: undefined,
    seriousComplaints: undefined,
    snapshot: record.snapshot && {
      ...record.snapshot,
      officeRate: undefined,
      rows: record.snapshot.rows
        .filter(
          (row) =>
            !(row.category === "人工调整" && row.teacher === 0) &&
            row.category !== "等待" &&
            row.category !== "待核",
        )
        .map((row) => ({
          ...row,
          office: 0,
          officeUnitPrice: undefined,
          pendingRates: row.pendingRates?.filter((side) => side !== "office"),
        })),
    },
  };
}

export function scopeState(
  state: DemoState,
  identity: BusinessIdentity,
): DemoState {
  const account = state.accounts.find(
    (item) => item.id === identity.accountId && item.enabled,
  );
  if (!account || account.roleId !== identity.roleId)
    throw new Error("账号已停用或权限已变化");
  if (
    identity.roleId === "teacher" &&
    (!identity.teacherId ||
      !state.teachers.some((item) => item.id === identity.teacherId))
  )
    throw new Error("老师登录账号尚未关联档案");
  const can = (permission: string) => canBusiness(state, identity, permission);
  const teacherId = identity.teacherId;
  const studentIds = new Set(
    state.students
      .filter((student) =>
        teacherId
          ? student.teacherId === teacherId ||
            state.lessons.some(
              (lesson) =>
                lesson.studentId === student.id &&
                lesson.teacherId === teacherId,
            )
          : studentInScope(state, student, account.scope, account),
      )
      .map((student) => student.id),
  );
  const teacherIds = new Set(
    state.teachers
      .filter((teacher) =>
        teacherId
          ? teacher.id === teacherId
          : identity.roleId !== "tm" || teacher.tmAccountId === account.id,
      )
      .map((teacher) => teacher.id),
  );
  const lessons = state.lessons.filter(
    (lesson) =>
      studentIds.has(lesson.studentId) && teacherIds.has(lesson.teacherId),
  );
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  const canSeePay = !teacherId && can("payroll.view") && can("field.pay_amount");
  const visible: DemoState = {
    ...state,
    students: state.students
      .filter((student) => studentIds.has(student.id))
      .map((student) => {
        if (can("student.edit") && !teacherId) return student;
        const { surveySecret, surveyToken, ...profile } = student;
        if (teacherId)
          return {
            ...profile,
            phone: "",
            email: "",
            roster: undefined,
            balance: 0,
            totalUnits: null,
            purchaseDate: "",
            renewalStatus: "",
            monthlyRecords: [],
            legacyComplaints: "",
            legacyCompensations: "",
            legacyMissed: "",
            serviceStopResults: [],
          };
        return profile;
      }),
    teachers: state.teachers.filter((teacher) => teacherIds.has(teacher.id)),
    lessons,
    orders: teacherId
      ? []
      : state.orders
          ?.filter((order) => order.studentIds.some((id) => studentIds.has(id)))
          .map((order) => ({
            ...order,
            memberCount: order.studentIds.length,
            studentIds: order.studentIds.filter((id) => studentIds.has(id)),
          })),
    classInAccounts: teacherId
      ? []
      : state.classInAccounts
          ?.filter((item) => item.studentIds.some((id) => studentIds.has(id)))
          .map((item) => ({
            ...item,
            studentIds: item.studentIds.filter((id) => studentIds.has(id)),
          })),
    feedback: state.feedback
      .filter(
        (item) =>
          studentIds.has(item.studentId) &&
          (!teacherId || item.status === "已完成") &&
          (teacherIds.has(item.teacherId) ||
            (!teacherId && identity.roleId !== "tm" && !item.teacherId)),
      )
      .map((item) =>
        teacherId
          ? {
              ...item,
              owner: "",
              processNote: "",
              customerProgress: "",
              customerResult: "",
              jointVerdict: "",
              tmResult: "",
              tmDate: "",
              tmNote: "",
              screenshots: [],
              followUps: [],
            }
          : item,
      ),
    credits: teacherId
      ? []
      : state.credits.filter((item) => studentIds.has(item.studentId)),
    events: state.events.filter((item) =>
      teacherId
        ? item.teacherId === teacherId
        : item.studentId
          ? studentIds.has(item.studentId)
          : can("audit.view"),
    ),
    reports: state.reports.filter((item) => lessonIds.has(item.lessonId)),
    tasks: teacherId
      ? []
      : state.tasks.filter((item) => studentIds.has(item.studentId)),
    referrals: teacherId
      ? []
      : state.referrals.filter(
          (item) =>
            studentIds.has(item.studentId) &&
            studentIds.has(item.referrerStudentId),
        ),
    payroll: state.payroll.filter((item) =>
      teacherId
        ? item.teacherId === teacherId && item.status !== "待确认"
        : can("payroll.view") && teacherIds.has(item.teacherId),
    ),
    halfMonthPayroll: teacherId
      ? (state.halfMonthPayroll
          ?.filter(
            (item) => item.teacherId === teacherId && item.status !== "待确认",
          )
          .map(redactHalfMonthForTeacher) ?? [])
      : can("payroll.view") && can("field.pay_amount")
        ? (state.halfMonthPayroll?.filter((item) =>
            teacherIds.has(item.teacherId),
          ) ?? [])
        : [],
    payRuleChanges: canSeePay ? state.payRuleChanges : undefined,
    lessonPayBasis: canSeePay ? Object.fromEntries(Object.entries(state.lessonPayBasis ?? {}).filter(([id]) => lessonIds.has(id))) : undefined,
    officeRateHistory: canSeePay ? Object.fromEntries(Object.entries(state.officeRateHistory ?? {}).filter(([so]) => state.teachers.some(t => t.so === so && teacherIds.has(t.id)))) : undefined,
    officePayRates: can("payroll.view") && can("field.pay_amount") && !teacherId
      ? Object.fromEntries(Object.entries(state.officePayRates ?? {}).filter(([so]) => state.teachers.some(t => t.so === so && teacherIds.has(t.id)))) : undefined,
    payTerms:
      teacherId || !can("payroll.view")
        ? []
        : state.payTerms?.filter((item) => teacherIds.has(item.teacherId)),
    settlements: state.settlements
      ?.filter(
        (item) =>
          teacherIds.has(item.teacherId) &&
          (!!teacherId || can("payroll.view")),
      )
      .map((item) =>
        teacherId
          ? {
              ...item,
              lines: item.lines.map((line) => ({ ...line, office: null })),
            }
          : item,
      ),
    actions: state.actions.filter((item) => teacherIds.has(item.teacherId)),
    leaves: state.leaves.filter((item) => teacherIds.has(item.teacherId)),
    roles: identity.roleId === "admin"
      ? [superAdminRole(), ...state.roles.filter((role) => role.id !== "admin")]
      : state.roles.filter(
          (role) => can("role.manage") || role.id === identity.roleId,
        ),
    accounts: teacherId ? [account] : state.accounts,
    importedBatches: [],
    slotLocks: state.slotLocks?.filter(
      (item) =>
        studentIds.has(item.studentId) && teacherIds.has(item.teacherId),
    ),
  };
  if (!canSeePay) {
    visible.credits = visible.credits.map(entry => ({ ...entry, renewalPayRuleVersion: undefined }));
    visible.feedback = visible.feedback.map(item => ({ ...item, tmPayRuleVersion: undefined }));
  }
  if (!teacherId && !can("field.student_phone")) {
    const mask = (phone: string) => (phone ? "****" + phone.slice(-4) : "");
    visible.students = visible.students.map((student) => ({
      ...student,
      phone: mask(student.phone),
      email: "",
      roster: student.roster && {
        ...student.roster,
        fields: Object.fromEntries(
          Object.entries(student.roster.fields).map(([key, value]) => [
            key,
            /手机|电话|phone/i.test(key) ? mask(value) : value,
          ]),
        ),
      },
    }));
    visible.classInAccounts = visible.classInAccounts?.map((account) => ({
      ...account,
      phone: mask(account.phone),
    }));
  }
  if (!teacherId && !can("feedback.view")) {
    visible.feedback = [];
    visible.students = visible.students.map((student) => ({
      ...student,
      legacyComplaints: "",
      roster: student.roster && {
        ...student.roster,
        fields: Object.fromEntries(
          Object.entries(student.roster.fields).filter(
            ([key]) => !/投诉|反馈/.test(key),
          ),
        ),
      },
    }));
    visible.events = visible.events.filter(
      (event) =>
        event.relatedType !== "feedback" && !/反馈|投诉/.test(event.type),
    );
    if (!can("payroll.view")) visible.actions = [];
  }
  if (!teacherId && !can("field.pay_amount")) {
    visible.teachers = visible.teachers.map((teacher) => ({
      ...teacher,
      rate: 0,
      payRateHistory: undefined,
    }));
    visible.actions = visible.actions.map((action) => ({
      ...action,
      amount: 0,
    }));
    visible.payTerms = [];
    visible.settlements = visible.settlements?.map((settlement) => ({
      ...settlement,
      lines: settlement.lines.map((line) => ({
        ...line,
        teacher: null,
        office: null,
      })),
    }));
    visible.payroll = visible.payroll.map((payroll) => ({
      ...payroll,
      adjustment: 0,
      adjustmentNote: "",
      opening: payroll.opening && { ...payroll.opening, amount: 0 },
      snapshot: payroll.snapshot && { base: 0, deductions: 0, total: 0 },
      breakdownSnapshot: undefined,
    }));
  }
  if (!teacherId && !can("student.view")) {
    visible.students = visible.students.map((student) => ({
      ...student,
      phone: "",
      email: "",
      roster: undefined,
      surveyOriginal: undefined,
      ageGroup: undefined,
      membershipDuration: undefined,
      listeningHours: undefined,
      preferredLessonTime: undefined,
      learningNotes: undefined,
      surveyToken: undefined,
      surveySecret: undefined,
      preferences: "",
      personality: "",
      interests: "",
      goal: "",
      foreignTeacherExperience: "",
      monthlyRecords: [],
      teacherChanges: [],
      serviceStopResults: [],
      legacyComplaints: "",
      legacyCompensations: "",
      legacyMissed: "",
    }));
    visible.classInAccounts = visible.classInAccounts?.map((account) => ({
      ...account,
      phone: "",
    }));
    visible.tasks = [];
    visible.referrals = [];
    if (!can("audit.view")) visible.events = [];
    if (!can("lesson.view")) visible.reports = [];
  }
  if (!teacherId && !can("teacher.view") && !can("schedule.view")) {
    visible.leaves = visible.leaves.map((leave) => ({ ...leave, reason: "" }));
    visible.teachers = visible.teachers.map((teacher) => ({
      ...teacher,
      phone: "",
      notes: "",
      teachingPhilosophy: "",
      educationBackground: "",
      classInAccount: "",
      photo: "",
      photos: [],
      introVideo: "",
      certificates: "",
      teacherTraining: "",
      quizScore: null,
      availabilityNote: "",
      tags: [],
    }));
  }
  return withScopedReservations(state, visible);
}
