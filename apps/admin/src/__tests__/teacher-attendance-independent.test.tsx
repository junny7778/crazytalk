// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { DEMO_TODAY, addDays, type Lesson } from "@crazytalk/shared";
import { demoRepository } from "../../../../packages/shared/src/repository";
import { lessonSchema } from "../../../../packages/shared/src/model";
import { transition } from "../../../../packages/shared/src/domain";
import TeacherAttendance, {
  attendanceTags,
} from "../components/TeacherAttendance";
import { ToastProvider } from "@crazytalk/ui";
import Teachers from "../pages/operations/Teachers";
import TeacherFeedback from "../components/TeacherFeedback";

function mount(element: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <MemoryRouter>{element}</MemoryRouter>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
});
afterEach(cleanup);
function fixture() {
  const data = demoRepository.read();
  const base = data.lessons[0];
  const day = DEMO_TODAY.slice(0, 7) + "-10";
  const lesson = (id: string, patch: Partial<Lesson> = {}): Lesson => ({
    ...base,
    id,
    teacherId: "t1",
    date: day,
    time: "10:00",
    duration: 25,
    status: "已完成",
    attendance: "正常",
    sync: "已同步",
    teacherIn: "10:00",
    teacherOut: "10:25",
    teacherAttendance: undefined,
    ...patch,
  });
  data.lessons = [
    lesson("normal"),
    lesson("mixed", { time: "11:00", teacherAttendance: ["迟到", "早退"] }),
    lesson("unknown", { teacherIn: "", teacherOut: "", attendance: "无数据" }),
    lesson("absent", { attendance: "老师缺席" }),
    lesson("cancelled", { status: "已取消" }),
    lesson("future", { date: DEMO_TODAY, status: "未开始" }),
    lesson("other", { teacherId: "t2" }),
    lesson("previous", { date: addDays(DEMO_TODAY.slice(0, 7) + "-01", -1) }),
  ];
  return { data, day, lesson };
}
describe("独立验收：老师考勤", () => {
  it("待上课课程即使残留实际时间也不展示，日历与列表一致", () => {
    fixture();
    mount(<TeacherAttendance teacherId="t1" />);
    expect(within(screen.getByRole("table")).getAllByText("—")).toHaveLength(2);
    fireEvent.click(screen.getByRole("tab", { name: "列表" }));
    const row = within(screen.getByRole("table")).getByText("待上课").closest("tr")!;
    expect(within(row).getAllByText("—")).toHaveLength(2);
  });
  it("演示数据未开始课程不预填实际进出时间", () => {
    const pending = demoRepository.read().lessons.filter((l) => l.status === "未开始");
    expect(pending.length).toBeGreaterThan(0);
    for (const lesson of pending) {
      expect([lesson.teacherIn, lesson.teacherOut, lesson.studentIn, lesson.studentOut]).toEqual(["", "", "", ""]);
    }
  });
  it("月概述按课统计，混合异常分别计数，排除取消、其他老师及未开始课程", () => {
    fixture();
    const { container } = mount(<TeacherAttendance teacherId="t1" />);
    expect(
      Array.from(container.querySelectorAll(".inset")).map(
        (e) => e.textContent,
      ),
    ).toEqual([
      "正常 1 次",
      "迟到 1 次",
      "早退 1 次",
      "缺席 1 次",
      "待核实 1 次",
    ]);
  });
  it("日期联动详情、日历和列表一致，并支持跨月与返回本月", () => {
    const { day } = fixture();
    mount(<TeacherAttendance teacherId="t1" />);
    const dateButton = screen.getByRole("button", { name: `查看${day}考勤` });
    expect(dateButton.textContent).toContain("有异常");
    fireEvent.click(dateButton);
    expect(dateButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("row")).toHaveLength(5);
    const detail = screen.getByRole("table");
    expect(within(detail).getByText("迟到")).toBeTruthy();
    expect(within(detail).getByText("早退")).toBeTruthy();
    expect(within(detail).getAllByText("未获取")).toHaveLength(2);
    expect(within(detail).getAllByText("10:25").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "列表" }));
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(within(screen.getByRole("table")).getByText("待上课")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "考勤上个月" }));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "本月" }));
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });
  it("未同步、缺少实际时间、未来课程不会误报正常；跨午夜显示次日结束", () => {
    const { data, lesson, day } = fixture();
    expect(attendanceTags(lesson("missing", { teacherOut: "" }))).toEqual([
      "待核实",
    ]);
    expect(attendanceTags(lesson("sync", { sync: "未同步" }))).toEqual([
      "待核实",
    ]);
    expect(
      attendanceTags(
        lesson("future", {
          date: addDays(DEMO_TODAY, 1),
          teacherAttendance: ["正常"],
        }),
      ),
    ).toEqual(["待上课"]);
    data.lessons = [lesson("midnight", { time: "23:50", duration: 25 })];
    mount(<TeacherAttendance teacherId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: `查看${day}考勤` }));
    expect(screen.getByText("次日 00:15")).toBeTruthy();
  });
  it("schema拒绝矛盾、重复结果，接受迟到与早退；更正考勤清除旧结果而纯扣课更正保留", () => {
    const { data, lesson } = fixture();
    for (const teacherAttendance of [
      ["正常", "迟到"],
      ["正常", "正常"],
      ["缺席", "早退"],
      [],
    ])
      expect(
        lessonSchema.safeParse({ ...lesson("schema"), teacherAttendance })
          .success,
      ).toBe(false);
    expect(
      lessonSchema.safeParse(
        lesson("valid", { teacherAttendance: ["迟到", "早退"] }),
      ).success,
    ).toBe(true);
    const target = data.lessons.find((l) => l.id === "mixed")!;
    const preserved = transition(data, {
      type: "lesson.correct",
      id: target.id,
      deduct: false,
      reason: "专项验收",
    }).data.lessons.find((l) => l.id === target.id)!;
    expect(preserved.teacherAttendance).toEqual(["迟到", "早退"]);
    const corrected = transition(data, {
      type: "lesson.correct",
      id: target.id,
      deduct: false,
      reason: "专项验收",
      attendance: "老师缺席",
    }).data.lessons.find((l) => l.id === target.id)!;
    expect(attendanceTags(corrected)).toEqual(["缺席"]);
  });
});
describe("独立验收：老师反馈", () => {
  it("只展示当前老师反馈，筛选评价及处理状态，保留详情入口", () => {
    const data = demoRepository.read();
    const base = data.feedback[0];
    data.feedback = [
      {
        ...base,
        id: "a",
        teacherId: "t1",
        rating: "差评",
        status: "处理中",
        content: "需跟进互动",
        date: "2026-10-10",
      },
      {
        ...base,
        id: "b",
        teacherId: "t1",
        rating: "好评",
        status: "已完成",
        content: "课堂积极",
        date: "2026-10-11",
      },
      { ...base, id: "c", teacherId: "t2", content: "其他老师反馈" },
    ];
    mount(<TeacherFeedback teacherId="t1" />);
    expect(screen.queryByText("其他老师反馈")).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(
      screen
        .getAllByRole("link", { name: "查看详情" })
        .map((e) => e.getAttribute("href")),
    ).toEqual(["/feedback/b", "/feedback/a"]);
    fireEvent.click(screen.getByRole("combobox", { name: "评价类型筛选" }));
    fireEvent.click(screen.getByRole("option", { name: "差评" }));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("需跟进互动")).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: "处理状态筛选" }));
    fireEvent.click(screen.getByRole("option", { name: "已完成" }));
    expect(screen.getByText("没有符合条件的反馈记录")).toBeTruthy();
  });
});

