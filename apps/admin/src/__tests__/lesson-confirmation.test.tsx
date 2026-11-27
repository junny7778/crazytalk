import { act as testAct } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import App from "../App";
import { CloseLesson } from "../../../teacher/src/screens";
import zh from "../../../teacher/src/locales/zh";
import { DEMO_TODAY, halfMonthStatement, type Report } from "@crazytalk/shared";

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
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  for (const lesson of demoRepository.read().lessons) {
    if (lesson.status === "待确认" && lesson.attendance === "正常") {
      lesson.teacherIn = lesson.time;
      lesson.studentIn = lesson.time;
      lesson.teacherOut = "23:00";
      lesson.studentOut = "23:00";
      lesson.teacherAttendance = ["正常"];
      delete lesson.confirmedUnits;
    }
  }
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

describe("学员课程入口与人工确认", () => {
  it("老师上传截图后可以提交单节记录，历史已处理课不重复消课", async () => {
    const data = demoRepository.read();
    const student = data.students[0];
    const lesson = data.lessons
      .filter(
        (item) =>
          item.studentId === student.id &&
          item.date <= "2026-10-31" &&
          ["待确认", "已完成", "缺席"].includes(item.status),
      )
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    data.reports = data.reports.filter(
      (report) => report.studentId !== student.id,
    );
    const beforeBalance = student.balance;
    const beforeStatus = student.status;
    const save = vi.fn((report: Omit<Report, "id">) =>
      demoRepository.execute({ type: "report.save", report }),
    );
    render(
      <CloseLesson
        lesson={lesson}
        student={student}
        existing={undefined}
        t={(key) => zh[key]}
        language="zh"
        dateLabel={(date) => date}
        onSave={save}
      />,
    );
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: /提交结课/ })); });
    expect(screen.getByRole("alert").textContent).toMatch(/截图/);
    expect(save).not.toHaveBeenCalled();
    await testAct(async () => { fireEvent.change(screen.getByLabelText(/教材结束页截图/),{target:{files:[new File(["data"],"page.png",{type:"image/png"})]}}); });
    await screen.findByRole("img",{name:"结束页"});
    await testAct(async () => { fireEvent.change(screen.getByRole("textbox", { name: /教材/ }), {
      target: { value: "新版教材" },
    }); });
    await testAct(async () => { fireEvent.change(screen.getByRole("spinbutton", { name: "页码" }), {
      target: { value: "12" },
    }); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: /提交结课/ })); });
    expect(save).toHaveBeenCalledOnce();
    const after = demoRepository.read();
    expect(
      after.reports.find((report) => report.lessonId === lesson.id),
    ).toMatchObject({ material: "新版教材", rating: 0, comment: "" });
    expect(after.students[0]).toMatchObject({
      material: "新版教材",
      balance: beforeBalance - (lesson.deducted ? 0 : lesson.confirmedUnits ?? 1),
      status: beforeStatus,
    });
    expect(after.students[0].unit).toMatch(/P12$/);
    expect(after.lessons.find((item) => item.id === lesson.id)?.deducted).toBe(
      true,
    );
  });
  it("从学员详情筛选课程时，不显示其他学生的课程", async () => {
    const data = demoRepository.read();
    const student = data.students[0];
    const expected = data.lessons.filter(
      (lesson) => lesson.studentId === student.id,
    );
    mount(`/lessons?tab=all&student=${student.id}`);
    expect(await screen.findByText(`共 ${expected.length} 节课`)).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(expected.length + 1);
    const studentLinks = within(screen.getByRole("table")).getAllByRole("link")
      .filter(link => link.getAttribute("href")?.startsWith("/students/"));
    expect(studentLinks.map(link => link.getAttribute("href"))).toEqual(
      expected.map(() => "/students/" + student.id),
    );
  });

  it("从详情核实老师缺席，只提交一次，保留余额和核实依据", async () => {
    const data = demoRepository.read();
    const row = data.lessons.find(l => l.status === "待确认" && l.attendance === "正常")!;
    row.teacherIn = "";
    row.teacherOut = "";
    row.attendanceMessages = {老师: new Date(Date.parse(row.date+"T"+row.time+":00+08:00")+600000).toISOString()};
    const balance = data.students.find(s=>s.id===row.studentId)!.balance;
    mount(`/lessons?lesson=${row.id}`);
    const detail = await screen.findByRole("dialog", {name:"课程详情"});
    expect(within(detail).queryByRole("button",{name:"更正结果"})).toBeNull();
    await testAct(async () => { fireEvent.click(within(detail).getByRole("button",{name:"核实"})); });
    const form = screen.getByRole("dialog",{name:"核实上课记录"});
    expect(within(form).getByText(/开课满 10 分钟，老师仍未到堂/)).toBeTruthy();
    expect((within(form).getByRole("button",{name:"确认核实"}) as HTMLButtonElement).disabled).toBe(true);
    await testAct(async () => { fireEvent.click(within(form).getByRole("combobox",{name:/核实结论/})); });
    await testAct(async () => { fireEvent.click(screen.getByRole("option",{name:"老师缺席"})); });
    expect(within(form).queryByRole("spinbutton")).toBeNull();
    await testAct(async () => { fireEvent.change(within(form).getByRole("textbox",{name:/核实依据/}),{target:{value:"已与老师核实"}}); });
    await testAct(async () => { fireEvent.click(within(form).getByRole("button",{name:"确认核实"})); });
    await screen.findByRole("button",{name:"更正结果"});
    expect(demoRepository.read().lessons.find(l=>l.id===row.id)).toMatchObject({status:"已完成",deducted:false,attendance:"老师缺席",incident:{reason:"老师缺席",note:"已与老师核实"}});
    expect(demoRepository.read().students.find(s=>s.id===row.studentId)!.balance).toBe(balance);
  });

  it("55分钟课程不自行折算，填写确认数量后扣课并准确撤销", async () => {
    const data = demoRepository.read();
    const lesson = data.lessons.find(
      (item) => item.status === "待确认" && item.attendance === "正常",
    )!;
    lesson.duration = 55;
    delete lesson.confirmedUnits;
    const student = data.students.find((item) => item.id === lesson.studentId)!;
    const balance = student.balance;
    mount(`/lessons?tab=confirm&student=${student.id}`);
    const checkbox = await screen.findByRole("row", {
      name: `课程 ${lesson.id}`,
    });
    await testAct(async () => { fireEvent.click(
      within(checkbox.closest("tr")!).getByRole("button", { name: "核实" }),
    ); });
    const dialog = screen.getByRole("dialog", { name: "核实上课记录" });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("combobox", { name: /核实结论/ })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("option", { name: "正常上课" })); });
    await testAct(async () => { fireEvent.change(within(dialog).getByRole("textbox", {name:/核实依据/}), {target:{value:"已核对上课记录"}}); });
    expect(
      within(dialog)
        .getByRole("spinbutton", { name: /本节扣课数量/ })
        .getAttribute("value"),
    ).toBe("");
    expect(
      (
        within(dialog).getByRole("button", {
          name: "确认核实",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await testAct(async () => { fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: /本节扣课数量/ }),
      { target: { value: "1.5" } },
    ); });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "确认核实" })); });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "核实上课记录" })).toBeNull(),
    );
    expect(
      demoRepository.read().students.find((item) => item.id === student.id)
        ?.balance,
    ).toBe(balance - 1.5);
    expect(demoRepository.read().credits[0]).toMatchObject({
      units: -1.5,
      studentId: student.id,
    });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "撤销" })); });
    await waitFor(() =>
      expect(
        demoRepository.read().students.find((item) => item.id === student.id)
          ?.balance,
      ).toBe(balance),
    );
  });
});

