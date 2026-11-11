import { studentInScope, scopeLabel } from "./organization";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { demoRepository, DEMO_STORAGE_KEY } from "./repository";
import type { Command } from "./model";
const AccessContext = createContext({
  roleId: "admin",
  preview: false,
  accountId: "",
  setRole: (_roleId: string, _preview?: boolean, _accountId?: string) => {},
});
export function DemoProvider({ children }: { children: ReactNode }) {
  const [roleId, setRoleId] = useState("admin");
  const [accountId, setAccountId] = useState("");
  const [preview, setPreview] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    const update = () =>
      queryClient.setQueryData(["demo"], demoRepository.read());
    const storage = (e: StorageEvent) => {
      if (e.key === DEMO_STORAGE_KEY)
        queryClient.setQueryData(["demo"], demoRepository.refresh());
    };
    window.addEventListener("crazytalk-change", update);
    demoRepository.settleCompletedLessons();
    const settlementTimer = window.setInterval(
      () => demoRepository.settleCompletedLessons(),
      30_000,
    );
    window.addEventListener("storage", storage);
    return () => {
      window.clearInterval(settlementTimer);
      window.removeEventListener("crazytalk-change", update);
      window.removeEventListener("storage", storage);
    };
  }, [queryClient]);
  return (
    <AccessContext.Provider
      value={{
        roleId,
        preview,
        accountId,
        setRole: (id, p = false, account = "") => {
          setAccountId(account);
          setRoleId(id);
          setPreview(p);
        },
      }}
    >
      {children}
    </AccessContext.Provider>
  );
}
export function useDemo() {
  const access = useContext(AccessContext);
  const queryClient = useQueryClient();
  const { data = demoRepository.read() } = useQuery({
    queryKey: ["demo"],
    queryFn: async () => demoRepository.read(),
    initialData: demoRepository.read,
    staleTime: Infinity,
  });
  const role = data.roles.find((r) => r.id === access.roleId);
  const activeAccount = data.accounts.find(a => a.enabled && a.id === access.accountId && a.roleId === access.roleId);
  const can = (permission: string) =>
    access.roleId === "admin" || !!role?.permissions.includes(permission);
  function act(command: Command) {
    if (access.preview) throw new Error("正在预览角色，退出预览后才能提交操作");
    if (access.accountId && !activeAccount) throw new Error("团队账号已停用");
    if (scope !== "全部") {
      const within=(studentId:string|undefined)=>{if(!studentId || !ids.has(studentId))throw new Error("记录不在当前数据范围内");};
      if(command.type==="survey.issue")within(command.id);
      if(command.type==="lesson.resolve")command.ids.forEach(id=>within(data.lessons.find(l=>l.id===id)?.studentId));
      if(command.type.startsWith("lesson.") && "id" in command)within(data.lessons.find(l=>l.id===command.id)?.studentId);
      if(command.type.startsWith("feedback.") && "id" in command)within(data.feedback.find(f=>f.id===command.id)?.studentId);
      if(command.type==="feedback.create" || command.type==="feedback.edit")within(command.feedback.studentId);
      if(command.type==="report.correct")within(data.reports.find(r=>r.id===command.id)?.studentId);
      if(command.type==="student.import")for(const profile of command.students)if(profile.importStudentId)within(profile.importStudentId);
      if(command.type==="order.buy" && command.studentIds.some(id=>!ids.has(id)))throw new Error("订单含超出授权范围的学员");
      if ("studentId" in command && command.studentId && !ids.has(command.studentId)) throw new Error("学员不在当前数据范围内");
      if ("id" in command && command.type.startsWith("student.") && !ids.has(command.id)) throw new Error("学员不在当前数据范围内");
    }
    if(activeAccount?.roleId==="tm" && command.type==="teacher.save"){
      const existing=data.teachers.find(t=>t.id===command.teacher.id);
      if(existing?.tmAccountId!==activeAccount.id || command.teacher.tmAccountId!==activeAccount.id)throw new Error("只能编辑本人负责的老师");
    }
    assertFeedbackCommandAccess(command, can);
    assertStudentCommandAccess(command, can);
    if (command.type === "teacher.save" && !can("availability.edit")) {
      const existing = data.teachers.find(
        (teacher) => teacher.id === command.teacher.id,
      );
      const schedule = (teacher: typeof command.teacher) =>
        JSON.stringify([
          teacher.availability,
          teacher.availabilityFrom,
          teacher.availabilityNote,
          teacher.availabilitySource,
        ]);
      if (
        existing
          ? schedule(existing) !== schedule(command.teacher)
          : command.teacher.availability.length > 0
      )
        throw new Error("你没有修改老师可用时间的权限");
    }
    const permission = command.type === "catalog.save" && ["项目", "渠道"].includes(command.entry.type)
      ? "org.manage" : commandPermissions[command.type];
    if (permission && !can(permission))
      throw new Error("你没有执行这个操作的权限");
    const operator = activeAccount?.name ||
      data.accounts.find(
        (account) => account.enabled && account.roleId === access.roleId,
      )?.name ||
      role?.name ||
      "教务";
    const result = demoRepository.execute({ ...command, operator });
    queryClient.setQueryData(["demo"], demoRepository.read());
    return result;
  }
  const scope = access.accountId ? activeAccount?.scope || "账号已停用" : role?.scope || "全部";
  const scopedStudents =
    scope === "全部"
      ? data.students
      : data.students.filter(s => studentInScope(data, s, scope, activeAccount));
  const ids = new Set(scopedStudents.map((s) => s.id));
  const scopedData =
    scope === "全部"
      ? data
      : {
          ...data,
          students: scopedStudents,
          orders:data.orders?.filter(o=>o.studentIds.some(id=>ids.has(id))).map(o=>({...o,studentIds:o.studentIds.filter(id=>ids.has(id))})),
          classInAccounts:data.classInAccounts?.filter(a=>a.studentIds.some(id=>ids.has(id))).map(a=>({...a,studentIds:a.studentIds.filter(id=>ids.has(id))})),
          lessons: data.lessons.filter((l) => ids.has(l.studentId)),
          feedback: data.feedback.filter((f) => ids.has(f.studentId)),
          credits: data.credits.filter((c) => ids.has(c.studentId)),
          events: data.events.filter(
            (e) => !e.studentId || ids.has(e.studentId),
          ),
          reports: data.reports.filter((r) => ids.has(r.studentId)),
          tasks: data.tasks.filter((task) => ids.has(task.studentId)),
          referrals: data.referrals.filter(
            (referral) =>
              ids.has(referral.studentId) &&
              ids.has(referral.referrerStudentId),
          ),
        };
  const managedTeacherIds=new Set(data.teachers.filter(t=>t.tmAccountId===activeAccount?.id).map(t=>t.id));
  const visible=activeAccount?.roleId==="tm" ? {...scopedData,
    teachers:scopedData.teachers.filter(t=>managedTeacherIds.has(t.id)),
    lessons:scopedData.lessons.filter(l=>managedTeacherIds.has(l.teacherId)),
    feedback:scopedData.feedback.filter(f=>managedTeacherIds.has(f.teacherId)),
    payroll:scopedData.payroll.filter(p=>managedTeacherIds.has(p.teacherId)),
    leaves:scopedData.leaves.filter(l=>managedTeacherIds.has(l.teacherId))
  } : scopedData;
  return {
    data: visible,
    act,
    can,
    ...access,
    reset: () => {
      demoRepository.reset();
      queryClient.setQueryData(["demo"], demoRepository.read());
    },
    scope: scopeLabel(data.catalog, scope),
  };
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
  "student.balance.open": "credit.add",
  "lesson.incident":"lesson.correct", "lesson.notice":"lesson.confirm",
  "slot.lock":"schedule.create", "slot.release":"schedule.create",
  "pay.terms":"pay_rate.edit","pay.freeze":"payroll.confirm",
  "survey.issue":"student.edit",
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
  "payroll.adjust": "payroll.adjust",
  "payroll.status": "payroll.confirm",
  "role.save": "role.manage",
  "role.delete": "role.manage",
  "account.save": "account.manage",
  "catalog.save": "basics.manage",
  "feedback-category.delete": "basics.manage",
  "rules.save": "rule.manage",
  "connection.save": "classin.manage",
};

