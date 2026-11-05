// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import {
  stateSchema,
  teacherSchema,
} from "../../../../packages/shared/src/model";
import { DEMO_TODAY, type Command } from "@crazytalk/shared";
import Teachers from "../pages/operations/Teachers";
import { Availability } from "../../../teacher/src/screens";
import en from "../../../teacher/src/locales/en";

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
            <Routes>
              <Route path="/teachers" element={<Teachers />} />
              <Route path="/teachers/:id" element={<Teachers />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
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

describe("老师课表视图", () => {
  it("默认日历，勾选后展示完成和取消课程，列表沿用同一筛选", () => {
    const data = demoRepository.read();
    const sample = data.lessons[0];
    data.lessons = [
      {
        ...sample,
        id: "calendar-future",
        teacherId: "t1",
        date: DEMO_TODAY,
        time: "10:00",
        status: "未开始",
        material: "待上教材",
      },
      {
        ...sample,
        id: "calendar-done",
        teacherId: "t1",
        date: DEMO_TODAY,
        time: "11:00",
        status: "已完成",
        material: "完成教材",
      },
      {
        ...sample,
        id: "calendar-cancel",
        teacherId: "t1",
        date: DEMO_TODAY,
        time: "12:00",
        status: "已取消",
        material: "取消教材",
      },
      {
        ...sample,
        id: "calendar-other",
        teacherId: "t2",
        date: DEMO_TODAY,
        status: "已完成",
        material: "其他老师教材",
      },
    ];
    mount("/teachers/t1?tab=schedule");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("待上教材")).toBeNull();
    fireEvent.mouseEnter(screen.getByLabelText("待上教材课程"));
    expect(
      within(screen.getByRole("tooltip")).getByText("待上教材"),
    ).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText("待上教材课程"), { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByLabelText("待上教材课程")).toBeTruthy();
    expect(screen.queryByLabelText("完成教材课程")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "查看已完成课程" }));
    expect(screen.getByLabelText("完成教材课程")).toBeTruthy();
    expect(screen.getByLabelText("取消教材课程")).toBeTruthy();
    expect(screen.queryByLabelText("其他老师教材课程")).toBeNull();
    fireEvent.click(screen.getByText("列表"));
    expect(screen.getByRole("columnheader", { name: "课程类型" })).toBeTruthy();
    expect(screen.getByText("完成教材")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "查看已完成课程" }));
    expect(screen.queryByText("完成教材")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "下个月" }));
    expect(screen.queryByText("待上教材")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "本月" }));
    expect(screen.getByText("待上教材")).toBeTruthy();
  });
});

describe("老师列表显示列", () => {
  it("老师名下学员的旧进度统一显示为三层斜杠格式", () => {
    const student = demoRepository
      .read()
      .students.find((item) => item.teacherId === "t1");
    if (!student) throw new Error("缺少学员");
    student.material = "Power Up 3";
    student.unit = "Unit 1 · p.4";
    mount("/teachers/t1?tab=students");
    expect(screen.getByText("Power Up 3 / Unit 1 / P4")).toBeTruthy();
  });
  it("独立展示等级，可切换列并恢复默认，筛选后保留列选择", () => {
    mount("/teachers");
    expect(screen.getByRole("columnheader", { name: "口音等级" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "导师等级" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "培训状态" })).toBeTruthy();
    expect(
      screen.queryByRole("columnheader", { name: "口音 / 等级" }),
    ).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "老师标签" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "显示列" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "口音等级" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "老师标签" }));
    expect(screen.queryByRole("columnheader", { name: "口音等级" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "导师等级" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("搜索老师姓名"), {
      target: { value: "Carol" },
    });
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getAllByRole("cell")).toHaveLength(
      within(rows[0]).getAllByRole("columnheader").length,
    );
    expect(within(rows[1]).getByText("耐心、发音清晰")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));
    expect(screen.getByRole("columnheader", { name: "口音等级" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "老师标签" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "显示列" }));
    expect(screen.queryByRole("checkbox", { name: "导师等级" })).toBeNull();
  });
});