describe("统一上课记录列表", () => {
  it("默认全部记录，快捷筛选保留搜索", async () => {
    const data = demoRepository.read();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-31T00:00:00+08:00"));
    const normal = data.lessons.find(
      (l) => l.status === "待确认" && l.attendance === "正常",
    )!;
    const student = data.students.find((s) => s.id === normal.studentId)!;
    mount(`/lessons?student=${student.id}`);
    await screen.findByRole("table");
    expect(screen.getAllByRole("row").length).toBe(
      Math.min(
        25,
        data.lessons.filter((l) => l.studentId === student.id).length,
      ) + 1,
    );
    const search = screen.getByPlaceholderText("搜索学员或老师姓名");
    await testAct(async () => { fireEvent.change(search, { target: { value: student.name } }); });
    await testAct(async () => { fireEvent.click(screen.getByRole("tab", { name: /待确认/ })); });
    expect(screen.queryByRole("button", { name: "批量确认" })).toBeNull();
    expect(search.getAttribute("value")).toBe(student.name);
    const expected = data.lessons.filter(
      (l) => l.studentId === student.id && l.status === "待确认",
    );
    expect(screen.getByText(`共 ${expected.length} 节课`)).toBeTruthy();
  });

  it("分页每页最多25条，日期范围和考勤链接筛选同时生效", async () => {
    const data = demoRepository.read();
    mount("/lessons");
    await screen.findByRole("table");
    expect(screen.getAllByRole("row")).toHaveLength(
      Math.min(25, data.lessons.length) + 1,
    );
    if (data.lessons.length > 25) {
      await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "下一页" })); });
      expect(screen.getByRole("button", { name: "第 2 页" })).toBeTruthy();
    }
    cleanup();
    const lesson = data.lessons.find((l) => l.status === "待确认")!;
    Object.assign(lesson, {
      date: "2025-01-06", attendance: "无数据", classInAttendanceReceived: false,
      incident: undefined, classInAttendanceIssue: undefined,
    });
    data.lessons = [
      lesson, { ...lesson, id: "other-date", date: "2025-01-07" },
      { ...lesson, id: "account-unlinked", attendance: "账号待关联" },
    ];
    mount("/lessons?tab=confirm&from=2025-01-06&to=2025-01-06&attendance=" + encodeURIComponent("数据缺失"));
    expect(await screen.findByText("共 1 节课")).toBeTruthy();
    expect(screen.getByRole("row", { name: "课程 " + lesson.id })).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });
});