describe("独立验收：入口与日期筛选", () => {
  it("老师详情考勤在反馈之前，两个Tab均能进入", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DemoProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={["/teachers/t1"]}>
              <Routes>
                <Route path="/teachers/:id" element={<Teachers />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </DemoProvider>
      </QueryClientProvider>,
    );
    const tabs = screen.getAllByRole("tab").map((e) => e.textContent);
    expect(tabs.indexOf("考勤")).toBeLessThan(tabs.indexOf("反馈"));
    expect(screen.queryByRole("tab", { name: "反馈与考勤" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "考勤" }));
    expect(screen.getByRole("button", { name: "考勤上个月" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "反馈" }));
    expect(screen.getByRole("columnheader", { name: "反馈日期" })).toBeTruthy();
  });
  it("反馈日期范围包含起止当天，反向范围给出错误提示", () => {
    const data = demoRepository.read();
    const base = data.feedback[0];
    data.feedback = [
      { ...base, id: "date-a", teacherId: "t1", date: "2026-10-10" },
      { ...base, id: "date-b", teacherId: "t1", date: "2026-10-11" },
    ];
    mount(<TeacherFeedback teacherId="t1" />);
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "2026-10-10" } });
    fireEvent.change(inputs[1], { target: { value: "2026-10-10" } });
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "查看详情" }).getAttribute("href"),
    ).toBe("/feedback/date-a");
    fireEvent.change(inputs[0], { target: { value: "2026-10-12" } });
    expect(screen.getByRole("alert").textContent).toBe(
      "结束日期不能早于开始日期",
    );
  });
});