describe("老师详情资料与培训", () => {
  it("新建预选默认头像，保存后可编辑更换并同步详情", () => {
    mount("/teachers");
    fireEvent.click(screen.getByRole("button", { name: /新建老师/ }));
    expect(
      screen
        .getByRole("button", { name: "默认头像 1" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(screen.getByRole("group", { name: "默认头像" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(4);
    fireEvent.change(screen.getByPlaceholderText("输入老师姓名"), {
      target: { value: "Avatar Test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存老师" }));
    const saved = demoRepository
      .read()
      .teachers.find((item) => item.name === "Avatar Test");
    expect(saved?.photo).toBe("/avatars/avatar-1.webp");
    cleanup();
    mount(`/teachers/${saved?.id}`);
    fireEvent.click(screen.getByRole("button", { name: "编辑资料" }));
    fireEvent.click(screen.getByRole("button", { name: "默认头像 4" }));
    expect(
      screen
        .getByRole("button", { name: "默认头像 1" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "保存老师" }));
    expect(screen.getByAltText("Avatar Test的照片").getAttribute("src")).toBe(
      "/avatars/avatar-4.webp",
    );
    expect(
      demoRepository.read().teachers.find((item) => item.id === saved?.id)
        ?.photo,
    ).toBe("/avatars/avatar-4.webp");
  });
  it("旧老师资料无需补填新字段即可读取，quiz 拒绝超范围成绩", () => {
    const legacy = demoRepository.read().teachers[0];
    expect(teacherSchema.parse(legacy).trained).toBe(true);
    expect(teacherSchema.parse(legacy).quizScore).toBeUndefined();
    expect(teacherSchema.safeParse({ ...legacy, quizScore: -1 }).success).toBe(
      false,
    );
    expect(teacherSchema.safeParse({ ...legacy, quizScore: 101 }).success).toBe(
      false,
    );
  });
  it("保存照片、独立开课日期、证书、标签与备注并展示", async () => {
    mount("/teachers/t1");
    expect(
      within(screen.getByLabelText("老师基本资料")).queryByText("英文名"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "编辑资料" }));
    const dialog = within(screen.getByRole("dialog", { name: "编辑老师" }));
    fireEvent.click(dialog.getByRole("checkbox", { name: "TEFL" }));
    fireEvent.click(dialog.getByRole("checkbox", { name: "TESOL" }));
    fireEvent.change(dialog.getByLabelText("老师标签"), {
      target: { value: "耐心、商务英语" },
    });
    fireEvent.change(dialog.getByLabelText("备注"), {
      target: { value: "优先安排晚间课程" },
    });
    fireEvent.change(dialog.getByLabelText("开课日期"), {
      target: { value: "2026-11-10" },
    });
    fireEvent.change(dialog.getByLabelText("上传老师照片"), {
      target: {
        files: [new File(["photo"], "teacher.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "使用默认头像" })).toBeTruthy(),
    );
    fireEvent.click(dialog.getByRole("button", { name: "保存老师" }));
    const saved = demoRepository.read().teachers[0];
    expect(saved).toMatchObject({
      certificates: "TEFL、TESOL",
      tags: ["耐心", "商务英语"],
      notes: "优先安排晚间课程",
      startDate: "2026-11-10",
      availabilityFrom: "",
    });
    const persisted = stateSchema.parse(
      JSON.parse(localStorage.getItem("crazytalk-demo-v1") || "null"),
    );
    expect(persisted.teachers[0]).toMatchObject({
      photo: saved.photo,
      certificates: "TEFL、TESOL",
      notes: "优先安排晚间课程",
      startDate: "2026-11-10",
    });
    expect(saved.photo).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByText("TEFL、TESOL")).toBeTruthy();
    expect(screen.getByText("优先安排晚间课程")).toBeTruthy();
    expect(screen.getAllByAltText("T. Carol的照片")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "编辑资料" }));
    fireEvent.click(screen.getByRole("button", { name: "默认头像 3" }));
    fireEvent.click(screen.getByRole("button", { name: "保存老师" }));
    expect(demoRepository.read().teachers[0].photo).toBe(
      "/avatars/avatar-3.webp",
    );
    expect(screen.getByAltText("T. Carol的照片").getAttribute("src")).toBe(
      "/avatars/avatar-3.webp",
    );
  });

  it("培训项目独立登记，零分可保存，取消视频培训不修改在职状态", () => {
    mount("/teachers/t1?tab=training");
    expect(screen.queryByText(/92 分/)).toBeNull();
    expect(screen.getAllByText("未登记").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "编辑培训记录" }));
    expect(screen.getByRole("dialog", { name: "编辑培训记录" }).classList.contains("modal")).toBe(true);
    const dialog = within(screen.getByRole("dialog", { name: "编辑培训记录" }));
    expect(dialog.queryByLabelText("备注")).toBeNull();
    expect(dialog.queryByText("每周常规可用时间")).toBeNull();
    fireEvent.change(dialog.getByLabelText("quiz 成绩"), {
      target: { value: "101" },
    });
    expect(
      dialog.getByRole("button", { name: "保存培训记录" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(dialog.getByLabelText("quiz 成绩"), {
      target: { value: "0" },
    });
    fireEvent.click(dialog.getByLabelText("视频培训已完成"));
    fireEvent.click(dialog.getByLabelText("RC"));
    fireEvent.click(screen.getByRole("option", { name: "已完成" }));
    fireEvent.change(dialog.getByLabelText("老师培训"), {
      target: { value: "已参加课堂互动培训" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "保存培训记录" }));
    expect(demoRepository.read().teachers[0]).toMatchObject({
      quizScore: 0,
      rcTraining: "已完成",
      trained: false,
      status: "在职",
      teacherTraining: "已参加课堂互动培训",
    });
    expect(demoRepository.read().teachers[0].titTraining).toBeUndefined();
    expect(screen.getByText("0 分")).toBeTruthy();
    expect(screen.getByText("已参加课堂互动培训")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "编辑培训记录" }));
    fireEvent.change(screen.getByLabelText("quiz 成绩"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存培训记录" }));
    expect(demoRepository.read().teachers[0].quizScore).toBeNull();
  });
});

describe("教师常规可用时间表单", () => {
  it("自定义时间浮层选择小时和分钟后更新字段并关闭", () => {
    mount("/teachers/t1?tab=availability");
    fireEvent.click(
      screen.getByRole("button", { name: "周一 开始时间 1 选择时间" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "09 时" }));
    fireEvent.click(screen.getByRole("button", { name: "35 分" }));
    expect(screen.getByLabelText("周一 开始时间 1").getAttribute("value")).toBe(
      "09:35",
    );
    expect(screen.queryByRole("button", { name: "35 分" })).toBeNull();
  });
  it("取消授课日后重新选中，恢复当天全部不连续时段", () => {
    mount("/teachers/t1?tab=availability");
    fireEvent.change(screen.getByLabelText("周一 开始时间 1"), {
      target: { value: "10:00" },
    });
    fireEvent.change(screen.getByLabelText("周一 结束时间 1"), {
      target: { value: "12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "周一 添加时段" }));
    fireEvent.change(screen.getByLabelText("周一 开始时间 2"), {
      target: { value: "19:00" },
    });
    fireEvent.change(screen.getByLabelText("周一 结束时间 2"), {
      target: { value: "21:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "周一" }));
    expect(screen.queryByLabelText("周一 开始时间 1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "周一" }));
    expect(screen.getByLabelText("周一 开始时间 1").getAttribute("value")).toBe(
      "10:00",
    );
    expect(screen.getByLabelText("周一 结束时间 1").getAttribute("value")).toBe(
      "12:00",
    );
    expect(screen.getByLabelText("周一 开始时间 2").getAttribute("value")).toBe(
      "19:00",
    );
    expect(screen.getByLabelText("周一 结束时间 2").getAttribute("value")).toBe(
      "21:00",
    );
  });
  it("一键把周一多段时间应用到工作日，替换原时段并保留周末", () => {
    mount("/teachers");
    fireEvent.click(screen.getByRole("button", { name: /新建老师/ }));
    const dialog = within(screen.getByRole("dialog", { name: "新建老师" }));
    fireEvent.change(dialog.getByLabelText("英文名"), {
      target: { value: "T. Weekdays" },
    });
    fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    );
    fireEvent.change(dialog.getByLabelText("周一 结束时间 1"), {
      target: { value: "18:00" },
    });
    fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    );
    fireEvent.change(dialog.getByLabelText("周一 开始时间 2"), {
      target: { value: "19:30" },
    });
    fireEvent.click(
      dialog.queryByRole("button", { name: "周二 添加时段" }) ||
        dialog.getByRole("button", { name: "周二" }),
    );
    fireEvent.change(dialog.getByLabelText("周二 开始时间 1"), {
      target: { value: "20:00" },
    });
    fireEvent.click(
      dialog.queryByRole("button", { name: "周六 添加时段" }) ||
        dialog.getByRole("button", { name: "周六" }),
    );
    fireEvent.change(dialog.getByLabelText("周六 开始时间 1"), {
      target: { value: "12:30" },
    });
    fireEvent.change(dialog.getByLabelText("周六 结束时间 1"), {
      target: { value: "14:55" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "周一 复制时段" }));
    for (const day of ["周二", "周三", "周四", "周五"])
      fireEvent.click(dialog.getByRole("checkbox", { name: day }));
    fireEvent.click(dialog.getByRole("button", { name: "确认复制" }));
    expect(dialog.getByLabelText("周二 开始时间 1").getAttribute("value")).toBe(
      "17:00",
    );
    expect(dialog.getByLabelText("周五 开始时间 2").getAttribute("value")).toBe(
      "19:30",
    );
    expect(dialog.getByLabelText("周六 结束时间 1").getAttribute("value")).toBe(
      "14:55",
    );
    fireEvent.click(dialog.getByRole("button", { name: "保存老师" }));
    const saved = demoRepository
      .read()
      .teachers.find((teacher) => teacher.name === "T. Weekdays");
    expect(saved?.availability).toHaveLength(11);
    for (const day of [1, 2, 3, 4, 5])
      expect(saved?.availability.filter((range) => range.day === day)).toEqual([
        { day, start: "17:00", end: "18:00" },
        { day, start: "19:30", end: "21:55" },
      ]);
    expect(saved?.availability.filter((range) => range.day === 6)).toEqual([
      { day: 6, start: "12:30", end: "14:55" },
    ]);
    expect(saved?.availability.some((range) => range.day === 0)).toBe(false);
  });

  it("建档时不默认开放，按星期填写多段并保留分钟和说明", () => {
    mount("/teachers");
    fireEvent.click(screen.getByRole("button", { name: /新建老师/ }));
    const dialog = within(screen.getByRole("dialog", { name: "新建老师" }));
    expect(dialog.getByText(/尚未填写常规可用时间/)).toBeTruthy();
    fireEvent.change(dialog.getByLabelText("英文名"), {
      target: { value: "T. Time Test" },
    });
    fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    );
    fireEvent.change(dialog.getByLabelText("周一 结束时间 1"), {
      target: { value: "18:00" },
    });
    fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    );
    fireEvent.change(dialog.getByLabelText("周一 开始时间 2"), {
      target: { value: "19:30" },
    });
    fireEvent.change(dialog.getByLabelText("周一 结束时间 2"), {
      target: { value: "21:55" },
    });
    fireEvent.change(dialog.getByLabelText("开始使用日期（选填）"), {
      target: { value: "2026-11-02" },
    });
    fireEvent.change(dialog.getByLabelText("时间说明（选填）"), {
      target: { value: "周五休息，临时安排先联系" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "保存老师" }));
    expect(
      demoRepository
        .read()
        .teachers.find((teacher) => teacher.name === "T. Time Test"),
    ).toMatchObject({
      availability: [
        { day: 1, start: "17:00", end: "18:00" },
        { day: 1, start: "19:30", end: "21:55" },
      ],
      availabilityFrom: "2026-11-02",
      availabilityNote: "周五休息，临时安排先联系",
      availabilitySource: "entered",
    });
  });

  it("同一天重叠时给出可理解的提示并阻止保存", () => {
    mount("/teachers");
    fireEvent.click(screen.getByRole("button", { name: /新建老师/ }));
    const dialog = within(screen.getByRole("dialog", { name: "新建老师" }));
    fireEvent.change(dialog.getByLabelText("英文名"), {
      target: { value: "T. Overlap" },
    });
    fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    );
    fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    );
    fireEvent.change(dialog.getByLabelText("周一 开始时间 2"), {
      target: { value: "19:00" },
    });
    expect(dialog.getByRole("alert").textContent).toMatch(/不能重叠/);
    expect(
      dialog.getByRole("button", { name: "保存老师" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      demoRepository
        .read()
        .teachers.some((teacher) => teacher.name === "T. Overlap"),
    ).toBe(false);
  });

  it("修改时间先列出受影响课程，确认保存后保留课程", () => {
    demoRepository.execute({
      type: "lesson.schedule",
      studentId: "s4",
      teacherId: "t1",
      slots: [{ date: "2026-11-20", time: "10:00" }],
      duration: 25,
      kind: "固定课",
      material: "Power Up 3",
    });
    const scheduled = demoRepository
      .read()
      .lessons.find(
        (lesson) =>
          lesson.date === "2026-11-20" &&
          lesson.time === "10:00" &&
          lesson.teacherId === "t1",
      );
    if (!scheduled) throw new Error("Missing scheduled lesson");
    mount("/teachers/t1?tab=availability");
    fireEvent.change(screen.getByLabelText("周五 结束时间 1"), {
      target: { value: "10:10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存可用时间" }));
    const dialog = within(
      screen.getByRole("dialog", { name: "确认调整可上课时间" }),
    );
    expect(dialog.getByText("2026-11-20 10:00")).toBeTruthy();
    expect(
      demoRepository
        .read()
        .teachers[0].availability.find((range) => range.day === 5)?.end,
    ).toBe("18:00");
    fireEvent.click(
      dialog.getByRole("button", { name: "确认保存，保留现有课程" }),
    );
    expect(
      demoRepository
        .read()
        .teachers[0].availability.find((range) => range.day === 5)?.end,
    ).toBe("10:10");
    expect(
      demoRepository
        .read()
        .lessons.find((lesson) => lesson.id === scheduled.id),
    ).toMatchObject({
      date: scheduled.date,
      time: scheduled.time,
      status: "未开始",
    });
  });

  it("教师端用英文维护同一份分钟级可用时间，不发起虚假的请假申请", () => {
    const data = demoRepository.read();
    const run = vi.fn((command: Command) => {
      demoRepository.execute(command);
      return true;
    });
    render(
      <Availability
        teacher={data.teachers[0]}
        lessons={data.lessons.filter((lesson) => lesson.teacherId === "t1")}
        leaves={[]}
        t={(key) => en[key]}
        language="en"
        run={run}
      />,
    );
    fireEvent.change(screen.getByLabelText("Mon end 1"), {
      target: { value: "17:55" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0].type).toBe("teacher.save");
    expect(
      demoRepository
        .read()
        .teachers[0].availability.find((range) => range.day === 1)?.end,
    ).toBe("17:55");
    expect(demoRepository.read().leaves).toHaveLength(data.leaves.length);
  });
});

describe("老师中心普通筛选", () => {
  it("默认全部老师，不展示快捷视图", () => {
    mount("/teachers");
    expect(
      screen.getByText(`共 ${demoRepository.read().teachers.length} 位老师`),
    ).toBeTruthy();
    expect(
      screen.queryByRole("tab", { name: /可排课|在职|本周被投诉/ }),
    ).toBeNull();
  });
  it("任职和培训条件组合筛选，清除后恢复全部", () => {
    const data = demoRepository.read();
    mount("/teachers?status=在职&training=completed");
    expect(
      screen.getByText(
        `共 ${data.teachers.filter((t) => t.status === "在职" && t.trained).length} 位老师`,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: "培训状态" }));
    fireEvent.click(screen.getByRole("option", { name: "未完成培训" }));
    expect(
      screen.getByText(
        `共 ${data.teachers.filter((t) => t.status === "在职" && !t.trained).length} 位老师`,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "清除全部筛选" }));
    expect(screen.getByText(`共 ${data.teachers.length} 位老师`)).toBeTruthy();
  });
  it("搜索与SO筛选可一并清除", () => {
    const data = demoRepository.read();
    mount("/teachers");
    fireEvent.click(screen.getByRole("combobox", { name: "筛选 SO" }));
    fireEvent.click(screen.getByRole("option", { name: data.teachers[0].so }));
    fireEvent.change(screen.getByPlaceholderText("搜索老师姓名"), {
      target: { value: "不存在的老师" },
    });
    expect(screen.getByText("没有符合条件的老师")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getByText(`共 ${data.teachers.length} 位老师`)).toBeTruthy();
  });
  it("旧排课链接转为可见普通条件，清除恢复全部", () => {
    const data = demoRepository.read();
    mount("/teachers?view=可排课");
    expect(
      screen.getByRole("combobox", { name: "任职状态" }).textContent,
    ).toContain("在职");
    expect(
      screen.getByText(
        `共 ${data.teachers.filter((t) => t.status === "在职" && (!data.rules.trainingRequired || t.trained)).length} 位老师`,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "清除全部筛选" }));
    expect(screen.getByText(`共 ${data.teachers.length} 位老师`)).toBeTruthy();
  });
});

it("证书多选回显旧证书，允许增选 CELTA 及取消其他", () => {
  demoRepository.read().teachers[0].certificates = "TEFL、旧资格证";
  mount("/teachers/t1");
  fireEvent.click(screen.getByRole("button", { name: "编辑资料" }));
  const dialog = within(screen.getByRole("dialog", { name: "编辑老师" }));
  expect((dialog.getByRole("checkbox", { name: "TEFL" }) as HTMLInputElement).checked).toBe(true);
  expect((dialog.getByRole("checkbox", { name: "其他" }) as HTMLInputElement).checked).toBe(true);
  expect(dialog.getByText("其他证书：旧资格证")).toBeTruthy();
  fireEvent.click(dialog.getByRole("checkbox", { name: "CELTA" }));
  fireEvent.click(dialog.getByRole("button", { name: "保存老师" }));
  expect(demoRepository.read().teachers[0].certificates).toBe("TEFL、旧资格证、CELTA");
  fireEvent.click(screen.getByRole("button", { name: "编辑资料" }));
  const reopened = within(screen.getByRole("dialog", { name: "编辑老师" }));
  fireEvent.click(reopened.getByRole("checkbox", { name: "其他" }));
  fireEvent.click(reopened.getByRole("checkbox", { name: "TEFL" }));
  fireEvent.click(reopened.getByRole("checkbox", { name: "CELTA" }));
  fireEvent.click(reopened.getByRole("button", { name: "保存老师" }));
  expect(demoRepository.read().teachers[0].certificates).toBe("");
});