it("导出包含全部筛选结果而非其他状态或仅当前页", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-31T00:00:00+08:00"));
  const expected = demoRepository
    .read()
    .lessons.filter((l) => l.status === "待确认");
  const create = vi.fn((_blob: Blob) => "blob:test");
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = create;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    mount("/lessons?tab=confirm");
    await testAct(async () => { fireEvent.click(
      await screen.findByRole("button", { name: "导出筛选结果" }),
    ); });
    const blob = create.mock.calls[0][0];
    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(csv.split("\r\n")).toHaveLength(expected.length + 1);
    expect(csv).not.toContain('"已完成"');
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

it.each(["/students", "/teachers", "/feedback", "/payroll"])(
  "一级列表 %s 使用统一25条分页",
  async (path) => {
    mount(path);
    const pagination = await screen.findByRole("navigation", {
      name: "列表分页",
    });
    expect(within(pagination).getByText(/每页 25 条/)).toBeTruthy();
    expect(
      within(pagination)
        .getByRole("button", { name: "第 1 页" })
        .getAttribute("aria-current"),
    ).toBe("page");
  },
);

it("上课记录仅匹配学员和老师姓名，不匹配群名", async () => {
  const data = demoRepository.read();
  const lesson = data.lessons[0];
  const student = data.students.find((item) => item.id === lesson.studentId)!;
  const teacher = data.teachers.find((item) => item.id === lesson.teacherId)!;
  student.name = "搜索验证学员";
  student.groupName = "仅群名关键词";
  teacher.name = "SearchOnlyTeacher";
  mount("/lessons");
  const search = await screen.findByPlaceholderText("搜索学员或老师姓名");
  await testAct(async () => { fireEvent.change(search, { target: { value: "仅群名关键词" } }); });
  expect(screen.getByText("共 0 节课")).toBeTruthy();
  await testAct(async () => { fireEvent.change(search, { target: { value: "验证学员" } }); });
  expect(
    screen.getByText(
      `共 ${data.lessons.filter((item) => item.studentId === student.id).length} 节课`,
    ),
  ).toBeTruthy();
  await testAct(async () => { fireEvent.change(search, { target: { value: "searchonlyteacher" } }); });
  expect(
    screen.getByText(
      `共 ${data.lessons.filter((item) => item.teacherId === teacher.id).length} 节课`,
    ),
  ).toBeTruthy();
});

it.each(["未开始", "已完成"] as const)(
  "课程详情独立展示字段，%s的进出时间按状态展示",
  async (status) => {
    const data = demoRepository.read();
    const lesson = data.lessons[0];
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-01T00:00:00+08:00"));
    if (status === "未开始") lesson.date = "2026-11-02";
    lesson.status = status;
    lesson.teacherIn = "20:31";
    lesson.teacherOut = "20:56";
    lesson.studentIn = "20:32";
    lesson.studentOut = "20:57";
    mount(`/lessons?student=${lesson.studentId}`);
    const checkbox = await screen.findByRole("row", {
      name: `课程 ${lesson.id}`,
    });
    await testAct(async () => { fireEvent.click(
      within(checkbox.closest("tr")!).getByRole("button", { name: "详情" }),
    ); });
    const dialog = within(screen.getByRole("dialog", { name: "课程详情" }));
    for (const label of [
      "学员",
      "老师",
      "上课日期",
      "计划开始时间",
      "计划时长",
      "课程类型",
      "老师进入时间",
      "老师离开时间",
      "学员进入时间",
      "学员离开时间",
    ])
      expect(dialog.getByText(label)).toBeTruthy();
    for (const time of ["20:31", "20:56", "20:32", "20:57"]) {
      if (status === "未开始") expect(dialog.queryByText(time)).toBeNull();
      else expect(dialog.getByText(time)).toBeTruthy();
    }
    if (status === "未开始") expect(dialog.getByText("尚未结算")).toBeTruthy();
  },
);

it.each([
  ["2025-01-14T23:59:59+08:00", "等待回传"],
  ["2025-01-15T00:00:00+08:00", "数据缺失"],
])("没有最终摘要时，上课记录列表及详情在 %s 显示%s", async (time, label) => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(time));
  const data = demoRepository.read();
  const lesson = data.lessons.find(l => l.status === "未开始")!;
  Object.assign(lesson, {
    date: "2025-01-06", time: "20:30", duration: 25, attendance: "正常",
    teacherIn: "20:30", studentIn: "20:30", teacherOut: "20:55", studentOut: "20:55",
    classInAttendanceReceived: false, classInAttendanceIssue: undefined,
  });
  const complete = {
    ...lesson, id: "reported-normal", status: "待确认" as const, attendance: "正常" as const,
    teacherAttendance: ["正常" as const], studentAttendance: ["正常" as const],
    classInAttendanceReceived: true, autoSettlementPaused: true,
  };
  data.lessons = [lesson, complete];
  mount("/lessons?student=" + lesson.studentId + "&from=2025-01-06&to=2025-01-06");
  expect(await screen.findByRole("row", { name: "课程 " + complete.id })).toBeTruthy();
  fireEvent.click(screen.getByRole("combobox", { name: "考勤情况" }));
  fireEvent.click(screen.getByRole("option", { name: label }));
  expect(screen.queryByRole("row", { name: "课程 " + complete.id })).toBeNull();
  const row = within(screen.getByRole("row", { name: "课程 " + lesson.id }));
  expect(row.getByText("待确认")).toBeTruthy();
  const attendanceIndex = screen.getAllByRole("columnheader").findIndex(h => h.textContent === "考勤");
  expect(row.getAllByRole("cell")[attendanceIndex].textContent).toBe(label);
  if (label === "等待回传") expect(row.queryByText(/已过计划结束时间，待核实/)).toBeNull();
  fireEvent.click(row.getByRole("button", { name: "详情" }));
  const detail = within(screen.getByRole("dialog", { name: "课程详情" }));
  expect(detail.getByText("考勤", { selector: "dt", exact: true }).nextElementSibling?.textContent).toBe(label);
  for (const [field, time] of [["老师进入时间", "20:30"], ["学员进入时间", "20:30"], ["老师离开时间", "20:55"], ["学员离开时间", "20:55"]]) {
    expect(detail.getByText(field).nextElementSibling?.textContent).toBe(time);
  }
  if (label === "数据缺失") {
    fireEvent.click(detail.getByRole("button", { name: "核实" }));
    const form = within(screen.getByRole("dialog", { name: "核实上课记录" }));
    expect(form.getByText(/仍未收到 ClassIn 最终考勤/)).toBeTruthy();
    expect(form.getAllByText("20:55")).toHaveLength(2);
  }
  if (label === "等待回传") expect(detail.queryByText(/已过计划结束时间，待核实/)).toBeNull();
  expect(data.lessons.find(l => l.id === lesson.id)?.status).toBe("未开始");
});

