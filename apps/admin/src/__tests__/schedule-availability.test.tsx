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
import { demoRepository } from "../../../../packages/shared/src/repository";
import Schedule from "../pages/Schedule";

function mount(path = "/schedule?teacher=t1&date=2026-11-20") {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Schedule />
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
  vi.unstubAllGlobals();
});

describe("可用时间与临时排课", () => {
  it("学员未填写意向时不推荐老师，清空开始日期不能保存", () => {
    mount("/schedule?student=s4&date=2026-11-20");
    expect(screen.queryByRole("region", { name: "推荐老师" })).toBeNull();
    fireEvent.change(screen.getByLabelText("开始日期"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存意向并匹配老师" }));
    expect(
      screen
        .getByRole("button", { name: "保存意向并匹配老师" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("非常规时间经确认创建临时课，保留常规时间并记录沟通", () => {
    const before = structuredClone(
      demoRepository.read().teachers.find((t) => t.id === "t1"),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "安排课程" }));
    fireEvent.click(screen.getByLabelText("学员"));
    fireEvent.click(screen.getByRole("option", { name: /Lucy/ }));
    const dialog = screen.getByRole("dialog");
    const ui = within(dialog);
    fireEvent.change(ui.getByLabelText("第1节上课时间"), {
      target: { value: "19:25" },
    });
    expect(ui.getByText(/（非常规时间）/)).toBeTruthy();
    const submit = ui.getByRole("button", { name: "确认排课" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(ui.getByLabelText("沟通备注（选填）"), {
      target: { value: "老师已同意周五临时加课" },
    });
    fireEvent.click(
      ui.getByRole("checkbox", { name: /已与 .*确认本节授课时间/ }),
    );
    expect(submit.hasAttribute("disabled")).toBe(false);
    fireEvent.click(submit);
    expect(screen.getByRole("dialog", { name: "排课完成" })).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "关闭" }),
    );
    const data = demoRepository.read();
    const created = data.lessons.find(
      (l) =>
        l.date === "2026-11-20" &&
        l.time === "19:25" &&
        l.studentId ===
          demoRepository.read().students.find((s) => s.name === "Lucy")?.id,
    );
    expect(created).toMatchObject({
      kind: "临时课",
      status: "未开始",
      deducted: false,
      confirmation: { note: "老师已同意周五临时加课" },
    });
    expect(created?.confirmation?.operator).toBeTruthy();
    expect(data.teachers.find((t) => t.id === "t1")).toEqual(before);
  });

  it("更改非常规课次时间后必须重新确认", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "安排课程" }));
    fireEvent.click(screen.getByLabelText("学员"));
    fireEvent.click(screen.getByRole("option", { name: /Lucy/ }));
    const ui = within(screen.getByRole("dialog"));
    const confirmation = ui.getByRole<HTMLInputElement>("checkbox", {
      name: /已与 .*确认本节授课时间/,
    });
    fireEvent.click(confirmation);
    expect(
      ui.getByRole("button", { name: "确认排课" }).hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.change(ui.getByLabelText("第1节上课时间"), {
      target: { value: "20:15" },
    });
    expect(confirmation.checked).toBe(false);
    expect(
      ui.getByRole("button", { name: "确认排课" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("常规时间支持分钟排课，清空日期不会崩溃且不能提交", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "安排课程" }));
    fireEvent.click(screen.getByLabelText("学员"));
    fireEvent.click(screen.getByRole("option", { name: /Lucy/ }));
    const ui = within(screen.getByRole("dialog"));
    fireEvent.change(ui.getByLabelText("第1节上课日期"), {
      target: { value: "2026-12-04" },
    });
    fireEvent.change(ui.getByLabelText("第1节上课时间"), {
      target: { value: "16:35" },
    });
    expect(
      ui.queryByRole("checkbox", { name: /已与 .*确认本节授课时间/ }),
    ).toBeNull();
    expect(
      ui.getByRole("button", { name: "确认排课" }).hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.change(ui.getByLabelText("第1节上课日期"), {
      target: { value: "" },
    });
    expect(
      ui.getByRole("button", { name: "确认排课" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(ui.getByLabelText("第1节上课日期"), {
      target: { value: "2026-12-04" },
    });
    fireEvent.click(ui.getByRole("button", { name: "确认排课" }));
    expect(
      demoRepository
        .read()
        .lessons.some(
          (l) =>
            l.time === "16:35" &&
            l.date === "2026-12-04" &&
            l.studentId ===
              demoRepository.read().students.find((s) => s.name === "Lucy")?.id,
        ),
    ).toBe(true);
    expect(document.querySelector(".schedule-date")?.textContent).toContain(
      "12月",
    );
  });
});
