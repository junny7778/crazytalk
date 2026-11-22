// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { addDays, DEMO_TODAY } from "@crazytalk/shared";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import { CustomSchedulingPanel } from "../components/scheduling/CustomSchedulingPanel";
function setup(teacherMode = false) {
  const data = demoRepository.read();
  data.lessons = [];
  data.leaves = [];
  data.students = data.students.slice(0, 2);
  data.teachers = data.teachers.slice(0, 2);
  data.students.forEach((s) => {
    s.status = "在读";
    s.materialIds = ["m1", "m2"];
    s.balance = 50;
  });
  data.classInAccounts = data.students.map((s, i) => ({
    id: s.id,
    phone: "",
    uid: String(981001 + i),
    studentIds: [s.id],
  }));
  data.teachers.forEach((t, i) => {
    t.status = "在职";
    t.trained = true;
    t.needConfirm = false;
    t.tags = [];
    t.materialIds = i ? ["m2"] : ["m1"];
    t.availabilityFrom = "";
    t.availability = Array.from({ length: 7 }, (_, day) => ({
      day,
      start: "19:00",
      end: "21:00",
    }));
  });
  const done = vi.fn();
  const dirty = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <CustomSchedulingPanel
            studentId={teacherMode ? "" : data.students[0].id}
            teacherId={teacherMode ? data.teachers[0].id : undefined}
            onDirtyChange={dirty}
            onBusyChange={() => {}}
            onStageChange={() => {}}
            onClose={() => {}}
            onComplete={done}
          />
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  return { data, done, dirty };
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
async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}
it("自定义日历仅提供本节教材可授老师，预览不写入，确认后写入教材且不重复提交", async () => {
  const { data, done } = setup();
  await click(new RegExp(`${DEMO_TODAY} 19:00 可排课`));
  const dialog = within(screen.getByRole("dialog"));
  expect(
    dialog.queryByRole("button", { name: new RegExp(data.teachers[1].name) }),
  ).toBeNull();
  await act(async () => {
    fireEvent.click(
      dialog.getByRole("button", { name: new RegExp(data.teachers[0].name) }),
    );
  });
  await click("加入课表");
  expect(demoRepository.read().lessons).toHaveLength(0);
  await click("预览排课");
  expect(
    screen.getByRole("region", { name: "自定义排课预览" }).textContent,
  ).toContain("Power Up 1");
  expect(demoRepository.read().lessons).toHaveLength(0);
  await click("确认排课");
  expect(done).toHaveBeenCalledOnce();
  expect(Object.keys(localStorage).filter(k=>k.startsWith("ct-custom-calendar:"))).toHaveLength(0);
  expect(demoRepository.read().lessons[0].material).toBe("Power Up 1");
});
it("按老师可先点日历时段，再从卡片选学员和共同教材", async () => {
  const { data } = setup(true);
  await click(new RegExp(`${DEMO_TODAY} 19:00 可排课`));
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(data.students[0].name) }),
    );
  });
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("Power Up 1")).toBeTruthy();
  expect(dialog.queryByText("Power Up 3")).toBeNull();
  await act(async () => {
    fireEvent.click(
      dialog.getByRole("button", { name: new RegExp(data.teachers[0].name) }),
    );
  });
  await click("加入课表");
  expect(screen.queryByRole("combobox", { name: "学员" })).toBeNull();
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(data.students[1].name) }),
    );
  });
  expect(
    screen.getByRole("dialog", { name: "放弃当前排课草稿？" }),
  ).toBeTruthy();
  await click("继续编辑");
  await click("预览排课");
  expect(
    screen.getByRole("region", { name: "自定义排课预览" }).textContent,
  ).toContain("Power Up 1");
});
it("多选时段一次加入草稿，查看和操作切换保留草稿", async () => {
  const { data } = setup();
  await act(async () => {
    fireEvent.click(screen.getByLabelText("多选上课时间"));
  });
  await click(new RegExp(`${DEMO_TODAY} 19:00 可排课`));
  await click(new RegExp(`${DEMO_TODAY} 20:00 可排课`));
  await click("为选中时段选择老师");
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: new RegExp(data.teachers[0].name),
      }),
    );
  });
  await click("加入课表");
  await click("预览排课");
  expect(
    within(screen.getByRole("region", { name: "自定义排课预览" })).getAllByRole(
      "row",
    ),
  ).toHaveLength(3);
  await click("返回调整");
  await act(async () => {
    fireEvent.click(screen.getByRole("tab", { name: "查看课表" }));
  });
  expect(screen.queryByRole("button", { name: "预览排课" })).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole("tab", { name: "操作排课" }));
  });
  await click("预览排课");
  expect(
    within(screen.getByRole("region", { name: "自定义排课预览" })).getAllByRole(
      "row",
    ),
  ).toHaveLength(3);
});

it("按周重复的草稿可恢复，明确放弃后不再恢复", async () => {
  const { data } = setup();
  await act(async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "重复安排" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("option", { name: "每周重复，共 2 周" }));
  });
  await click(new RegExp(`${DEMO_TODAY} 19:00 可排课`));
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: new RegExp(data.teachers[0].name),
      }),
    );
  });
  await click("加入课表");
  cleanup();
  setup();
  await click("继续上次编排");
  await click("预览排课");
  const review = screen.getByRole("region", { name: "自定义排课预览" });
  expect(within(review).getAllByRole("row")).toHaveLength(3);
  expect(review.textContent).toContain(addDays(DEMO_TODAY, 7));
  await click("返回调整");
  await act(async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "重复安排" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("option", { name: "仅选中日期" }));
  });
  await click("放弃草稿并修改");
  expect(screen.queryByRole("button", { name: "继续上次编排" })).toBeNull();
  expect(
    Object.keys(localStorage).filter((k) =>
      k.startsWith("ct-custom-calendar:"),
    ),
  ).toHaveLength(0);
});
it("重复日期遇到老师请假时阻止整批加入", async () => {
  const { data } = setup();
  data.leaves.push({
    id: "repeat-leave",
    teacherId: data.teachers[0].id,
    start: addDays(DEMO_TODAY, 7),
    end: addDays(DEMO_TODAY, 7),
    reason: "休假",
    status: "已登记",
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "重复安排" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("option", { name: "每周重复，共 2 周" }));
  });
  await click(new RegExp(`${DEMO_TODAY} 19:00 可排课`));
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: new RegExp(data.teachers[0].name),
      }),
    );
  });
  await click("加入课表");
  expect(
    screen.getByText(
      "选中或重复课次存在时间冲突，未加入课表，请修改时间或重复周期。",
    ),
  ).toBeTruthy();
  expect(demoRepository.read().lessons).toHaveLength(0);
});