it("最终摘要确认学员缺席后，列表和详情展示缺席，可单独确认学员课时", async () => {
  const data = demoRepository.read();
  const lesson = data.lessons.find(l => l.status === "待确认")!;
  Object.assign(lesson, {
    date: "2025-01-06", time: "19:00", duration: 25, plannedUnits: 1, deducted: false,
    attendance: "学员缺席", teacherAttendance: ["正常"], studentAttendance: ["缺席"],
    teacherIn: "19:00", teacherOut: "19:25", studentIn: "", studentOut: "",
    classInAttendanceReceived: true, classInAttendanceIssue: undefined, incident: undefined,
    attendanceFinal: {学员: true},
  });
  const teacher = data.teachers.find(t => t.id === lesson.teacherId)!;
  Object.assign(teacher, { payMode: "NP", rate: 180 });
  data.officePayRates = { [teacher.so]: 60 };
  const rows = halfMonthStatement(data, teacher, "2025-01-1").rows.filter(r => r.source === lesson.id);
  expect(rows.map(r => [r.teacher, r.office])).toEqual([[90,30]]);
  mount("/lessons?student=" + lesson.studentId + "&from=2025-01-06&to=2025-01-06");
  const row = within(await screen.findByRole("row", { name: "课程 " + lesson.id }));
  expect(row.getByText("学员缺席")).toBeTruthy();
  expect(row.getByRole("button", { name: "确认学员课时" })).toBeTruthy();
  expect(row.queryByRole("button", { name: "核实" })).toBeNull();
  fireEvent.click(row.getByRole("button", { name: "详情" }));
  const detail = within(screen.getByRole("dialog", { name: "课程详情" }));
  expect(detail.getByText("考勤", { selector: "dt", exact: true }).nextElementSibling?.textContent).toBe("学员缺席");
  expect(detail.getByText("学员考勤", { selector: "dt" }).nextElementSibling?.textContent).toBe("缺席");
  expect(detail.queryByRole("button", { name: "核实" })).toBeNull();
  fireEvent.click(detail.getByRole("button", { name: "确认学员课时" }));
  const form = within(screen.getByRole("dialog", { name: "确认学员课时" }));
  expect(form.queryByRole("combobox", { name: /核实结论/ })).toBeNull();
  fireEvent.click(form.getByRole("combobox", { name: /课时处理/ }));
  fireEvent.click(screen.getByRole("option", { name: "不扣" }));
  fireEvent.change(form.getByRole("textbox", { name: /课时处理说明/ }), { target: { value: "批准免扣学员课时" } });
  fireEvent.click(form.getByRole("button", { name: "确认课时" }));
  await waitFor(() => {
    const updated = demoRepository.read();
    const recorded = updated.lessons.find(l => l.id === lesson.id)!;
    expect(recorded).toMatchObject({ status: "已完成", deducted: false, attendance: "学员缺席" });
    expect(halfMonthStatement(updated, teacher, "2025-01-1").rows.filter(r => r.source === lesson.id)
      .map(r => [r.teacher, r.office])).toEqual([[90,30]]);
  });
});

