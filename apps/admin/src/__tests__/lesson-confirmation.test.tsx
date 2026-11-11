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
import type { Report } from "@crazytalk/shared";

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
    fireEvent.click(screen.getByRole("button", { name: /提交结课/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/截图/);
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/教材结束页截图/),{target:{files:[new File(["data"],"page.png",{type:"image/png"})]}});
    await screen.findByRole("img",{name:"结束页"});
    fireEvent.change(screen.getByRole("textbox", { name: /教材/ }), {
      target: { value: "新版教材" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "页码" }), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /提交结课/ }));
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
    for (const other of data.students.slice(1))
      expect(screen.queryByRole("link", { name: other.name })).toBeNull();
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
    fireEvent.click(
      within(checkbox.closest("tr")!).getByRole("button", { name: "核实" }),
    );
    const dialog = screen.getByRole("dialog", { name: "确认扣课数量" });
    expect(
      within(dialog)
        .getByRole("spinbutton", { name: /本节扣课数量/ })
        .getAttribute("value"),
    ).toBe("");
    expect(
      (
        within(dialog).getByRole("button", {
          name: "确认扣课",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: /本节扣课数量/ }),
      { target: { value: "1.5" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "确认扣课" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "确认扣课数量" })).toBeNull(),
    );
    expect(
      demoRepository.read().students.find((item) => item.id === student.id)
        ?.balance,
    ).toBe(balance - 1.5);
    expect(demoRepository.read().credits[0]).toMatchObject({
      units: -1.5,
      studentId: student.id,
    });
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
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
    fireEvent.change(search, { target: { value: student.name } });
    fireEvent.click(screen.getByRole("tab", { name: /待确认/ }));
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
      fireEvent.click(screen.getByRole("button", { name: "下一页" }));
      expect(screen.getByRole("button", { name: "第 2 页" })).toBeTruthy();
    }
    cleanup();
    const lesson = data.lessons.find((l) => l.status === "待确认")!;
    mount(
      `/lessons?tab=confirm&from=${lesson.date}&to=${lesson.date}&attendance=${encodeURIComponent(lesson.attendance)}`,
    );
    const expected = data.lessons.filter(
      (l) =>
        l.status === "待确认" &&
        l.date === lesson.date &&
        l.attendance === lesson.attendance,
    );
    expect(await screen.findByText(`共 ${expected.length} 节课`)).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(
      Math.min(25, expected.length) + 1,
    );
  });
});

it("导出包含全部筛选结果而非其他状态或仅当前页", async () => {
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
    fireEvent.click(
      await screen.findByRole("button", { name: "导出筛选结果" }),
    );
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
  fireEvent.change(search, { target: { value: "仅群名关键词" } });
  expect(screen.getByText("共 0 节课")).toBeTruthy();
  fireEvent.change(search, { target: { value: "验证学员" } });
  expect(
    screen.getByText(
      `共 ${data.lessons.filter((item) => item.studentId === student.id).length} 节课`,
    ),
  ).toBeTruthy();
  fireEvent.change(search, { target: { value: "searchonlyteacher" } });
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
    lesson.status = status;
    lesson.teacherIn = "20:31";
    lesson.teacherOut = "20:56";
    lesson.studentIn = "20:32";
    lesson.studentOut = "20:57";
    mount(`/lessons?student=${lesson.studentId}`);
    const checkbox = await screen.findByRole("row", {
      name: `课程 ${lesson.id}`,
    });
    fireEvent.click(
      within(checkbox.closest("tr")!).getByRole("button", { name: "详情" }),
    );
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

it("过时未开始课程在列表和详情提示待核实，不自动改变业务状态", async () => {
  const lesson = demoRepository.read().lessons[0];
  lesson.date = "2000-01-01";
  lesson.status = "未开始";
  mount(`/lessons?student=${lesson.studentId}&from=2000-01-01&to=2000-01-01`);
  const checkbox = await screen.findByRole("row", {
    name: `课程 ${lesson.id}`,
  });
  const row = within(checkbox.closest("tr")!);
  expect(row.getByText("已过计划结束时间，待核实")).toBeTruthy();
  expect(row.getByText("待核实")).toBeTruthy();
  expect(row.getByText("未开始")).toBeTruthy();
  fireEvent.click(row.getByRole("button", { name: "详情" }));
  const dialog = within(screen.getByRole("dialog", { name: "课程详情" }));
  expect(dialog.getByText("已过计划结束时间，待核实")).toBeTruthy();
  expect(dialog.queryByText("尚未开始")).toBeNull();
  expect(
    demoRepository.read().lessons.find((l) => l.id === lesson.id)?.status,
  ).toBe("未开始");
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
  fireEvent.click(row.getByRole("button", { name: "详情" }));
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

it("考勤筛选仅保留8项，缺失数据归入待核实且原因独立展示", async () => {
  const lesson = demoRepository.read().lessons[0];
  lesson.status = "待确认";
  lesson.attendance = "无数据";
  mount(`/lessons?student=${lesson.studentId}`);
  fireEvent.click(await screen.findByRole("combobox", { name: "考勤情况" }));
  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(9);
  for (const name of ["尚未开始", "不适用", "无数据", "账号待关联"])
    expect(screen.queryByRole("option", { name })).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: "待核实" }));
  const checkbox = screen.getByRole("row", {
    name: `课程 ${lesson.id}`,
  });
  const row = within(checkbox.closest("tr")!);
  expect(row.getByText("待核实", { selector: ".badge" })).toBeTruthy();
  expect(row.getByText("数据提示：未收到考勤数据")).toBeTruthy();
});

it("进入上课记录自动结算正常课，仅异常课保留核实入口", async () => {
  const data = demoRepository.read();
  const lesson = data.lessons.find(
    (l) => l.status === "待确认" && l.attendance === "正常",
  )!;
  lesson.confirmedUnits = 1.5;
  const student = data.students.find((s) => s.id === lesson.studentId)!;
  student.balanceKnown = true;
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
