// @vitest-environment jsdom
import { useState } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider, useDemo } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { createSeed, DEMO_TODAY, addDays } from "@crazytalk/shared";
import {
  demoRepository,
  DEMO_STORAGE_KEY,
} from "../../../../packages/shared/src/repository";
import {
  StudentActionModal,
  StudentQuickView,
  type StudentAction,
} from "../components/StudentActions";
import StudentProfileEditor from "../components/StudentProfileEditor";

function mount(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter>{node}</MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
function Action({
  action,
  lessonId,
}: {
  action: StudentAction;
  lessonId?: string;
}) {
  const { data } = useDemo();
  return (
    <StudentActionModal
      action={action}
      student={data.students[0]}
      initialLessonId={lessonId}
      onClose={() => {}}
    />
  );
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}
function choose(label: string, value: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: value }));
}
function fixture() {
  const state = createSeed();
  const lesson = state.lessons.find(
    (item) => item.studentId === state.students[0].id,
  )!;
  state.teachers.forEach((teacher) => {
    teacher.trained = true;
    teacher.needConfirm = false;
    teacher.availability = Array.from({ length: 7 }, (_, day) => ({
      day,
      start: "17:00",
      end: "23:00",
    }));
  });
  state.lessons = [
    {
      ...lesson,
      id: "preview-first",
      date: addDays(DEMO_TODAY, 2),
      time: "18:00",
      duration: 55,
      teacherId: "t1",
      status: "未开始",
      deducted: false,
    },
    {
      ...lesson,
      id: "preview-second",
      date: addDays(DEMO_TODAY, 3),
      time: "19:00",
      duration: 25,
      teacherId: "t1",
      status: "未开始",
      deducted: false,
    },
    {
      ...lesson,
      id: "busy-slot",
      studentId: state.students[1].id,
      date: addDays(DEMO_TODAY, 3),
      time: "20:00",
      duration: 50,
      teacherId: "t1",
      status: "未开始",
      deducted: false,
    },
  ];
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  demoRepository.refresh();
  return state;
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

describe("学员操作体验补齐", () => {
  it("从指定课程进入调课，原新安排明确，冲突在保存前提示并禁止提交", async () => {
    fixture();
    mount(<Action action="reschedule" lessonId="preview-second" />);
    expect(
      (screen.getByLabelText("从哪天开始") as HTMLInputElement).value,
    ).toBe(addDays(DEMO_TODAY, 3));
    expect(
      (screen.getByLabelText("新的上课时间") as HTMLInputElement).value,
    ).toBe("19:00");
    expect(screen.getByLabelText("调课安排预览").textContent).toContain(
      "本次仅调整这一节课",
    );
    change("新的上课时间", "20:00");
    expect(screen.getByText("老师这个时间已经有课")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "确认保存" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    change("新的上课时间", "21:00");
    expect(screen.getByText("老师和学员均无时间冲突")).toBeTruthy();
    change("备注 / 原因", "家长协商调整");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "我已与家长和老师确认本次变更" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await waitFor(() =>
      expect(
        demoRepository
          .read()
          .lessons.find((lesson) => lesson.id === "preview-second")?.time,
      ).toBe("21:00"),
    );
    expect(
      demoRepository
        .read()
        .lessons.find((lesson) => lesson.id === "preview-first")?.time,
    ).toBe("18:00");
  });
  it("换师只预览生效日期后的课程，显示实际时长及逐节可用结果", () => {
    fixture();
    mount(<Action action="changeTeacher" />);
    choose("老师", "T. Destiny · BigBrains");
    change("从哪天开始", addDays(DEMO_TODAY, 3));
    const preview = screen.getByLabelText("换老师影响预览");
    expect(preview.textContent).toContain("将调整 1 节课");
    expect(preview.textContent).toContain("25 分钟");
    expect(preview.textContent).toContain("时间可安排");
    expect(preview.textContent).not.toContain("55 分钟");
  });
  it("速览按业务日期显示最近反馈，保留上下文回调并提供换师入口", () => {
    const state = fixture();
    const template = state.feedback[0];
    state.feedback = [
      {
        ...template,
        id: "older",
        studentId: "s1",
        date: "2026-10-01",
        content: "较早记录",
      },
      {
        ...template,
        id: "latest",
        studentId: "s1",
        date: "2026-10-30",
        content: "最近记录",
        rating: "差评",
        status: "处理中",
      },
    ];
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    demoRepository.refresh();
    const onFeedback = vi.fn();
    const onOpenLesson = vi.fn();
    mount(
      <StudentQuickView
        id="s1"
        onClose={() => {}}
        onFeedback={onFeedback}
        onOpenLesson={onOpenLesson}
      />,
    );
    expect(screen.getByText("最近记录")).toBeTruthy();
    expect(screen.queryByText("较早记录")).toBeNull();
    expect(screen.getByText("处理中")).toBeTruthy();
    expect(screen.getByText(/55 分钟/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看反馈" }));
    expect(onFeedback).toHaveBeenCalledWith("latest");
    fireEvent.click(screen.getByRole("button", { name: "查看这节课" }));
    expect(onOpenLesson).toHaveBeenCalledWith("preview-first");
    expect(screen.getByRole("button", { name: "换老师" })).toBeTruthy();
  });
  it("字段错误就近显示并定位；取消填写时可继续保留内容", async () => {
    const close = vi.fn();
    mount(<StudentProfileEditor onClose={close} />);
    change("学生名字", "保留输入验收");
    change("手机号码", "138");
    fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "手机号需为 11 位，暂未提供可留空",
    );
    expect(screen.getByLabelText("手机号码").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(document.activeElement).toBe(screen.getByLabelText("手机号码"));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    const confirm = screen.getByRole("dialog", { name: "放弃未保存的内容？" });
    fireEvent.click(within(confirm).getByRole("button", { name: "继续填写" }));
    expect((screen.getByLabelText("学生名字") as HTMLInputElement).value).toBe(
      "保留输入验收",
    );
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("从反馈发起补偿自动带入当前反馈，且不允许跨学员关联", async () => {
    const state = fixture();
    state.feedback[0].studentId = state.students[0].id;
    state.feedback[0].content = "需要补偿的反馈";
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    demoRepository.refresh();
    mount(
      <StudentActionModal
        student={state.students[0]}
        action="compensate"
        initialFeedbackId={state.feedback[0].id}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "关联反馈" }).textContent,
    ).toContain("需要补偿的反馈");
    change("课时数", "1.5");
    change("备注 / 原因", "按约定补偿");
    fireEvent.click(screen.getByRole("button", { name: "确认加 1.5 课时" }));
    await waitFor(() =>
      expect(demoRepository.read().credits[0].feedbackId).toBe(
        state.feedback[0].id,
      ),
    );
    cleanup();
    const other = {
      ...state.feedback[0],
      id: "other-student-feedback",
      studentId: state.students[1].id,
    };
    state.feedback.push(other);
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    demoRepository.refresh();
    mount(
      <StudentActionModal
        student={state.students[0]}
        action="compensate"
        initialFeedbackId={other.id}
        onClose={() => {}}
      />,
    );
    change("备注 / 原因", "不能跨学生");
    fireEvent.click(screen.getByRole("button", { name: "确认加 24 课时" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "这条反馈不属于当前学员，请重新打开补偿操作",
    );
  });
  it("没有待上课时给出下一步说明，不提供失效调课提交", () => {
    const state = fixture();
    state.lessons = [];
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    demoRepository.refresh();
    mount(<Action action="reschedule" />);
    expect(
      screen.getByText("暂无待上课程，可先到排班管理安排上课。"),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "确认保存" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it.each(["取消", "关闭"])(
    "加课时修改后点击%s直接关闭，不二次确认",
    (button) => {
      const state = fixture();
      const close = vi.fn();
      mount(
        <StudentActionModal
          student={state.students[0]}
          action="credit"
          onClose={close}
        />,
      );
      change("业务日期", addDays(DEMO_TODAY, -3));
      fireEvent.click(screen.getByRole("button", { name: "充值" }));
      fireEvent.click(
        screen.getByRole("button", { name: button }),
      );
      expect(close).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole("dialog", { name: "放弃未保存的内容？" }),
      ).toBeNull();
    },
  );
  it("补偿预填反馈与类型不算已编辑，改变关联后仍保护输入", () => {
    const state = fixture();
    state.feedback[0].studentId = state.students[0].id;
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    demoRepository.refresh();
    const close = vi.fn();
    mount(
      <StudentActionModal
        student={state.students[0]}
        action="compensate"
        initialFeedbackId={state.feedback[0].id}
        onClose={close}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("dialog", { name: "放弃未保存的内容？" }),
    ).toBeNull();
    choose("关联反馈", "不关联反馈");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("dialog", { name: "放弃未保存的内容？" }),
    ).toBeTruthy();
  });
  it("已有学员手机号在无完整查看权限时脱敏且不可误改", () => {
    const state = fixture();
    const role = state.roles.find((item) => item.id === "ops");
    if (!role) throw new Error("缺少教务角色");
    role.permissions = role.permissions.filter(
      (permission) => permission !== "field.student_phone",
    );
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    demoRepository.refresh();
    function RestrictedEditor() {
      const { setRole } = useDemo();
      const [open, setOpen] = useState(false);
      return open ? (
        <StudentProfileEditor student={state.students[0]} onClose={() => {}} />
      ) : (
        <button
          onClick={() => {
            setRole("ops");
            setOpen(true);
          }}
        >
          切换教务
        </button>
      );
    }
    mount(<RestrictedEditor />);
    fireEvent.click(screen.getByRole("button", { name: "切换教务" }));
    const phone = screen.getByLabelText("手机号码") as HTMLInputElement;
    expect(phone.disabled).toBe(true);
    expect(phone.value).toBe(`****${state.students[0].phone.slice(-4)}`);
    expect(demoRepository.read().students[0].phone).toBe(
      state.students[0].phone,
    );
  });
});