it("课程已结束包含历史缺席，状态筛选不再提供缺席", async () => {
  const data = demoRepository.read();
  const lesson = data.lessons[0];
  lesson.status = "缺席";
  lesson.attendance = "学员缺席";
  mount(`/lessons?student=${lesson.studentId}&status=已结束`);
  const checkbox = await screen.findByRole("row", {
    name: `课程 ${lesson.id}`,
  });
  const row = within(checkbox.closest("tr")!);
  expect(row.getByText("已结束")).toBeTruthy();
  expect(row.getByText("学员缺席")).toBeTruthy();
  await testAct(async () => { fireEvent.click(row.getByRole("button", { name: "详情" })); });
  expect(
    within(screen.getByRole("dialog", { name: "课程详情" })).getByText(
      "已结束",
    ),
  ).toBeTruthy();
});

it("确认学员缺席后保存考勤，不再写入独立缺席课程状态", () => {
  const lesson = demoRepository
    .read()
    .lessons.find((l) => l.status === "待确认" && l.attendance === "正常")!;
  demoRepository.execute({
    type: "lesson.resolve",
    ids: [lesson.id],
    decision: "缺席",
    units: 1,
    reason: "已核实学员缺席",
  });
  const result = demoRepository.read().lessons.find((l) => l.id === lesson.id)!;
  expect(result.status).toBe("已完成");
  expect(result.attendance).toBe("学员缺席");
  expect(result.studentAttendance).toEqual(["缺席"]);
});

