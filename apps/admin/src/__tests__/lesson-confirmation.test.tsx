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
  it("老师只填写教材及页码即可提交单节记录，不强制评分评语或联动扣课", () => {
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
    expect(screen.getByRole("alert").textContent).toMatch(/教材.*页码/);
    expect(save).not.toHaveBeenCalled();
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
      balance: beforeBalance,
      status: beforeStatus,
    });
    expect(after.students[0].unit).toMatch(/p\.12$/);
    expect(after.lessons.find((item) => item.id === lesson.id)?.deducted).toBe(
      lesson.deducted,
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
    const checkbox = await screen.findByRole("checkbox", {
      name: `选择课程 ${lesson.id}`,
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
  it("默认全部记录，快捷筛选保留搜索并清除勾选", async () => {
    const data = demoRepository.read();
    const normal = data.lessons.find(
      (l) => l.status === "待确认" && l.attendance === "正常",
    )!;
    const student = data.students.find((s) => s.id === normal.studentId)!;
    mount(`/lessons?student=${student.id}`);
    await screen.findByRole("table");
    expect(screen.getAllByRole("row").length).toBe(
      Math.min(
        20,
        data.lessons.filter((l) => l.studentId === student.id).length,
      ) + 1,
    );
    const search = screen.getByPlaceholderText("搜索学生名字、群名或老师");
    fireEvent.change(search, { target: { value: student.name } });
    const checkbox = screen.getByRole("checkbox", {
      name: `选择课程 ${normal.id}`,
    });
    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "批量确认" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /待确认/ }));
    expect(screen.queryByRole("button", { name: "批量确认" })).toBeNull();
    expect(search.getAttribute("value")).toBe(student.name);
    const expected = data.lessons.filter(
      (l) => l.studentId === student.id && l.status === "待确认",
    );
    expect(screen.getByText(`共 ${expected.length} 节课`)).toBeTruthy();
  });

  it("仅勾选可批量确认记录，批量确认不影响异常或未核实数量记录", async () => {
    const data = demoRepository.read();
    const pending = data.lessons.filter((l) => l.status === "待确认");
    const normals = pending.filter((l) => l.attendance === "正常");
    delete normals[0].confirmedUnits;
    const eligible = pending.filter(
      (l) => l.attendance === "正常" && (l.confirmedUnits ?? 0) > 0,
    );
    const untouched = pending
      .filter((l) => !eligible.includes(l))
      .map((l) => l.id);
    mount("/lessons?tab=confirm");
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "选择本页可批量确认的课程" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "批量确认" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "批量确认" })).toBeNull(),
    );
    for (const lesson of eligible)
      expect(
        demoRepository.read().lessons.find((l) => l.id === lesson.id)?.deducted,
      ).toBe(true);
    for (const id of untouched)
      expect(
        demoRepository.read().lessons.find((l) => l.id === id)?.status,
      ).toBe("待确认");
  });

  it("分页每页最多20条，日期范围和考勤链接筛选同时生效", async () => {
    const data = demoRepository.read();
    mount("/lessons");
    await screen.findByRole("table");
    expect(screen.getAllByRole("row")).toHaveLength(
      Math.min(20, data.lessons.length) + 1,
    );
    if (data.lessons.length > 20) {
      fireEvent.click(screen.getByRole("button", { name: "下一页" }));
      expect(screen.getByText(/第 2 \/ /)).toBeTruthy();
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
      Math.min(20, expected.length) + 1,
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
