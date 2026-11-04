// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import Schedule from "../pages/Schedule";
function setup(windowEnd = "19:25") {
  const d = demoRepository.read();
  d.lessons = [];
  d.leaves = [];
  d.teachers = d.teachers.slice(0, 2);
  d.teachers.forEach((t) => {
    t.status = "在职";
    t.trained = true;
    t.needConfirm = false;
    t.categories = ["少儿"];
    t.availabilityFrom = "";
    t.availability = [{ day: 1, start: "19:00", end: "21:00" }];
  });
  const s = d.students[3];
  s.status = "待排课";
  s.scheduleIntent = {
    mode: "fixed",
    startDate: "2026-11-23",
    weeks: 2,
    frequency: 1,
    duration: 25,
    windows: [{ day: 1, start: "19:00", end: windowEnd }],
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/schedule?student=${s.id}`]}>
            <Schedule />
          </MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  return { d, s };
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
  vi.unstubAllGlobals();
});
it("新固定入口只展示完整方案与负荷，进入学生日历不写数据", () => {
  setup();
  expect(screen.queryByRole("button", { name: "查看可用时间" })).toBeNull();
  expect(screen.getAllByText(/已排 0 节（所有学员）/)).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: "查看排课方案" })[0]);
  expect(screen.getByRole("region", { name: "学员固定课表" })).toBeTruthy();
  expect(screen.getByText("方案预览 · 尚未确认")).toBeTruthy();
  expect(demoRepository.read().lessons).toHaveLength(0);
});
it("单节换师只影响本节，最终确认一次创建双老师课程", () => {
  const { d } = setup();
  const primary = d.teachers[0],
    other = d.teachers[1];
  fireEvent.click(screen.getAllByRole("button", { name: "查看排课方案" })[0]);
  const calendar = within(screen.getByRole("region", { name: "学员固定课表" }));
  fireEvent.click(
    calendar.getByRole("button", {
      name: new RegExp(`2026-11-23 19:00 ${primary.name}`),
    }),
  );
  fireEvent.click(screen.getByLabelText("本节可用老师"));
  fireEvent.click(screen.getByRole("option", { name: other.name }));
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  expect(
    within(screen.getByRole("region", { name: "学员固定课表" })).getByRole(
      "button",
      { name: new RegExp(`2026-11-30 19:00 ${primary.name}`) },
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "确认排课" }));
  expect(demoRepository.read().lessons.map((l) => l.teacherId)).toEqual([
    other.id,
    primary.id,
  ]);
});
it("暂不安排保留缺口，部分提交后再次补齐不重复创建", () => {
  const { d } = setup();
  fireEvent.click(screen.getAllByRole("button", { name: "查看排课方案" })[0]);
  fireEvent.click(
    within(screen.getByRole("region", { name: "学员固定课表" })).getByRole(
      "button",
      { name: new RegExp(`2026-11-23 19:00 ${d.teachers[0].name}`) },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "暂不安排本节" }));
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  fireEvent.click(screen.getByRole("button", { name: "确认已安排的 1 节" }));
  expect(demoRepository.read().lessons).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: /下一处待安排/ }));
  fireEvent.click(screen.getByLabelText("本节可用老师"));
  fireEvent.click(
    screen.getByRole("option", {
      name: new RegExp(`${d.teachers[0].name} · 主老师`),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  fireEvent.click(screen.getByRole("button", { name: "确认排课" }));
  expect(demoRepository.read().lessons).toHaveLength(2);
});

it("可排时段区分展示，拖动只调整本节并保留固定计划归属", () => {
  const { d, s } = setup("21:00");
  fireEvent.click(screen.getAllByRole("button", { name: "查看排课方案" })[0]);
  const calendar = within(screen.getByRole("region", { name: "学员固定课表" }));
  expect(
    calendar.getByRole("button", { name: "2026-11-23 19:30 可排课" }).className,
  ).toContain("available");
  expect(
    calendar
      .getByRole("button", { name: "2026-11-24 19:30 不可排课" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  const source = calendar.getByRole("button", {
    name: `2026-11-23 19:00 ${d.teachers[0].name}`,
  });
  const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(source, { dataTransfer });
  fireEvent.dragOver(
    calendar.getByRole("button", { name: "2026-11-23 19:30 可排课" }),
    { dataTransfer },
  );
  fireEvent.drop(
    calendar.getByRole("button", { name: "2026-11-23 19:30 可排课" }),
    { dataTransfer },
  );
  expect(
    calendar.getByRole("button", {
      name: `2026-11-23 19:30 ${d.teachers[0].name}`,
    }),
  ).toBeTruthy();
  expect(demoRepository.read().lessons).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "确认排课" }));
  const made = demoRepository
    .read()
    .lessons.filter((l) => l.studentId === s.id);
  expect(made).toHaveLength(2);
  expect(made.find((l) => l.date === "2026-11-23")).toMatchObject({
    time: "19:30",
    fixedOrigin: { date: "2026-11-23", time: "19:00" },
  });
  expect(made.find((l) => l.date === "2026-11-30")?.time).toBe("19:00");
});
it("拖入意向范围外拒绝移动，原课次不变", () => {
  const { d } = setup("21:00");
  fireEvent.click(screen.getAllByRole("button", { name: "查看排课方案" })[0]);
  const calendar = within(screen.getByRole("region", { name: "学员固定课表" }));
  const name = `2026-11-23 19:00 ${d.teachers[0].name}`;
  fireEvent.dragStart(calendar.getByRole("button", { name }), {
    dataTransfer: { setData: vi.fn() },
  });
  fireEvent.drop(
    calendar.getByRole("button", { name: "2026-11-24 19:30 不可排课" }),
  );
  expect(calendar.getByRole("button", { name })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("课程未移动");
  expect(demoRepository.read().lessons).toHaveLength(0);
});

it("拖动后原老师不可用时要求选择可用老师，不静默换师", () => {
  const { d } = setup("21:00");
  d.teachers[0].availability = [{ day: 1, start: "19:00", end: "19:25" }];
  fireEvent.click(screen.getAllByRole("button", { name: "查看排课方案" })[0]);
  const calendar = within(screen.getByRole("region", { name: "学员固定课表" }));
  fireEvent.dragStart(
    calendar.getByRole("button", {
      name: `2026-11-23 19:00 ${d.teachers[0].name}`,
    }),
    { dataTransfer: { setData: vi.fn() } },
  );
  fireEvent.drop(
    calendar.getByRole("button", { name: "2026-11-23 19:30 可排课" }),
  );
  const editor = within(screen.getByRole("dialog", { name: "调整本节课程" }));
  expect(
    editor.getByText("原老师在新时间不可用，请选择本节可用老师。"),
  ).toBeTruthy();
  fireEvent.click(editor.getByLabelText("本节可用老师"));
  expect(
    screen.queryByRole("option", { name: new RegExp(d.teachers[0].name) }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: d.teachers[1].name }));
  fireEvent.click(editor.getByRole("button", { name: "完成" }));
  expect(
    calendar.getByRole("button", {
      name: `2026-11-23 19:30 ${d.teachers[1].name}`,
    }),
  ).toBeTruthy();
});