it("考勤筛选独立列出等待回传和数据缺失，截止后无回传可按数据缺失筛选", async () => {
  const lesson = demoRepository.read().lessons[0];
  Object.assign(lesson, {
    date: "2025-01-06", status: "待确认", attendance: "无数据",
    classInAttendanceReceived: false, incident: undefined, classInAttendanceIssue: undefined,
  });
  mount("/lessons?student=" + lesson.studentId + "&from=2025-01-06&to=2025-01-06");
  fireEvent.click(await screen.findByRole("combobox", { name: "考勤情况" }));
  for (const name of ["等待回传", "待核实", "数据缺失"]) {
    expect(screen.getByRole("option", { name })).toBeTruthy();
  }
  fireEvent.click(screen.getByRole("option", { name: "数据缺失" }));
  const row = within(screen.getByRole("row", { name: "课程 " + lesson.id }));
  expect(row.getByText("数据缺失", { selector: ".badge" })).toBeTruthy();
});

it("进入上课记录自动结算正常课，仅异常课保留核实入口", async () => {
  const data = demoRepository.read();
  const lesson = data.lessons.find(
    (l) => l.status === "待确认" && l.attendance === "正常",
  )!;
  lesson.confirmedUnits = 1.5;
  const student = data.students.find((s) => s.id === lesson.studentId)!;
  const balance = student.balance;
  mount(`/lessons?student=${student.id}`);
  await waitFor(() =>
    expect(
      demoRepository.read().lessons.find((l) => l.id === lesson.id)?.deducted,
    ).toBe(true),
  );
  const row = within(screen.getByRole("row", { name: `课程 ${lesson.id}` }));
  expect(row.getByText("已结束")).toBeTruthy();
  expect(row.getByText("已扣 1.5 课时")).toBeTruthy();
  expect(row.queryByRole("button", { name: "核实" })).toBeNull();
  demoRepository.settleCompletedLessons();
  expect(
    demoRepository.read().students.find((s) => s.id === student.id)?.balance,
  ).toBe(balance - 1.5);
});

it("上课记录仅保留列表及课程详情入口", () => {
 mount("/lessons");
 expect(screen.queryByRole("button",{name:"日历"})).toBeNull();
 expect(screen.queryByRole("region",{name:"课程周历"})).toBeNull();
 expect(screen.getByRole("table")).toBeTruthy();
 fireEvent.click(screen.getAllByRole("button",{name:"详情"})[0]);
 expect(screen.getByRole("dialog")).toBeTruthy();
});

it.each(["迟到", "早退"] as const)("核实时预填 ClassIn 老师%s及分钟数", async (tag) => {
  const lesson = demoRepository.read().lessons.find(
    (item) => item.status === "待确认" && item.attendance === "正常",
  )!;
  lesson.teacherAttendance = [tag];
  lesson.classInTeacherExceptionMinutes = 7;
  mount("/lessons?lesson=" + lesson.id);
  const detail = await screen.findByRole("dialog", { name: "课程详情" });
  fireEvent.click(within(detail).getByRole("button", { name: "核实" }));
  const form = within(screen.getByRole("dialog", { name: "核实上课记录" }));
  expect(form.getByRole("combobox", { name: /核实结论/ }).textContent).toBe("老师" + tag);
  expect((form.getByRole("spinbutton", { name: /核实分钟数/ }) as HTMLInputElement).value).toBe("7");
});

