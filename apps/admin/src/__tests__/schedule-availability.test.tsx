import { transferableAbortController } from "node:util";
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
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import {
  demoRepository,
  DEMO_STORAGE_KEY,
} from "../../../../packages/shared/src/repository";
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
          <RouterProvider router={createMemoryRouter([{path:"*",element:<Schedule/>}],{initialEntries:[path]})}/>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  if (path.includes("student=")) fireEvent.click(screen.getByRole("button",{name:"一键排课"}));
}
beforeEach(() => {
  vi.stubGlobal("AbortController", class { constructor(){return transferableAbortController();} });
  localStorage.clear();
  demoRepository.reset();
  demoRepository.read().classInAccounts = demoRepository.read().students.map((student,index)=>({id:`verified-${student.id}`,phone:"",uid:String(123456+index),studentIds:[student.id]}));
  const fixture = demoRepository.read();
  fixture.students[2].name = "排课测试学员";
  fixture.students[2].chineseName = "排课测试学员";
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fixture));
  demoRepository.refresh();
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
  it("学员未填写意向时不推荐老师，清空开始日期不能保存", async () => {
    mount("/schedule?student=s4&date=2026-11-20");
    expect(screen.queryByRole("region", { name: "推荐老师" })).toBeNull();
    await testAct(async () => {
      fireEvent.change(screen.getByLabelText("开始日期"), {
        target: { value: "" },
      });
    });
    await testAct(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "生成排课方案" }),
      );
    });
    expect(
      screen
        .getByRole("button", { name: "生成排课方案" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("非常规时间经确认创建临时课，保留常规时间并记录沟通", async () => {
    const before = structuredClone(
      demoRepository.read().teachers.find((t) => t.id === "t1"),
    );
    mount();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "为该老师排课" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByLabelText("学员"));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("option", { name: /排课测试学员/ }));
    });
    const dialog = document.querySelector<HTMLElement>(".course-plan")!;
    const ui = within(dialog);
    await testAct(async () => {
      fireEvent.change(ui.getByLabelText("第1节上课时间"), {
        target: { value: "19:25" },
      });
    });
    expect(ui.getByText(/（非常规时间）/)).toBeTruthy();
    const submit = (await submitButton());
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"返回调整"}));
    await testAct(async () => {
      fireEvent.change(ui.getByLabelText("沟通备注（选填）"), {
        target: { value: "老师已同意周五临时加课" },
      });
    });
    await testAct(async () => {
      fireEvent.click(
        ui.getByRole("checkbox", { name: /已与 .*确认本节授课时间/ }),
      );
    });
    const confirmed = (await submitButton());
    expect(confirmed.hasAttribute("disabled")).toBe(false);
    await testAct(async () => {
      fireEvent.click(confirmed);
    });
    expect(screen.getByText(/课程已保存，可在下方查看同步状态/)).toBeTruthy();
    const data = demoRepository.read();
    const created = data.lessons.find(
      (l) =>
        l.date === "2026-11-20" &&
        l.time === "19:25" &&
        l.studentId ===
          demoRepository.read().students.find((s) => s.name === "排课测试学员")
            ?.id,
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

  it("更改非常规课次时间后必须重新确认", async () => {
    mount();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "为该老师排课" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByLabelText("学员"));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("option", { name: /排课测试学员/ }));
    });
    const ui = within(document.querySelector<HTMLElement>(".course-plan")!);
    const confirmation = ui.getByRole<HTMLInputElement>("checkbox", {
      name: /已与 .*确认本节授课时间/,
    });
    await testAct(async () => {
      fireEvent.click(confirmation);
    });
    expect(
      (await submitButton()).hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"返回调整"}));
    await testAct(async () => {
      fireEvent.change(ui.getByLabelText("第1节上课时间"), {
        target: { value: "20:15" },
      });
    });
    expect(confirmation.checked).toBe(false);
    expect(
      (await submitButton()).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("常规时间支持分钟排课，清空日期不会崩溃且不能提交", async () => {
    mount();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "为该老师排课" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByLabelText("学员"));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("option", { name: /排课测试学员/ }));
    });
    const ui = within(document.querySelector<HTMLElement>(".course-plan")!);
    await testAct(async () => {
      fireEvent.change(ui.getByLabelText("第1节上课日期"), {
        target: { value: "2026-12-04" },
      });
    });
    await testAct(async () => {
      fireEvent.change(ui.getByLabelText("第1节上课时间"), {
        target: { value: "16:35" },
      });
    });
    expect(
      ui.queryByRole("checkbox", { name: /已与 .*确认本节授课时间/ }),
    ).toBeNull();
    expect(
      (await submitButton()).hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"返回调整"}));
    await testAct(async () => {
      fireEvent.change(ui.getByLabelText("第1节上课日期"), {
        target: { value: "" },
      });
    });
    expect(
      (await submitButton()).hasAttribute("disabled"),
    ).toBe(true);
    await testAct(async () => {
      fireEvent.change(ui.getByLabelText("第1节上课日期"), {
        target: { value: "2026-12-04" },
      });
    });
    await testAct(async () => {
      fireEvent.click((await submitButton()));
    });
    expect(
      demoRepository
        .read()
        .lessons.some(
          (l) =>
            l.time === "16:35" &&
            l.date === "2026-12-04" &&
            l.studentId ===
              demoRepository
                .read()
                .students.find((s) => s.name === "排课测试学员")?.id,
        ),
    ).toBe(true);
    expect(screen.getByText(/课程已保存，可在下方查看同步状态/)).toBeTruthy();
  });
});

async function submitButton(name = "确认排课") {
  const next = screen.queryByRole("button", {name:"预览排课"});
  if (next) await testAct(async()=>{fireEvent.click(next);});
  return screen.getByRole("button", {name});
}