export function assertFeedbackCommandAccess(
  command: Command,
  can: (permission: string) => boolean,
) {
  const permission =
    command.type === "feedback.followUp"
      ? command.section === "TM跟进"
        ? "feedback.verdict"
        : "feedback.process"
      : command.type === "feedback.customer"
        ? "feedback.process"
        : command.type === "feedback.tm" || command.type === "feedback.measures"
          ? "feedback.verdict"
          : command.type === "feedback.edit"
            ? "feedback.create"
            : "";
  if (permission && !can(permission))
    throw new Error("你没有执行这个操作的权限");
  if (
    (command.type === "feedback.measures" ||
      command.type === "feedback.verdict") &&
    command.measures.includes("扣款")
  ) {
    if (command.deductionConfirmed && !can("teacher_action.deduct"))
      throw new Error("你没有直接扣款的权限");
    if (
      !command.deductionConfirmed &&
      !can("teacher_action.create") &&
      !can("teacher_action.deduct")
    )
      throw new Error("你没有发起扣款的权限");
  }
}

export function assertStudentCommandAccess(
  command: Command,
  can: (permission: string) => boolean,
) {
  const permission =
    command.type === "student.profile" ||
    command.type === "student.details.update" ||
    command.type === "student.history.update"
      ? "student.edit"
      : command.type === "student.import"
        ? "student.import"
        : command.type === "student.balance.open"
          ? "credit.add"
          : undefined;
  if (permission && !can(permission))
    throw new Error("你没有执行这个操作的权限");
}