it("上课记录核实老师取消，使用实际取消时间", async () => {
  const lesson = demoRepository.read().lessons.find(l => l.status === "待确认" && l.attendance === "正常")!;
  mount("/lessons?lesson=" + lesson.id);
  const detail = await screen.findByRole("dialog", {name:"课程详情"});
  fireEvent.click(within(detail).getByRole("button",{name:"核实"}));
  const form = within(screen.getByRole("dialog",{name:"核实上课记录"}));
  fireEvent.click(form.getByRole("combobox",{name:/核实结论/}));
  fireEvent.click(screen.getByRole("option",{name:"老师取消"}));
  fireEvent.change(form.getByLabelText(/实际取消时间/),{target:{value:lesson.date + "T00:00"}});
  fireEvent.change(form.getByRole("textbox",{name:/核实依据/}),{target:{value:"排课取消申请时间已核对"}});
  fireEvent.click(form.getByRole("button",{name:"确认核实"}));
  await waitFor(()=>expect(demoRepository.read().lessons.find(l=>l.id===lesson.id)).toMatchObject({
    status:"已取消",deducted:false,cancellation:{responsibility:"老师",at:new Date(lesson.date + "T00:00:00+08:00").toISOString()},
  }));
});

it("从网络课程实际取消，到工资单录入双方应得金额", async () => {
  const data = demoRepository.read();
  const lesson = data.lessons.find(l=>l.status==="待确认" && l.attendance==="正常")!;
  const teacher = data.teachers.find(t=>t.id===lesson.teacherId)!;
  lesson.date = DEMO_TODAY;
  data.lessons = [lesson];
  data.teachers = [teacher];
  teacher.payMode = "NP";
  teacher.rate = 180;
  data.officePayRates = {[teacher.so]:60};
  data.feedback = []; data.settlements = []; data.payroll = []; data.actions = [];
  const first = mount("/lessons?lesson=" + lesson.id);
  const detail = await screen.findByRole("dialog", {name:"课程详情"});
  fireEvent.click(within(detail).getByRole("button",{name:"核实"}));
  const form = within(screen.getByRole("dialog",{name:"核实上课记录"}));
  fireEvent.click(form.getByRole("combobox",{name:/核实结论/}));
  fireEvent.click(screen.getByRole("option",{name:"老师网络设备问题"}));
  fireEvent.click(form.getByRole("combobox",{name:/实际上课结果/}));
  fireEvent.click(screen.getByRole("option",{name:"取消"}));
  fireEvent.change(form.getByRole("textbox",{name:/核实依据/}),{target:{value:"教务确认受影响课程未完成"}});
  fireEvent.click(form.getByRole("button",{name:"确认核实"}));
  await waitFor(()=>expect(demoRepository.read().lessons[0]).toMatchObject({status:"已取消",incident:{networkOutcome:"取消"}}));
  first.unmount();
  mount("/payroll");
  fireEvent.click(await screen.findByRole("link", { name: "查看工资单" }));
  const payroll = within(screen.getByRole("region", { name: "工资单详情" }));
  const row = within(payroll.getByText("网络取消课酬待核").closest("tr")!);
  fireEvent.click(row.getByRole("button", { name: "核实" }));
  const review = within(screen.getByRole("dialog", { name: "核实薪资明细" }));
  fireEvent.click(review.getByRole("button", { name: "记录处理结果" }));
  const payrollForm = within(screen.getByRole("dialog", { name: "记录处理结果" }));
  fireEvent.change(payrollForm.getByLabelText(/本节老师应得课酬/), { target: { value: "73" } });
  fireEvent.change(payrollForm.getByLabelText(/本节 SO 应得课酬/), { target: { value: "22" } });
  fireEvent.change(payrollForm.getByLabelText("待核处理说明"), { target: { value: "办公室核实双方实际金额" } });
  fireEvent.click(payrollForm.getByRole("button", { name: "保存处理结果" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "记录处理结果" })).toBeNull());
  const table = within(payroll.getByRole("table", { name: "薪资明细" }));
  expect(table.getByText("+₱73")).toBeTruthy();
  expect(table.getByText("+₱22")).toBeTruthy();
  expect(table.getByText(/办公室核实双方实际金额/)).toBeTruthy();
});

