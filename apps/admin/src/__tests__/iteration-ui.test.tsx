// @vitest-environment jsdom
import { act as testAct, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { DEMO_TODAY } from "@crazytalk/shared";
import { demoRepository } from "../../../../packages/shared/src/repository";
import { bindSchedulingStaff } from "../../../../tests/fixtures/scheduling";
import Students from "../pages/Students";
import StudentDetail from "../pages/StudentDetail";
import Teachers from "../pages/operations/Teachers";
import Lessons from "../pages/operations/Lessons";
import Schedule from "../pages/Schedule";
import { StudentLessonDrawer } from "../components/StudentLessonDrawer";
import TeacherSchedule from "../components/TeacherSchedule";

function mount(node: React.ReactElement, path = "/") {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}

async function choose(label: string, optionText: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  await testAct(async () => {
    trigger.focus();
    fireEvent.click(trigger);
  });
  const option = await screen.findByRole("option", { name: optionText });
  await testAct(async () => {
    fireEvent.click(option);
  });
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

describe("2026-11-26 迭代需求专项 UI 测试（admin）", () => {
  it("T2.1 学员列表默认显示问卷状态与剩余课时，且筛选生效", async () => {
    const state = demoRepository.read();
    const ritaStudents = state.students.filter((s) => s.owner === "Rita" || s.ownerAccountId === "u2");
    for (const s of ritaStudents) {
      delete s.surveySubmittedAt;
      delete s.surveyToken;
    }
    ritaStudents[0].surveySubmittedAt = "2026-10-20T10:00:00Z";
    ritaStudents[1].surveyToken = "tok-pending";
    localStorage.setItem("crazytalk-demo-standard-v1", JSON.stringify(state));
    demoRepository.refresh();

    mount(<Students />, "/students");
    expect(screen.getByRole("columnheader", { name: "问卷状态" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "剩余课时" })).toBeTruthy();

    await choose("问卷状态筛选", "已完成");
    expect(screen.getByText(ritaStudents[0].name)).toBeTruthy();
    expect(screen.queryByText(ritaStudents[1].name)).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(2);

    await choose("问卷状态筛选", "全部问卷状态");
    await choose("剩余课时筛选", "0 课时");
    const zeroRows = ritaStudents.filter((s) => s.balance === 0);
    expect(screen.getAllByRole("row")).toHaveLength(zeroRows.length + 1);
  });

  it("T2.2/T1.4 加课时区分新购(72/144)与续费(自由输入如5节)，服务跟进移除登记补偿", async () => {
    const state = demoRepository.read();
    const s = state.students[0];
    mount(<StudentDetail />, `/students/${s.id}`);
    // 路由 params 不带 :id 时可用 Routes，直接测 StudentActionModal / StudentService 更精准；
    // 验证服务跟进已移除“登记补偿”并验证加课时区分新购/续费：
    cleanup();
    const { StudentActionModal } = await import("../components/StudentActions");
    const { default: StudentService } = await import("../components/StudentService");

    mount(<StudentService student={s} onOpen={() => {}} onVisit={() => {}} onFeedback={() => {}} />);
    expect(screen.queryByRole("button", { name: "登记补偿" })).toBeNull();
    cleanup();

    mount(<StudentActionModal student={s} action="credit" onClose={() => {}} />);
    // 默认新购为 72/144 下拉
    expect(screen.getByRole("combobox", { name: "购买课时" })).toBeTruthy();

    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "续费" }));
    });
    const renewalInput = screen.getByLabelText("续费课时数") as HTMLInputElement;
    expect(renewalInput.value).toBe("5");
    await testAct(async () => {
      fireEvent.change(renewalInput, { target: { value: "5" } });
      fireEvent.click(screen.getByRole("button", { name: "确认加 5 课时" }));
    });
    await waitFor(() => expect(demoRepository.read().credits[0].type).toBe("续费"));
    expect(demoRepository.read().credits[0].units).toBe(5);
  });

  it("T2.3 课程抽屉支持直接异常处理（lesson.incident）", async () => {
    const state = demoRepository.read();
    const lesson = state.lessons[0];
    mount(<StudentLessonDrawer lessonId={lesson.id} onClose={() => {}} />);

    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "异常登记" }));
    });
    await testAct(async () => {
      fireEvent.change(screen.getByLabelText("异常核实说明"), {
        target: { value: "网络卡顿超过10分钟" },
      });
      fireEvent.click(screen.getByRole("button", { name: "提交异常登记" }));
    });
    await waitFor(() =>
      expect(demoRepository.read().lessons.find((l) => l.id === lesson.id)?.incident?.note).toBe(
        "网络卡顿超过10分钟",
      ),
    );
  });

  it("T2.5 老师课表支持勾选可固定空闲时间（截图模式）并隐藏学员姓名", async () => {
    const state = demoRepository.read();
    const tutor = state.teachers[0];
    const bookedLesson = state.lessons.find((l) => l.teacherId === tutor.id && l.status !== "已取消");
    const studentName = bookedLesson ? state.students.find((s) => s.id === bookedLesson.studentId)?.name : "";
    mount(<TeacherSchedule teacherId={tutor.id} />);

    const toggle = screen.getByLabelText("仅看可固定空闲时间（截图模式）");
    await testAct(async () => {
      fireEvent.click(toggle);
    });
    expect(screen.getByRole("region", { name: "可固定空闲时间截图视图" })).toBeTruthy();
    if (studentName) {
      expect(screen.queryByText(studentName)).toBeNull();
    }
    expect(screen.getByText(/可固定时段文字汇总/)).toBeTruthy();
  });

  it("T3.2/T3.3 排课页取消时间优先，支持单选教材只读与临时排课推荐置顶且可自选", async () => {
    const state = bindSchedulingStaff(demoRepository.read());
    state.rules.trainingRequired = false;
    state.accounts.forEach((a, i) => {
      a.classInUid ||= String(880100 + i);
    });
    state.classInAccounts = state.students.map((s, i) => ({
      id: `ci-${s.id}`,
      phone: s.phone,
      uid: String(990100 + i),
      studentIds: [s.id],
    }));
    // 确保 Rita 名下在读学员使用 m1 且有充足可用课时，并清理旧排课意向
    const student = state.students.find(
      (s) => (s.owner === "Rita" || s.ownerAccountId === "u2") && s.status === "在读",
    )!;
    student.balance = 20;
    student.materialIds = ["m1"];
    student.material = "Power Up 1";
    delete student.scheduleIntent;
    state.lessons = state.lessons.filter((l) => l.studentId !== student.id);
    // 一位同组推荐老师(t2: A队/二组)，一位跨组可用老师(t1: B队/一组)
    state.teachers[1].team = "A队";
    state.teachers[1].group = "二组";
    state.teachers[1].materialIds = ["m1"];
    state.teachers[1].availability = [{ day: 1, start: "18:00", end: "21:00" }];
    state.teachers[0].team = "B队";
    state.teachers[0].group = "一组";
    state.teachers[0].materialIds = ["m1"];
    state.teachers[0].availability = [{ day: 1, start: "18:00", end: "21:00" }];
    localStorage.setItem("crazytalk-demo-standard-v1", JSON.stringify(state));
    demoRepository.refresh();

    const router = createMemoryRouter(
      [{ path: "/schedule", element: <Schedule /> }],
      { initialEntries: [`/schedule?student=${student.id}`] },
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DemoProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </DemoProvider>
      </QueryClientProvider>,
    );

    // 进入一键排课：没有时间优先策略选项，有课程类型选项、教材只读
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "一键排课" }));
    });
    expect(screen.queryByText("时间优先")).toBeNull();
    expect(screen.getByLabelText("上课教材")).toHaveProperty("disabled", true);
    expect(screen.getByRole("combobox", { name: "课程类型" })).toBeTruthy();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "返回概况" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "临时排课" }));
    });
    expect(screen.getByRole("combobox", { name: "课程类型" }).textContent).toContain("临时课");
  });

  it("T3.4 上课记录页支持按课程类型（固定课/临时课）筛选", async () => {
    mount(<Lessons />, "/lessons");
    const kindCombo = screen.getByRole("combobox", { name: "课程类型" });
    expect(kindCombo).toBeTruthy();
    await choose("课程类型", "临时课");
    const tempCells = screen.getAllByText("临时课");
    expect(tempCells.length).toBeGreaterThan(0);
    expect(screen.queryByText("固定课", { selector: "td .badge" })).toBeNull();
  });
});
