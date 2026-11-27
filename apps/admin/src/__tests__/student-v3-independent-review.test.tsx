import { act as testAct } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import {
  DEMO_TODAY,
  addDays,
  transition,
  type DemoState,
} from "@crazytalk/shared";
import { DEMO_STORAGE_KEY, demoRepository } from "../../../../packages/shared/src/repository";
import { studentActivities } from "../lib/studentActivity";
import App from "../App";

function mount(path: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
async function choose(label: string, option: string) {
  await testAct(async () => {
    fireEvent.click(screen.getByRole("combobox", { name: label }));
  });
  await testAct(async () => {
    fireEvent.click(screen.getByRole("option", { name: option }));
  });
}
async function change(label: string, value: string) {
  await testAct(async () => {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), {
      target: { value },
    });
  });
}
let studentId: string;
let studentName: string;
function fixture(): DemoState {
  return structuredClone(demoRepository.read());
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  studentId = demoRepository.read().students[0].id;
  studentName = demoRepository.read().students[0].name;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("学员中心 V3 独立验收", () => {
  it("列表保留当前业务列及订单状态筛选；档案保留4个入口", async () => {
    mount("/students?view=正常&orderStatus=停课");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(
      screen.getByRole("combobox", { name: "订单状态筛选" }).textContent,
    ).toContain("停课");
    expect(screen.queryByRole("link", { name: studentName })).toBeNull();
    await choose("订单状态筛选", "全部订单状态");
    expect(screen.getAllByRole("link", { name: studentName })[0]).toBeTruthy();
    for (const name of [
      "学生名字",
      "学员 ID",
      "渠道",
      "订单状态",
      "上课老师",
      "起始教材",
      "上课时间",
      "总课时",
      "买单日期",
    ])
      expect(screen.getByRole("columnheader", { name })).toBeTruthy();
    for (const name of ["订单状态", "上课老师", "总课时"])
      expect(screen.getByRole("button", { name })).toBeTruthy();
    for (const name of ["学生名字", "学员 ID", "渠道", "教材", "上课时间"])
      expect(screen.queryByRole("button", { name })).toBeNull();
    await testAct(async () => {
      fireEvent.click(screen.getAllByRole("link", { name: studentName })[0]);
    });
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByText("****1234")).toBeTruthy();
  });
  it("列表/周历同源，筛选与切周保留实际课程，课程在档案内打开", async () => {
    const s = demoRepository.read().students[0];
    const lessons = demoRepository
      .read()
      .lessons.filter((l) => l.studentId === s.id);
    mount(`/students/${s.id}?tab=courses`);
    expect(screen.getAllByRole("button", { name: /^查看课程 / })).toHaveLength(
      lessons.length,
    );
    await choose("课程状态", "未开始");
    expect(screen.getAllByRole("button", { name: /^查看课程 / })).toHaveLength(
      lessons.filter((l) => l.status === "未开始").length,
    );
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "日历" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "下一周" }));
    });
    const selected = screen.getAllByRole("button", { name: /^查看课程 / })[0];
    await testAct(async () => {
      fireEvent.click(selected);
    });
    expect(screen.getByRole("dialog", { name: "课程详情" })).toBeTruthy();
    expect(
      document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ).toBe("课程与教材进度");
  });
  it("确认扣课必须人工填数量，更正归还差额且不改变薪资", () => {
    let data = fixture();
    const l = data.lessons.find(
      (l) => l.status === "待确认" && l.attendance === "正常",
    )!;
    l.duration = 120;
    delete l.confirmedUnits;
    const before = data.students.find((s) => s.id === l.studentId)!.balance;
    expect(() =>
      transition(data, {
        type: "lesson.resolve",
        ids: [l.id],
        decision: "扣课",
        reason: "核对完毕",
      }),
    ).toThrow(/数量|分钟/);
    data = transition(data, {
      type: "lesson.resolve",
      ids: [l.id],
      decision: "扣课",
      reason: "独立验收",
      units: 1.5,
    }).data;
    expect(data.students.find((s) => s.id === l.studentId)!.balance).toBe(
      before - 1.5,
    );
    const payroll = structuredClone(data.payroll);
    data = transition(data, {
      type: "lesson.correct",
      id: l.id,
      deduct: true,
      units: 0.5,
      reason: "核对更正",
      attendance: "正常",
      result: "已完成",
    }).data;
    expect(data.students.find((s) => s.id === l.studentId)!.balance).toBe(
      before - 0.5,
    );
    expect(data.payroll).toEqual(payroll);
    expect(
      data.events.filter(
        (e) => e.relatedType === "lesson" && e.relatedId === l.id,
      ),
    ).toHaveLength(2);
    expect(data.credits[0]).toMatchObject({ units: 1, lessonId: l.id });
  });
  it("教材报告只需教材与页码，更新最新课且编辑旧课不倒退当前进度", () => {
    let data = fixture();
    const lessons = data.lessons
      .filter(
        (l) => l.studentId === data.students[0].id && l.status === "已完成",
      )
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const old = lessons[0],
      latest = lessons[lessons.length - 1];
    const save = (l: typeof old, to: string) => ({
      type: "report.save" as const,
      report: {
        lessonId: l.id,
        studentId: l.studentId,
        teacherId: l.teacherId,
        date: l.date,
        material: "独立教材",
        from: "",
        to,
        rating: 0,
        comment: "",
        suggestedLevel: "",
      },
    });
    data = transition(data, save(latest, "p.120")).data;
    data = transition(data, save(old, "p.55")).data;
    expect(data.students[0]).toMatchObject({
      material: "独立教材",
      unit: "p.120",
    });
    expect(data.reports.find((r) => r.lessonId === old.id)).toMatchObject({
      to: "p.55",
      rating: 0,
      comment: "",
    });
  });
  it("服务记录采用充值/转介绍的业务日期，实体与登记日志不重复", () => {
    let data = fixture();
    const s = data.students[0],
      ref = data.students[1];
    data = transition(data, {
      type: "referral.add",
      studentId: s.id,
      referrerStudentId: ref.id,
      date: "2026-09-15",
      note: "独立关系",
    }).data;
    const relation = data.referrals[0];
    data = transition(data, {
      type: "credit.add",
      studentId: s.id,
      units: 3,
      kind: "充值",
      date: "2026-09-16",
      note: "独立充值",
      referralId: relation.id,
    }).data;
    const feed = studentActivities(data, s.id);
    expect(feed.filter((a) => a.content.includes("独立关系"))).toHaveLength(1);
    expect(
      feed.find(
        (a) => a.target.kind === "referral" && a.target.id === relation.id,
      )?.date,
    ).toBe("2026-09-15");
    expect(feed.filter((a) => a.content.includes("独立充值"))).toHaveLength(1);
    expect(data.students[0].balance).toBe(s.balance + 3);
  });
  it("新增换师日志保留全部历史换师且同一事项只展示一次", () => {
    const data = fixture();
    data.students[0].teacherChanges = [
      {
        id: "review-old-change",
        date: "2026-08-01",
        fromTeacher: "旧老师A",
        toTeacher: "旧老师B",
        reason: "历史调整",
      },
      {
        id: "review-new-change",
        date: "2026-11-05",
        fromTeacher: "旧老师B",
        toTeacher: "新老师C",
        reason: "本次调整",
      },
    ];
    data.events = data.events.filter((event) => event.studentId !== studentId);
    data.events.push({
      id: "review-change-event",
      studentId: studentId,
      teacherId: "t1",
      date: DEMO_TODAY,
      type: "换老师",
      content: "由 新老师C 接手 3 节课，本次调整",
      operator: "验收",
    });
    const changes = studentActivities(data, studentId).filter(
      (item) => item.type === "换老师",
    );
    expect(changes).toHaveLength(2);
    expect(changes.map((item) => item.date)).toEqual([
      "2026-11-05",
      "2026-08-01",
    ]);
    expect(changes.map((item) => item.target.kind)).toEqual([
      "teacherChange",
      "teacherChange",
    ]);
  });
  it("待办可空总结完成，自动完成人时间，无期限不设今天", () => {
    let data = fixture();
    data.students[0].owner = "";
    data = transition(data, {
      type: "task.add",
      studentId: data.students[0].id,
      title: "独立待办",
      owner: "",
      dueDate: "",
      note: "",
    }).data;
    const t = data.tasks[0];
    expect(t).toMatchObject({
      owner: "待分配",
      dueDate: "",
      sourceType: "manual",
    });
    data = transition(data, {
      type: "task.complete",
      id: t.id,
      result: "",
      operator: "独立验收",
    }).data;
    expect(data.tasks[0]).toMatchObject({
      status: "已完成",
      result: "",
      completedBy: "独立验收",
    });
    expect(Number.isFinite(Date.parse(data.tasks[0].completedAt))).toBe(true);
    expect(() =>
      transition(data, { type: "task.complete", id: t.id, result: "" }),
    ).toThrow(/已经完成/);
  });
  it("凌晨完成待办后服务记录按北京时间归入正确日期", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:30:00+08:00"));
    try {
      let data = fixture();
      data = transition(data, {
        type: "task.add",
        studentId: studentId,
        title: "凌晨独立验收",
        owner: "",
      }).data;
      const task = data.tasks[0];
      data = transition(data, {
        type: "task.complete",
        id: task.id,
        result: "",
      }).data;
      expect(
        studentActivities(data, studentId).find(
          (item) => item.target.kind === "task" && item.target.id === task.id,
        )?.date,
      ).toBe("2026-11-01");
    } finally {
      vi.useRealTimers();
    }
  });
  it("余额高于阈值和暂停服务不误报；课前提醒关联真实课并防重", () => {
    let data = fixture();
    const s = data.students[0];
    const before = data.tasks.length;
    s.balance = 101;
    data = transition(data, {
      type: "student.reminder.preview",
      studentId: s.id,
      kind: "balance",
      threshold: 100,
    }).data;
    expect(data.tasks).toHaveLength(before);
    data.students[0].status = "停课";
    data = transition(data, {
      type: "student.reminder.preview",
      studentId: s.id,
      kind: "balance",
      threshold: 100,
    }).data;
    expect(data.tasks).toHaveLength(before);
    data.students[0].status = "在读";
    const l = data.lessons.find(
      (l) =>
        l.studentId === s.id && l.status === "未开始" && l.date >= DEMO_TODAY,
    )!;
    const cmd = {
      type: "student.courseReminder.preview" as const,
      studentId: s.id,
      lessonId: l.id,
      kind: "before" as const,
    };
    data = transition(data, cmd).data;
    data = transition(data, cmd).data;
    expect(data.tasks).toHaveLength(before + 1);
    expect(data.tasks[0]).toMatchObject({
      lessonIds: [l.id],
      sourceType: "reminder",
      dueDate: "",
    });
  });
  it("老师离职向有预约或有效绑定的学员派单且附真实课程", () => {
    const data = fixture();
    const t = data.teachers[0];
    const affected = data.lessons.filter(
      (l) =>
        l.teacherId === t.id && l.status === "未开始" && l.date >= DEMO_TODAY,
    );
    const next = transition(data, {
      type: "teacher.offboard",
      teacherId: t.id,
      reason: "独立验收",
    }).data;
    const tasks = next.tasks.filter(
      (task) => task.sourceId === `offboard:${t.id}`,
    );
    expect(tasks.map((t) => t.studentId).sort()).toEqual(
      [...new Set([...affected.map((l) => l.studentId), ...data.students.filter(s => s.teacherId === t.id && !["停课", "结课", "退费"].includes(s.status)).map(s => s.id)])].sort(),
    );
    for (const task of tasks)
      expect(task.lessonIds?.sort()).toEqual(
        affected
          .filter((l) => l.studentId === task.studentId)
          .map((l) => l.id)
          .sort(),
      );
  });
  it("指定课程调课带入原安排，改动后关窗继续填写保留内容", async () => {
    const l = demoRepository
      .read()
      .lessons.find((l) => l.studentId === studentId && l.status === "未开始")!;
    mount(`/students/${studentId}?tab=courses`);
    await testAct(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(`^查看课程 ${l.date} ${l.time}`),
        }),
      );
    });
    await testAct(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "课程详情" })).getByRole(
          "button",
          { name: "调课" },
        ),
      );
    });
    const dlg = screen.getByRole("dialog", { name: `给 ${studentName} 调课` });
    expect(
      (within(dlg).getByLabelText("新的上课时间") as HTMLInputElement).value,
    ).toBe(l.time);
    await change("备注 / 原因", "独立验收调整");
    await testAct(async () => {
      fireEvent.click(within(dlg).getByRole("button", { name: "取消" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "继续填写" }));
    });
    expect(
      (screen.getByLabelText("备注 / 原因") as HTMLTextAreaElement).value,
    ).toBe("独立验收调整");
  });
  it("反馈在档案内登记查看编辑并补偿，不跳离服务页", async () => {
    mount(`/students/${studentId}?tab=service`);
    await testAct(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "登记反馈" })[0]);
    });
    expect(screen.getByRole("dialog", { name: /反馈/ })).toBeTruthy();
    expect(
      document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ).toBe("服务跟进");
  });
  it("55/120分钟与取消课程在周历按实际起止时间展示", async () => {
    const data = fixture();
    const source = data.lessons.find((l) => l.studentId === studentId)!;
    data.lessons = data.lessons.filter((l) => l.studentId !== studentId);
    data.lessons.push(
      {
        ...source,
        id: "review-55",
        date: DEMO_TODAY,
        time: "09:05",
        duration: 55,
        status: "已取消",
        deducted: false,
      },
      {
        ...source,
        id: "review-120",
        date: DEMO_TODAY,
        time: "10:00",
        duration: 120,
        status: "未开始",
        deducted: false,
      },
    );
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
    demoRepository.refresh();
    mount(`/students/${studentId}?tab=courses`);
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "日历" }));
    });
    const short = screen.getByRole("button", {
      name: /^查看课程 .*55分钟 已取消$/,
    });
    const long = screen.getByRole("button", {
      name: /^查看课程 .*120分钟 未开始$/,
    });
    expect(short.textContent).toContain("09:05–10:00");
    expect(short.className).toContain("sc-cancelled");
    expect(long.textContent).toContain("10:00–12:00");
    expect(Number.parseFloat(short.style.height)).toBeLessThan(
      Number.parseFloat(long.style.height),
    );
  });
  it("从档案登记反馈，到反馈页编辑处理，再回档案关联补偿", async () => {
    mount(`/students/${studentId}?tab=service`);
    await testAct(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "登记反馈" })[0]);
    });
    await change("学员反馈（原话）", "独立验收反馈闭环");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存反馈" }));
    });
    const activity = screen.getByText("独立验收反馈闭环").closest("article")!;
    await testAct(async () => {
      fireEvent.click(
        within(activity).getByRole("button", { name: "查看详情" }),
      );
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "前往反馈处理" }));
    });
    const editFeedback = await screen.findByRole("button", {
      name: "编辑反馈资料",
    });
    await testAct(async () => {
      fireEvent.click(editFeedback);
    });
    await change("学员反馈（原话）", "独立验收反馈已编辑");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存反馈" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "更新客服处理" }));
    });
    await choose("客服处理进度", "处理中");
    await change("客服备注", "已与家长核实");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存客服处理" }));
    });
    const feedback = demoRepository
      .read()
      .feedback.find((f) => f.content === "独立验收反馈已编辑")!;
    expect(feedback).toMatchObject({
      customerProgress: "处理中",
      processNote: "已与家长核实",
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("link", { name: studentId }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "服务跟进" }));
    });
    expect(screen.queryByRole("button", { name: "登记补偿" })).toBeNull();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "课时与续费" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加课时" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "补偿" }));
    });
    await choose("关联反馈", `${DEMO_TODAY} · 独立验收反馈已编辑`);
    expect(
      screen.getByRole("combobox", { name: "关联反馈" }).textContent,
    ).toContain("独立验收反馈已编辑");
    await change("课时数", "0.5");
    await change("备注 / 原因", "独立核实补偿");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认加 0.5 课时" }));
    });
    expect(demoRepository.read().credits[0]).toMatchObject({
      feedbackId: feedback.id,
      type: "补偿",
      units: 0.5,
    });
    expect(
      document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ).toBe("课时与续费");
  });
  it("取消充值关闭表单且不保存业务日期和流水", async () => {
    mount(`/students/${studentId}?tab=credits`);
    await testAct(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "加课时" })[0]);
    });
    await change("业务日期", addDays(DEMO_TODAY, -3));
    await testAct(async () => {
      fireEvent.click(
        within(
          screen.getByRole("dialog", { name: `给 ${studentName} 加课时` }),
        ).getByRole("button", { name: "取消" }),
      );
    });
    expect(
      screen.queryByRole("dialog", { name: `给 ${studentName} 加课时` }),
    ).toBeNull();
    expect(
      demoRepository
        .read()
        .credits.some(
          (c) =>
            c.date === addDays(DEMO_TODAY, -3) &&
            c.studentId === studentId &&
            c.units === 72,
        ),
    ).toBe(false);
  });
  it("档案内反馈原话填写后关闭，保护未保存的反馈内容", async () => {
    mount(`/students/${studentId}?tab=service`);
    await testAct(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "登记反馈" })[0]);
    });
    await change("学员反馈（原话）", "独立验收尚未保存的家长原话");
    await testAct(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "登记反馈" })).getByRole(
          "button",
          { name: "取消" },
        ),
      );
    });
    const protection = screen.queryByRole("dialog", {
      name: "放弃未保存的内容？",
    });
    if (protection) {
      await testAct(async () => {
        fireEvent.click(
          within(protection).getByRole("button", { name: "继续编辑" }),
        );
      });
      expect(
        (screen.getByLabelText("学员反馈（原话）") as HTMLTextAreaElement)
          .value,
      ).toBe("独立验收尚未保存的家长原话");
    } else if (!screen.queryByRole("dialog", { name: "登记反馈" })) {
      await testAct(async () => {
        fireEvent.click(screen.getAllByRole("button", { name: "登记反馈" })[0]);
      });
      expect(
        (screen.getByLabelText("学员反馈（原话）") as HTMLTextAreaElement)
          .value,
      ).toBe("独立验收尚未保存的家长原话");
    }
  });
  it.each([
    ["更新客服处理", "客服备注", "processNote"],
    ["更新 TM 判定", "TM判定说明", "tmNote"],
    ["添加跟进", "追加跟进内容", "followUps"],
  ] as const)(
    "从档案进入反馈页后，%s关闭不写入草稿",
    async (action, label, field) => {
      const record = demoRepository
        .read()
        .feedback.find((f) => f.studentId === studentId)!;
      const before = structuredClone(record[field]);
      mount(`/students/${studentId}?tab=service`);
      const article = screen.getByText(record.content).closest("article")!;
      await testAct(async () => {
        fireEvent.click(
          within(article).getByRole("button", { name: "查看详情" }),
        );
      });
      await testAct(async () => {
        fireEvent.click(screen.getByRole("button", { name: "前往反馈处理" }));
      });
      await testAct(async () => {
        fireEvent.click(screen.getByRole("button", { name: action }));
      });
      await change(label, "未保存草稿");
      await testAct(async () => {
        fireEvent.click(
          within(screen.getByRole("dialog", { name: action })).getByRole(
            "button",
            { name: "关闭" },
          ),
        );
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(
        demoRepository.read().feedback.find((f) => f.id === record.id)![field],
      ).toEqual(before);
    },
  );
});