it("从已取消课程详情核实双人实到，明确结论后解除工资待核", async () => {
  const lesson = demoRepository.read().lessons.find(l => l.status === "待确认" && l.attendance === "正常")!;
  const issue = "课程已取消，但最终考勤显示师生均已到堂，请核实本节实际上课结果";
  Object.assign(lesson, {
    status: "已取消", classInAttendanceReceived: true, classInAttendanceIssue: issue,
    cancellation: { responsibility: "学员", kind: "学员请假", at: lesson.date + "T00:00:00+08:00", waived: false },
  });
  mount("/lessons?lesson=" + lesson.id);
  const detail = await screen.findByRole("dialog", { name: "课程详情" });
  fireEvent.click(within(detail).getByRole("button", { name: "核实" }));
  const form = within(screen.getByRole("dialog", { name: "核实上课记录" }));
  expect(form.getByText(issue)).toBeTruthy();
  fireEvent.click(form.getByRole("combobox", { name: /核实结论/ }));
  fireEvent.click(screen.getByRole("option", { name: "正常上课" }));
  fireEvent.change(form.getByRole("textbox", { name: /核实依据/ }), { target: { value: "双方确认正常完课" } });
  fireEvent.change(form.getByRole("spinbutton", { name: /本节扣课数量/ }), { target: { value: "1" } });
  fireEvent.click(form.getByRole("button", { name: "确认核实" }));
  await waitFor(() => {
    const recorded = demoRepository.read().lessons.find(l => l.id === lesson.id)!;
    expect(recorded.status).toBe("已完成");
    expect(recorded.classInAttendanceIssue).toBeUndefined();
    expect(recorded.cancellation).toBeUndefined();
  });
});

it("未开始的历史课在结算截止前继续等待，到点后可从上课记录核实并计薪", async () => {
  const data = demoRepository.read();
  const lesson = data.lessons.find(l => l.status === "未开始")!;
  Object.assign(lesson, {
    date: "2025-01-06", time: "19:00", duration: 25, attendance: "无数据", classInAttendanceReceived: false,
    incident: undefined, cancellation: undefined, attendanceFinal: undefined, classInAttendanceIssue: undefined,
  });
  const teacher = data.teachers.find(t => t.id === lesson.teacherId)!;
  Object.assign(teacher, { startDate: "", payMode: "NP", rate: 180 });
  data.officePayRates = { [teacher.so]: 60 };
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2025-01-14T23:59:59+08:00"));
  const rows = () => halfMonthStatement(demoRepository.read(), teacher, "2025-01-1").rows.filter(r => r.source === lesson.id);
  expect(rows().map(r => r.category)).toEqual(["等待"]);
  const first = mount("/lessons?lesson=" + lesson.id);
  let detail = await screen.findByRole("dialog", { name: "课程详情" });
  expect(within(detail).queryByRole("button", { name: "核实" })).toBeNull();
  first.unmount();
  now.mockReturnValue(Date.parse("2025-01-15T00:00:00+08:00"));
  expect(rows().map(r => r.category)).toEqual(["待核"]);
  mount("/lessons?lesson=" + lesson.id);
  detail = await screen.findByRole("dialog", { name: "课程详情" });
  fireEvent.click(within(detail).getByRole("button", { name: "核实" }));
  const form = within(screen.getByRole("dialog", { name: "核实上课记录" }));
  fireEvent.click(form.getByRole("combobox", { name: /核实结论/ }));
  fireEvent.click(screen.getByRole("option", { name: "正常上课" }));
  fireEvent.click(form.getByRole("combobox", { name: /课时处理/ }));
  fireEvent.click(screen.getByRole("option", { name: "不扣" }));
  fireEvent.change(form.getByRole("textbox", { name: /核实依据/ }), { target: { value: "核实老师实际授课" } });
  fireEvent.click(form.getByRole("button", { name: "确认核实" }));
  await waitFor(() => expect(rows().map(r => [r.teacher, r.office])).toEqual([[180, 60]]));
});
