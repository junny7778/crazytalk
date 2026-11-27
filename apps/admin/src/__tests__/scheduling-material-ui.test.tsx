import { bindSchedulingStaff } from "../../../../tests/fixtures/scheduling";
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
function setup(teacherMode = false, studentMaterialIds = ["m1"]) {
  const data = demoRepository.read();
  data.lessons = [];
  data.leaves = [];
  data.students = data.students.slice(0, 2);
  data.teachers = data.teachers.slice(0, 2);
  data.students.forEach((s, index) => {
    s.status = "在读";
    s.materialIds = teacherMode ? [index ? "m2" : "m1"] : studentMaterialIds;
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
    t.materialIds = i ? ["m2"] : teacherMode ? ["m1","m2"] : ["m1"];
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
  bindSchedulingStaff(demoRepository.read());
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
  const { data, done } = setup(false, ["m2"]);
  const book = screen.getByLabelText("上课教材") as HTMLInputElement;
  expect(book.disabled).toBe(true);
  expect(book.value).toBe("Power Up 3");
  await click(new RegExp(`${DEMO_TODAY} 19:00 可排课`));
  const dialog = within(screen.getByRole("dialog"));
  expect(
    dialog.queryByRole("button", { name: new RegExp(data.teachers[0].name) }),
  ).toBeNull();
  await act(async () => {
    fireEvent.click(
      dialog.getByRole("button", { name: new RegExp(data.teachers[1].name) }),
    );
  });
  await click("加入课表");
  expect(screen.queryByRole("button", {name:new RegExp(`${DEMO_TODAY} 19:25 可排课`)})).toBeNull();
  expect(screen.getByRole("button", {name:new RegExp(`${DEMO_TODAY} 19:30 可排课`)})).toBeTruthy();
  expect(demoRepository.read().lessons).toHaveLength(0);
  await click("预览排课");
  expect(
    screen.getByRole("region", { name: "自定义排课预览" }).textContent,
  ).toContain("Power Up 3");
  expect(demoRepository.read().lessons).toHaveLength(0);
  await click("确认排课");
  expect(done).toHaveBeenCalledOnce();
  expect(Object.keys(localStorage).filter(k=>k.startsWith("ct-custom-calendar:"))).toHaveLength(0);
  expect(demoRepository.read().lessons[0].material).toBe("Power Up 3");
});
it("按老师可先点日历时段，再从卡片选学员和共同教材", async () => {
  const { data } = setup(true);
  await click(new RegExp(`${DEMO_TODAY} 19:00 可排课`));
  await click("确认时段");
  await act(async () => {
    fireEvent.click(
      screen.getByText(data.students[0].name, {selector:".schedule-student-card strong"}),
    );
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  const book = screen.getByRole("combobox",{name:"教材"});
  expect(screen.getByText("本次安排 1 周，共 1 节课待确认").parentElement).toBe(screen.getByRole("button", {name:"本周"}).parentElement);
  const studentField = screen.getByRole("textbox", {name: "学员"}) as HTMLInputElement;
  expect(studentField.value).toBe(data.students[0].name);
  expect(studentField.disabled).toBe(true);
  fireEvent.click(book);
  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(1);
  expect(options[0].getAttribute("aria-selected")).toBe("true");
  const firstMaterial = options[0].textContent!.trim();
  fireEvent.click(options[0]);
  const card = screen.getByRole("button",{name:/19:00 待确认/});
  expect(card.textContent).toContain(firstMaterial);
  expect(screen.queryByLabelText("每节时长")).toBeNull();
  await click(/更换学员/);await click("关闭");
  expect(book.textContent).toContain(firstMaterial);
  await click(/更换学员/);
  fireEvent.click(screen.getByText(data.students[1].name, {selector:".schedule-student-card strong"}));
  expect(screen.getByRole("button",{name:/19:00 待确认/}).textContent).toContain(data.students[1].name);
  fireEvent.click(screen.getByRole("combobox", {name:"教材"}));
  const secondOption = screen.getByRole("option", {name:"Power Up 3"});
  const material = secondOption.textContent!.trim();
  fireEvent.click(secondOption);
  expect(demoRepository.read().lessons).toHaveLength(0);
  await click("确定排课");
  expect(demoRepository.read().lessons[0].material).toBe(material);
  expect(demoRepository.read().lessons[0].studentId).toBe(data.students[1].id);
});
it("多选时段一次加入草稿，周历翻页保留待确认课节", async () => {
  const { data } = setup();
  await act(async () => {
    fireEvent.click(screen.getByRole("switch", {name:"开启多选", checked:false}));
  });
  await click(new RegExp(`${DEMO_TODAY} 19:00 可排课`));
  await click(new RegExp(`${DEMO_TODAY} 20:00 可排课`));
  expect(screen.getByRole("switch", {name:"开启多选", checked:true})).toBeTruthy();
  const bar = within(screen.getByRole("group", {name:"已选排课时段"}));
  expect(bar.getByText("已选 2 个时段")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  await act(async () => { fireEvent.click(bar.getByRole("button", {name:"确认时段"})); });
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
    fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  });
  expect(screen.getByRole("button", { name: "预览排课" }).hasAttribute("disabled")).toBe(false);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "上一周" }));
  });
  await click("预览排课");
  expect(
    within(screen.getByRole("region", { name: "自定义排课预览" })).getAllByRole(
      "row",
    ),
  ).toHaveLength(3);
});

it("按周重复的未提交课次退出后清空，重复设置恢复默认", async () => {
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
  expect(Object.keys(localStorage).some(k => k.startsWith("ct-custom-calendar:"))).toBe(false);
  await click("预览排课");
  expect(within(screen.getByLabelText("自定义排课预览")).getAllByRole("row")).toHaveLength(3);
  cleanup();
  setup();
  expect(screen.getByRole("button", { name: "预览排课" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("combobox", { name: "重复安排" }).textContent).toContain("仅选中日期");
  expect(demoRepository.read().lessons).toHaveLength(0);
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
  expect(within(screen.getByRole("dialog")).queryByRole("button", {name:new RegExp(data.teachers[0].name)})).toBeNull();
  expect(screen.getByRole("button", {name:"加入课表"}).hasAttribute("disabled")).toBe(true);
  await click("取消");
  await act(async () => { fireEvent.click(screen.getByRole("combobox", {name:"重复安排"})); });
  await act(async () => { fireEvent.click(screen.getByRole("option", {name:"仅选中日期"})); });
  await click(new RegExp(`${DEMO_TODAY} 19:00 可排课`));
  expect(within(screen.getByRole("dialog")).getByRole("button", {name:new RegExp(data.teachers[0].name)})).toBeTruthy();
  expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
  expect(demoRepository.read().lessons).toHaveLength(0);
});
